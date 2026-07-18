import os
import json
import hashlib
from typing import Optional
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from fastapi.responses import JSONResponse

from src.services.storage import get_file_path, save_upload
from src.config import MAX_UPLOAD_SIZE, OUTPUTS_DIR
from src.services.style_recommender import generate_recommended_style
from src.utils.task_queue import burn_queue
from src.tools.subtitle_tools import asr_transcribe_video

router = APIRouter()

ALLOWED_EXTENSIONS = {".mp4", ".mov", ".avi", ".mkv", ".webm", ".flv", ".wmv",
                      ".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg", ".wma"}


def _validate_file_ext(filename: str):
    ext = os.path.splitext(filename or "")[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {ext}")


@router.post("/asr/")
async def api_asr(
    file: Optional[UploadFile] = File(None),
    file_uuid: Optional[str] = Form(None),
    quality: Optional[str] = Form("standard"),
    async_mode: bool = Form(False),
    width: Optional[int] = Form(None),
    height: Optional[int] = Form(None),
):
    if file_uuid:
        path = get_file_path(file_uuid)
        if not path or not os.path.exists(path):
            raise HTTPException(status_code=404, detail="File not found")
        cache_key = f"{file_uuid}_{quality}"
    elif file:
        if file.filename:
            _validate_file_ext(file.filename)
        if file.size and file.size > MAX_UPLOAD_SIZE:
            raise HTTPException(status_code=413, detail=f"File too large. Max size is {MAX_UPLOAD_SIZE/1024/1024}MB")
        path = save_upload(file)
        with open(path, "rb") as f:
            file_hash = hashlib.md5(f.read()).hexdigest()
        cache_key = f"{file_hash}_{quality}"
    else:
        raise HTTPException(status_code=400, detail="Either file or file_uuid is required")

    cache_dir = os.path.join(OUTPUTS_DIR, "asr_cache")
    os.makedirs(cache_dir, exist_ok=True)
    cache_file = os.path.join(cache_dir, f"{cache_key}.json")

    if os.path.exists(cache_file):
        print(f"ASR cache hit: {cache_key}")
        with open(cache_file, "r", encoding="utf-8") as f:
            result = json.load(f)
        if width and height:
            style = generate_recommended_style(width, height)
            result["recommended_style"] = style.dict()
            if "events" in result and result["events"]:
                for event in result["events"]:
                    event["style"] = style.Name
        return JSONResponse(result)

    if quality == "auto":
        try:
            file_size = os.path.getsize(path)
            model_size = "medium" if file_size > 50 * 1024 * 1024 else "small"
        except Exception:
            model_size = "small"
    elif quality == "high":
        model_size = "medium"
    elif quality == "professional":
        model_size = "large-v3"
    else:
        model_size = "small"

    print(f"Using model \"{model_size}\" for quality={quality}")

    if async_mode:
        task_id = await burn_queue.submit("asr_task", media_path=path, model_size=model_size)
        return JSONResponse({"task_id": task_id, "status": "queued", "message": "ASR task submitted"})

    import asyncio
    loop = asyncio.get_running_loop()
    result = await loop.run_in_executor(None, lambda: asr_transcribe_video.invoke({"media_path": path, "model_size": model_size}))

    if width and height:
        style = generate_recommended_style(width, height)
        result.recommended_style = style
        if result.events:
            for event in result.events:
                event.style = style.Name

    if hasattr(result, "dict"):
        result = result.dict()

    try:
        with open(cache_file, "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=2)
        print(f"ASR result cached: {cache_key}")
    except Exception as e:
        print(f"Failed to cache ASR result: {e}")

    return JSONResponse(result)
