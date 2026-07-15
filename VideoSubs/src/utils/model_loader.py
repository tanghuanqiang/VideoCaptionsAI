import os
import sys
import whisper
import torch
import gc
from typing import Literal

ModelSize = Literal['tiny', 'base', 'small', 'medium', 'large', 'large-v2', 'large-v3']

# ---- Fix whisper assets path for PyInstaller frozen builds ----
# whisper.audio uses os.path.dirname(__file__) which breaks in frozen mode
if getattr(sys, 'frozen', False):
    _assets_dir = os.path.join(sys._MEIPASS, 'whisper', 'assets')
    _npz_path = os.path.join(_assets_dir, 'mel_filters.npz')
    if os.path.isfile(_npz_path):
        import whisper.audio as _whisper_audio
        _whisper_audio._MEL_FILTERS_PATH = _npz_path
        # Also set the tokenizer paths
        for _attr, _fname in [('_TIKTOKEN_PATH', 'gpt2.tiktoken'), ('_MULTILINGUAL_TIKTOKEN_PATH', 'multilingual.tiktoken')]:
            _fp = os.path.join(_assets_dir, _fname)
            if os.path.isfile(_fp) and hasattr(_whisper_audio, _attr):
                setattr(_whisper_audio, _attr, _fp)
        print(f"Whisper assets path fixed: {_assets_dir}")

# Cache only the most recently used model to save memory
_current_model_size = None
_current_model = None


def _get_device():
    """Detect best available device without allocating GPU memory."""
    if torch.cuda.is_available():
        try:
            name = torch.cuda.get_device_name(0)
            print(f"CUDA available. Using GPU: {name}")
            return "cuda"
        except Exception as e:
            print(f"CUDA init failed: {e}. Falling back to CPU.")
    print("Using CPU for inference.")
    return "cpu"


def unload_model():
    """Explicitly unload the current model to free memory."""
    global _current_model, _current_model_size
    if _current_model is not None:
        del _current_model
        _current_model = None
        _current_model_size = None
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        print("Model unloaded from memory.")


def get_whisper_model(model_size: ModelSize = None):
    """Get Whisper model. Keeps only ONE model in memory at a time."""
    global _current_model, _current_model_size

    if model_size is None:
        model_size = os.environ.get("WHISPER_MODEL", "base")

    # Return cached model if same size
    if _current_model_size == model_size and _current_model is not None:
        return _current_model

    # Unload previous model if different size
    if _current_model is not None:
        print(f"Switching model from {_current_model_size} to {model_size}...")
        unload_model()

    device = _get_device()

    print(f"Loading Whisper model: {model_size} on {device}")

    try:
        model = whisper.load_model(model_size, device=device)
    except Exception as e:
        if device == "cuda":
            print(f"GPU load failed: {e}. Retrying on CPU...")
            device = "cpu"
            model = whisper.load_model(model_size, device=device)
        else:
            raise e

    # Clean up any fragmented GPU memory
    if device == "cuda":
        torch.cuda.empty_cache()

    print(f"Whisper model '{model_size}' loaded on {device}")

    _current_model = model
    _current_model_size = model_size
    return model