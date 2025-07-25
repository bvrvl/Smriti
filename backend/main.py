import asyncio
import datetime as dt
import os
import pickle
import re
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from itertools import combinations
from threading import Lock
from typing import List, Union

# Third-Party Imports
import nltk
import numpy as np
import spacy
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from gensim.corpora import Dictionary
from gensim.models.ldamodel import LdaModel
from nltk.corpus import stopwords
from nltk.sentiment.vader import SentimentIntensityAnalyzer
from pydantic import BaseModel, Field
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity
from sqlalchemy import and_, or_, not_, extract
from sqlalchemy.orm import Session

import database

# --- Global State for Background Task ---
# This tracks our long-running embedding task so the frontend can poll its status.
embedding_status = {"status": "idle", "progress": 0, "total": 0}
status_lock = Lock()  # Prevents race conditions when updating the status

# --- Global Setup & Model Loading ---
nlp = spacy.load("en_core_web_sm")
nlp.max_length = 2000000
embedding_model = SentenceTransformer('all-MiniLM-L6-v2')
database.Base.metadata.create_all(bind=database.engine)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Manages application state, including a thread pool for background tasks.
    app.state.executor = ThreadPoolExecutor()
    app.state.db = database.SessionLocal()
    print("Application startup complete.")
    yield
    app.state.db.close()
    app.state.executor.shutdown()
    print("Application shutting down.")


app = FastAPI(lifespan=lifespan)

# --- Middleware & Pydantic Models ---
origins = ["http://localhost:5173"]
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

class EntrySchema(BaseModel):
    id: int
    entry_date: dt.datetime
    content: str
    tags: str | None = None
    class Config: from_attributes = True

class SentimentDataPoint(BaseModel): date: dt.datetime; score: float
class AggregatedSentiment(BaseModel): label: Union[int, str]; average_score: float
class Topic(BaseModel): topic_id: int; keywords: List[str]
class EntityCount(BaseModel): text: str; count: int
class NerResult(BaseModel): people: List[EntityCount]; places: List[EntityCount]; orgs: List[EntityCount]
class CoOccurrenceRequest(BaseModel): entities: List[str] = Field(..., min_length=2, max_length=4)
class VennSet(BaseModel): key: List[str]; data: int
class CommonConnectionResult(BaseModel): entity1: str; entity2: str; common_entities: List[EntityCount]
class SemanticSearchRequest(BaseModel): query: str


# --- Background Embedding Task ---
def run_embedding_generation(db: Session):
    """This function runs in a background thread to generate embeddings without blocking the server."""
    global embedding_status, status_lock

    try:
        entries_to_embed = db.query(database.JournalEntry).filter(database.JournalEntry.embedding.is_(None)).all()
        
        with status_lock:
            if not entries_to_embed:
                embedding_status["status"] = "idle"
                return
            embedding_status["status"] = "processing"
            embedding_status["total"] = len(entries_to_embed)
            embedding_status["progress"] = 0

        print(f"Embedding task: Starting to process {len(entries_to_embed)} entries.")
        for i, entry in enumerate(entries_to_embed):
            vector = embedding_model.encode(entry.content)
            entry.embedding = pickle.dumps(vector)
            with status_lock:
                embedding_status["progress"] = i + 1
        
        db.commit()
        print("Embedding task: Successfully generated and saved all embeddings.")

    except Exception as e:
        print(f"Embedding task ERROR: {e}")
        db.rollback()
    finally:
        with status_lock:
            embedding_status["status"] = "idle"


# --- API Endpoints ---
@app.post("/api/import")
async def import_entries(request: Request):
    db = request.app.state.db
    executor = request.app.state.executor
    loop = asyncio.get_running_loop()
    
    imported_count, skipped_count = 0, 0
    all_parsed_entries = []
    for filename in os.listdir("/data"):
        if not filename.endswith((".md", ".txt")): continue
        with open(os.path.join("/data", filename), 'r', encoding='utf-8') as f: raw_content = f.read()
        date_obj, tags, clean_content = None, None, ""
        date_match = re.search(r"Created:\s*(.+)", raw_content)
        if date_match:
            date_str = date_match.group(1).strip()
            for fmt in ("%B %d, %Y %I:%M %p", "%B %d, %Y"):
                try:
                    date_obj = dt.datetime.strptime(date_str, fmt)
                    break
                except ValueError: continue
        if not date_obj:
            try:
                date_obj = dt.datetime.strptime(filename.split('.')[0], "%Y-m-%d")
            except ValueError:
                skipped_count += 1
                continue
        tags_match = re.search(r"Tags:\s*(.+)", raw_content)
        if tags_match: tags = tags_match.group(1).strip()
        lines = raw_content.splitlines()
        content_lines = [line for line in lines if not (line.strip().startswith('#') or line.strip().lower().startswith('created:') or line.strip().lower().startswith('tags:'))]
        clean_content = "\n".join(content_lines).strip()
        all_parsed_entries.append({"entry_date": date_obj, "content": clean_content, "tags": tags})

    if all_parsed_entries:
        existing_dates = {result[0] for result in db.query(database.JournalEntry.entry_date).all()}
        unique_new_entries = {p["entry_date"]: p for p in all_parsed_entries if p["entry_date"] not in existing_dates}
        entries_to_add = [database.JournalEntry(**data) for data in unique_new_entries.values()]
        
        if entries_to_add:
            db.add_all(entries_to_add)
            db.commit()
            imported_count = len(entries_to_add)
            # IMPORTANT: Start the heavy embedding task in the background AFTER committing.
            loop.run_in_executor(executor, run_embedding_generation, db)

    return {"message": f"Imported {imported_count} new entries. Skipped {skipped_count}. Embedding process started."}


@app.get("/api/import/status")
def get_import_status():
    """New endpoint for the frontend to poll for embedding progress."""
    with status_lock:
        return embedding_status


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
    db = request.app.state.db
    entries = db.query(database.JournalEntry).all()
    if len(entries) < 5: return []
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
    db = request.app.state.db
    entries = db.query(database.JournalEntry).all()
    full_text = " ".join([entry.content for entry in entries])
    doc = nlp(full_text)
    people = [ent.text for ent in doc.ents if ent.label_ == "PERSON"]
    places = [ent.text for ent in doc.ents if ent.label_ in ["GPE", "LOC"]]
    orgs = [ent.text for ent in doc.ents if ent.label_ == "ORG"]
    people_counts, places_counts, orgs_counts = Counter(people), Counter(places), Counter(orgs)
    top_people = [{"text": text, "count": count} for text, count in people_counts.most_common(15)]
    top_places = [{"text": text, "count": count} for text, count in places_counts.most_common(15)]
    top_orgs = [{"text": text, "count": count} for text, count in orgs_counts.most_common(15)]
    return {"people": top_people, "places": top_places, "orgs": top_orgs}


@app.post("/api/analysis/co-occurrence", response_model=List[VennSet])
def post_co_occurrence(req: CoOccurrenceRequest, request: Request):
    db = request.app.state.db
    entity_list = list(set(req.entities))
    base_query = db.query(database.JournalEntry.content).filter(or_(*[database.JournalEntry.content.like(f"%{entity}%") for entity in entity_list])).all()
    relevant_entries = [entry.content for entry in base_query]
    results = []
    for i in range(1, len(entity_list) + 1):
        for combo in combinations(entity_list, i):
            combo_list = list(combo)
            count = sum(1 for entry in relevant_entries if all(entity in entry for entity in combo_list))
            if count > 0:
                results.append({"key": combo_list, "data": count})
    return results


@app.get("/api/analysis/common-connections", response_model=CommonConnectionResult)
def get_common_connections(entity1: str, entity2: str, request: Request):
    db = request.app.state.db
    if not entity1 or not entity2 or entity1 == entity2: return {"entity1": entity1, "entity2": entity2, "common_entities": []}
    query = db.query(database.JournalEntry.content).filter(and_(database.JournalEntry.content.like(f"%{entity1}%"), database.JournalEntry.content.like(f"%{entity2}%"))).all()
    intersection_text = " ".join([entry.content for entry in query])
    if not intersection_text: return {"entity1": entity1, "entity2": entity2, "common_entities": []}
    doc = nlp(intersection_text)
    other_entities = [ent.text for ent in doc.ents if ent.text.lower() not in [entity1.lower(), entity2.lower()]]
    common_counts = Counter(other_entities)
    top_common = [{"text": text, "count": count} for text, count in common_counts.most_common(10)]
    return {"entity1": entity1, "entity2": entity2, "common_entities": top_common}


@app.post("/api/search/semantic", response_model=List[EntrySchema])
def semantic_search(search_req: SemanticSearchRequest, request: Request):
    db = request.app.state.db
    entries_with_embeddings = db.query(database.JournalEntry).filter(database.JournalEntry.embedding.is_not(None)).all()
    if not entries_with_embeddings:
        return []
    query_vector = embedding_model.encode([search_req.query])
    entry_embeddings = np.array([pickle.loads(entry.embedding) for entry in entries_with_embeddings])
    similarities = cosine_similarity(query_vector, entry_embeddings)[0]
    top_indices = np.argsort(similarities)[-10:][::-1]
    top_entries = [entries_with_embeddings[i] for i in top_indices if similarities[i] > 0.3]
    return top_entries