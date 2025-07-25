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
from pydantic import Field
from sqlalchemy.orm import Session
from sqlalchemy import or_

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
    tags: str | None = None
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

class CoOccurrenceRequest(BaseModel):
    # We'll allow between 2 and 4 entities for a clean Venn diagram
    entities: List[str] = Field(..., min_length=2, max_length=4)

class VennSet(BaseModel):
    key: List[str]
    data: int

class CommonConnectionResult(BaseModel):
    entity1: str
    entity2: str
    common_entities: List[EntityCount]


# =============================================================================
# API ENDPOINTS
# =============================================================================
@app.post("/api/import")
def parse_and_clean_content(file_content: str, filename: str):
    """
    Parses metadata from the journal entry, cleans the content, and returns a structured dictionary.
    """
    date_obj = None
    tags = None
    
    # 1. Try to find date in "Created: Month Day, Year HH:MM AM/PM" format
    date_match = re.search(r"Created:\s*(.+)", file_content)
    if date_match:
        date_str = date_match.group(1).strip()
        # Try parsing with time, then without, to be flexible
        for fmt in ("%B %d, %Y %I:%M %p", "%B %d, %Y"):
            try:
                date_obj = dt.datetime.strptime(date_str, fmt).date()
                break
            except ValueError:
                continue

    # 2. If no date found in content, fallback to filename parsing
    if not date_obj:
        try:
            date_str = filename.split('.')[0]
            date_obj = dt.datetime.strptime(date_str, "%Y-%m-%d").date()
        except ValueError:
            # If filename also fails, we can't process this entry
            return None

    # 3. Find tags
    tags_match = re.search(r"Tags:\s*(.+)", file_content)
    if tags_match:
        tags = tags_match.group(1).strip()

    # 4. Clean the content: remove title, Created line, and Tags line
    lines = file_content.splitlines()
    content_lines = []
    for line in lines:
        if not line.strip().startswith('#') and \
           not line.strip().lower().startswith('created:') and \
           not line.strip().lower().startswith('tags:'):
            content_lines.append(line)
    
    clean_content = "\n".join(content_lines).strip()
    
    return {
        "entry_date": date_obj,
        "tags": tags,
        "content": clean_content
    }


@app.post("/api/import")
def import_entries(db: Session = Depends(get_db)):
    data_dir = "/data"
    if not os.path.exists(data_dir):
        return {"message": "Data directory not found."}

    imported_count = 0
    skipped_count = 0
    for filename in os.listdir(data_dir):
        if filename.endswith((".md", ".txt")):
            with open(os.path.join(data_dir, filename), 'r', encoding='utf-8') as f:
                raw_content = f.read()
            
            parsed_data = parse_and_clean_content(raw_content, filename)
            
            if not parsed_data:
                skipped_count += 1
                continue
            
            # Check if an entry for this date already exists in the DB
            exists = db.query(database.JournalEntry).filter(
                database.JournalEntry.entry_date == parsed_data["entry_date"]
            ).first()
            
            if not exists:
                new_entry = database.JournalEntry(
                    entry_date=parsed_data["entry_date"],
                    content=parsed_data["content"],
                    tags=parsed_data["tags"]
                )
                db.add(new_entry)
                imported_count += 1
    
    db.commit()
    return {
        "message": f"Successfully imported {imported_count} new entries. Skipped {skipped_count} files."
    }

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

from sqlalchemy import and_, not_

@app.post("/api/analysis/co-occurrence", response_model=List[VennSet])
def post_co_occurrence(request: CoOccurrenceRequest, db: Session = Depends(get_db)):
    """
    Calculates the co-occurrence for a list of 2 to 4 entities.
    """
    from itertools import combinations

    entity_list = list(set(request.entities)) # Ensure unique entities
    
    # Get all entries that contain at least one of the entities for efficiency
    base_query = db.query(database.JournalEntry.content).filter(
        or_(*[database.JournalEntry.content.like(f"%{entity}%") for entity in entity_list])
    ).all()
    
    # The list of all relevant journal entries as strings
    relevant_entries = [entry.content for entry in base_query]

    results = []
    # We need to calculate the size of every possible intersection (singles, pairs, triples, etc.)
    for i in range(1, len(entity_list) + 1):
        for combo in combinations(entity_list, i):
            combo_list = list(combo)
            
            # Count how many entries contain ALL entities in the current combination
            count = sum(1 for entry in relevant_entries if all(entity in entry for entity in combo_list))
            
            if count > 0:
                results.append({"key": combo_list, "data": count})

    return results

@app.get("/api/analysis/common-connections", response_model=CommonConnectionResult)
def get_common_connections(entity1: str, entity2: str, db: Session = Depends(get_db)):
    if not entity1 or not entity2 or entity1 == entity2:
        return {"entity1": entity1, "entity2": entity2, "common_entities": []}

    # Find all entries containing both entity1 and entity2
    query = db.query(database.JournalEntry.content).filter(
        and_(
            database.JournalEntry.content.like(f"%{entity1}%"),
            database.JournalEntry.content.like(f"%{entity2}%")
        )
    ).all()
    
    intersection_text = " ".join([entry.content for entry in query])
    
    if not intersection_text:
        return {"entity1": entity1, "entity2": entity2, "common_entities": []}

    # Now run NER on just this subset of text
    doc = nlp(intersection_text)
    
    # Extract all entities, EXCLUDING the two we searched for
    other_entities = [
        ent.text for ent in doc.ents 
        if ent.text.lower() not in [entity1.lower(), entity2.lower()]
    ]
    
    # Count and return the top 10 most common
    common_counts = Counter(other_entities)
    top_common = [{"text": text, "count": count} for text, count in common_counts.most_common(10)]
    
    return {"entity1": entity1, "entity2": entity2, "common_entities": top_common}