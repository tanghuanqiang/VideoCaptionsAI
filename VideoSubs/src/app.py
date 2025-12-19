# app.py
import asyncio
import json
from typing import Optional, List
from contextlib import asynccontextmanager
from fastapi import FastAPI, UploadFile, File, Form, Request, Depends, HTTPException, status
from fastapi.responses import JSONResponse, StreamingResponse, FileResponse
import os
import uuid
import shutil
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import timedelta

from src.tools.subtitle_tools import (
    asr_transcribe_video, final_hard_burn, probe_media
)
from src.utils.model_loader import get_whisper_model
from src.agent.SubsAI import graph, State
from src.agent.Subs import SubtitleDoc, AssStyle, SubtitleEvent
from src.db import init_db, get_db, User
from src.auth import (
    create_access_token, get_current_user, verify_password, 
    get_password_hash, get_current_user_from_token, ACCESS_TOKEN_EXPIRE_MINUTES
)
from src.connection_manager import manager

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Load model
    print("Starting up: Preloading Whisper model...")
    try:
        get_whisper_model()
        print("Startup: Whisper model preloaded successfully.")
    except Exception as e:
        print(f"Startup: Failed to preload Whisper model: {e}")
    yield
    # Shutdown: Clean up if needed
    print("Shutting down...")

app = FastAPI(title="Subtitle Tools API", version="1.0.0", lifespan=lifespan)

# Initialize DB
init_db()

app.add_middleware(
    CORSMiddleware,
    # allow_origins=["*"],  # Invalid with allow_credentials=True
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition", "Content-Length"],
)

app.mount("/static", StaticFiles(directory="static"), name="static")
app.mount("/outputs", StaticFiles(directory="outputs"), name="outputs")

# --- Auth Models ---
class Token(BaseModel):
    access_token: str
    token_type: str

class UserCreate(BaseModel):
    username: str
    password: str

class UserResponse(BaseModel):
    id: int
    username: str
    balance: float
    class Config:
        from_attributes = True

# --- Auth Routes ---

@app.post("/register", response_model=UserResponse)
def register(user: UserCreate, db: Session = Depends(get_db)):
    db_user = db.query(User).filter(User.username == user.username).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Username already registered")
    hashed_password = get_password_hash(user.password)
    db_user = User(username=user.username, hashed_password=hashed_password)
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

@app.post("/token", response_model=Token)
async def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

@app.get("/users/me", response_model=UserResponse)
async def read_users_me(current_user: User = Depends(get_current_user)):
    return current_user

# --- Existing Logic with Multi-user Support ---

def save_upload(file: UploadFile) -> str:
    """保存上传文件到临时路径"""
    uploads_dir = os.path.join("outputs")
    os.makedirs(uploads_dir, exist_ok=True)
    filename = os.path.basename(file.filename or "upload")
    unique_name = f"{filename}"
    dest_path = os.path.join(uploads_dir, unique_name)
    with open(dest_path, "wb") as out_f:
        try:
            shutil.copyfileobj(file.file, out_f)
        finally:
            try:
                file.file.seek(0)
            except Exception:
                pass
    return dest_path

@app.post("/asr/")
async def api_asr(file: UploadFile = File(...), current_user: User = Depends(get_current_user)):
    """语音识别 (Whisper) - Requires Auth"""
    path = save_upload(file)
    result = asr_transcribe_video.invoke({"media_path": path})
    if hasattr(result, "dict"):
        result = result.dict()
    return JSONResponse(result)

@app.post("/burn/")
async def api_burn(file: UploadFile = File(...), ass_file: UploadFile = File(...), current_user: User = Depends(get_current_user)):
    """硬字幕烧录 - Requires Auth"""
    task_id = str(uuid.uuid4())[:8]
    task_dir = os.path.join("outputs", task_id)
    os.makedirs(task_dir, exist_ok=True)

    media_path = os.path.join(task_dir, file.filename)
    with open(media_path, "wb") as f:
        f.write(file.file.read())
    ass_path = os.path.join(task_dir, ass_file.filename)
    with open(ass_path, "wb") as f:
        f.write(ass_file.file.read())
    
    media_info = probe_media.invoke({"media_path": media_path})
    media_height = media_info.get("height")
    media_width = media_info.get("width")
    
    result = final_hard_burn.invoke({"media_height": media_height, "media_width": media_width, "media_path": media_path, "ass_path": ass_path, "task_dir": task_dir})
    return FileResponse(result, media_type="video/mp4", filename=os.path.basename(result))

@app.post("/copilot/send")
async def send_message(
    text: str = Form(...),
    subtitles_json: Optional[str] = Form(None),
    styles_json: Optional[str] = Form(None),
    video: Optional[UploadFile] = File(None),
    files: Optional[List[UploadFile]] = File(None),
    current_user: User = Depends(get_current_user)
):
    subtitles = []
    styles = []
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

    print(f"User {current_user.username} sent: {text}")
    
    for f in files or []:
        if not os.path.exists(f.filename):
            save_upload(f)
    if video and not os.path.exists(video.filename):
        save_upload(video)
        
    # Pass user_id to stream function
    asyncio.create_task(stream_graph_updates(text, subtitles, styles, video, files or [], current_user.username))
    return JSONResponse({"status": "ok"})

@app.get("/copilot/sse")
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

async def stream_graph_updates(user_input: str, subtiles: list[SubtitleDoc], styles: list[AssStyle], video: UploadFile, files: list[UploadFile], user_id: str):
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

    user_prompt = f"""
        输入说明：
        - 视频文件: {video.filename if video else 'None'}
        - 目前字幕（数组形式）: {subtiles}
        - 字幕样式（数组形式）: {styles}
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

