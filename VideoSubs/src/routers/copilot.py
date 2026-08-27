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

router = APIRouter()

COPILOT_SESSION_PATTERN = re.compile(r"^[A-Za-z0-9_-]{8,96}$")


def _new_session_id() -> str:
    return secrets.token_urlsafe(18)


def _session_id_or_new(value: Optional[str]) -> str:
    return value if value and COPILOT_SESSION_PATTERN.fullmatch(value) else _new_session_id()


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
    subtitles = []
    styles = []

    if include_context:
        if subtitles_json:
            try:
                subtitles = json.loads(subtitles_json)
            except Exception as e:
                print("invalid subtitles_json:", e)
        if styles_json:
            try:
                styles = json.loads(styles_json)
            except Exception as e:
                print("invalid styles_json:", e)

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
        video_obj = video
        save_upload(video)

    for f in (files or []):
        if not os.path.exists(f.filename or ""):
            save_upload(f)

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
