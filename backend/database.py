from sqlalchemy import create_engine, Text, Date, String
from sqlalchemy.orm import sessionmaker, DeclarativeBase, Mapped, mapped_column
import datetime as dt

SQLALCHEMY_DATABASE_URL = "sqlite:////tmp/journal.db"
engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

class Base(DeclarativeBase):
    type_annotation_map = {
        dt.date: Date,
        str: String,
    }

class JournalEntry(Base):
    __tablename__ = "entries"
    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    entry_date: Mapped[dt.date] = mapped_column(unique=True, index=True)
    content: Mapped[str] = mapped_column(Text)
    tags: Mapped[str | None]