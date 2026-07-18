from sqlalchemy import create_engine, Column, Integer, String, Float, ForeignKey, Text, DateTime
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from datetime import datetime, timezone

SQLALCHEMY_DATABASE_URL = "sqlite:///./video_subs.db"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def _utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


class VideoEditHistory(Base):
    __tablename__ = "video_edit_history"

    id = Column(Integer, primary_key=True, index=True)
    file_uuid = Column(String, index=True)
    original_filename = Column(String)
    thumbnail_path = Column(String, nullable=True)
    subtitle_file = Column(String, nullable=True)
    output_file = Column(String, nullable=True)
    status = Column(String, default="processing")
    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)
    extra_meta = Column("extra_meta", Text, default="{}")


def init_db():
    Base.metadata.create_all(bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
