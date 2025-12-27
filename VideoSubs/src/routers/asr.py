import os
import json
import hashlib
from typing import Optional
from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException
from fastapi.responses import JSONResponse

from src.db import User
from src.auth import get_current_user
from src.services.storage import get_file_path, save_upload
from src.config import MAX_UPLOAD_SIZE, OUTPUTS_DIR
from src.utils.task_queue import burn_queue
from src.tools.subtitle_tools import asr_transcribe_video
from src.agent.Subs import AssStyle

router = APIRouter()

def generate_recommended_style(width: int, height: int) -> AssStyle:
    """
    根据视频分辨率和宽高比生成推荐的字幕样式。
    考虑了横屏、竖屏、方形视频的不同阅读体验。
    """
    if not width or width <= 0: width = 1920
    if not height or height <= 0: height = 1080
    
    aspect_ratio = width / height
    min_dim = min(width, height)
    max_dim = max(width, height)
    
    # 默认参数 (基于 1080p 横屏基准)
    font_size = 80
    margin_v = 50
    margin_side = 30
    outline = 2.5
    
    if aspect_ratio >= 1.2:
        # --- 横屏视频 (Landscape) ---
        # 典型: 1920x1080 (16:9), 1280x720
        # 策略: 字体大小约为高度的 5-7%
        # 1080p -> 60-80px
        
        # 使用高度作为主要参考
        scale = height / 1080.0
        font_size = int(75 * scale)
        margin_v = int(60 * scale)
        margin_side = int(50 * scale)
        outline = 3.0 * scale
        
    elif aspect_ratio <= 0.8:
        # --- 竖屏视频 (Portrait) ---
        # 典型: 1080x1920 (9:16) Shorts/TikTok
        # 策略: 屏幕较窄，字体不能太大以免换行过多，但也不能太小以免看不清
        # 通常字体大小约为宽度的 6-8%
        
        # 使用宽度作为主要参考
        scale = width / 1080.0
        # 竖屏通常需要稍微大一点的字号比例来吸引注意力，但受限于宽度
        # 之前是 70 * scale，对于 1440w 来说是 93，用户觉得 128 好
        # 128 / 1.33 = 96. 
        # 让我们提高基准字号到 95
        font_size = int(95 * scale) 
        # 竖屏底部通常有 UI 遮挡 (评论框、点赞等)，需要抬高字幕
        margin_v = int(350 * scale) # 抬高约 1/5 - 1/6
        margin_side = int(60 * scale)
        outline = 3.5 * scale # 竖屏背景通常杂乱，加粗描边
        
    else:
        # --- 方形视频 (Square) ---
        # 典型: 1080x1080 (1:1) Instagram/Feed
        scale = width / 1080.0
        font_size = int(70 * scale)
        margin_v = int(80 * scale)
        margin_side = int(40 * scale)
        outline = 3.0 * scale

    # 确保最小值
    font_size = max(24, font_size)
    margin_v = max(10, margin_v)
    outline = max(1.0, outline)

    return AssStyle(
        id="Recommended",
        Name="Recommended",
        FontName="Arial",
        FontSize=font_size,
        PrimaryColour="#FFFFFF",
        SecondaryColour="#000000",
        OutlineColour="#000000",
        BackColour="#000000",
        Bold=False,
        Italic=False,
        Underline=False,
        StrikeOut=False,
        ScaleX=100,
        ScaleY=100,
        Spacing=0,
        Angle=0,
        BorderStyle=0,
        Outline=outline,
        Shadow=0,
        Alignment=2,
        MarginL=10,
        MarginR=10,
        MarginV=margin_v,
        Encoding=1,
        PrimaryAlpha=255,
        SecondaryAlpha=0,
        OutlineAlpha=0,
        BackAlpha=0
    )

@router.post("/asr/")
async def api_asr(
    file: Optional[UploadFile] = File(None),
    file_uuid: Optional[str] = Form(None),
    quality: Optional[str] = Form('standard'),  # fast/standard/high/auto
    async_mode: bool = Form(False),
    width: Optional[int] = Form(None),
    height: Optional[int] = Form(None),
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
        # Check file size
        if file.size and file.size > MAX_UPLOAD_SIZE:
            raise HTTPException(status_code=413, detail=f"File too large. Max size is {MAX_UPLOAD_SIZE/1024/1024}MB")
            
        # 直接上传文件（兼容旧逻辑）
        path = save_upload(file)
        # 生成缓存键（基于文件内容哈希）
        with open(path, 'rb') as f:
            file_hash = hashlib.md5(f.read()).hexdigest()
        cache_key = f"{file_hash}_{quality}"
    else:
        raise HTTPException(status_code=400, detail="Either file or file_uuid is required")
    
    # 检查缓存
    cache_dir = os.path.join(OUTPUTS_DIR, "asr_cache")
    os.makedirs(cache_dir, exist_ok=True)
    cache_file = os.path.join(cache_dir, f"{cache_key}.json")
    
    if os.path.exists(cache_file):
        print(f"ASR cache hit: {cache_key}")
        with open(cache_file, 'r', encoding='utf-8') as f:
            result = json.load(f)
        
        # 如果缓存中没有 recommended_style 但请求提供了分辨率，则补充生成
        if width and height:
             # 始终重新生成推荐样式，以防逻辑更新
             style = generate_recommended_style(width, height)
             result["recommended_style"] = style.dict()
             
             # 强制更新所有事件的样式为推荐样式
             if "events" in result and result["events"]:
                 for event in result["events"]:
                     event["style"] = style.Name
             
        return JSONResponse(result)
    
    # 模型路由：直接根据质量模式选择模型（不考虑音频长度）
    # 策略：
    # 自动模式 → 根据文件大小简单判断
    # 标准模式 → small
    # 高质量模式 → medium
    # 专业模式 → large-v3
    if quality == 'auto':
        try:
            file_size = os.path.getsize(path)
            # > 50MB use medium, else small
            if file_size > 50 * 1024 * 1024:
                model_size = 'medium'
            else:
                model_size = 'small'
        except:
            model_size = 'small'
    elif quality == 'high':
        model_size = 'medium'
    elif quality == 'professional':
        model_size = 'large-v3'
    else:  # 'standard'
        model_size = 'small'

    print(f"Using model '{model_size}' for quality={quality}")
    
    if async_mode:
        task_id = await burn_queue.submit(
            "asr_task",
            media_path=path,
            model_size=model_size
        )
        return JSONResponse({
            "task_id": task_id,
            "status": "queued",
            "message": "ASR任务已提交，请使用task_id查询状态"
        })

    result = asr_transcribe_video.invoke({"media_path": path, "model_size": model_size})
    
    # 生成推荐样式
    if width and height:
        style = generate_recommended_style(width, height)
        result.recommended_style = style
        # 更新所有事件的样式为推荐样式
        if result.events:
            for event in result.events:
                event.style = style.Name

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
