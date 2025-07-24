# FINAL, CORRECTED version of /backend/main.py for the end of Phase 3

# --- Python Standard Library Imports ---
from contextlib import asynccontextmanager
import os
import datetime as dt # Using 'dt' alias for consistency
from typing import List # For type hinting a list response

# --- Third-Party Imports ---
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel # For creating response models
from sqlalchemy.orm import Session

# --- NLP Library Imports ---
import nltk
from nltk.sentiment.vader import SentimentIntensityAnalyzer

# --- Local Application Imports ---
import database

# =============================================================================
# INITIAL SETUP
# =============================================================================

# Download the VADER lexicon (sentiment analysis model) if it's not already present.
# This happens once when the application starts.
try:
    nltk.data.find('sentiment/vader_lexicon.zip')
except LookupError:
    print("Downloading VADER lexicon...")
    nltk.download('vader_lexicon')
    print("Download complete.")

# Create the database tables defined in database.py if they don't already exist.
# This also happens once on startup.
database.Base.metadata.create_all(bind=database.engine)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Code here runs on startup
    print("Application startup complete.")
    yield
    # Code here runs on shutdown
    print("Application shutting down.")


app = FastAPI(lifespan=lifespan)

# CORS Middleware: Allows the frontend (running on port 5173) to communicate with this backend.
origins = ["http://localhost:5173"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Dependency to get a database session for each request.
def get_db():
    db = database.SessionLocal()
    try:
        yield db
    finally:
        db.close()


# =============================================================================
# PYDANTIC MODELS (Data Shapes for API)
# =============================================================================

class EntrySchema(BaseModel):
    id: int
    entry_date: dt.date
    content: str

    class Config:
        # Use from_attributes for Pydantic V2 compatibility
        from_attributes = True

class SentimentDataPoint(BaseModel):
    date: dt.date
    score: float


# =============================================================================
# API ENDPOINTS
# =============================================================================

@app.get("/")
def read_root():
    return {"message": "Hello from your FastAPI Backend!"}


@app.post("/api/import")
def import_entries(db: Session = Depends(get_db)):
    data_dir = "/data" # This path is INSIDE the Docker container
    if not os.path.exists(data_dir):
        return {"message": "Data directory not found. Make sure you have a /data folder."}

    imported_count = 0
    for filename in os.listdir(data_dir):
        if filename.endswith(".md"):
            try:
                date_str = filename.split('.')[0]
                entry_date = dt.datetime.strptime(date_str, "%Y-%m-%d").date()
                
                with open(os.path.join(data_dir, filename), 'r') as f:
                    content = f.read()
                
                exists = db.query(database.JournalEntry).filter(database.JournalEntry.entry_date == entry_date).first()
                if not exists:
                    new_entry = database.JournalEntry(entry_date=entry_date, content=content)
                    db.add(new_entry)
                    imported_count += 1
            except ValueError:
                print(f"Skipping file with invalid name format: {filename}")
                continue
    
    db.commit()
    return {"message": f"Successfully imported {imported_count} new entries."}


@app.get("/api/entries", response_model=List[EntrySchema])
def get_entries(db: Session = Depends(get_db)):
    entries = db.query(database.JournalEntry).order_by(database.JournalEntry.entry_date.desc()).all()
    return entries


@app.get("/api/analysis/sentiment", response_model=List[SentimentDataPoint])
def get_sentiment_analysis(db: Session = Depends(get_db)):
    sid = SentimentIntensityAnalyzer()
    entries = db.query(database.JournalEntry).order_by(database.JournalEntry.entry_date.asc()).all()
    
    results = []
    for entry in entries:
        sentiment_scores = sid.polarity_scores(entry.content)
        # The 'compound' score is a single metric from -1 (very negative) to +1 (very positive)
        results.append({"date": entry.entry_date, "score": sentiment_scores['compound']})
        
    return results