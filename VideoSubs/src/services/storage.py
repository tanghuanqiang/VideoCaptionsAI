import os
import uuid
import shutil
from typing import Optional
from fastapi import UploadFile
from src.config import OUTPUTS_DIR

# File storage mapping: uuid -> file_path
file_storage = {}

def save_upload(file: UploadFile) -> str:
    """保存上传文件到临时路径"""
    uploads_dir = os.path.join(OUTPUTS_DIR)
    os.makedirs(uploads_dir, exist_ok=True)
    filename = os.path.basename(file.filename or "upload")
    unique_name = f"{filename}"
    dest_path = os.path.join(uploads_dir, unique_name)
    with open(dest_path, "wb") as out_f:
        try:
            shutil.copyfileobj(file.file, out_f)
        finally:
            try:
                file.file.seek(0)
            except Exception:
                pass
    return dest_path

def save_upload_with_uuid(file: UploadFile, user_id: str) -> tuple[str, str]:
    """保存上传文件并返回UUID"""
    file_uuid = str(uuid.uuid4())
    uploads_dir = os.path.join(OUTPUTS_DIR, "uploads", user_id)
    os.makedirs(uploads_dir, exist_ok=True)
    
    # 保持原始文件扩展名
    ext = os.path.splitext(file.filename or "")[1]
    filename = f"{file_uuid}{ext}"
    dest_path = os.path.join(uploads_dir, filename)
    
    with open(dest_path, "wb") as out_f:
        try:
            shutil.copyfileobj(file.file, out_f)
        finally:
            try:
                file.file.seek(0)
            except Exception:
                pass
    
    # 存储UUID到路径映射
    file_storage[file_uuid] = dest_path
    return file_uuid, dest_path

def get_file_path(file_uuid: str) -> Optional[str]:
    """根据UUID获取文件路径"""
    return file_storage.get(file_uuid)
