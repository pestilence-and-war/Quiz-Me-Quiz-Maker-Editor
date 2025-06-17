# backend/main.py
import os
import json
import fitz  # PyMuPDF
import logging
from flask import Flask, request, jsonify
from flask_cors import CORS
from waitress import serve
from dotenv import load_dotenv, set_key
from datetime import datetime

# --- Imports for DB and Auth ---
from flask_sqlalchemy import SQLAlchemy
from flask_bcrypt import Bcrypt
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity, JWTManager

# --- Google GenAI Library Imports ---
from google import genai
from google.genai import types
from google.api_core import exceptions as google_exceptions

# --- App Initialization & Config ---
load_dotenv()
app = Flask(__name__)

# Configure logging
logging.basicConfig(level=logging.INFO)
app.logger.setLevel(logging.INFO)

# In production, use a secure, randomly generated secret key stored as an env variable
app.config["JWT_SECRET_KEY"] = os.getenv("JWT_SECRET_KEY", "a-default-fallback-secret-key-for-dev")
app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///site.db"
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

# Enable CORS for your frontend
CORS(app)

# --- Initialize Extensions ---
db = SQLAlchemy(app)
bcrypt = Bcrypt(app)
jwt = JWTManager(app)

# --- Database Models ---
class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(60), nullable=False)
    subscription_tier = db.Column(db.String(20), nullable=False, default='free')

class UsageLog(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    timestamp = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

# --- Tier Limits Configuration ---
TIER_LIMITS = {
    'free': 3,
    'pro': 50
}

# --- Master System Prompt for AI ---
SYSTEM_PROMPT = """
You are an expert curriculum designer and a helpful AI assistant for teachers. Your task is to generate high-quality, relevant quiz questions based on the provided text document. The output MUST be a valid JSON array of question objects. Do not include any explanatory text, notes, or markdown formatting like ```json ... ``` before or after the JSON array. The response must start with '[' and end with ']'. Each object in the array must conform to one of the following structures based on the 'type' key. For "single" choice questions: {"id": "placeholder_id", "type": "single", "Question": "The question text?", "Options": ["Option A", "Correct Option B", "Option C", "Option D"], "answer": "Correct Option B", "Rationale": "A brief explanation of why the answer is correct.", "hint": "An optional hint for the student."}. For "multi-select" questions: {"id": "placeholder_id", "type": "multi-select", "Question": "The question text, asking for multiple answers?", "Options": ["Correct Option A", "Incorrect Option B", "Correct Option C", "Incorrect Option D"], "answer": ["Correct Option A", "Correct Option C"], "Rationale": "A brief explanation of why the selected answers are correct.", "hint": "An optional hint for the student."}. For "fill-in" questions: {"id": "placeholder_id", "type": "fill-in", "Question": "The capital of France is ____.", "Options": [], "answer": "Paris", "Rationale": "Paris is the capital city of France.", "hint": "It's a famous European city known for art."}. For "ordering" questions: {"id": "placeholder_id", "type": "ordering", "Question": "Arrange these planets in order from the sun.", "Options": ["Mars", "Venus", "Earth", "Mercury"], "answer": ["Mercury", "Venus", "Earth", "Mars"], "Rationale": "This is the correct order of the first four planets from the sun.", "hint": "A hot planet is first."}
"""

# --- API Endpoints ---
@app.route('/api/register', methods=['POST'])
def register():
    app.logger.info("/api/register endpoint hit.")
    data = request.get_json()
    email = data.get('email')
    password = data.get('password')

    if not email or not password:
        app.logger.warning("Registration attempt with missing email or password.")
        return jsonify({"message": "Email and password are required."}), 400

    if User.query.filter_by(email=email).first():
        app.logger.warning(f"Registration attempt for existing email: {email}")
        return jsonify({"message": "Email already exists"}), 409
    
    app.logger.info(f"Registering new user: {email}")
    hashed_password = bcrypt.generate_password_hash(password).decode('utf-8')
    user = User(email=email, password_hash=hashed_password)
    db.session.add(user)
    db.session.commit()
    app.logger.info(f"User {email} registered successfully.")
    return jsonify({"message": "User registered successfully"}), 201

@app.route('/api/login', methods=['POST'])
def login():
    app.logger.info("/api/login endpoint hit.")
    data = request.get_json()
    email = data.get('email')
    password = data.get('password')

    if not email or not password:
        app.logger.warning("Login attempt with missing email or password.")
        return jsonify({"message": "Email and password are required."}), 400

    user = User.query.filter_by(email=email).first()
    if user and bcrypt.check_password_hash(user.password_hash, password):
        app.logger.info(f"Successful login for user: {email}")
        access_token = create_access_token(identity={'id': user.id, 'email': user.email})
        return jsonify(access_token=access_token)
    
    app.logger.warning(f"Failed login attempt for email: {email}")
    return jsonify({"message": "Invalid credentials"}), 401

@app.route('/api/generate-questions', methods=['POST'])
@jwt_required()
def generate_questions():
    app.logger.info("/api/generate-questions endpoint hit.")
    
    # --- 1. Get User and Check Usage ---
    current_user_identity = get_jwt_identity()
    user_id = current_user_identity['id']
    user = User.query.get(user_id)
    app.logger.info(f"Request received from user: {user.email} (ID: {user.id})")

    is_dev_user = os.getenv("DEV_MODE_USER_EMAIL") == user.email
    if is_dev_user:
        app.logger.info(f"User {user.email} is in dev mode. Skipping usage checks.")
    else:
        start_of_month = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        usage_count = UsageLog.query.filter(UsageLog.user_id == user.id, UsageLog.timestamp >= start_of_month).count()
        limit = TIER_LIMITS.get(user.subscription_tier, 0)
        app.logger.info(f"User {user.email} (Tier: {user.subscription_tier}) has used {usage_count}/{limit} generations this month.")
        
        if usage_count >= limit:
            app.logger.warning(f"User {user.email} has reached their generation limit.")
            return jsonify({"success": False, "message": f"You have used {usage_count}/{limit} of your monthly generations. Please upgrade for more."}), 429

    # --- 2. Load Master API Key ---
    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        app.logger.error("CRITICAL: GOOGLE_API_KEY not configured on server.")
        return jsonify({"message": "Server configuration error: API key not found."}), 500

    # --- 3. Extract and Parse Form Data & File ---
    try:
        app.logger.info("Extracting data from multipart form.")
        if 'document' not in request.files: return jsonify({"success": False, "message": "No document file provided."}), 400
        file = request.files['document']
        if file.filename == '': return jsonify({"success": False, "message": "No selected file."}), 400

        subject = request.form.get('subject', 'General')
        grade = request.form.get('grade', 'Unspecified')
        notes = request.form.get('notes', 'None')
        num_questions = request.form.get('num_questions', '5')
        question_types = request.form.get('question_types', 'single, multi-select')

        app.logger.info(f"File received: {file.filename}, Subject: {subject}, Grade: {grade}, Num Questions: {num_questions}")

        file_bytes = file.read()
        extracted_text = ""
        if file.filename.lower().endswith('.pdf'):
            with fitz.open(stream=file_bytes, filetype="pdf") as doc:
                for page in doc: extracted_text += page.get_text()
        elif file.filename.lower().endswith('.txt'):
            extracted_text = file_bytes.decode('utf-8', errors='ignore')
        else:
            return jsonify({"success": False, "message": "Unsupported file type. Please use PDF or TXT."}), 400
        
        if not extracted_text.strip(): return jsonify({"success": False, "message": "Could not extract any text from the document."}), 400
        app.logger.info(f"Extracted {len(extracted_text)} characters from document.")
    except Exception as e:
        app.logger.error(f"Error parsing form or file: {e}", exc_info=True)
        return jsonify({"success": False, "message": "Failed to process the uploaded document."}), 500
    
    # --- 4. Construct AI Prompt ---
    user_prompt = f"Please generate {num_questions} questions from the following document.\n- Subject: {subject}\n- Grade Level: {grade}\n- Desired Question Types: {question_types}\n- Additional Teacher Notes: {notes}\n\nSource Text:\n---\n{extracted_text[:20000]}"
    app.logger.info("User prompt constructed for AI.")

    # --- 5. Call Google Gemini API ---
    try:
        app.logger.info("Initializing Google GenAI Client...")
        client = genai.Client(api_key=api_key)
        
        generation_config = types.GenerateContentConfig(temperature=0.7, max_output_tokens=8192, response_mime_type="application/json")
        
        app.logger.info("Sending request to Gemini API...")
        response = client.models.generate_content(
            model='models/gemini-2.0-flash-lite',
            contents=[SYSTEM_PROMPT, user_prompt],
            config=generation_config
        )
        
        app.logger.info("Received response from Gemini API.")
        generated_json = json.loads(response.text)
        
        # --- 6. Log Successful Usage ---
        if not is_dev_user:
            new_log = UsageLog(user_id=user.id)
            db.session.add(new_log)
            db.session.commit()
            app.logger.info(f"Logged successful generation for user {user.email}.")
        
        return jsonify({"success": True, "questions": generated_json})
        
    except json.JSONDecodeError:
        app.logger.error(f"Failed to decode JSON from Gemini response: {response.text}")
        return jsonify({"success": False, "message": "The AI returned an invalid JSON format. Please try again."}), 500
    except Exception as e:
        app.logger.error(f"An error occurred with the Google API call: {e}", exc_info=True)
        return jsonify({"success": False, "message": f"An error occurred while generating questions: {str(e)}"}), 500

# --- Server Execution ---
if __name__ == '__main__':
    with app.app_context():
        app.logger.info("Checking for and creating database if it doesn't exist...")
        db.create_all()
        app.logger.info("Database is ready.")
    
    app.logger.info("Starting production server with Waitress...")
    serve(app, host='0.0.0.0', port=5000)