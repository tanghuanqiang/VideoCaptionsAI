import os
import json
import asyncio
import re
import secrets
from typing import Optional, List
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Query
from fastapi.responses import JSONResponse, StreamingResponse

from src.connection_manager import manager
from src.agent.SubsAI import graph, reload_agent
from src.services.storage import get_file_path, save_upload
from src.config import MAX_UPLOAD_SIZE

router = APIRouter()

COPILOT_SESSION_PATTERN = re.compile(r"^[A-Za-z0-9_-]{8,96}$")
MAX_COPILOT_TEXT_BYTES = 32 * 1024
MAX_COPILOT_CONTEXT_BYTES = 2 * 1024 * 1024
MAX_COPILOT_FILES = 4
MAX_COPILOT_FILE_BYTES = min(MAX_UPLOAD_SIZE, 50 * 1024 * 1024)
ALLOWED_COPILOT_EXTENSIONS = {
    ".mp4", ".mov", ".avi", ".mkv", ".webm", ".mp3", ".wav",
    ".m4a", ".aac", ".flac", ".ogg", ".ass", ".ssa", ".srt",
    ".vtt", ".txt", ".json", ".md",
}


def _new_session_id() -> str:
    return secrets.token_urlsafe(18)


def _session_id_or_new(value: Optional[str]) -> str:
    return value if value and COPILOT_SESSION_PATTERN.fullmatch(value) else _new_session_id()


def _parse_context_json(raw: Optional[str], field_name: str) -> list:
    if not raw:
        return []
    if len(raw.encode("utf-8")) > MAX_COPILOT_CONTEXT_BYTES:
        raise HTTPException(status_code=413, detail=f"{field_name} is too large")
    try:
        value = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail=f"{field_name} must be valid JSON") from exc
    if not isinstance(value, list):
        raise HTTPException(status_code=400, detail=f"{field_name} must be a JSON array")
    return value


def _validate_copilot_upload(upload: UploadFile) -> None:
    extension = os.path.splitext(upload.filename or "")[1].lower()
    if extension not in ALLOWED_COPILOT_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Unsupported Copilot file type: {extension}")
    if upload.size and upload.size > MAX_COPILOT_FILE_BYTES:
        raise HTTPException(status_code=413, detail="Copilot attachment is too large")


async def stream_graph_updates(
    user_input: str,
    subtitles: list,
    styles: list,
    video,
    files: list,
    include_context: bool = True,
    session_id: str = "",
):
    system_prompt = """You are a professional video subtitle editing assistant.

IMPORTANT:
- The input fields "video_file", "current_subtitles", "subtitle_styles" may be "None" or empty.
- If "video_file" is "None", you MUST NOT call tools that require a video file.
- Even without video or subtitles, you can still answer general questions.

OUTPUT RULES:
1) If there are subtitle/style modifications, return them ONLY in code blocks:
   - Use ```subtitle block for JSON array of modified items.
   - Use ```style block for style changes.
2) Keep explanations short (max 60 chars).
3) If an error occurs, state: ERROR: <tool_name> - <error_message>
"""

    context_info = (
        f"- Current subtitles: {subtitles}\n- Subtitle styles: {styles}"
        if include_context
        else "- Current subtitles: not provided\n- Subtitle styles: not provided"
    )

    user_prompt = f"""
Input:
- Video file: {video.filename if video else "None"}
{context_info}
- Extra files: {files}
- User request: {user_input}
"""

    from langchain_core.messages import SystemMessage, HumanMessage
    state = {"messages": [SystemMessage(content=system_prompt), HumanMessage(content=user_prompt)]}

    if graph is None:
        await manager.send_personal_message(
            "Error: Copilot is not configured. Please set your API key in settings.", session_id
        )
        return

    try:
        async for event in graph.astream(state):
            for value in event.values():
                messages = value.get("messages", [])
                if not messages:
                    continue
                msg = messages[-1]
                if hasattr(msg, "content"):
                    content = msg.content
                elif isinstance(msg, dict) and "content" in msg:
                    content = msg["content"]
                else:
                    content = str(msg)

                if isinstance(content, str):
                    for char in content:
                        await manager.send_personal_message(char, session_id)
                        await asyncio.sleep(0.02)
    except Exception as e:
        await manager.send_personal_message(f"Error: {str(e)}", session_id)


@router.post("/copilot/send")
async def send_message(
    text: str = Form(...),
    subtitles_json: Optional[str] = Form(None),
    styles_json: Optional[str] = Form(None),
    video_uuid: Optional[str] = Form(None),
    video: Optional[UploadFile] = File(None),
    files: Optional[List[UploadFile]] = File(None),
    include_context: bool = Form(True),
    session_id: Optional[str] = Query(None),
):
    session_id = _session_id_or_new(session_id)
    if not text.strip():
        raise HTTPException(status_code=400, detail="text must not be empty")
    if len(text.encode("utf-8")) > MAX_COPILOT_TEXT_BYTES:
        raise HTTPException(status_code=413, detail="Copilot prompt is too large")

    subtitles = []
    styles = []

    if include_context:
        subtitles = _parse_context_json(subtitles_json, "subtitles_json")
        styles = _parse_context_json(styles_json, "styles_json")

    print(f"Copilot received: {text} (include_context={include_context})")

    video_obj = None
    if video_uuid:
        video_path = get_file_path(video_uuid)
        if video_path and os.path.exists(video_path):

            class MockUploadFile:
                def __init__(self, path):
                    self.filename = os.path.basename(path)
                    self.path = path
            video_obj = MockUploadFile(video_path)
    elif video:
        _validate_copilot_upload(video)
        video_obj = video
        save_upload(video, max_bytes=MAX_COPILOT_FILE_BYTES)

    if len(files or []) > MAX_COPILOT_FILES:
        raise HTTPException(status_code=400, detail=f"At most {MAX_COPILOT_FILES} Copilot attachments are allowed")
    for f in (files or []):
        _validate_copilot_upload(f)
        save_upload(f, max_bytes=MAX_COPILOT_FILE_BYTES)

    asyncio.create_task(
        stream_graph_updates(text, subtitles, styles, video_obj, files or [], include_context, session_id)
    )
    return JSONResponse({"status": "ok", "session_id": session_id})


@router.get("/copilot/sse")
async def sse_endpoint(session_id: Optional[str] = Query(None, min_length=8, max_length=96)):
    session_id = _session_id_or_new(session_id)

    async def event_generator():
        queue = await manager.connect(session_id)
        try:
            while True:
                msg = await queue.get()
                yield f"data: {msg}\n\n"
        except asyncio.CancelledError:
            manager.disconnect(session_id)

    return StreamingResponse(event_generator(), media_type="text/event-stream")
