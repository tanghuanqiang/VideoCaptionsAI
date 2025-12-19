import os
import whisper
import torch

_model = None

def get_whisper_model():
    global _model
    if _model is None:
        model_size = os.environ.get("WHISPER_MODEL", "tiny")
        device = "cuda" if torch.cuda.is_available() else "cpu"
        
        print(f"Loading OpenAI Whisper model: {model_size} on {device}")
        _model = whisper.load_model(model_size, device=device)
        print("OpenAI Whisper model loaded successfully")
    return _model
