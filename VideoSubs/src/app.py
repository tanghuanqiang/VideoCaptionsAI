# app.py
import asyncio
import json
from typing import Optional, List
from fastapi import FastAPI, UploadFile, File, Form,Request
from fastapi.responses import JSONResponse, StreamingResponse
import os
from fastapi.responses import FileResponse
import uuid
from src.tools.subtitle_tools import (
    asr_transcribe_video,final_hard_burn,probe_media
)
from src.agent.SubsAI import graph,State
from src.agent.Subs import SubtitleDoc,AssStyle,SubtitleEvent
from fastapi import FastAPI, UploadFile, File, Form
import shutil
from fastapi.staticfiles import StaticFiles

app = FastAPI(title="Subtitle Tools API", version="1.0.0")
from fastapi.middleware.cors import CORSMiddleware

# app.add_middleware(
#     CORSMiddleware,
#     allow_origins=["*"],  # 或指定你的前端地址
#     allow_credentials=False,
#     allow_methods=["*"],
#     allow_headers=["*"],
# )

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # 改为你的前端 origin
    allow_credentials=False,                    # 若你确实需要凭证
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition", "Content-Length"],  # 让前端可读这些头
)


app.mount("/static", StaticFiles(directory="static"), name="static")
app.mount("/outputs", StaticFiles(directory="outputs"), name="outputs")




def save_upload(file: UploadFile) -> str:
    """保存上传文件到临时路径"""
    # 保存到 outputs/uploads 目录，保留原始文件名但加上 uuid 前缀以避免冲突
    uploads_dir = os.path.join("outputs")
    os.makedirs(uploads_dir, exist_ok=True)
    filename = os.path.basename(file.filename or "upload")
    unique_name = f"{filename}"
    dest_path = os.path.join(uploads_dir, unique_name)
    # 使用流式写入，避免一次性读入大文件
    with open(dest_path, "wb") as out_f:
        try:
            # UploadFile.file is a SpooledTemporaryFile; use shutil.copyfileobj for streaming
            import shutil as _sh
            _sh.copyfileobj(file.file, out_f)
        finally:
            # ensure the file pointer is at start for future reads if necessary
            try:
                file.file.seek(0)
            except Exception:
                pass
    return dest_path


@app.post("/asr/")
async def api_asr(file: UploadFile = File(...)):
    """
    语音识别 (Whisper)
    """
    path = save_upload(file)
    result = asr_transcribe_video.invoke({"media_path": path})
    # Convert Pydantic model to dict if needed
    if hasattr(result, "dict"):
        result = result.dict()
    return JSONResponse(result)

@app.post("/burn/")
async def api_burn(file: UploadFile = File(...), ass_file: UploadFile = File(...)):
    """硬字幕烧录"""
    # 生成临时任务ID和输出目录
    import uuid
    task_id = str(uuid.uuid4())[:8]
    task_dir = os.path.join("outputs", task_id)
    os.makedirs(task_dir, exist_ok=True)

    # 保存上传视频和字幕
    media_path = os.path.join(task_dir, file.filename)
    with open(media_path, "wb") as f:
        f.write(file.file.read())
    ass_path = os.path.join(task_dir, ass_file.filename)
    with open(ass_path, "wb") as f:
        f.write(ass_file.file.read())
    # 使用 ffprobe 获取视频信息
    media_info = probe_media.invoke({"media_path": media_path})
    media_height = media_info.get("height")
    media_width = media_info.get("width")
    print("media_info: " + str(media_info))
    print(f"Media Info - Height: {media_height}, Width: {media_width}")
    # 生成硬字幕视频
    result = final_hard_burn.invoke({"media_height": media_height, "media_width": media_width, "media_path": media_path, "ass_path": ass_path, "task_dir": task_dir})
    print("result: " + str(result))
    return FileResponse(result, media_type="video/mp4", filename=os.path.basename(result))


# 存储消息的简单内存队列（模拟聊天室）
message_queue: asyncio.Queue[str] = asyncio.Queue()

@app.post("/copilot/send")
async def send_message(
    text: str = Form(...),
    subtitles_json: Optional[str] = Form(None),
    styles_json: Optional[str] = Form(None),
    video: Optional[UploadFile] = File(None),
    files: Optional[List[UploadFile]] = File(None),
):
    # 解析可选的 JSON 字段
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

    print(f"接收到消息: {text}, video: {getattr(video,'filename', None)}, attachments: {[f.filename for f in (files or [])]}, subtitles: {subtitles}, styles: {styles}")
    # 将 UploadFile 等原样传给 stream_graph_updates（注意该任务是异步后台任务）
    # 查看文件是否存在，不存在就上传
    for f in files or []:
        if not os.path.exists(f.filename):
            save_upload(f)
    if video and not os.path.exists(video.filename):
        save_upload(video)
    asyncio.create_task(stream_graph_updates(text, subtitles, styles, video, files or []))
    return JSONResponse({"status": "ok"})

@app.get("/copilot/sse")
async def sse_endpoint():
    """
    SSE 流式接口，前端 EventSource 订阅这里
    """
    async def event_generator():
        while True:
            msg = await message_queue.get()
            yield f"data: {msg}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")
async def stream_graph_updates(user_input: str,subtiles: list[SubtitleDoc],styles: list[AssStyle],video: UploadFile,files: list[UploadFile]):
    prompt = f"""你是一个专业的视频字幕编辑助手。
        输入说明：
        - 视频文件: {video.filename}
        - 目前字幕（数组形式）: {subtiles}
        - 字幕样式（数组形式）: {styles}
        - 额外文件清单: {files}
        - 用户需求: {user_input}

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
    state = {"messages": [{"role": "user", "content": prompt}]}
    async for event in graph.astream(state):
        for value in event.values():
            # 取最后一条AI回复内容
            msg = value["messages"][-1]
            # 按字逐步推送到队列
            for char in msg.content:
                await message_queue.put(char)
                await asyncio.sleep(0.02)  # 控制速度，可调整

    # 测试数据：逐字推送 markdown 内容，包含字幕和样式代码块
    # markdown = (
    #     "Copilot已优化字幕内容如下：\n\n"
    #     "```subtitle\n"
    #     '[{"id": "1", "start": "00:00:01", "end": "00:00:03", "text": "测试字幕1", "style": "Default", "group": ""},'
    #     '{"id": "2", "start": "00:00:04", "end": "00:00:06", "text": "测试字幕2", "style": "Default", "group": ""}]\n'
    #     "```\n\n"
    #     "```style\n"
    #     '[{"id": "Default", "Name": "Default", "FontName": "Arial", "FontSize": 36, "PrimaryColour": "&H00FFFFFF"}]\n'
    #     "```\n"
    #     "Copilot已优化字幕内容如上"
    # )
    # for char in markdown:
    #     await message_queue.put(char)
    #     await asyncio.sleep(0.02)



# # 视频处理管道 单个接口可运行
# @app.post("/pipeline/")
# async def run_pipeline(
#     file: UploadFile = File(...),
# ):
#     """
#     视频字幕生成完整处理管道，文件保存在 outputs/{task_id}/，返回可访问 URL。
#     """
#     # 1. 生成任务ID和输出目录
#     task_id = str(uuid.uuid4())[:8]
#     task_dir = os.path.join("outputs", task_id)
#     os.makedirs(task_dir, exist_ok=True)

#     # 2. 保存上传视频
#     media_path = os.path.join(task_dir, file.filename)
#     with open(media_path, "wb") as f:
#         shutil.copyfileobj(file.file, f)

#     # 3. 工具链处理
#     media_info = probe_media.invoke({"media_path": media_path})
#     subs = asr_transcribe_video.invoke({"media_path": media_info})
#     # subs_processed = process_subs.invoke({"subtitle_doc": subs, "rules": {"max_len": max_len}})
#     srt_path = format_srt.invoke({"subtitle_doc": subs.dict(), "out_dir": task_dir})
#     ass_path = format_ass.invoke({"subtitle_doc": subs.dict(), "out_dir": task_dir})
#     preview_path = preview_mux.invoke({"media_path": media_path, "ass_path": ass_path, "out_dir": task_dir})
#     final_path = final_hard_burn.invoke({"media_path": media_path, "ass_path": ass_path, "out_dir": task_dir})

#     # 4. 构造可访问URL
#     def to_url(path):
#         rel = os.path.relpath(path, start="outputs")
#         return f"/outputs/{rel.replace('\\', '/')}"

#     return JSONResponse(content={
#         "media_info": media_info,
#         "subs_sample": [e.dict() for e in subs.events[:2]],
#         "srt_url": to_url(srt_path),
#         "ass_url": to_url(ass_path),
#         "preview_url": to_url(preview_path),
#         "final_url": to_url(final_path)
#     })
