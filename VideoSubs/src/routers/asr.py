import os
import json
import hashlib
from typing import Optional
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from fastapi.responses import JSONResponse

from src.services.storage import UploadTooLargeError, get_file_path, save_upload
from src.config import MAX_UPLOAD_SIZE, OUTPUTS_DIR
from src.services.style_recommender import generate_recommended_style
from src.utils.task_queue import burn_queue
from src.tools.subtitle_tools import asr_transcribe_video, probe_media

router = APIRouter()

ALLOWED_EXTENSIONS = {".mp4", ".mov", ".avi", ".mkv", ".webm", ".flv", ".wmv",
                      ".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg", ".wma"}


def _validate_file_ext(filename: str):
    ext = os.path.splitext(filename or "")[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {ext}")


def _resolve_saved_path(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    relative = value[len("/outputs/"):] if value.startswith("/outputs/") else value
    root = os.path.abspath(OUTPUTS_DIR)
    candidate = os.path.abspath(os.path.join(root, relative))
    if os.path.commonpath([root, candidate]) != root:
        return None
    return candidate if os.path.isfile(candidate) else None


def _file_md5(path: str) -> str:
    digest = hashlib.md5()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


@router.post("/asr/")
async def api_asr(
    file: Optional[UploadFile] = File(None),
    file_uuid: Optional[str] = Form(None),
    quality: Optional[str] = Form("standard"),
    async_mode: bool = Form(False),
    width: Optional[int] = Form(None),
    height: Optional[int] = Form(None),
    file_path: Optional[str] = Form(None),
):
    if file_uuid:
        path = get_file_path(file_uuid)
        if not path or not os.path.exists(path):
            raise HTTPException(status_code=404, detail="File not found")
    elif file:
        if file.filename:
            _validate_file_ext(file.filename)
        if file.size and file.size > MAX_UPLOAD_SIZE:
            raise HTTPException(status_code=413, detail=f"File too large. Max size is {MAX_UPLOAD_SIZE/1024/1024}MB")
        try:
            path = save_upload(file)
        except UploadTooLargeError as exc:
            raise HTTPException(status_code=413, detail=str(exc)) from exc
    elif file_path:
        path = _resolve_saved_path(file_path)
        if not path:
            raise HTTPException(status_code=404, detail="File not found")
    else:
        raise HTTPException(status_code=400, detail="Either file, file_uuid, or file_path is required")

    cache_key = f"{_file_md5(path)}_{quality}"

    cache_dir = os.path.join(OUTPUTS_DIR, "asr_cache")
    os.makedirs(cache_dir, exist_ok=True)
    cache_file = os.path.join(cache_dir, f"{cache_key}.json")

    if os.path.exists(cache_file):
        print(f"ASR cache hit: {cache_key}")
        try:
            with open(cache_file, "r", encoding="utf-8-sig") as f:
                result = json.load(f)
            if width and height:
                style = generate_recommended_style(width, height)
                result["recommended_style"] = style.dict()
                if "events" in result and result["events"]:
                    for event in result["events"]:
                        event["style"] = style.Name
            return JSONResponse(result)
        except (OSError, json.JSONDecodeError) as exc:
            # A partial cache must not turn a new recognition into a 500.
            print(f"Ignoring invalid ASR cache {cache_file}: {exc}")

    if quality == "auto":
        try:
            file_size = os.path.getsize(path)
            model_size = "medium" if file_size > 50 * 1024 * 1024 else "small"
        except Exception:
            model_size = "small"
    elif quality == "fast":
        model_size = "base"
    elif quality == "balanced":
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
    try:
        result = await loop.run_in_executor(
            None,
            lambda: asr_transcribe_video.invoke({"media_path": path, "model_size": model_size}),
        )
    except Exception as exc:
        import logging
        logging.getLogger("VideoCaptionsAI").exception("ASR inference failed for %s", path)
        raise HTTPException(
            status_code=500,
            detail={
                "code": "ASR_INFERENCE_FAILED",
                "message": "语音识别推理失败，请检查媒体音轨、模型和后端日志。",
            },
        ) from exc

    # The generated frontend does not send width/height form fields. Probe the
    # actual media so the response still carries the existing resolution/fps
    # contract and the ASS PlayRes can stay aligned with the source video.
    if not result.resolution:
        try:
            media_info = probe_media.invoke({"media_path": path})
            probed_width = media_info.get("width")
            probed_height = media_info.get("height")
            if probed_width and probed_height:
                result.resolution = {"width": int(probed_width), "height": int(probed_height)}
            for stream in media_info.get("streams", []):
                if stream.get("codec_type") != "video":
                    continue
                rate = str(stream.get("r_frame_rate", ""))
                if "/" in rate:
                    numerator, denominator = rate.split("/", 1)
                    if float(denominator):
                        result.fps = float(numerator) / float(denominator)
                break
        except Exception as exc:
            print(f"Could not probe ASR media metadata: {exc}")

    if width and height:
        style = generate_recommended_style(width, height)
        result.recommended_style = style
        result.resolution = {"width": width, "height": height}
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
