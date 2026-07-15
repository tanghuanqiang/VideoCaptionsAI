import os
import json
import asyncio
from typing import Optional, List
from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy.orm import Session
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage

from src.db import User, get_db
from src.auth import get_current_user, get_current_user_from_token
from src.connection_manager import manager
from src.agent.SubsAI import graph, reload_agent
from src.agent.Subs import SubtitleDoc, AssStyle
from src.services.storage import get_file_path, save_upload

router = APIRouter()

async def stream_graph_updates(user_input: str, subtiles: list, styles: list, video, files: list, user_id: str, include_context: bool = True):
    system_prompt = """You are a professional video subtitle editing assistant.

        IMPORTANT:
        - The input fields 'video_file', 'current_subtitles', 'subtitle_styles' may be 'None' or empty. This means the user hasn't provided those resources.
        - If 'video_file' is 'None', you MUST NOT call tools that require a video file. If the user requests an operation that requires a video, tell them to upload a video first.
        - Even without video or subtitles, you can still answer general questions.

        OUTPUT RULES (very important):
        1) If there are subtitle/style modifications, return them ONLY in code blocks:
            - Use ```subtitle code block to return a JSON array containing only the objects that need to be added/modified/deleted.
            - Use ```style code block to return style changes.
        2) Keep explanations short (max 60 chars).
        3) If an error occurs, clearly state: ERROR: <tool_name> - <error_message>
    """

    if include_context:
        context_info = f"- Current subtitles: {subtiles}\n- Subtitle styles: {styles}"
    else:
        context_info = "- Current subtitles: User did not provide context\n- Subtitle styles: User did not provide context"

    user_prompt = f"""
        Input:
        - Video file: {video.filename if video else 'None'}
        {context_info}
        - Extra files: {files}
        - User request: {user_input}
    """

    # Use proper LangChain message types
    state = {"messages": [
        SystemMessage(content=system_prompt),
        HumanMessage(content=user_prompt)
    ]}

    if graph is None:
        await manager.send_personal_message("Error: Copilot is not configured. Please click the gear icon to set your API key.", user_id)
        return

    try:
        async for event in graph.astream(state):
            for value in event.values():
                messages = value.get("messages", [])
                if not messages:
                    continue
                msg = messages[-1]
                # msg could be AIMessage, dict, or other types
                if hasattr(msg, 'content'):
                    content = msg.content
                elif isinstance(msg, dict) and 'content' in msg:
                    content = msg['content']
                else:
                    content = str(msg)

                if isinstance(content, str):
                    for char in content:
                        await manager.send_personal_message(char, user_id)
                        await asyncio.sleep(0.02)
    except Exception as e:
        await manager.send_personal_message(f"Error: {str(e)}", user_id)

@router.post("/copilot/send")
async def send_message(
    text: str = Form(...),
    subtitles_json: Optional[str] = Form(None),
    styles_json: Optional[str] = Form(None),
    video_uuid: Optional[str] = Form(None),
    video: Optional[UploadFile] = File(None),
    files: Optional[List[UploadFile]] = File(None),
    include_context: bool = Form(True),
    current_user: User = Depends(get_current_user)
):
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

    print(f"User {current_user.username} sent: {text} (include_context={include_context})")

    video_path = None
    if video_uuid:
        video_path = get_file_path(video_uuid)
        if video_path and os.path.exists(video_path):
            class MockUploadFile:
                def __init__(self, path):
                    self.filename = os.path.basename(path)
                    self.path = path
            video = MockUploadFile(video_path)
    elif video:
        video_path = save_upload(video)

    for f in files or []:
        if not os.path.exists(f.filename):
            save_upload(f)

    asyncio.create_task(stream_graph_updates(text, subtitles, styles, video, files or [], current_user.username, include_context))
    return JSONResponse({"status": "ok"})

@router.get("/copilot/sse")
async def sse_endpoint(token: str = "bypass", db: Session = Depends(get_db)):
    """SSE streaming endpoint - Auth bypassed."""
    user = await get_current_user_from_token(token, db) if token else None
    if not user:
        user = await get_current_user_from_token("bypass", db)

    async def event_generator():
        queue = await manager.connect(user.username)
        try:
            while True:
                msg = await queue.get()
                yield f"data: {msg}\n\n"
        except asyncio.CancelledError:
            manager.disconnect(user.username)

    return StreamingResponse(event_generator(), media_type="text/event-stream")