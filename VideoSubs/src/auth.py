import os
from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from src.db import User, get_db

# AUTH BYPASS: no login required
SECRET_KEY = os.environ.get("SECRET_KEY", "video-captions-ai-dev-key-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/token", auto_error=False)

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=15))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

async def get_current_user(
    token: Optional[str] = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    """Always return a default user (auth bypass)."""
    default_user = db.query(User).filter(User.username == "default").first()
    if not default_user:
        default_user = User(
            username="default",
            hashed_password="",  # Fix: column name is hashed_password, not password_hash
            balance=0.0,
        )
        db.add(default_user)
        db.commit()
        db.refresh(default_user)
    return default_user

async def get_current_user_from_token(token: str, db: Session):
    """Helper for SSE/WebSockets. Token is optional (bypass)."""
    default_user = db.query(User).filter(User.username == "default").first()
    if not default_user:
        default_user = User(
            username="default",
            hashed_password="",
            balance=0.0,
        )
        db.add(default_user)
        db.commit()
        db.refresh(default_user)
    return default_user
