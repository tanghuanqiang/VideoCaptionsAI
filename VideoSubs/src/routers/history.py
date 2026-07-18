from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, timezone
import json

from src.db import get_db, VideoEditHistory

router = APIRouter()


def _utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _serialize(item: VideoEditHistory) -> dict:
    return {
        "id": item.id,
        "file_uuid": item.file_uuid,
        "original_filename": item.original_filename,
        "thumbnail_path": item.thumbnail_path,
        "subtitle_file": item.subtitle_file,
        "output_file": item.output_file,
        "status": item.status,
        "created_at": item.created_at.isoformat() if item.created_at else None,
        "updated_at": item.updated_at.isoformat() if item.updated_at else None,
        "metadata": json.loads(item.extra_meta) if item.extra_meta else {},
    }


@router.get("/history")
async def get_edit_history(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    status: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    query = db.query(VideoEditHistory)
    if status:
        query = query.filter(VideoEditHistory.status == status)
    total = query.count()
    items = query.order_by(VideoEditHistory.created_at.desc()).offset(skip).limit(limit).all()
    return JSONResponse({
        "total": total,
        "skip": skip,
        "limit": limit,
        "items": [_serialize(i) for i in items],
    })


@router.get("/history/{history_id}")
async def get_edit_history_detail(history_id: int, db: Session = Depends(get_db)):
    item = db.query(VideoEditHistory).filter(VideoEditHistory.id == history_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="History record not found")
    return JSONResponse(_serialize(item))


@router.post("/history")
async def create_edit_history(
    file_uuid: str,
    original_filename: str,
    thumbnail_path: Optional[str] = None,
    metadata: Optional[dict] = None,
    db: Session = Depends(get_db),
):
    item = VideoEditHistory(
        file_uuid=file_uuid,
        original_filename=original_filename,
        thumbnail_path=thumbnail_path,
        status="processing",
        extra_meta=json.dumps(metadata) if metadata else "{}",
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return JSONResponse({"id": item.id, "file_uuid": item.file_uuid, "status": item.status})


@router.patch("/history/{history_id}")
async def update_edit_history(
    history_id: int,
    subtitle_file: Optional[str] = None,
    output_file: Optional[str] = None,
    status: Optional[str] = None,
    metadata: Optional[dict] = None,
    db: Session = Depends(get_db),
):
    item = db.query(VideoEditHistory).filter(VideoEditHistory.id == history_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="History record not found")

    if subtitle_file is not None:
        item.subtitle_file = subtitle_file
    if output_file is not None:
        item.output_file = output_file
    if status is not None:
        item.status = status
    if metadata is not None:
        existing = json.loads(item.extra_meta) if item.extra_meta else {}
        existing.update(metadata)
        item.extra_meta = json.dumps(existing)

    item.updated_at = _utcnow()
    db.commit()
    db.refresh(item)
    return JSONResponse({"id": item.id, "status": item.status, "updated_at": item.updated_at.isoformat()})


@router.delete("/history/{history_id}")
async def delete_edit_history(history_id: int, db: Session = Depends(get_db)):
    item = db.query(VideoEditHistory).filter(VideoEditHistory.id == history_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="History record not found")
    db.delete(item)
    db.commit()
    return JSONResponse({"message": "History record deleted"})
