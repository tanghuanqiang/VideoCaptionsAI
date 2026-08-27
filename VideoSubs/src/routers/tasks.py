import os
import re
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import JSONResponse, FileResponse

from src.utils.task_queue import burn_queue, TaskStatus
import src.config as _config

router = APIRouter()
_TASK_ID_PATTERN = re.compile(r"^[a-f0-9]{8}$")


def _safe_output_path(value) -> Optional[str]:
    if not isinstance(value, str) or not value:
        return None
    root = Path(_config.OUTPUTS_DIR).resolve()
    candidate = Path(value).resolve()
    if candidate == root or root not in candidate.parents:
        return None
    if candidate.is_symlink() or not candidate.is_file():
        return None
    return str(candidate)


def _validate_task_id(task_id: str) -> None:
    if not _TASK_ID_PATTERN.fullmatch(task_id):
        raise HTTPException(status_code=404, detail="Task not found")


def _safe_download_filename(filename: Optional[str], fallback: str) -> str:
    candidate = os.path.basename(filename or fallback).replace("\r", "").replace("\n", "").strip()
    candidate = re.sub(r"[^A-Za-z0-9._ -]", "_", candidate)
    return candidate[:128] or fallback


@router.get("/burn/task/{task_id}")
async def get_burn_task_status(task_id: str):
    _validate_task_id(task_id)
    task = burn_queue.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    task_info = task.to_dict()
    if task.status == TaskStatus.COMPLETED and task.result:
        output_path = task.result.get("output_path")
        if _safe_output_path(output_path):
            task_info["download_url"] = f"/api/burn/download/{task_id}"
    return JSONResponse(task_info)


@router.get("/burn/download/{task_id}")
async def download_burn_result(task_id: str, filename: Optional[str] = Query(None)):
    _validate_task_id(task_id)
    task = burn_queue.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if task.status != TaskStatus.COMPLETED:
        raise HTTPException(status_code=400, detail=f"Task not complete. Status: {task.status}")
    if not task.result or "output_path" not in task.result:
        raise HTTPException(status_code=500, detail="Task result is invalid")

    output_path = _safe_output_path(task.result["output_path"])
    if not output_path:
        raise HTTPException(status_code=404, detail="Output file not found")

    download_filename = _safe_download_filename(filename, os.path.basename(output_path))
    return FileResponse(
        output_path, media_type="video/mp4", filename=download_filename,
        headers={
            "Cross-Origin-Resource-Policy": "cross-origin",
            "Access-Control-Expose-Headers": "Content-Disposition"
        }
    )


@router.delete("/burn/task/{task_id}")
async def cancel_burn_task(task_id: str):
    _validate_task_id(task_id)
    success = await burn_queue.cancel_task(task_id)
    if success:
        return JSONResponse({"message": "Task cancelled"})
    task = burn_queue.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    raise HTTPException(status_code=400, detail=f"Cannot cancel. Status: {task.status}")


@router.get("/burn/queue/status")
async def get_queue_status():
    queue_status = burn_queue.get_queue_status()
    queue_status["worker_running"] = (
        burn_queue._worker_task is not None and not burn_queue._worker_task.done()
        if burn_queue._worker_task else False
    )
    return JSONResponse(queue_status)
