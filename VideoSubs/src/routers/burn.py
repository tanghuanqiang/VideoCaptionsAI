import os
import uuid
import logging
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Request, UploadFile
from fastapi.responses import JSONResponse

import src.config as _config
from src.services.caption_payload import MAX_ASS_PAYLOAD_BYTES, require_ass_text, unwrap_export_payload
from src.services.storage import UploadTooLargeError, get_file_path, save_upload_to_path
from src.utils.task_queue import burn_queue

router = APIRouter()
logger = logging.getLogger("VideoCaptionsAI")

ALLOWED_VIDEO = {".mp4", ".mov", ".avi", ".mkv", ".webm", ".flv", ".wmv"}
ALLOWED_SUBTITLE = {".ass", ".srt", ".vtt", ".ssa"}


def _validate(filename: str, allowed: set[str]):
    ext = os.path.splitext(filename or "")[1].lower()
    if ext not in allowed:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {ext}")


def _safe_filename(filename: str, fallback: str) -> str:
    return os.path.basename(filename or fallback) or fallback


def _find_video_by_name(video_name: Optional[str]) -> Optional[str]:
    if not video_name:
        return None
    target = os.path.basename(video_name)
    if not target:
        return None
    for root, _, files in os.walk(_config.OUTPUTS_DIR):
        if target in files:
            return os.path.join(root, target)
    return None


def _resolve_video_path(value: Any) -> Optional[str]:
    if not isinstance(value, str) or not value or value.startswith("blob:"):
        return None
    relative = value[len("/outputs/"):] if value.startswith("/outputs/") else value
    root = Path(_config.OUTPUTS_DIR).resolve()
    candidate = (root / relative).resolve()
    if candidate == root or root not in candidate.parents:
        return None
    return str(candidate) if candidate.is_file() else None


async def _parse_burn_request(request: Request) -> tuple[Any, str, Optional[str]]:
    content_type = request.headers.get("content-type", "").lower()
    if content_type.startswith("application/json"):
        raw_body = await request.json()
        if not isinstance(raw_body, dict):
            raise HTTPException(status_code=400, detail="JSON body must be an object")
        payload = unwrap_export_payload(raw_body)
        try:
            ass_text = require_ass_text(payload)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        video_name = payload.get("videoName")
        video_path = _resolve_video_path(payload.get("videoPath"))
        if video_path is None:
            video_path = _resolve_video_path(payload.get("videoUrl"))
        if video_path is None:
            video_path = _resolve_video_path(get_file_path(str(payload.get("videoFileId", ""))))
        if video_path is None:
            video_path = _resolve_video_path(get_file_path(str(payload.get("fileUuid", ""))))
        if video_path is None:
            video_path = _find_video_by_name(video_name if isinstance(video_name, str) else None)
        if video_path is None:
            raise HTTPException(
                status_code=400,
                detail="No persisted video file found. Upload the video before hard-burning.",
            )
        return video_path, ass_text, video_name if isinstance(video_name, str) else None

    form = await request.form()
    file = form.get("file")
    ass_file = form.get("ass_file")
    if not isinstance(file, UploadFile) or not isinstance(ass_file, UploadFile):
        raise HTTPException(
            status_code=400,
            detail="Expected JSON {ass,...} or multipart fields file and ass_file",
        )
    _validate(file.filename or "", ALLOWED_VIDEO)
    _validate(ass_file.filename or "", ALLOWED_SUBTITLE)
    try:
        ass_bytes = await ass_file.read(MAX_ASS_PAYLOAD_BYTES + 1)
        if len(ass_bytes) > MAX_ASS_PAYLOAD_BYTES:
            raise HTTPException(status_code=413, detail="ASS file exceeds the maximum allowed size")
        ass_text = ass_bytes.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise HTTPException(status_code=400, detail="ASS file must be UTF-8") from exc
    return file, ass_text, file.filename


@router.post("/burn/")
async def api_burn(request: Request):
    try:
        task_id = str(uuid.uuid4())[:8]
        task_dir = os.path.join(_config.OUTPUTS_DIR, task_id)
        os.makedirs(task_dir, exist_ok=True)

        parsed_video, ass_text, video_name = await _parse_burn_request(request)
        if isinstance(parsed_video, UploadFile):
            media_path = os.path.join(
                task_dir,
                _safe_filename(parsed_video.filename or video_name or "video.mp4", "video.mp4"),
            )
            try:
                save_upload_to_path(parsed_video, media_path)
            except UploadTooLargeError as exc:
                raise HTTPException(status_code=413, detail=str(exc)) from exc
        else:
            media_path = os.path.abspath(parsed_video)

        # Keep the complete frontend document byte-for-byte intact.
        ass_path = os.path.join(task_dir, f"{task_id}.ass")
        with open(ass_path, "w", encoding="utf-8", newline="") as f:
            f.write(ass_text)
        print(f"[BURN] Media: {media_path}")
        print(f"[BURN] ASS: {ass_path} ({os.path.getsize(ass_path)} bytes)")

        queue_task_id = await burn_queue.submit(
            "burn_task", media_path=media_path, ass_path=ass_path, task_dir=task_dir
        )
        print(f"Task submitted: {queue_task_id}")

        return JSONResponse({
            "task_id": queue_task_id,
            "status": "queued",
            "message": "Task submitted",
        })
    except HTTPException:
        raise
    except Exception:
        logger.exception("Hard-burn request failed")
        raise HTTPException(status_code=500, detail="Failed to queue hard-burn task")
