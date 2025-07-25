import datetime as dt
from sqlalchemy import create_engine, Text, Date, String, DateTime
from sqlalchemy.orm import sessionmaker, DeclarativeBase, Mapped, mapped_column

#The database is stored in a temporary directory and is wiped on each restart.
SQLALCHEMY_DATABASE_URL = "sqlite:////tmp/journal.db"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

class Base(DeclarativeBase):
    #This tells SQLAlchemy how to map Python types to database column types.
    type_annotation_map = {
        dt.datetime: DateTime,
        dt.date: Date,
        str: String,
    }

# This class defines the 'entries' table in our database.
class JournalEntry(Base):
    __tablename__ = "entries"
    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    entry_date: Mapped[dt.datetime] = mapped_column(unique=True, index=True)
    content: Mapped[str] = mapped_column(Text)
    tags: Mapped[str | None]