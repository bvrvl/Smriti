from sqlalchemy import create_engine, Column, Integer, String, Text, Date
from sqlalchemy.orm import sessionmaker
from sqlalchemy.orm import sessionmaker, DeclarativeBase

# Location of the SQLite database file
SQLALCHEMY_DATABASE_URL = "sqlite:////tmp/journal.db" #Making db temporary


# Create the SQLAlchemy engine
engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)

# Create a session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class for the database models
class Base(DeclarativeBase):
    pass

# Define JournalEntry model (the table in the database)
class JournalEntry(Base):
    __tablename__ = "entries"

    id = Column(Integer, primary_key=True, index=True)
    entry_date = Column(Date, unique=True, index=True)
    content = Column(Text)