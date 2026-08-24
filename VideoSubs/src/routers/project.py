"""Project document persistence for CaptionFlo."""

from typing import Any, Dict

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse

from src.services.project_store import load_document, save_document

router = APIRouter()


@router.post("/project/save")
async def save_project(body: Dict[str, Any]):
    try:
        saved = save_document(body)
    except (OSError, TypeError, ValueError) as exc:
        raise HTTPException(status_code=500, detail=f"Project save failed: {exc}") from exc
    return JSONResponse({"status": "saved", "project": saved})


@router.get("/project/load")
async def load_project():
    try:
        document = load_document()
    except (OSError, ValueError) as exc:
        raise HTTPException(status_code=500, detail=f"Project load failed: {exc}") from exc
    if document is None:
        return JSONResponse({"status": "empty", "project": None})
    return JSONResponse(document)
