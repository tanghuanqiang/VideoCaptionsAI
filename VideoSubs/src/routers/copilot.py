import os
import json
import asyncio
from typing import Optional, List
from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy.orm import Session

from src.db import User, get_db
from src.auth import get_current_user, get_current_user_from_token
from src.connection_manager import manager
from src.agent.SubsAI import graph
from src.agent.Subs import SubtitleDoc, AssStyle
from src.services.storage import get_file_path, save_upload

router = APIRouter()

async def stream_graph_updates(user_input: str, subtiles: list[SubtitleDoc], styles: list[AssStyle], video: UploadFile, files: list[UploadFile], user_id: str, include_context: bool = True):
    system_prompt = """你是一个专业的视频字幕编辑助手。

        重要提示：
        - 输入中的 '视频文件'、'目前字幕'、'字幕样式' 等可能为 'None' 或空列表。这表示用户没有提供这些资源。
        - 如果 '视频文件' 为 'None'，你**绝对不能**调用需要视频文件的工具（如 asr_transcribe_video, probe_media, final_hard_burn 等）。如果用户请求的操作必须需要视频，请直接回复告知用户需要先上传视频。
        - 即使没有视频或字幕，你仍然可以回答用户的通用问题或进行纯文本的创作/修改建议。

        严格输出规范（非常重要，请严格遵守）：
        1) 如果存在字幕或样式修改，必须只在代码块中返回变更：
            - 使用 ```subtitle``` 代码块返回一个 JSON 数组，数组内只包含需要新增/更改/删除的字幕对象（遵循你现有的 Subtitle JSON 格式）。例如：
                ```subtitle
                [{{ "id":"3", "start":"00:00:10","end":"00:00:12","text":"修正文本","style":"Default"}}]
                ```
        - 如需修改样式，使用单独的 ```style``` 代码块返回 JSON 数组，内含被修改或新增的样式对象。例如：
            ```style
            [{{ "id":"Default","Name":"Default","FontSize":40 }}]
            ```
        - 代码块之外允许一段简短说明（<= 60 字）作为“总结/原因/步骤”，但不得再次重复或输出字幕 JSON。

        2) 代码块内返回的 JSON 只包含“需要修改的对象”（增/改/删的最小集合），不应包含完整无改动的大文件或重复所有对象，但需要返回对象的所有属性。
        
        3) 如果发生工具或处理错误，请在回复中明确标注：ERROR: <工具名> - <错误信息>。不要在字幕代码块内放错误信息。


        额外要求：
        - 优先保持输出简洁，避免多余文本干扰前端解析。
        - 若需要删除字幕，请将 subtitle 对象中的text 字段设为空字符串 ""
    """

    # 根据 include_context 决定是否包含字幕和样式信息
    if include_context:
        context_info = f"""- 目前字幕（数组形式）: {subtiles}
        - 字幕样式（数组形式）: {styles}"""
    else:
        context_info = """- 目前字幕: 用户未提供上下文
        - 字幕样式: 用户未提供上下文"""

    user_prompt = f"""
        输入说明：
        - 视频文件: {video.filename if video else 'None'}
        {context_info}
        - 额外文件清单: {files}
        - 用户需求: {user_input}
    """
    # In a real app, we would load conversation history from DB here
    state = {"messages": [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt}
    ]}
    
    try:
        async for event in graph.astream(state):
            for value in event.values():
                msg = value["messages"][-1]
                for char in msg.content:
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
    include_context: bool = Form(True),  # 新增：是否包含字幕上下文
    current_user: User = Depends(get_current_user)
):
    subtitles = []
    styles = []
    
    # 解析字幕和样式（如果include_context为True）
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
    
    # 处理视频文件
    video_path = None
    if video_uuid:
        # 使用UUID引用
        video_path = get_file_path(video_uuid)
        if video_path and os.path.exists(video_path):
            # 创建一个虚拟的UploadFile对象
            class MockUploadFile:
                def __init__(self, path):
                    self.filename = os.path.basename(path)
                    self.path = path
            video = MockUploadFile(video_path)
    elif video:
        # 新上传的视频
        video_path = save_upload(video)
    
    # 处理额外文件
    for f in files or []:
        if not os.path.exists(f.filename):
            save_upload(f)
        
    # Pass user_id to stream function
    asyncio.create_task(stream_graph_updates(text, subtitles, styles, video, files or [], current_user.username, include_context))
    return JSONResponse({"status": "ok"})

@router.get("/copilot/sse")
async def sse_endpoint(token: str, db: Session = Depends(get_db)):
    """
    SSE 流式接口 - Requires Token in Query Param
    """
    user = await get_current_user_from_token(token, db)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid token")

    async def event_generator():
        queue = await manager.connect(user.username)
        try:
            while True:
                msg = await queue.get()
                yield f"data: {msg}\n\n"
        except asyncio.CancelledError:
            manager.disconnect(user.username)

    return StreamingResponse(event_generator(), media_type="text/event-stream")
