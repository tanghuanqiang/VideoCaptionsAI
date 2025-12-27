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
    
    # 优先使用 CUDA
    device = "cpu"
    if torch.cuda.is_available():
        try:
            # 尝试在 GPU 上分配一个小张量来验证可用性
            # RTX 50 系列 (Blackwell) 可能因为 PyTorch 版本滞后而导致 CUDA 初始化失败
            t = torch.tensor([1]).cuda()
            # 进一步验证：执行简单计算，确保 kernel 可用
            (t + 1).cpu()
            device = "cuda"
            device_name = torch.cuda.get_device_name(0)
            print(f"✅ CUDA is available and working. Using GPU: {device_name}")
            if "5070" in device_name or "5080" in device_name or "5090" in device_name:
                 print("ℹ️  RTX 50-series GPU detected. Ignoring potential PyTorch compatibility warnings if tensor allocation succeeded.")
        except Exception as e:
            print(f"⚠️ CUDA is available but failed to initialize (likely architecture mismatch for RTX 50 series).")
            print(f"   Error: {e}")
            print("   Falling back to CPU.")
            device = "cpu"
    else:
        print("⚠️ CUDA not available. Using CPU. This will be slow!")
        print("   Please ensure you have installed PyTorch with CUDA support.")
    
    print(f"Loading OpenAI Whisper model: {model_size} on {device}")
    
    try:
        model = whisper.load_model(model_size, device=device)
    except Exception as e:
        if device == "cuda":
            print(f"❌ Failed to load model on GPU (Kernel Error): {e}")
            print("🔄 Falling back to CPU...")
            device = "cpu"
            print(f"Loading OpenAI Whisper model: {model_size} on {device}")
            model = whisper.load_model(model_size, device=device)
        else:
            raise e

    print(f"OpenAI Whisper model '{model_size}' loaded successfully")
    
    # 缓存模型
    _models[model_size] = model
    return model
