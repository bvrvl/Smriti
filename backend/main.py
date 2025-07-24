# --- Python Standard Library Imports ---
from contextlib import asynccontextmanager
import os
import datetime as dt
from typing import List
import re

# --- Third-Party Imports ---
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import Session

# --- NLP Library Imports ---
import nltk
from nltk.sentiment.vader import SentimentIntensityAnalyzer
from gensim.corpora import Dictionary
from gensim.models.ldamodel import LdaModel
from nltk.corpus import stopwords
from nltk.tokenize import word_tokenize
import spacy
from collections import Counter

# --- Local Application Imports ---
import database

# Tell NLTK where our pre-downloaded data is.
nltk.data.path.append("/root/nltk_data")
#load spaCy model for Named Entity Recognition
nlp = spacy.load("en_core_web_sm")
# =============================================================================
# INITIAL SETUP
# =============================================================================
database.Base.metadata.create_all(bind=database.engine)

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("Application startup complete.")
    yield
    print("Application shutting down.")

app = FastAPI(lifespan=lifespan)

# CORS Middleware
origins = ["http://localhost:5173"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Dependency for getting a database session
def get_db():
    db = database.SessionLocal()
    try:
        yield db
    finally:
        db.close()

# =============================================================================
# PYDANTIC MODELS
# =============================================================================
class EntrySchema(BaseModel):
    id: int
    entry_date: dt.date
    content: str
    class Config:
        from_attributes = True

class SentimentDataPoint(BaseModel):
    date: dt.date
    score: float

class Topic(BaseModel):
    topic_id: int
    keywords: List[str]

class EntityCount(BaseModel):
    text: str
    count: int

class NerResult(BaseModel):
    people: List[EntityCount]
    places: List[EntityCount]
    orgs: List[EntityCount]

# =============================================================================
# API ENDPOINTS
# =============================================================================
@app.post("/api/import")
def import_entries(db: Session = Depends(get_db)):
    data_dir = "/data"
    if not os.path.exists(data_dir):
        return {"message": "Data directory not found."}
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
    return db.query(database.JournalEntry).order_by(database.JournalEntry.entry_date.desc()).all()

@app.get("/api/analysis/sentiment", response_model=List[SentimentDataPoint])
def get_sentiment_analysis(db: Session = Depends(get_db)):
    sid = SentimentIntensityAnalyzer()
    entries = db.query(database.JournalEntry).order_by(database.JournalEntry.entry_date.asc()).all()
    results = []
    for entry in entries:
        sentiment_scores = sid.polarity_scores(entry.content)
        results.append({"date": entry.entry_date, "score": sentiment_scores['compound']})
    return results

@app.get("/api/analysis/topics", response_model=List[Topic])
def get_topic_analysis(db: Session = Depends(get_db)):
    entries = db.query(database.JournalEntry).all()
    if len(entries) < 5:
        return []
    stop_words = set(stopwords.words('english'))
    processed_docs = []
    for entry in entries:
        text = re.sub(r'[^a-zA-Z\s]', '', entry.content, re.I|re.A).lower()
        tokens = word_tokenize(text)
        filtered_tokens = [token for token in tokens if token not in stop_words and len(token) > 3]
        processed_docs.append(filtered_tokens)
    dictionary = Dictionary(processed_docs)
    if not dictionary:
        return []
    dictionary.filter_extremes(no_below=1, no_above=0.8)
    if not dictionary:
        return []
    corpus = [dictionary.doc2bow(doc) for doc in processed_docs]
    if not any(corpus):
        return []
    num_topics = 5 
    lda_model = LdaModel(corpus=corpus, id2word=dictionary, num_topics=num_topics, passes=15, random_state=100, chunksize=10)
    topics = []
    raw_topics = lda_model.print_topics(num_topics=num_topics, num_words=10)
    if not raw_topics:
        return []
    for idx, topic_str in raw_topics:
        keywords = [word.split('*')[1].replace('"', '').strip() for word in topic_str.split(' + ')]
        topics.append({"topic_id": idx, "keywords": keywords})
    return topics


@app.get("/api/analysis/ner", response_model=NerResult)
def get_ner_analysis(db: Session = Depends(get_db)):
    entries = db.query(database.JournalEntry).all()
    
    full_text = " ".join([entry.content for entry in entries])
    
    # Process the text with spaCy
    doc = nlp(full_text)
    
    # Extract and categorize entities
    people = [ent.text for ent in doc.ents if ent.label_ == "PERSON"]
    places = [ent.text for ent in doc.ents if ent.label_ in ["GPE", "LOC"]]
    orgs = [ent.text for ent in doc.ents if ent.label_ == "ORG"]
    
    # Count the occurrences of each unique entity
    people_counts = Counter(people)
    places_counts = Counter(places)
    orgs_counts = Counter(orgs)
    
    # Format the data for the API response, taking the top 15 of each
    top_people = [{"text": text, "count": count} for text, count in people_counts.most_common(15)]
    top_places = [{"text": text, "count": count} for text, count in places_counts.most_common(15)]
    top_orgs = [{"text": text, "count": count} for text, count in orgs_counts.most_common(15)]
    
    return {"people": top_people, "places": top_places, "orgs": top_orgs}