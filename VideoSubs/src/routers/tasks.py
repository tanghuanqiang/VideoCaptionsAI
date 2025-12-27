import os
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse, FileResponse
from sqlalchemy.orm import Session

from src.db import User, get_db
from src.auth import get_current_user, get_current_user_from_token
from src.utils.task_queue import burn_queue, TaskStatus

router = APIRouter()

@router.get("/burn/task/{task_id}")
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


async def get_current_user_download(
    token: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    if not token:
        raise HTTPException(status_code=401, detail="Token required")
    user = await get_current_user_from_token(token, db)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid token")
    return user

@router.get("/burn/download/{task_id}")
async def download_burn_result(task_id: str, current_user: User = Depends(get_current_user_download)):
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
        filename=os.path.basename(output_path),
        headers={
            "Cross-Origin-Resource-Policy": "cross-origin",
            "Access-Control-Expose-Headers": "Content-Disposition"
        }
    )


@router.delete("/burn/task/{task_id}")
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


@router.get("/burn/queue/status")
async def get_queue_status(current_user: User = Depends(get_current_user)):
    """获取任务队列状态"""
    queue_status = burn_queue.get_queue_status()
    # 添加worker状态检查
    queue_status["worker_running"] = burn_queue._worker_task is not None and not burn_queue._worker_task.done() if burn_queue._worker_task else False
    return JSONResponse(queue_status)
