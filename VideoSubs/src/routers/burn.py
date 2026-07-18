import os
import uuid
from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse

import src.config as _config
from src.utils.task_queue import burn_queue

router = APIRouter()

ALLOWED_VIDEO = {".mp4", ".mov", ".avi", ".mkv", ".webm", ".flv", ".wmv"}
ALLOWED_SUBTITLE = {".ass", ".srt", ".vtt", ".ssa"}


def _validate(filename: str, allowed: set):
    ext = os.path.splitext(filename or "")[1].lower()
    if ext not in allowed:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {ext}")


@router.post("/burn/")
async def api_burn(file: UploadFile = File(...), ass_file: UploadFile = File(...)):
    _validate(file.filename or "", ALLOWED_VIDEO)
    _validate(ass_file.filename or "", ALLOWED_SUBTITLE)

    try:
        task_id = str(uuid.uuid4())[:8]
        task_dir = os.path.join(_config.OUTPUTS_DIR, task_id)
        os.makedirs(task_dir, exist_ok=True)

        media_path = os.path.join(task_dir, file.filename)
        with open(media_path, "wb") as f:
            f.write(await file.read())
        media_size = os.path.getsize(media_path)
        print(f"[BURN] Media saved: {media_path} ({media_size} bytes)")

        ass_path = os.path.join(task_dir, ass_file.filename)
        with open(ass_path, "wb") as f:
            f.write(await ass_file.read())
        ass_size = os.path.getsize(ass_path)
        print(f"[BURN] ASS saved: {ass_path} ({ass_size} bytes)")

        queue_task_id = await burn_queue.submit(
            "burn_task", media_path=media_path, ass_path=ass_path, task_dir=task_dir
        )
        print(f"Task submitted: {queue_task_id}")

        return JSONResponse({
            "task_id": queue_task_id,
            "status": "queued",
            "message": "Task submitted"
        })
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in /burn/: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
