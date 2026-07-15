import os
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from fastapi.responses import JSONResponse

from src.db import User
from src.auth import get_current_user
from src.services.storage import save_upload_with_uuid
from src.config import MAX_UPLOAD_SIZE

router = APIRouter()

@router.post("/upload_file")
async def upload_file_endpoint(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user)
):
    """涓婁紶鏂囦欢骞惰繑鍥濽UID"""
    # Check file size
    if file.size and file.size > MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=413, detail=f"File too large. Max size is {MAX_UPLOAD_SIZE/1024/1024}MB")
        
    file_uuid, file_path = save_upload_with_uuid(file, current_user.username)
    return JSONResponse({
        "uuid": file_uuid,
        "filename": file.filename,
        "size": os.path.getsize(file_path)
    })
