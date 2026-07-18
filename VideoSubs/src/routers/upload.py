import os
from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse
from src.services.storage import save_upload_with_uuid
from src.config import MAX_UPLOAD_SIZE

router = APIRouter()

ALLOWED_EXTENSIONS = {".mp4", ".mov", ".avi", ".mkv", ".webm", ".flv", ".wmv",
                      ".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg", ".wma"}


@router.post("/upload_file")
async def upload_file_endpoint(file: UploadFile = File(...)):
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {ext}")
    if file.size and file.size > MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=413, detail=f"File too large. Max size is {MAX_UPLOAD_SIZE/1024/1024}MB")

    file_uuid, file_path = save_upload_with_uuid(file, "default")
    return JSONResponse({
        "uuid": file_uuid,
        "filename": file.filename,
        "size": os.path.getsize(file_path)
    })
