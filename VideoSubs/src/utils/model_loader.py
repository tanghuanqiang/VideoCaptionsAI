import os
import whisper
import torch
from typing import Literal

_models = {}  # 缓存多个模型

ModelSize = Literal['tiny', 'base', 'small', 'medium', 'large', 'large-v2', 'large-v3']

def get_whisper_model(model_size: ModelSize = None):
    """Get Whisper model with dynamic size selection"""
    global _models
    
    # 如果没有指定模型，使用默认模型
    if model_size is None:
        model_size = os.environ.get("WHISPER_MODEL", "base")
    
    # 如果已加载，直接返回
    if model_size in _models:
        return _models[model_size]
    
    device = "cuda" if torch.cuda.is_available() else "cpu"
    
    print(f"Loading OpenAI Whisper model: {model_size} on {device}")
    model = whisper.load_model(model_size, device=device)
    print(f"OpenAI Whisper model '{model_size}' loaded successfully")
    
    # 缓存模型
    _models[model_size] = model
    return model
