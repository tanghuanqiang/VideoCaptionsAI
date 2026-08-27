"""Subtitle export endpoint using the frontend-generated ASS as source of truth."""

import io
from typing import Any, Dict

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from src.services.caption_payload import require_ass_text, unwrap_export_payload

router = APIRouter()


@router.post("/export/subtitle")
async def export_subtitle(body: Dict[str, Any]):
    payload = unwrap_export_payload(body)
    output_format = str(payload.get("format", "")).lower()
    if output_format not in {"ass", "srt"}:
        raise HTTPException(status_code=400, detail="format must be 'ass' or 'srt'")
    try:
        ass_text = require_ass_text(payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if output_format == "ass":
        content = ass_text.encode("utf-8")
        filename = "subtitles.ass"
        media_type = "text/x-ass"
    else:
        try:
            import pysubs2
        except ImportError as exc:
            raise HTTPException(status_code=500, detail="pysubs2 is required for SRT export") from exc
        try:
            subtitles = pysubs2.SSAFile.from_string(ass_text, format_="ass")
            content = subtitles.to_string("srt").encode("utf-8")
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Invalid ASS document: {exc}") from exc
        filename = "subtitles.srt"
        media_type = "application/x-subrip"

    return StreamingResponse(
        io.BytesIO(content),
        media_type=media_type,
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Content-Length": str(len(content)),
            "Access-Control-Expose-Headers": "Content-Disposition, Content-Length",
        },
    )
