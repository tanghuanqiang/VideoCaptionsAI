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
from src.utils.task_queue import burn_queue, TaskStatus
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
    
    # Startup: Start task queue
    print("Starting up: Initializing task queue...")
    await burn_queue.start()
    print("Startup: Task queue started.")
    
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

# File storage mapping: uuid -> file_path
file_storage = {}

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

def save_upload_with_uuid(file: UploadFile, user_id: str) -> tuple[str, str]:
    """保存上传文件并返回UUID"""
    file_uuid = str(uuid.uuid4())
    uploads_dir = os.path.join("outputs", "uploads", user_id)
    os.makedirs(uploads_dir, exist_ok=True)
    
    # 保持原始文件扩展名
    ext = os.path.splitext(file.filename or "")[1]
    filename = f"{file_uuid}{ext}"
    dest_path = os.path.join(uploads_dir, filename)
    
    with open(dest_path, "wb") as out_f:
        try:
            shutil.copyfileobj(file.file, out_f)
        finally:
            try:
                file.file.seek(0)
            except Exception:
                pass
    
    # 存储UUID到路径映射
    file_storage[file_uuid] = dest_path
    return file_uuid, dest_path

def get_file_path(file_uuid: str) -> Optional[str]:
    """根据UUID获取文件路径"""
    return file_storage.get(file_uuid)

@app.post("/api/upload_file")
async def upload_file_endpoint(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user)
):
    """上传文件并返回UUID"""
    file_uuid, file_path = save_upload_with_uuid(file, current_user.username)
    return JSONResponse({
        "uuid": file_uuid,
        "filename": file.filename,
        "size": os.path.getsize(file_path)
    })

@app.post("/asr/")
async def api_asr(
    file: Optional[UploadFile] = File(None),
    file_uuid: Optional[str] = Form(None),
    quality: Optional[str] = Form('standard'),  # fast/standard/high
    current_user: User = Depends(get_current_user)
):
    """语音识别 (Whisper) - 支持直接上传或UUID引用，带缓存和模型路由"""
    if file_uuid:
        # 使用UUID引用已上传的文件
        path = get_file_path(file_uuid)
        if not path or not os.path.exists(path):
            raise HTTPException(status_code=404, detail="File not found")
        cache_key = f"{file_uuid}_{quality}"
    elif file:
        # 直接上传文件（兼容旧逻辑）
        path = save_upload(file)
        # 生成缓存键（基于文件内容哈希）
        import hashlib
        with open(path, 'rb') as f:
            file_hash = hashlib.md5(f.read()).hexdigest()
        cache_key = f"{file_hash}_{quality}"
    else:
        raise HTTPException(status_code=400, detail="Either file or file_uuid is required")
    
    # 检查缓存
    cache_dir = os.path.join("outputs", "asr_cache")
    os.makedirs(cache_dir, exist_ok=True)
    cache_file = os.path.join(cache_dir, f"{cache_key}.json")
    
    if os.path.exists(cache_file):
        print(f"ASR cache hit: {cache_key}")
        with open(cache_file, 'r', encoding='utf-8') as f:
            result = json.load(f)
        return JSONResponse(result)
    
    # 模型路由：直接根据质量模式选择模型（不考虑音频长度）
    # 策略：
    # 标准模式 → small
    # 高质量模式 → medium
    # 专业模式 → large-v3
    if quality == 'high':
        model_size = 'medium'
    elif quality == 'professional':
        model_size = 'large-v3'
    else:  # 'standard'
        model_size = 'small'

    print(f"Using model '{model_size}' for quality={quality}")
    
    result = asr_transcribe_video.invoke({"media_path": path, "model_size": model_size})
    if hasattr(result, "dict"):
        result = result.dict()
    
    # 存储缓存
    try:
        with open(cache_file, 'w', encoding='utf-8') as f:
            json.dump(result, f, ensure_ascii=False, indent=2)
        print(f"ASR result cached: {cache_key}")
    except Exception as e:
        print(f"Failed to cache ASR result: {e}")
    
    return JSONResponse(result)

@app.post("/burn/")
async def api_burn(file: UploadFile = File(...), ass_file: UploadFile = File(...), current_user: User = Depends(get_current_user)):
    """硬字幕烧录 - 异步任务模式"""
    try:
        task_id = str(uuid.uuid4())[:8]
        task_dir = os.path.join("outputs", task_id)
        os.makedirs(task_dir, exist_ok=True)

        # 保存上传的文件
        media_path = os.path.join(task_dir, file.filename)
        with open(media_path, "wb") as f:
            f.write(await file.read())
        ass_path = os.path.join(task_dir, ass_file.filename)
        with open(ass_path, "wb") as f:
            f.write(await ass_file.read())
        
        print(f"Files saved: {media_path}, {ass_path}")
        
        # 定义烧录任务函数
        def burn_task(media_path: str, ass_path: str, task_dir: str):
            try:
                # 探测视频信息
                media_info = probe_media.invoke({"media_path": media_path})
                media_height = media_info.get("height")
                media_width = media_info.get("width")
                
                # 执行烧录
                result = final_hard_burn.invoke({
                    "media_height": media_height, 
                    "media_width": media_width, 
                    "media_path": media_path, 
                    "ass_path": ass_path, 
                    "task_dir": task_dir
                })
                
                return {"output_path": result}
            except Exception as e:
                # 清理临时文件
                if os.path.exists(task_dir):
                    shutil.rmtree(task_dir, ignore_errors=True)
                raise e
        
        # 提交任务到队列
        queue_task_id = await burn_queue.submit(
            burn_task,
            media_path=media_path,
            ass_path=ass_path,
            task_dir=task_dir
        )
        
        print(f"Task submitted: {queue_task_id}")
        
        return JSONResponse({
            "task_id": queue_task_id,
            "status": "queued",
            "message": "任务已提交，请使用task_id查询状态"
        })
    except Exception as e:
        print(f"Error in /burn/ endpoint: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/copilot/send")
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


# ===== 任务队列相关接口 =====

@app.get("/burn/task/{task_id}")
async def get_burn_task_status(task_id: str, current_user: User = Depends(get_current_user)):
    """查询烧录任务状态"""
    task = burn_queue.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    
    task_info = task.to_dict()
    
    # 如果任务完成，添加下载链接
    if task.status == TaskStatus.COMPLETED and task.result:
        output_path = task.result.get("output_path")
        if output_path and os.path.exists(output_path):
            task_info["download_url"] = f"/burn/download/{task_id}"
    
    return JSONResponse(task_info)


@app.get("/burn/download/{task_id}")
async def download_burn_result(task_id: str, current_user: User = Depends(get_current_user)):
    """下载烧录完成的视频"""
    task = burn_queue.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    
    if task.status != TaskStatus.COMPLETED:
        raise HTTPException(status_code=400, detail=f"任务尚未完成，当前状态: {task.status}")
    
    if not task.result or "output_path" not in task.result:
        raise HTTPException(status_code=500, detail="任务结果异常")
    
    output_path = task.result["output_path"]
    if not os.path.exists(output_path):
        raise HTTPException(status_code=404, detail="输出文件不存在")
    
    return FileResponse(
        output_path, 
        media_type="video/mp4", 
        filename=os.path.basename(output_path)
    )


@app.delete("/burn/task/{task_id}")
async def cancel_burn_task(task_id: str, current_user: User = Depends(get_current_user)):
    """取消烧录任务（仅对排队中的任务有效）"""
    success = await burn_queue.cancel_task(task_id)
    if success:
        return JSONResponse({"message": "任务已取消"})
    else:
        task = burn_queue.get_task(task_id)
        if not task:
            raise HTTPException(status_code=404, detail="任务不存在")
        raise HTTPException(status_code=400, detail=f"任务无法取消，当前状态: {task.status}")


@app.get("/burn/queue/status")
async def get_queue_status(current_user: User = Depends(get_current_user)):
    """获取任务队列状态"""
    queue_status = burn_queue.get_queue_status()
    # 添加worker状态检查
    queue_status["worker_running"] = burn_queue._worker_task is not None and not burn_queue._worker_task.done() if burn_queue._worker_task else False
    return JSONResponse(queue_status)
