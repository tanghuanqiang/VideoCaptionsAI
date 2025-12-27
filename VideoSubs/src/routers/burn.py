import os
import uuid
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from fastapi.responses import JSONResponse

from src.db import User
from src.auth import get_current_user
from src.config import OUTPUTS_DIR
from src.utils.task_queue import burn_queue

router = APIRouter()

@router.post("/burn/")
async def api_burn(file: UploadFile = File(...), ass_file: UploadFile = File(...), current_user: User = Depends(get_current_user)):
    """硬字幕烧录 - 异步任务模式"""
    try:
        task_id = str(uuid.uuid4())[:8]
        task_dir = os.path.join(OUTPUTS_DIR, task_id)
        os.makedirs(task_dir, exist_ok=True)

        # 保存上传的文件
        media_path = os.path.join(task_dir, file.filename)
        with open(media_path, "wb") as f:
            f.write(await file.read())
        ass_path = os.path.join(task_dir, ass_file.filename)
        with open(ass_path, "wb") as f:
            f.write(await ass_file.read())
        
        print(f"Files saved: {media_path}, {ass_path}")
        
        # 提交任务到队列
        queue_task_id = await burn_queue.submit(
            "burn_task",
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
