import os
import io
import json
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pypdf import PdfReader
from groq import Groq
from dotenv import load_dotenv

# Load environment variables relative to the main.py directory
base_dir = os.path.dirname(os.path.abspath(__file__))
load_dotenv(dotenv_path=os.path.join(base_dir, ".env"))

app = FastAPI(title="AI Resume Matcher API", version="1.0.0")

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
@app.get("/api")
@app.get("/api/")
def read_root():
    return {"status": "online", "message": "Resume Matcher API is running", "version": "1.0.0"}

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
            raise HTTPException(
                status_code=400,
                detail="Could not extract text from the PDF. Ensure it is not a scanned image PDF."
            )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read PDF file: {str(e)}")

    # Get Groq API key
    groq_key = os.getenv("GROQ_API_KEY")
    if not groq_key:
        raise HTTPException(
            status_code=500,
            detail="GROQ_API_KEY is not configured. Please set it in environment variables."
        )

    prompt = f"""You are an expert HR Manager and Technical Recruiter with years of experience matching candidate resumes to job descriptions.
Analyze the following candidate resume text against the provided Job Description.

Job Description:
\"\"\"
{job_description}
\"\"\"

Candidate Resume:
\"\"\"
{resume_text}
\"\"\"

Respond ONLY with a valid JSON object matching this exact schema. No markdown, no explanation, just the JSON:

{{
  "match_score": <number 0-100>,
  "match_level": "<High|Medium|Low>",
  "summary": "<2-3 sentence summary of compatibility>",
  "matched_skills": ["<skill1>", "<skill2>"],
  "missing_skills": ["<skill1>", "<skill2>"],
  "suggestions": [
    "<actionable recommendation 1>",
    "<actionable recommendation 2>",
    "<actionable recommendation 3>"
  ],
  "interview_prep": [
    {{
      "question": "<tailored interview question>",
      "guideline": "<brief answer guideline>"
    }},
    {{
      "question": "<technical question>",
      "guideline": "<answer guideline>"
    }},
    {{
      "question": "<behavioral question>",
      "guideline": "<answer guideline>"
    }}
  ]
}}"""

    try:
        client = Groq(api_key=groq_key)
        chat_completion = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {
                    "role": "system",
                    "content": "You are an expert HR and recruitment AI. Always respond with valid JSON only."
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            response_format={"type": "json_object"},
            temperature=0.3,
            max_tokens=2048
        )

        raw = chat_completion.choices[0].message.content
        result_data = json.loads(raw)
        return result_data

    except json.JSONDecodeError:
        raise HTTPException(
            status_code=500,
            detail="AI response could not be parsed as JSON. Please try again."
        )
    except Exception as e:
        err_str = str(e)
        if "429" in err_str or "rate_limit" in err_str.lower() or "quota" in err_str.lower():
            raise HTTPException(
                status_code=429,
                detail="API rate limit reached. Please wait a moment and try again."
            )
        raise HTTPException(status_code=500, detail=f"AI API error: {err_str}")

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    host = os.getenv("HOST", "0.0.0.0")
    uvicorn.run(app, host=host, port=port)
