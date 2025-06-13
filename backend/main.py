# backend/main.py
import os
import json
import fitz  # PyMuPDF
from flask import Flask, request, jsonify
from flask_cors import CORS
from waitress import serve
from dotenv import load_dotenv, set_key
from datetime import datetime
from flask_sqlalchemy import SQLAlchemy
from flask_bcrypt import Bcrypt
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity, JWTManager
from google.genai import types

# Import the Google GenAI library
from google import genai
from google.api_core import exceptions as google_exceptions

# --- Flask App Initialization ---
app = Flask(__name__)
# Allow requests from your frontend's origin (e.g., http://127.0.0.1:5500)
# For development, you can allow all origins with "*"
CORS(app) 
load_dotenv()

# --- Configuration ---
# Set up a secret key for JWT. In production, this should be a long, random string.
app.config["JWT_SECRET_KEY"] = "your-super-secret-key-for-now" 
app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///site.db" # This creates a 'site.db' file for our database

# --- Initialize Extensions ---
db = SQLAlchemy(app)
bcrypt = Bcrypt(app)
jwt = JWTManager(app)

# --- Database Models (The structure of our tables) ---
class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(60), nullable=False)
    subscription_tier = db.Column(db.String(20), nullable=False, default='free') # 'free' or 'pro'
    # In a real app, you'd store a stripe_customer_id here

class UsageLog(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    timestamp = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

# --- Tier Limits Configuration ---
TIER_LIMITS = {
    'free': 3,
    'pro': 50
}

# --- New Authentication Endpoints ---
@app.route('/api/register', methods=['POST'])
def register():
    data = request.get_json()
    if User.query.filter_by(email=data['email']).first():
        return jsonify({"message": "Email already exists"}), 409
    
    hashed_password = bcrypt.generate_password_hash(data['password']).decode('utf-8')
    user = User(email=data['email'], password_hash=hashed_password)
    db.session.add(user)
    db.session.commit()
    return jsonify({"message": "User registered successfully"}), 201

@app.route('/api/login', methods=['POST'])
def login():
    data = request.get_json()
    user = User.query.filter_by(email=data['email']).first()
    if user and bcrypt.check_password_hash(user.password_hash, data['password']):
        access_token = create_access_token(identity={'id': user.id, 'email': user.email})
        return jsonify(access_token=access_token)
    return jsonify({"message": "Invalid credentials"}), 401



# --- System Prompts and Configuration ---
# This is our master prompt engineering section.
SYSTEM_PROMPT = """
You are an expert curriculum designer and a helpful AI assistant for teachers. 
Your task is to generate high-quality, relevant quiz questions based on the provided text document.

The output MUST be a valid JSON array of question objects. 
Do not include any explanatory text, notes, or markdown formatting like ```json ... ``` before or after the JSON array.
The response must start with '[' and end with ']'.

Each object in the array must conform to one of the following structures based on the 'type' key.

1. For "single" choice questions:
{
  "id": "placeholder_id",
  "type": "single",
  "Question": "The question text?",
  "Options": ["Option A", "Correct Option B", "Option C", "Option D"],
  "answer": "Correct Option B",
  "Rationale": "A brief explanation of why the answer is correct.",
  "hint": "An optional hint for the student."
}

2. For "multi-select" questions:
{
  "id": "placeholder_id",
  "type": "multi-select",
  "Question": "The question text, asking for multiple answers?",
  "Options": ["Correct Option A", "Incorrect Option B", "Correct Option C", "Incorrect Option D"],
  "answer": ["Correct Option A", "Correct Option C"],
  "Rationale": "A brief explanation of why the selected answers are correct.",
  "hint": "An optional hint for the student."
}

3. For "fill-in" questions:
{
  "id": "placeholder_id",
  "type": "fill-in",
  "Question": "The capital of France is ____.",
  "Options": [],
  "answer": "Paris",
  "Rationale": "Paris is the capital city of France.",
  "hint": "It's a famous European city known for art."
}

4. For "ordering" questions:
{
  "id": "placeholder_id",
  "type": "ordering",
  "Question": "Arrange these planets in order from the sun.",
  "Options": ["Mars", "Venus", "Earth", "Mercury"],
  "answer": ["Mercury", "Venus", "Earth", "Mars"],
  "Rationale": "This is the correct order of the first four planets from the sun.",
  "hint": "A hot planet is first."
}
"""

# --- API Endpoints ---

@app.route('/api/generate-questions', methods=['POST'])
# @jwt_required() # Temporarily disabled for testing
def generate_questions():
    # --- TEMPORARY: Bypassing user checks for testing the generation pipeline ---
    print("WARNING: generate-questions endpoint is running without authentication for testing.")

    # --- Load Your Master API Key ---
    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        return jsonify({"message": "Server configuration error: GOOGLE_API_KEY not found in .env"}), 500

    # --- Extract Data from Request ---
    try:
        if 'document' not in request.files:
            return jsonify({"success": False, "message": "No document file provided."}), 400
        
        file = request.files['document']
        if file.filename == '':
            return jsonify({"success": False, "message": "No selected file."}), 400

        subject = request.form.get('subject', 'General')
        grade = request.form.get('grade', 'Unspecified')
        notes = request.form.get('notes', 'None')
        num_questions = request.form.get('num_questions', '5')
        question_types = request.form.get('question_types', 'single, multi-select')
    except Exception as e:
        app.logger.error(f"Error parsing form data: {e}")
        return jsonify({"success": False, "message": "Invalid request data."}), 400

    # --- Extract Text from Document ---
    try:
        file_bytes = file.read()
        extracted_text = ""
        if file.filename.lower().endswith('.pdf'):
            with fitz.open(stream=file_bytes, filetype="pdf") as doc:
                for page in doc:
                    extracted_text += page.get_text()
        elif file.filename.lower().endswith('.txt'):
            extracted_text = file_bytes.decode('utf-8', errors='ignore')
        else:
            return jsonify({"success": False, "message": "Unsupported file type. Please use PDF or TXT."}), 400
        
        if not extracted_text.strip():
            return jsonify({"success": False, "message": "Could not extract any text from the document."}), 400
    except Exception as e:
        app.logger.error(f"Error extracting text from file: {e}")
        return jsonify({"success": False, "message": "Failed to process the uploaded document."}), 500

    # --- Construct Prompts ---
    user_prompt = f"""Please generate {num_questions} questions from the following document.
- Subject: {subject}
- Grade Level: {grade}
- Desired Question Types: {question_types}
- Additional Teacher Notes: {notes}

Source Text:
---
{extracted_text[:15000]}
"""

    try:
        client = genai.Client(api_key=api_key)
        
        # Define the generation config using the types.GenerateContentConfig class
        generation_config = types.GenerateContentConfig(
            temperature=0.7,
            max_output_tokens=8192,
            response_mime_type="application/json"
        )
        
        # Call generate_content and pass the config object to the 'config' parameter
        response = client.models.generate_content(
            model='models/gemini-1.5-flash-latest', # Change to your preferred model
            contents=[SYSTEM_PROMPT, user_prompt],
            config=generation_config # Pass the object to the 'config' parameter
        )
        
        generated_json = json.loads(response.text)
        
        return jsonify({"success": True, "questions": generated_json})
        
    except json.JSONDecodeError:
        app.logger.error(f"Failed to decode JSON from Gemini response: {response.text}")
        return jsonify({"success": False, "message": "The AI returned an invalid JSON format. Please try again."}), 500
    except Exception as e:
        app.logger.error(f"An error occurred with the Google API call: {e}")
        return jsonify({"success": False, "message": f"An error occurred while generating questions: {str(e)}"}), 500
# @jwt_required() # This protects the endpoint
# def generate_questions():
#     # --- 1. Get User and Check Usage ---
#     current_user_identity = get_jwt_identity()
#     user_id = current_user_identity['id']
#     user = User.query.get(user_id)
    
#     # *** HERE IS THE USAGE LIMITING LOGIC ***
#     is_dev_user = os.getenv("DEV_MODE_USER_EMAIL") == user.email
    
#     if not is_dev_user:
#         # Calculate usage for the current month
#         start_of_month = datetime.now().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
#         usage_count = UsageLog.query.filter(
#             UsageLog.user_id == user.id,
#             UsageLog.timestamp >= start_of_month
#         ).count()
        
#         limit = TIER_LIMITS.get(user.subscription_tier, 0)
        
#         if usage_count >= limit:
#             return jsonify({"success": False, "message": "You have reached your monthly generation limit."}), 429 # Too Many Requests

#     # --- 2. Load Your Master API Key ---
#     api_key = os.getenv("GOOGLE_API_KEY") # This is now YOUR key, not the user's
    if not api_key:
        return jsonify({"message": "Server configuration error: API key not found."}), 500

    # --- 1. Extract Data from Request ---
    try:
        # Check for file part
        if 'document' not in request.files:
            return jsonify({"success": False, "message": "No document file provided."}), 400
        
        file = request.files['document']
        if file.filename == '':
            return jsonify({"success": False, "message": "No selected file."}), 400

        # Extract metadata from form fields
        subject = request.form.get('subject', 'General')
        grade = request.form.get('grade', 'Unspecified')
        notes = request.form.get('notes', 'None')
        num_questions = request.form.get('num_questions', '5')
        question_types = request.form.get('question_types', 'single, multi-select')

    except Exception as e:
        app.logger.error(f"Error parsing form data: {e}")
        return jsonify({"success": False, "message": "Invalid request data."}), 400

    # --- 2. Extract Text from Document ---
    try:
        file_bytes = file.read()
        extracted_text = ""
        if file.filename.lower().endswith('.pdf'):
            with fitz.open(stream=file_bytes, filetype="pdf") as doc:
                for page in doc:
                    extracted_text += page.get_text()
        elif file.filename.lower().endswith('.txt'):
            extracted_text = file_bytes.decode('utf-8')
        else:
            return jsonify({"success": False, "message": "Unsupported file type. Please use PDF or TXT."}), 400
        
        if not extracted_text.strip():
            return jsonify({"success": False, "message": "Could not extract any text from the document."}), 400

    except Exception as e:
        app.logger.error(f"Error extracting text from file: {e}")
        return jsonify({"success": False, "message": "Failed to process the uploaded document."}), 500

    # --- 3. Construct the User Prompt ---
    user_prompt = f"""
    Please generate {num_questions} questions from the following document.
    - Subject: {subject}
    - Grade Level: {grade}
    - Desired Question Types: {question_types}
    - Additional Teacher Notes: {notes}

    Source Text:
    ---
    {extracted_text[:15000]}
    """ # Truncate text to avoid overly large prompts

    # --- 4. Call the Google Gemini API ---
    try:
        # Initialize the client using the verified key
        client = genai.Client(api_key=api_key)
        
        # Select the model
        model = client.models.get('gemini-2.0-flash-lite') # Use a fast, capable model

        # Define the generation config, crucially requesting JSON output
        generation_config = {
            "temperature": 0.7,
            "max_output_tokens": 8192,
            "response_mime_type": "application/json",
        }

        # Make the non-streaming API call
        response = model.generate_content(
            [SYSTEM_PROMPT, user_prompt],
            generation_config=generation_config
        )
        
        # The response.text will be a clean JSON string because of response_mime_type
        generated_json = json.loads(response.text)

        if not is_dev_user:
            new_log = UsageLog(user_id=user.id)
            db.session.add(new_log)
            db.session.commit()
        #Uncomment after testing
        #return jsonify({"success": True, "questions": generated_json})
        pass
    except Exception as e:
        pass

    # For now, return a dummy success to test the pipeline
    return jsonify({"success": True, "questions": [{"id": "dummy_q_1", "type": "single", "Question": "This is a test question.", "Options": ["A", "B"], "answer": "A", "Rationale": "Because.", "hint": "h"}]})

    # except json.JSONDecodeError:
    #     app.logger.error(f"Failed to decode JSON from Gemini response: {response.text}")
    #     return jsonify({"success": False, "message": "The AI returned an invalid JSON format. Please try again."}), 500
    # except Exception as e:
    #     app.logger.error(f"An error occurred with the Google API call: {e}")
    #     return jsonify({"success": False, "message": f"An error occurred while generating questions: {e}"}), 500


# --- Server Execution ---
if __name__ == '__main__':
    with app.app_context():
        # This will create the database file if it doesn't exist
        db.create_all() 
    print("Starting backend server for Quiz Editor...")
    serve(app, host='0.0.0.0', port=5000)