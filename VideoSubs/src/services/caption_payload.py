"""Helpers for the frontend-owned ASS export contract."""

from typing import Any, Dict


def unwrap_export_payload(body: Dict[str, Any]) -> Dict[str, Any]:
    nested = body.get("payload")
    if isinstance(nested, dict):
        merged = dict(nested)
        if body.get("format") is not None:
            merged["format"] = body["format"]
        return merged
    return dict(body)


def require_ass_text(payload: Dict[str, Any]) -> str:
    ass_text = payload.get("ass")
    if not isinstance(ass_text, str) or not ass_text.strip():
        raise ValueError("payload.ass must be a non-empty ASS document")
    if "[Script Info]" not in ass_text or "[Events]" not in ass_text:
        raise ValueError("payload.ass is not a complete ASS document")
    return ass_text
