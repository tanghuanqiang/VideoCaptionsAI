import os
import shutil
from typing import Optional
from src.tools.subtitle_tools import (
    asr_transcribe_video, probe_media, run_ffmpeg_burn
)

# --- Task Handlers ---
def burn_task_handler(media_path: str, ass_path: str, task_dir: str, progress_callback=None):
    try:
        # 探测视频信息
        media_info = probe_media.invoke({"media_path": media_path})
        media_height = media_info.get("height")
        media_width = media_info.get("width")
        
        # 执行烧录 (直接调用实现函数以支持进度回调)
        result = run_ffmpeg_burn(
            media_height=media_height, 
            media_width=media_width, 
            media_path=media_path, 
            ass_path=ass_path, 
            task_dir=task_dir,
            progress_callback=progress_callback
        )
        
        return {"output_path": result}
    except Exception as e:
        # 清理临时文件
        if os.path.exists(task_dir):
            shutil.rmtree(task_dir, ignore_errors=True)
        raise e

def asr_task_handler(media_path: str, model_size: str, lang: Optional[str] = None):
    """ASR 异步任务处理器"""
    print(f"Starting ASR task for {media_path} with model {model_size}")
    result = asr_transcribe_video.invoke({"media_path": media_path, "model_size": model_size, "lang": lang})
    if hasattr(result, "dict"):
        result = result.dict()
    return result
