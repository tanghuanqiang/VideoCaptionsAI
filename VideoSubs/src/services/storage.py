import os
import re
import uuid
from typing import Optional
from fastapi import UploadFile
from src.config import MAX_UPLOAD_SIZE, OUTPUTS_DIR

# File storage mapping: uuid -> file_path
file_storage = {}


class UploadTooLargeError(ValueError):
    """Raised after a streamed upload exceeds the configured size limit."""


def _safe_extension(filename: Optional[str]) -> str:
    extension = os.path.splitext(filename or "")[1].lower()
    return extension if re.fullmatch(r"\.[a-z0-9]{1,16}", extension) else ""


def _safe_user_id(user_id: str) -> str:
    sanitized = re.sub(r"[^A-Za-z0-9_-]", "_", user_id).strip("_")
    return sanitized or "default"


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
    file_storage[file_uuid] = dest_path
    return file_uuid, dest_path

def get_file_path(file_uuid: str) -> Optional[str]:
    """根据UUID获取文件路径"""
    return file_storage.get(file_uuid)
