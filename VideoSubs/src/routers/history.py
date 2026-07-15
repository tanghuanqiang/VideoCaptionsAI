from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
import json

from src.db import get_db, User, VideoEditHistory
from src.auth import get_current_user

router = APIRouter()

@router.get("/history")
async def get_edit_history(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    status: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get user's video edit history records"""
    query = db.query(VideoEditHistory).filter(VideoEditHistory.user_id == current_user.id)
    
    if status:
        query = query.filter(VideoEditHistory.status == status)
    
    total = query.count()
    
    items = query.order_by(VideoEditHistory.created_at.desc()).offset(skip).limit(limit).all()
    
    history_items = []
    for item in items:
        history_items.append({
            "id": item.id,
            "file_uuid": item.file_uuid,
            "original_filename": item.original_filename,
            "thumbnail_path": item.thumbnail_path,
            "subtitle_file": item.subtitle_file,
            "output_file": item.output_file,
            "status": item.status,
            "created_at": item.created_at.isoformat() if item.created_at else None,
            "updated_at": item.updated_at.isoformat() if item.updated_at else None,
            "metadata": json.loads(item.edit_metadata) if item.edit_metadata else {}
        })
    
    return JSONResponse({
        "total": total,
        "skip": skip,
        "limit": limit,
        "items": history_items
    })

@router.get("/history/{history_id}")
async def get_edit_history_detail(
    history_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get single history record detail"""
    item = db.query(VideoEditHistory).filter(
        VideoEditHistory.id == history_id,
        VideoEditHistory.user_id == current_user.id
    ).first()
    
    if not item:
        raise HTTPException(status_code=404, detail="History record not found")
    
    return JSONResponse({
        "id": item.id,
        "file_uuid": item.file_uuid,
        "original_filename": item.original_filename,
        "thumbnail_path": item.thumbnail_path,
        "subtitle_file": item.subtitle_file,
        "output_file": item.output_file,
        "status": item.status,
        "created_at": item.created_at.isoformat() if item.created_at else None,
        "updated_at": item.updated_at.isoformat() if item.updated_at else None,
        "metadata": json.loads(item.edit_metadata) if item.edit_metadata else {}
    })

@router.post("/history")
async def create_edit_history(
    file_uuid: str,
    original_filename: str,
    thumbnail_path: Optional[str] = None,
    metadata: Optional[dict] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create new video edit history record"""
    history_item = VideoEditHistory(
        user_id=current_user.id,
        file_uuid=file_uuid,
        original_filename=original_filename,
        thumbnail_path=thumbnail_path,
        status="processing",
        edit_metadata=json.dumps(metadata) if metadata else "{}"
    )
    
    db.add(history_item)
    db.commit()
    db.refresh(history_item)
    
    return JSONResponse({
        "id": history_item.id,
        "file_uuid": history_item.file_uuid,
        "status": history_item.status
    })

@router.patch("/history/{history_id}")
async def update_edit_history(
    history_id: int,
    subtitle_file: Optional[str] = None,
    output_file: Optional[str] = None,
    status: Optional[str] = None,
    metadata: Optional[dict] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update video edit history record"""
    item = db.query(VideoEditHistory).filter(
        VideoEditHistory.id == history_id,
        VideoEditHistory.user_id == current_user.id
    ).first()
    
    if not item:
        raise HTTPException(status_code=404, detail="History record not found")
    
    if subtitle_file is not None:
        item.subtitle_file = subtitle_file
    if output_file is not None:
        item.output_file = output_file
    if status is not None:
        item.status = status
    if metadata is not None:
        existing_metadata = json.loads(item.edit_metadata) if item.edit_metadata else {}
        existing_metadata.update(metadata)
        item.edit_metadata = json.dumps(existing_metadata)
    
    item.updated_at = datetime.utcnow()
    
    db.commit()
    db.refresh(item)
    
    return JSONResponse({
        "id": item.id,
        "status": item.status,
        "updated_at": item.updated_at.isoformat()
    })

@router.delete("/history/{history_id}")
async def delete_edit_history(
    history_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete video edit history record"""
    item = db.query(VideoEditHistory).filter(
        VideoEditHistory.id == history_id,
        VideoEditHistory.user_id == current_user.id
    ).first()
    
    if not item:
        raise HTTPException(status_code=404, detail="History record not found")
    
    db.delete(item)
    db.commit()
    
    return JSONResponse({"message": "History record deleted successfully"})
