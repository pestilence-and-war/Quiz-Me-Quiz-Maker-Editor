# backend/main.py
import os
import json
import fitz  # PyMuPDF
from flask import Flask, request, jsonify
from flask_cors import CORS
from waitress import serve
from dotenv import load_dotenv, set_key

# Import the Google GenAI library
from google import genai
from google.api_core import exceptions as google_exceptions

# --- Flask App Initialization ---
app = Flask(__name__)
# Allow requests from your frontend's origin (e.g., http://127.0.0.1:5500)
# For development, you can allow all origins with "*"
CORS(app) 
load_dotenv()

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

@app.route('/api/verify-and-save-key', methods=['POST'])
def verify_and_save_key():
    """
    Receives an API key, verifies it with Google, and saves it to a .env file on success.
    """
    data = request.get_json()
    if not data or 'api_key' not in data:
        return jsonify({"success": False, "message": "API key is required."}), 400

    api_key = data['api_key']
    try:
        # Initialize a temporary client just for verification
        temp_client = genai.Client(api_key=api_key)
        # Attempt a lightweight, read-only API call to verify the key
        temp_client.models.list()
        
        # If successful, save the key to the .env file in the backend directory
        dotenv_path = os.path.join(os.path.dirname(__file__), '.env')
        set_key(dotenv_path, "GOOGLE_API_KEY", api_key)

        return jsonify({"success": True, "message": "API Key is valid and has been saved."})

    except google_exceptions.PermissionDenied:
        return jsonify({"success": False, "message": "Authentication failed. The API key is invalid or has insufficient permissions."}), 401
    except Exception as e:
        app.logger.error(f"An unexpected error occurred during API key verification: {e}")
        return jsonify({"success": False, "message": f"An error occurred: {e}"}), 500

@app.route('/api/generate-questions', methods=['POST'])
def generate_questions():
    """
    The main endpoint for generating questions.
    """
    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        return jsonify({"success": False, "message": "API key not configured on server. Please verify your key first."}), 401

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
    {extracted_text[:10000]}
    """ # Truncate text to avoid overly large prompts

    # --- 4. Call the Google Gemini API ---
    try:
        # Initialize the client using the verified key
        client = genai.Client(api_key=api_key)
        
        # Select the model
        model = client.models.get('gemini-1.5-flash-latest') # Use a fast, capable model

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
        
        return jsonify({"success": True, "questions": generated_json})

    except json.JSONDecodeError:
        app.logger.error(f"Failed to decode JSON from Gemini response: {response.text}")
        return jsonify({"success": False, "message": "The AI returned an invalid JSON format. Please try again."}), 500
    except Exception as e:
        app.logger.error(f"An error occurred with the Google API call: {e}")
        return jsonify({"success": False, "message": f"An error occurred while generating questions: {e}"}), 500


# --- Server Execution ---
if __name__ == '__main__':
    print("Starting backend server for Quiz Editor...")
    # Use Waitress, a production-ready WSGI server
    serve(app, host='0.0.0.0', port=5000)