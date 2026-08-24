"""Small persistent store for the active frontend project document."""

import json
import os
from pathlib import Path
from typing import Any, Dict, Optional

from src.config import OUTPUTS_DIR

PROJECT_FILENAME = "captionflo-project.json"


def project_path() -> Path:
    return Path(OUTPUTS_DIR) / PROJECT_FILENAME


def _find_persisted_video(video_name: Optional[str]) -> Optional[Path]:
    if not video_name:
        return None
    candidate_name = os.path.basename(video_name)
    if not candidate_name or candidate_name in {".", ".."}:
        return None
    root = Path(OUTPUTS_DIR)
    if not root.exists():
        return None
    for candidate in root.rglob(candidate_name):
        if candidate.is_file() and candidate.name != PROJECT_FILENAME:
            return candidate
    return None


def _resolve_persisted_path(value: Any) -> Optional[Path]:
    if not isinstance(value, str) or not value:
        return None
    relative = value[len("/outputs/"):] if value.startswith("/outputs/") else value
    root = Path(OUTPUTS_DIR).resolve()
    candidate = (root / relative).resolve()
    if candidate == root or root not in candidate.parents:
        return None
    return candidate if candidate.is_file() else None


def sanitize_document(document: Dict[str, Any]) -> Dict[str, Any]:
    saved = dict(document)
    video_url = saved.get("videoUrl")
    if isinstance(video_url, str) and video_url.startswith("blob:"):
        saved["videoUrl"] = None
    return saved


def save_document(document: Dict[str, Any]) -> Dict[str, Any]:
    path = project_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    saved = sanitize_document(document)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(saved, ensure_ascii=False, indent=2), encoding="utf-8")
    temporary.replace(path)
    return saved


def load_document() -> Optional[Dict[str, Any]]:
    path = project_path()
    if not path.exists():
        return None
    document = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(document, dict):
        raise ValueError("Saved project must be a JSON object")

    video_path = _resolve_persisted_path(document.get("videoPath"))
    if video_path is None:
        video_path = _resolve_persisted_path(document.get("videoUrl"))
    if video_path is None:
        video_path = _find_persisted_video(document.get("videoName"))
    if video_path:
        relative = video_path.relative_to(Path(OUTPUTS_DIR)).as_posix()
        document["videoUrl"] = f"/outputs/{relative}"
        document["videoPath"] = relative
    else:
        document["videoUrl"] = None
        document["videoPath"] = None
    return document
