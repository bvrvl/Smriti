from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from contextlib import asynccontextmanager
import os
from datetime import datetime
import database

# Create database tables if they don't exist
database.Base.metadata.create_all(bind=database.engine)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Application starts up
    print("Starting up and creating database tables...")
    # (This is a good place for startup logic)
    yield
    # Application is shutting down
    print("Shutting down...")


app = FastAPI(lifespan=lifespan)

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

# --- API Endpoints ---
@app.get("/")
def read_root():
    return {"message": "Hello from your FastAPI Backend!"}

@app.post("/api/import")
def import_entries(db: Session = Depends(get_db)):
    data_dir = "/data" # Inside the container, look for files here
    if not os.path.exists(data_dir):
        return {"message": "Data directory not found. Make sure you have a /data folder."}

    imported_count = 0
    for filename in os.listdir(data_dir):
        # Assume filenames are like 'YYYY-MM-DD.md'
        if filename.endswith(".md"):
            try:
                # Parse date from filename
                date_str = filename.split('.')[0]
                entry_date = datetime.strptime(date_str, "%Y-%m-%d").date()
                
                # Read content
                with open(os.path.join(data_dir, filename), 'r') as f:
                    content = f.read()
                
                # Check if entry already exists
                exists = db.query(database.JournalEntry).filter(database.JournalEntry.entry_date == entry_date).first()
                if not exists:
                    # Create new entry and add to database
                    new_entry = database.JournalEntry(entry_date=entry_date, content=content)
                    db.add(new_entry)
                    imported_count += 1
            except ValueError:
                print(f"Skipping file with invalid name format: {filename}")
                continue
    
    db.commit() # Save all changes to the database
    return {"message": f"Successfully imported {imported_count} new entries."}