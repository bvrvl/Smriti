import datetime as dt
import os
import re
from collections import Counter
from contextlib import asynccontextmanager
from itertools import combinations
from typing import List, Union


#Third-Party Imports
import nltk
import spacy
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from gensim.corpora import Dictionary
from gensim.models.ldamodel import LdaModel
from nltk.corpus import stopwords
from nltk.sentiment.vader import SentimentIntensityAnalyzer
from pydantic import BaseModel, Field
from sqlalchemy import and_, or_, not_, extract
from sqlalchemy.orm import Session

from sentence_transformers import SentenceTransformer
import numpy as np
import pickle
from sklearn.metrics.pairwise import cosine_similarity


import database

# --- Global Setup & Model Loading ---
# Load the spaCy model into memory once on startup
nlp = spacy.load("en_core_web_sm")

# Increase the max_length limit to handle large combined text from all journals
nlp.max_length = 2000000
embedding_model = SentenceTransformer('all-MiniLM-L6-v2')

database.Base.metadata.create_all(bind=database.engine)


@asynccontextmanager
async def lifespan(app: FastAPI):
    #Creates a single, shared database session for the application's entire lifespan.
    app.state.db = database.SessionLocal()
    print("Application startup complete. Database session created.")
    yield
    app.state.db.close()
    print("Application shutting down. Database session closed.")


app = FastAPI(lifespan=lifespan)

#--- Middleware ---
origins = ["http://localhost:5173"]
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])


#--- Pydantic Models (API Data Schemas) ---
class EntrySchema(BaseModel):
    id: int
    entry_date: dt.datetime # Changed to datetime
    content: str
    tags: str | None = None
    class Config: from_attributes = True

class SentimentDataPoint(BaseModel): date: dt.datetime; score: float # Changed to datetime
class AggregatedSentiment(BaseModel): label: Union[int, str]; average_score: float
class Topic(BaseModel): topic_id: int; keywords: List[str]
class EntityCount(BaseModel): text: str; count: int
class NerResult(BaseModel): people: List[EntityCount]; places: List[EntityCount]; orgs: List[EntityCount]
class CoOccurrenceRequest(BaseModel): entities: List[str] = Field(..., min_length=2, max_length=4)
class VennSet(BaseModel): key: List[str]; data: int
class CommonConnectionResult(BaseModel): entity1: str; entity2: str; common_entities: List[EntityCount]
class SemanticSearchRequest(BaseModel):
    query: str

#--- API Endpoints ---
@app.post("/api/import")
def import_entries(request: Request):
    db = request.app.state.db
    data_dir = "/data"
    if not os.path.exists(data_dir): return {"message": "Data directory not found."}

    imported_count, skipped_count = 0, 0
    
    # Stage 1: Read and parse all files into a temporary list.
    all_parsed_entries = []
    for filename in os.listdir(data_dir):
        if not filename.endswith((".md", ".txt")): continue
        with open(os.path.join(data_dir, filename), 'r', encoding='utf-8') as f: raw_content = f.read()
        date_obj, tags, clean_content = None, None, ""
        date_match = re.search(r"Created:\s*(.+)", raw_content)
        if date_match:
            date_str = date_match.group(1).strip()
            for fmt in ("%B %d, %Y %I:%M %p", "%B %d, %Y"):
                try:
                    date_obj = dt.datetime.strptime(date_str, fmt) # Keep as datetime object
                    break
                except ValueError: continue
        if not date_obj:
            try:
                date_obj = dt.datetime.strptime(filename.split('.')[0], "%Y-%m-%d") # Keep as datetime
            except ValueError:
                skipped_count += 1
                continue
        tags_match = re.search(r"Tags:\s*(.+)", raw_content)
        if tags_match: tags = tags_match.group(1).strip()
        lines = raw_content.splitlines()
        content_lines = [line for line in lines if not (line.strip().startswith('#') or line.strip().lower().startswith('created:') or line.strip().lower().startswith('tags:'))]
        clean_content = "\n".join(content_lines).strip()
        all_parsed_entries.append({"entry_date": date_obj, "content": clean_content, "tags": tags})

    # Stage 2: Perform a single, efficient database transaction.
    if all_parsed_entries:
        existing_dates = {result[0] for result in db.query(database.JournalEntry.entry_date).all()}
        unique_new_entries = {}
        for parsed_entry in all_parsed_entries:
            entry_date = parsed_entry["entry_date"]
            if entry_date not in existing_dates and entry_date not in unique_new_entries:
                unique_new_entries[entry_date] = parsed_entry
        entries_to_add = []
        for entry_data in unique_new_entries.values():
        # Generate the vector embedding for the entry's content
            vector = embedding_model.encode(entry_data['content'])
        # We must serialize the numpy array to bytes to store it in the BLOB
            entry_data['embedding'] = pickle.dumps(vector)
            entries_to_add.append(database.JournalEntry(**entry_data))

        if entries_to_add:
            db.add_all(entries_to_add)
            db.commit()
            imported_count = len(entries_to_add)
    return {"message": f"Successfully imported {imported_count} new entries. Skipped {skipped_count} files."}


@app.get("/api/entries", response_model=List[EntrySchema])
def get_entries(request: Request):
    db = request.app.state.db
    return db.query(database.JournalEntry).order_by(database.JournalEntry.entry_date.desc()).all()


@app.get("/api/on-this-day", response_model=List[EntrySchema])
def get_on_this_day(request: Request):
    db = request.app.state.db
    today = dt.date.today()
    return db.query(database.JournalEntry).filter(
        extract('month', database.JournalEntry.entry_date) == today.month,
        extract('day', database.JournalEntry.entry_date) == today.day
    ).order_by(database.JournalEntry.entry_date.asc()).all()


@app.get("/api/analysis/sentiment", response_model=List[SentimentDataPoint])
def get_sentiment_analysis(request: Request):
    db = request.app.state.db
    sid = SentimentIntensityAnalyzer()
    entries = db.query(database.JournalEntry).order_by(database.JournalEntry.entry_date.asc()).all()
    results = []
    for entry in entries:
        sentiment_scores = sid.polarity_scores(entry.content)
        results.append({"date": entry.entry_date, "score": sentiment_scores['compound']})
    return results


@app.get("/api/analysis/sentiment/weekday", response_model=List[AggregatedSentiment])
def get_sentiment_by_weekday(request: Request):
    db = request.app.state.db
    sid = SentimentIntensityAnalyzer()
    entries = db.query(database.JournalEntry).all()
    weekday_scores = {i: [] for i in range(7)}
    for entry in entries:
        weekday = entry.entry_date.weekday()
        score = sid.polarity_scores(entry.content)['compound']
        weekday_scores[weekday].append(score)
    weekday_map = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
    results = []
    for i in range(7):
        if weekday_scores[i]:
            avg = sum(weekday_scores[i]) / len(weekday_scores[i])
            results.append({"label": weekday_map[i], "average_score": avg})
    return results


@app.get("/api/analysis/sentiment/month", response_model=List[AggregatedSentiment])
def get_sentiment_by_month(request: Request):
    db = request.app.state.db
    sid = SentimentIntensityAnalyzer()
    entries = db.query(database.JournalEntry).all()
    month_scores = {i: [] for i in range(1, 13)}
    for entry in entries:
        month = entry.entry_date.month
        score = sid.polarity_scores(entry.content)['compound']
        month_scores[month].append(score)
    month_map = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    results = []
    for i in range(1, 13):
        if month_scores[i]:
            avg = sum(month_scores[i]) / len(month_scores[i])
            results.append({"label": month_map[i-1], "average_score": avg})
    return results

@app.get("/api/analysis/sentiment/hour", response_model=List[AggregatedSentiment])
def get_sentiment_by_hour(request: Request):
    db = request.app.state.db
    sid = SentimentIntensityAnalyzer()
    entries = db.query(database.JournalEntry).all()
    hour_scores = {i: [] for i in range(24)}
    for entry in entries:
        hour = entry.entry_date.hour
        score = sid.polarity_scores(entry.content)['compound']
        hour_scores[hour].append(score)
    results = []
    for hour, scores in hour_scores.items():
        if scores:
            avg_score = sum(scores) / len(scores)
            label = f"{hour:02d}:00" 
            results.append({"label": label, "average_score": avg_score})
    return sorted(results, key=lambda x: x['label'])


@app.get("/api/analysis/topics", response_model=List[Topic])
def get_topic_analysis(request: Request):
    """Uses LDA to discover latent topics from the entire journal corpus."""
    db = request.app.state.db
    entries = db.query(database.JournalEntry).all()
    if len(entries) < 5:
        return []

    stop_words = set(stopwords.words('english'))
    processed_docs = []
    for entry in entries:
        text = re.sub(r'[^a-zA-Z\s]', '', entry.content, re.I|re.A).lower()
        tokens = nltk.word_tokenize(text)
        filtered_tokens = [token for token in tokens if token not in stop_words and len(token) > 3]
        processed_docs.append(filtered_tokens)

    dictionary = Dictionary(processed_docs)
    if not dictionary: return []

    dictionary.filter_extremes(no_below=1, no_above=0.8)
    if not dictionary: return []

    corpus = [dictionary.doc2bow(doc) for doc in processed_docs]
    if not any(corpus): return []

    lda_model = LdaModel(corpus=corpus, id2word=dictionary, num_topics=5, passes=15, random_state=100, chunksize=10)
    
    topics = []
    raw_topics = lda_model.print_topics(num_topics=5, num_words=10)
    if not raw_topics: return []
        
    for idx, topic_str in raw_topics:
        keywords = [word.split('*')[1].replace('"', '').strip() for word in topic_str.split(' + ')]
        topics.append({"topic_id": idx, "keywords": keywords})
        
    return topics


@app.get("/api/analysis/ner", response_model=NerResult)
def get_ner_analysis(request: Request):
    """Performs Named Entity Recognition to find all people, places, and organizations."""
    db = request.app.state.db
    entries = db.query(database.JournalEntry).all()
    full_text = " ".join([entry.content for entry in entries])
    doc = nlp(full_text)
    
    people = [ent.text for ent in doc.ents if ent.label_ == "PERSON"]
    places = [ent.text for ent in doc.ents if ent.label_ in ["GPE", "LOC"]]
    orgs = [ent.text for ent in doc.ents if ent.label_ == "ORG"]
    
    people_counts = Counter(people)
    places_counts = Counter(places)
    orgs_counts = Counter(orgs)
    
    top_people = [{"text": text, "count": count} for text, count in people_counts.most_common(15)]
    top_places = [{"text": text, "count": count} for text, count in places_counts.most_common(15)]
    top_orgs = [{"text": text, "count": count} for text, count in orgs_counts.most_common(15)]
    
    return {"people": top_people, "places": top_places, "orgs": top_orgs}

@app.post("/api/analysis/co-occurrence", response_model=List[VennSet])
def post_co_occurrence(req: CoOccurrenceRequest, request: Request):
    """Calculates the size of all intersections for a given list of entities."""
    db = request.app.state.db
    entity_list = list(set(req.entities))
    
    # Efficiently pre-fetch only the entries that contain at least one of the entities.
    base_query = db.query(database.JournalEntry.content).filter(
        or_(*[database.JournalEntry.content.like(f"%{entity}%") for entity in entity_list])
    ).all()
    relevant_entries = [entry.content for entry in base_query]

    results = []
    # Calculate the size of every possible intersection (e.g., [A], [B], [A,B], [C], [A,C]...)
    for i in range(1, len(entity_list) + 1):
        for combo in combinations(entity_list, i):
            combo_list = list(combo)
            count = sum(1 for entry in relevant_entries if all(entity in entry for entity in combo_list))
            if count > 0:
                results.append({"key": combo_list, "data": count})
    return results


@app.get("/api/analysis/common-connections", response_model=CommonConnectionResult)
def get_common_connections(entity1: str, entity2: str, request: Request):
    """Finds which other entities appear most frequently alongside a specific pair of entities."""
    db = request.app.state.db
    if not entity1 or not entity2 or entity1 == entity2:
        return {"entity1": entity1, "entity2": entity2, "common_entities": []}

    # Find all entries where both entities are present.
    query = db.query(database.JournalEntry.content).filter(
        and_(
            database.JournalEntry.content.like(f"%{entity1}%"),
            database.JournalEntry.content.like(f"%{entity2}%")
        )
    ).all()
    intersection_text = " ".join([entry.content for entry in query])
    
    if not intersection_text:
        return {"entity1": entity1, "entity2": entity2, "common_entities": []}

    # Run NER only on this smaller subset of text.
    doc = nlp(intersection_text)
    
    # Find all other entities, excluding the original two.
    other_entities = [
        ent.text for ent in doc.ents 
        if ent.text.lower() not in [entity1.lower(), entity2.lower()]
    ]
    
    common_counts = Counter(other_entities)
    top_common = [{"text": text, "count": count} for text, count in common_counts.most_common(10)]
    
    return {"entity1": entity1, "entity2": entity2, "common_entities": top_common}

@app.post("/api/search/semantic", response_model=List[EntrySchema])
def semantic_search(search_req: SemanticSearchRequest, request: Request):
    db = request.app.state.db
    
    # Step 1: Fetch all entries that have an embedding
    entries_with_embeddings = db.query(database.JournalEntry).filter(
        database.JournalEntry.embedding.is_not(None)
    ).all()

    if not entries_with_embeddings:
        return []

    # Step 2: Convert the user's query into a vector
    query_vector = embedding_model.encode([search_req.query])

    # Step 3: Calculate similarity
    entry_embeddings = np.array([pickle.loads(entry.embedding) for entry in entries_with_embeddings])
    similarities = cosine_similarity(query_vector, entry_embeddings)[0]

    # Step 4: Find the top 10 most similar entries
    top_indices = np.argsort(similarities)[-10:][::-1]
    
    top_entries = [entries_with_embeddings[i] for i in top_indices if similarities[i] > 0.3] # Threshold
    
    return top_entries