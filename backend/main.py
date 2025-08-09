# --- Python Standard Library Imports ---
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

# --- Third-Party Imports ---
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
from llama_cpp import Llama

# --- Local Application Imports ---
import database

# -----------------------------------------------------------------------------
# GLOBAL CONFIGURATION & MODEL LOADING
# -----------------------------------------------------------------------------

# Global state for tracking the progress of background embedding tasks.
embedding_status = {"status": "idle", "progress": 0, "total": 0}
status_lock = Lock()

# Load NLP models once at startup for efficiency.
nlp = spacy.load("en_core_web_sm")
nlp.max_length = 2000000  # Increase max length for processing large texts.
embedding_model = SentenceTransformer('all-MiniLM-L6-v2')

# Load the main language model.
llm = Llama(
    model_path="/models/gemma-3b-it.gguf",
    n_ctx=3096,       # Set context window size.
    n_gpu_layers=-1,  # Offload all possible layers to GPU.
    verbose=True      # Enable detailed logging from llama.cpp.
)

# Initialize the database and create tables if they don't exist.
database.Base.metadata.create_all(bind=database.engine)

# -----------------------------------------------------------------------------
# FASTAPI APPLICATION LIFECYCLE
# -----------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manages the application's lifespan, setting up resources on startup
    and cleaning them up on shutdown."""
    app.state.executor = ThreadPoolExecutor()
    app.state.db = database.SessionLocal()
    print("Application startup complete.")
    yield
    app.state.db.close()
    app.state.executor.shutdown()
    print("Application shutting down.")

app = FastAPI(lifespan=lifespan)

# Configure CORS (Cross-Origin Resource Sharing) to allow the frontend to communicate.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -----------------------------------------------------------------------------
# PYDANTIC DATA MODELS
# -----------------------------------------------------------------------------

class EntrySchema(BaseModel):
    id: int; entry_date: dt.datetime; content: str; tags: str | None = None
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
class GenerativeQARequest(BaseModel): query: str

# -----------------------------------------------------------------------------
# BACKGROUND TASKS
# -----------------------------------------------------------------------------

def run_embedding_generation(db: Session):
    """A background task to generate and save vector embeddings for journal entries."""
    global embedding_status, status_lock
    try:
        entries_to_embed = db.query(database.JournalEntry).filter(database.JournalEntry.embedding.is_(None)).all()
        with status_lock:
            if not entries_to_embed:
                embedding_status["status"] = "idle"; return
            embedding_status.update({"status": "processing", "total": len(entries_to_embed), "progress": 0})
        
        for i, entry in enumerate(entries_to_embed):
            vector = embedding_model.encode(entry.content)
            entry.embedding = pickle.dumps(vector)
            with status_lock: embedding_status["progress"] = i + 1
        db.commit()
    except Exception as e:
        print(f"Embedding task ERROR: {e}"); db.rollback()
    finally:
        with status_lock: embedding_status["status"] = "idle"

# -----------------------------------------------------------------------------
# API ENDPOINTS
# -----------------------------------------------------------------------------

@app.post("/api/import")
async def import_entries(request: Request):
    """Parses text/markdown files from the /data volume, creates journal entries,
    and kicks off the background embedding process."""
    db, executor, loop = request.app.state.db, request.app.state.executor, asyncio.get_running_loop()
    imported_count, skipped_count = 0, 0
    all_parsed_entries = []
    for filename in os.listdir("/data"):
        if not filename.endswith((".md", ".txt")): continue
        with open(os.path.join("/data", filename), 'r', encoding='utf-8') as f: raw_content = f.read()
        date_obj, tags = None, None
        date_match = re.search(r"Created:\s*(.+)", raw_content)
        if date_match:
            date_str = date_match.group(1).strip()
            for fmt in ("%B %d, %Y %I:%M %p", "%B %d, %Y"):
                try:
                    date_obj = dt.datetime.strptime(date_str, fmt); break
                except ValueError: continue
        if not date_obj:
            try: date_obj = dt.datetime.strptime(filename.split('.')[0], "%Y-%m-%d")
            except ValueError: skipped_count += 1; continue
        tags_match = re.search(r"Tags:\s*(.+)", raw_content)
        if tags_match: tags = tags_match.group(1).strip()
        lines = raw_content.splitlines()
        content_lines = [line for line in lines if not (line.strip().startswith('#') or line.strip().lower().startswith('created:') or line.strip().lower().startswith('tags:'))]
        clean_content = "\n".join(content_lines).strip()
        all_parsed_entries.append({"entry_date": date_obj, "content": clean_content, "tags": tags})
    if all_parsed_entries:
        existing_dates = {r[0] for r in db.query(database.JournalEntry.entry_date).all()}
        unique_new = {p["entry_date"]: p for p in all_parsed_entries if p["entry_date"] not in existing_dates}
        entries_to_add = [database.JournalEntry(**data) for data in unique_new.values()]
        if entries_to_add:
            db.add_all(entries_to_add); db.commit(); imported_count = len(entries_to_add)
            loop.run_in_executor(executor, run_embedding_generation, db)
    return {"message": f"Imported {imported_count} new entries. Skipped {skipped_count}. Embedding process started."}


@app.get("/api/import/status")
def get_import_status():
    """Returns the current status of the background embedding task."""
    with status_lock: return embedding_status


@app.get("/api/entries", response_model=List[EntrySchema])
def get_entries(request: Request):
    """Fetches all journal entries, sorted by most recent."""
    db = request.app.state.db
    return db.query(database.JournalEntry).order_by(database.JournalEntry.entry_date.desc()).all()


@app.get("/api/on-this-day", response_model=List[EntrySchema])
def get_on_this_day(request: Request):
    """Finds journal entries written on the same month and day in previous years."""
    db = request.app.state.db; today = dt.date.today()
    return db.query(database.JournalEntry).filter(extract('month', database.JournalEntry.entry_date) == today.month, extract('day', database.JournalEntry.entry_date) == today.day).order_by(database.JournalEntry.entry_date.asc()).all()

# --- Analysis Endpoints ---
@app.get("/api/analysis/sentiment", response_model=List[SentimentDataPoint])
def get_sentiment_analysis(request: Request):
    db = request.app.state.db; sid = SentimentIntensityAnalyzer()
    entries = db.query(database.JournalEntry).order_by(database.JournalEntry.entry_date.asc()).all()
    return [{"date": entry.entry_date, "score": sid.polarity_scores(entry.content)['compound']} for entry in entries]


@app.get("/api/analysis/sentiment/weekday", response_model=List[AggregatedSentiment])
def get_sentiment_by_weekday(request: Request):
    db = request.app.state.db; sid = SentimentIntensityAnalyzer()
    entries = db.query(database.JournalEntry).all()
    weekday_scores = {i: [] for i in range(7)}
    for entry in entries: weekday_scores[entry.entry_date.weekday()].append(sid.polarity_scores(entry.content)['compound'])
    weekday_map = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    results = [{"label": weekday_map[i], "average_score": sum(scores) / len(scores)} for i, scores in weekday_scores.items() if scores]
    return results


@app.get("/api/analysis/sentiment/month", response_model=List[AggregatedSentiment])
def get_sentiment_by_month(request: Request):
    db = request.app.state.db; sid = SentimentIntensityAnalyzer()
    entries = db.query(database.JournalEntry).all()
    month_scores = {i: [] for i in range(1, 13)}
    for entry in entries: month_scores[entry.entry_date.month].append(sid.polarity_scores(entry.content)['compound'])
    month_map = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    results = [{"label": month_map[i-1], "average_score": sum(scores) / len(scores)} for i, scores in month_scores.items() if scores]
    return results


@app.get("/api/analysis/sentiment/hour", response_model=List[AggregatedSentiment])
def get_sentiment_by_hour(request: Request):
    db = request.app.state.db; sid = SentimentIntensityAnalyzer()
    entries = db.query(database.JournalEntry).all()
    hour_scores = {i: [] for i in range(24)}
    for entry in entries: hour_scores[entry.entry_date.hour].append(sid.polarity_scores(entry.content)['compound'])
    results = [{"label": f"{hour:02d}:00", "average_score": sum(scores) / len(scores)} for hour, scores in hour_scores.items() if scores]
    return sorted(results, key=lambda x: x['label'])


@app.get("/api/analysis/topics", response_model=List[Topic])
def get_topic_analysis(request: Request):
    db = request.app.state.db; entries = db.query(database.JournalEntry).all()
    if len(entries) < 5: return []
    stop_words = set(stopwords.words('english'))
    processed_docs = [[token for token in nltk.word_tokenize(re.sub(r'[^a-zA-Z\s]', '', entry.content, re.I|re.A).lower()) if token not in stop_words and len(token) > 3] for entry in entries]
    dictionary = Dictionary(processed_docs)
    if not dictionary: return []
    dictionary.filter_extremes(no_below=1, no_above=0.8)
    if not dictionary: return []
    corpus = [dictionary.doc2bow(doc) for doc in processed_docs]
    if not any(corpus): return []
    lda_model = LdaModel(corpus=corpus, id2word=dictionary, num_topics=5, passes=15, random_state=100, chunksize=10)
    topics = []; raw_topics = lda_model.print_topics(num_topics=5, num_words=10)
    if not raw_topics: return []
    for idx, topic_str in raw_topics:
        keywords = [word.split('*')[1].replace('"', '').strip() for word in topic_str.split(' + ')]
        topics.append({"topic_id": idx, "keywords": keywords})
    return topics
    

@app.get("/api/analysis/ner", response_model=NerResult)
def get_ner_analysis(request: Request):
    db = request.app.state.db; entries = db.query(database.JournalEntry).all()
    full_text = " ".join([entry.content for entry in entries]); doc = nlp(full_text)
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
    db = request.app.state.db; entity_list = list(set(req.entities))
    base_query = db.query(database.JournalEntry.content).filter(or_(*[database.JournalEntry.content.like(f"%{entity}%") for entity in entity_list])).all()
    relevant_entries = [entry.content for entry in base_query]
    results = []
    for i in range(1, len(entity_list) + 1):
        for combo in combinations(entity_list, i):
            combo_list = list(combo)
            count = sum(1 for entry in relevant_entries if all(entity in entry for entity in combo_list))
            if count > 0: results.append({"key": combo_list, "data": count})
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
    """Performs a semantic search over journal entries using vector embeddings."""
    db = request.app.state.db
    entries_with_embeddings = db.query(database.JournalEntry).filter(database.JournalEntry.embedding.is_not(None)).all()
    if not entries_with_embeddings: return []
    
    query_vector = embedding_model.encode([search_req.query])
    entry_embeddings = np.array([pickle.loads(entry.embedding) for entry in entries_with_embeddings])
    
    similarities = cosine_similarity(query_vector, entry_embeddings)[0]
    top_indices = np.argsort(similarities)[-15:][::-1] # Retrieve top 15 candidates
    
    # Filter candidates by a relevance threshold.
    top_entries = [entries_with_embeddings[i] for i in top_indices if similarities[i] > 0.15]
    return top_entries

# -----------------------------------------------------------------------------
# DIGITAL TWIN (GENERATIVE QA) FEATURE
# -----------------------------------------------------------------------------

def _expand_query_for_retrieval(query: str) -> str:
    """Uses the LLM to expand a user's query into a richer set of search terms,
    improving the relevance of the retrieved context."""
    prompt = f"""You are a search expert. Expand the user's query into a short, comma-separated list of 5-7 related keywords and concepts for a semantic search. Do not add any explanation.

User Query: "{query}"

Keywords:"""

    response = llm.create_completion(
        prompt=prompt,
        max_tokens=60,
        temperature=0.3, # Low temperature for focused, relevant keywords.
        stop=[",", "\n"] # Stop early for efficiency.
    )
    return response['choices'][0]['text'].strip()

@app.post("/api/generate/qa")
def digital_twin_qa(qa_req: GenerativeQARequest, request: Request):
    """Handles a user's question using an advanced, multi-step RAG pipeline to
    generate a grounded, natural-sounding answer from the perspective of the journal's author."""
    db = request.app.state.db

    # STEP 1: Query Expansion - Make the search smarter.
    expanded_terms = _expand_query_for_retrieval(qa_req.query)
    rich_query = f"{qa_req.query}, {expanded_terms}"

    # STEP 2: Retrieval - Find the most relevant journal entries.
    search_req = SemanticSearchRequest(query=rich_query)
    relevant_entries = semantic_search(search_req, request)

    if not relevant_entries:
        return {"answer": "Based on my journal entries, I don't have a strong memory of that. Try rephrasing your question or asking about something else."}

    # STEP 3: Context Formatting - Prepare the context for the LLM.
    context_list = []
    total_chars = 0
    SAFE_CHAR_LIMIT = 4000 # A safe character limit for an 8GB machine.

    for entry in relevant_entries:
        entry_date = entry.entry_date.strftime('%Y-%m-%d')
        content_to_add = f"Memory from {entry_date}:\n{entry.content}\n"
        if total_chars + len(content_to_add) > SAFE_CHAR_LIMIT:
            break
        context_list.append(content_to_add)
        total_chars += len(content_to_add)
    formatted_context = "\n---\n".join(context_list)
    
    # STEP 4: Generation - Use a Chain of Thought prompt for grounded reasoning.
    final_prompt = f"""<start_of_turn>user
You are a digital twin, a consciousness built from the journal of your author. Your entire personality and memory are based ONLY on the provided memories below.
Your task is to answer the user's question by following a strict thought process.

**Memories:**
---
{formatted_context}
---

**Question:** {qa_req.query}

**Instructions:**
First, write a "Chain of Thought" section where you analyze the memories to find the answer.
- Systematically go through the provided memories.
- Extract key quotes, feelings, and events that are directly relevant to the question.
- Synthesize these points to form a coherent understanding.
- If the memories do not contain an answer, state that clearly in your analysis.

Second, based *only* on your Chain of Thought, write the "Final Answer."
- The answer must be in the first person ('I', 'me', 'my').
- Speak naturally and reflectively.
- **DO NOT** mention the "Chain of Thought" in your final answer.
- Subtly mention things from your memories when relevant.
- If the analysis concluded that no answer exists, the final answer must be a humble and natural admission, like "I've searched through my memories, but I can't seem to recall the specifics of that."

Begin.
<end_of_turn>
<start_of_turn>model
**Chain of Thought:**
- """

    response = llm.create_completion(
        prompt=final_prompt,
        max_tokens=1500,
        stop=["<end_of_turn>", "<start_of_turn>"],
        temperature=0.6,
    )
    full_response_text = response['choices'][0]['text']

    # STEP 5: Response Parsing - Extract only the clean, final answer for the user.
    try:
        final_answer_marker = re.search(r'\*\*Final Answer:\*\*', full_response_text, re.IGNORECASE)
        if final_answer_marker:
            answer = full_response_text[final_answer_marker.end():].strip()
        else:
            # If the model fails to follow the format, we return its raw analysis.
            answer = full_response_text.strip()
    except Exception as e:
        print(f"Error parsing model response: {e}")
        answer = full_response_text # Fallback on any parsing error.

    return {"answer": answer}