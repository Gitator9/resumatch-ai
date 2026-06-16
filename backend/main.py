import os
import io
import json
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from pypdf import PdfReader
import google.generativeai as genai
from dotenv import load_dotenv

# Load environment variables relative to the main.py directory
base_dir = os.path.dirname(os.path.abspath(__file__))
load_dotenv(dotenv_path=os.path.join(base_dir, ".env"))

# Configure Gemini API on startup if key exists
api_key = os.getenv("GEMINI_API_KEY")
if api_key:
    genai.configure(api_key=api_key)
else:
    print("WARNING: GEMINI_API_KEY is not set on startup. Ensure it is configured in backend/.env")

app = FastAPI(title="AI Resume Matcher API", version="1.0.0")

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins for development
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"status": "online", "message": "Resume Matcher API is running"}

@app.post("/api/analyze")
async def analyze_resume(
    file: UploadFile = File(...),
    job_description: str = Form(...)
):
    # Validate file type
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF resumes are supported.")
    
    # Read PDF text
    try:
        pdf_bytes = await file.read()
        pdf_file = io.BytesIO(pdf_bytes)
        reader = PdfReader(pdf_file)
        
        resume_text = ""
        for page in reader.pages:
            text = page.extract_text()
            if text:
                resume_text += text + "\n"
        
        if not resume_text.strip():
            raise HTTPException(status_code=400, detail="Could not extract text from the PDF. Ensure it is not a scanned image PDF.")
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read PDF file: {str(e)}")

    # Call Gemini API (Retrieve and configure dynamically)
    current_key = os.getenv("GEMINI_API_KEY")
    if not current_key:
        raise HTTPException(status_code=500, detail="Gemini API key is not configured. Please set GEMINI_API_KEY on the backend.")
    
    genai.configure(api_key=current_key)

    prompt = f"""
You are an expert HR Manager and Technical Recruiter with years of experience matching candidate resumes to job descriptions.
Analyze the following candidate resume text against the provided Job Description.

Job Description:
\"\"\"
{job_description}
\"\"\"

Candidate Resume:
\"\"\"
{resume_text}
\"\"\"

Provide your assessment in a strict JSON format matching the following schema. Return only the JSON object. Do not wrap in markdown quotes.

JSON Schema:
{{
  "match_score": number (0 to 100 representing percentage match),
  "match_level": "High" | "Medium" | "Low",
  "summary": "Brief 2-3 sentence summary explaining the compatibility evaluation",
  "matched_skills": ["List", "of", "skills", "found", "in", "both", "resume", "and", "job", "description"],
  "missing_skills": ["List", "of", "critical", "skills", "in", "job", "description", "but", "missing", "or", "weak", "in", "resume"],
  "suggestions": [
    "Specific actionable recommendation 1",
    "Specific actionable recommendation 2",
    "Specific actionable recommendation 3"
  ],
  "interview_prep": [
    {{
      "question": "Tailored interview question checking a missing or key skill area",
      "guideline": "Brief advice on what the recruiter is looking for and how the candidate should answer this question based on their resume"
    }},
    {{
      "question": "Another tailored technical question",
      "guideline": "Answer outline/guideline"
    }},
    {{
      "question": "Another tailored behavioral question based on their experience gap",
      "guideline": "Answer outline/guideline"
    }}
  ]
}}
"""

    try:
        # We use gemini-3.5-flash as it is extremely fast and effective for JSON-based resume analysis
        model = genai.GenerativeModel('gemini-3.5-flash')
        response = model.generate_content(
            prompt,
            generation_config={"response_mime_type": "application/json"}
        )
        
        # Parse the JSON response
        result_data = json.loads(response.text)
        return result_data
        
    except json.JSONDecodeError as jde:
        # Fallback if AI output is not perfectly structured
        raise HTTPException(status_code=500, detail="AI response could not be parsed as valid JSON. Please try again.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gemini API execution error: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    host = os.getenv("HOST", "0.0.0.0")
    uvicorn.run(app, host=host, port=port)
