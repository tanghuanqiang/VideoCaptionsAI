import os
import re
import uuid
import json
import tempfile
import threading
from typing import Optional
from fastapi import UploadFile
from src.config import MAX_UPLOAD_SIZE, OUTPUTS_DIR

# File storage mapping: uuid -> file_path
file_storage = {}
_INDEX_FILENAME = "upload_index.json"
_index_loaded = False
_index_loaded_path: Optional[str] = None
_index_lock = threading.RLock()


class UploadTooLargeError(ValueError):
    """Raised after a streamed upload exceeds the configured size limit."""


def _safe_extension(filename: Optional[str]) -> str:
    extension = os.path.splitext(filename or "")[1].lower()
    return extension if re.fullmatch(r"\.[a-z0-9]{1,16}", extension) else ""


def _safe_user_id(user_id: str) -> str:
    sanitized = re.sub(r"[^A-Za-z0-9_-]", "_", user_id).strip("_")
    return sanitized or "default"


def _index_path() -> str:
    return os.path.join(OUTPUTS_DIR, _INDEX_FILENAME)


def _load_index() -> None:
    global _index_loaded, _index_loaded_path
    index_path = os.path.abspath(_index_path())
    if _index_loaded and _index_loaded_path == index_path:
        return
    with _index_lock:
        if _index_loaded and _index_loaded_path == index_path:
            return
        # A changed output directory represents a new storage namespace.
        if _index_loaded_path != index_path:
            file_storage.clear()
        _index_loaded = True
        _index_loaded_path = index_path

    try:
        with open(index_path, "r", encoding="utf-8") as fh:
            data = json.load(fh)
        if not isinstance(data, dict):
            return
        root = os.path.abspath(OUTPUTS_DIR)
        for file_uuid, path in data.items():
            if not isinstance(file_uuid, str) or not isinstance(path, str):
                continue
            candidate = os.path.abspath(path)
            if os.path.commonpath([root, candidate]) == root and os.path.isfile(candidate):
                file_storage[file_uuid] = candidate
    except (OSError, ValueError, json.JSONDecodeError):
        return


def _persist_index() -> None:
    with _index_lock:
        parent = os.path.abspath(OUTPUTS_DIR)
        os.makedirs(parent, exist_ok=True)
        fd, temporary = tempfile.mkstemp(prefix=".upload-index-", suffix=".tmp", dir=parent)
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as fh:
                json.dump(file_storage, fh, ensure_ascii=False, indent=2)
                fh.flush()
                os.fsync(fh.fileno())
            os.replace(temporary, _index_path())
        finally:
            try:
                os.remove(temporary)
            except OSError:
                pass


def save_upload_to_path(file: UploadFile, dest_path: str, max_bytes: int = MAX_UPLOAD_SIZE) -> int:
    """Stream an upload to disk and remove a partial file if it exceeds the limit."""
    written = 0
    os.makedirs(os.path.dirname(dest_path), exist_ok=True)
    try:
        with open(dest_path, "wb") as out_f:
            while chunk := file.file.read(1024 * 1024):
                written += len(chunk)
                if written > max_bytes:
                    raise UploadTooLargeError(f"File too large. Max size is {max_bytes / 1024 / 1024}MB")
                out_f.write(chunk)
    except Exception:
        try:
            os.remove(dest_path)
        except OSError:
            pass
        raise
    finally:
        try:
            file.file.seek(0)
        except Exception:
            pass
    return written

def save_upload(file: UploadFile) -> str:
    """保存上传文件到临时路径"""
    uploads_dir = os.path.join(OUTPUTS_DIR, "uploads", "direct")
    os.makedirs(uploads_dir, exist_ok=True)
    unique_name = f"{uuid.uuid4()}{_safe_extension(file.filename)}"
    dest_path = os.path.join(uploads_dir, unique_name)
    save_upload_to_path(file, dest_path)
    return dest_path

def save_upload_with_uuid(file: UploadFile, user_id: str) -> tuple[str, str]:
    """保存上传文件并返回UUID"""
    file_uuid = str(uuid.uuid4())
    uploads_dir = os.path.join(OUTPUTS_DIR, "uploads", _safe_user_id(user_id))
    os.makedirs(uploads_dir, exist_ok=True)
    
    # 保持原始文件扩展名
    ext = _safe_extension(file.filename)
    filename = f"{file_uuid}{ext}"
    dest_path = os.path.join(uploads_dir, filename)
    save_upload_to_path(file, dest_path)
    
    # 存储UUID到路径映射
    _load_index()
    with _index_lock:
        file_storage[file_uuid] = os.path.abspath(dest_path)
        _persist_index()
    return file_uuid, dest_path

def get_file_path(file_uuid: str) -> Optional[str]:
    """根据UUID获取文件路径"""
    _load_index()
    path = file_storage.get(file_uuid)
    if not path or not os.path.isfile(path):
        return None
    return path
