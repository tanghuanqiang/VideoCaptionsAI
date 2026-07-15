"""
VideoCaptionsAI - Configuration Manager
Stores LLM/Copilot settings in a JSON config file.
"""
import os
import json
import threading
from pathlib import Path

CONFIG_FILE = None  # Set by app.py at startup

DEFAULT_CONFIG = {
    "llm_api_base": "https://api.openai.com/v1",
    "llm_api_key": "",
    "llm_model_name": "gpt-4o",
    "tavily_api_key": "",
    "temperature": 0.0,
}

_lock = threading.Lock()


def set_config_path(path: str):
    global CONFIG_FILE
    CONFIG_FILE = path


def get_config_path() -> str:
    global CONFIG_FILE
    if CONFIG_FILE:
        return CONFIG_FILE
    # Default: config.json next to the exe
    return str(Path(os.path.dirname(os.path.abspath(__file__))).parent / "config.json")


def load_config() -> dict:
    """Load config from file, merge with defaults."""
    config = dict(DEFAULT_CONFIG)
    path = get_config_path()
    try:
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as f:
                saved = json.load(f)
            config.update(saved)
    except Exception as e:
        print(f"Warning: Could not load config from {path}: {e}")
    return config


def save_config(config: dict) -> bool:
    """Save config to file."""
    path = get_config_path()
    try:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(config, f, indent=2, ensure_ascii=False)
        return True
    except Exception as e:
        print(f"Error saving config to {path}: {e}")
        return False


def get_config() -> dict:
    """Thread-safe config read."""
    with _lock:
        return load_config()


def update_config(updates: dict) -> dict:
    """Thread-safe config update. Returns new full config."""
    with _lock:
        config = load_config()
        config.update({k: v for k, v in updates.items() if k in DEFAULT_CONFIG})
        save_config(config)
        return config
