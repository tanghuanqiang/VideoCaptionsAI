from sqlalchemy import create_engine, Column, Integer, String, Float, ForeignKey, Text, DateTime
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from datetime import datetime

SQLALCHEMY_DATABASE_URL = "sqlite:///./video_subs.db"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    balance = Column(Float, default=0.0)
    
    conversations = relationship("Conversation", back_populates="owner")
    video_edits = relationship("VideoEditHistory", back_populates="owner")

class Conversation(Base):
    __tablename__ = "conversations"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    title = Column(String, default="New Chat")
    messages = Column(Text, default="[]") # Storing JSON string for simplicity in this demo
    
    owner = relationship("User", back_populates="conversations")

class VideoEditHistory(Base):
    __tablename__ = "video_edit_history"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    file_uuid = Column(String, index=True)  # UUID of the file
    original_filename = Column(String)  # Original video filename
    thumbnail_path = Column(String, nullable=True)  # Path to thumbnail
    subtitle_file = Column(String, nullable=True)  # Path to subtitle file (ASS/SRT)
    output_file = Column(String, nullable=True)  # Path to final output video
    status = Column(String, default="processing")  # processing, completed, failed
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    edit_metadata = Column("metadata", Text, default="{}")  # JSON string for additional metadata
    
    owner = relationship("User", back_populates="video_edits")

def init_db():
    Base.metadata.create_all(bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
