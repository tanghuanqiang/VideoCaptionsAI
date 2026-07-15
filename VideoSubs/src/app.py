import asyncio
import os
import sys
import warnings
import threading
import webbrowser
from pathlib import Path
# Suppress specific warnings from libraries
warnings.filterwarnings("ignore", category=UserWarning, module="langchain_tavily")

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.responses import JSONResponse, StreamingResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

# ---- Resolve paths for PyInstaller single-exe or dev mode ----
if getattr(sys, "frozen", False):
    _EXE_DIR = Path(sys.executable).parent  # where the exe lives
    _BUNDLE_DIR = Path(sys._MEIPASS)        # where bundled data is extracted
else:
    _EXE_DIR = Path(__file__).resolve().parent.parent  # VideoSubs dir
    _BUNDLE_DIR = _EXE_DIR

# Writable data goes alongside the exe, bundled data from _BUNDLE_DIR
DB_PATH = str(_EXE_DIR / "video_subs.db")
OUTPUTS_DIR = str(_EXE_DIR / "outputs")
FRONTEND_DIR = str(_BUNDLE_DIR / "frontend_dist")

# Override via environment
OUTPUTS_DIR = os.environ.get("OUTPUTS_DIR", OUTPUTS_DIR)


# ---- Fix whisper assets path for PyInstaller bundle ----
import sys as _sys
import os as _os
if getattr(_sys, "frozen", False):
    # In PyInstaller bundle, whisper's __file__ points to PYZ, not filesystem
    # Patch whisper.audio to use the bundled assets path
    _whisper_assets_dir = _os.path.join(_sys._MEIPASS, "whisper", "assets")
    if _os.path.isdir(_whisper_assets_dir):
        import whisper.audio as _whisper_audio
        _orig_mel_filters = _whisper_audio.mel_filters
        
        def _patched_mel_filters(device, n_mels: int):
            import numpy as np
            import torch
            _assets_path = _os.path.join(_sys._MEIPASS, "whisper", "assets", "mel_filters.npz")
            if _os.path.exists(_assets_path):
                _whisper_audio._MEL_FILTERS_PATH = _assets_path
            return _orig_mel_filters(device, n_mels)
        
        _whisper_audio.mel_filters = _patched_mel_filters
        print(f"Whisper assets patched: {_whisper_assets_dir}")
os.makedirs(OUTPUTS_DIR, exist_ok=True)
os.environ["OUTPUTS_DIR"] = OUTPUTS_DIR

# Initialize config manager path
from src.config_manager import set_config_path
set_config_path(str(_EXE_DIR / "config.json"))

# Override config values before importing submodules that use them
import src.config as config
config.OUTPUTS_DIR = OUTPUTS_DIR

# Monkey-patch db.py to use the right DB path
import src.db as db_module
db_module.SQLALCHEMY_DATABASE_URL = f"sqlite:///{DB_PATH}"
# Recreate engine with the new URL
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
db_module.engine = create_engine(
    db_module.SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
db_module.SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=db_module.engine)

from src.db import init_db
from src.utils.model_loader import get_whisper_model
from src.utils.task_queue import burn_queue
from src.services.cleanup import cleanup_old_files, periodic_cleanup

# Routers
from src.routers import upload, asr, burn, copilot, tasks, history

# Prometheus metrics
try:
    from prometheus_client import generate_latest, CONTENT_TYPE_LATEST
    PROMETHEUS_AVAILABLE = True
except ImportError:
    PROMETHEUS_AVAILABLE = False

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Fix Windows console encoding for Whisper warnings
    import io
    try:
        sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    except Exception:
        pass

    # Startup: Load model in thread to avoid blocking event loop
    print("Starting up: Preloading Whisper model...")
    import concurrent.futures
    loop = asyncio.get_event_loop()
    try:
        await loop.run_in_executor(None, get_whisper_model)
        print("Startup: Whisper model preloaded successfully.")
    except Exception as e:
        print(f"Startup: Failed to preload Whisper model: {e}")
    
    # Startup: Register task handlers
    burn_queue.register_handler("burn_task", burn_task_handler)
    burn_queue.register_handler("asr_task", asr_task_handler)

    # Startup: Start task queue
    print("Starting up: Initializing task queue...")
    await burn_queue.start()
    print("Startup: Task queue started.")
    
    # Startup: Clean up old files
    cleanup_old_files()

    # Start periodic cleanup task
    asyncio.create_task(periodic_cleanup())
    
    # Desktop window is opened by main_exe.py
    
    yield
    # Shutdown: Clean up if needed
    print("Shutting down...")
    await burn_queue.stop()

app = FastAPI(title="VideoCaptionsAI", version="1.0.0", lifespan=lifespan)

# Initialize DB
init_db()

# CORS: allow all origins for LAN/Web access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition", "Content-Length"],
)

# Mount outputs directory
app.mount("/outputs", StaticFiles(directory=OUTPUTS_DIR), name="outputs")

# ---- Import handlers (need to be after task_queue import) ----
from src.services.handlers import burn_task_handler, asr_task_handler

# ---- Include Routers with /api prefix ----
app.include_router(upload.router, prefix="/api")
app.include_router(asr.router, prefix="/api")
app.include_router(burn.router, prefix="/api")
app.include_router(copilot.router, prefix="/api")
app.include_router(tasks.router, prefix="/api")
app.include_router(history.router, prefix="/api")

@app.get("/metrics")
async def metrics():
    if not PROMETHEUS_AVAILABLE:
        return JSONResponse({"error": "Prometheus client not installed"}, status_code=501)
    return StreamingResponse(
        generate_latest(), media_type=CONTENT_TYPE_LATEST
    )

# ---- Config API (Copilot settings) ----
from pydantic import BaseModel
from src.config_manager import get_config, update_config
from src.agent.SubsAI import reload_agent

class ConfigUpdate(BaseModel):
    llm_api_base: str = ""
    llm_api_key: str = ""
    llm_model_name: str = ""
    tavily_api_key: str = ""
    temperature: float = 0.0

@app.get("/api/config")
async def api_get_config():
    """Get current Copilot configuration."""
    return JSONResponse(get_config())

@app.post("/api/config")
async def api_update_config(body: ConfigUpdate):
    """Update Copilot configuration and reload agent."""
    updates = {k: v for k, v in body.dict().items() if v}
    if updates:
        config = update_config(updates)
        try:
            reload_agent()
        except Exception as e:
            print(f"Failed to reload agent: {e}")
        return JSONResponse(config)
    return JSONResponse(get_config())

# ---- Serve frontend static files (SPA fallback) ----
frontend_path = Path(FRONTEND_DIR)
if frontend_path.exists() and frontend_path.is_dir():
    from fastapi import Request
    from fastapi.responses import HTMLResponse
    
    # Mount static assets (JS, CSS, images, fonts, etc.)
    app.mount("/assets", StaticFiles(directory=str(frontend_path / "assets")), name="frontend_assets")
    
    # Serve specific files that might be at root
    @app.get("/vite.svg")
    async def vite_svg():
        svg_path = frontend_path / "vite.svg"
        if svg_path.exists():
            return FileResponse(str(svg_path))
        return JSONResponse({"detail": "Not Found"}, status_code=404)
    
    # Serve ffmpeg-core and fonts if they exist
    for subdir in ["ffmpeg-core", "fonts"]:
        subdir_path = frontend_path / subdir
        if subdir_path.exists() and subdir_path.is_dir():
            app.mount(f"/{subdir}", StaticFiles(directory=str(subdir_path)), name=f"frontend_{subdir}")
    
    # SPA fallback: serve index.html for all other routes
    @app.get("/{full_path:path}", response_class=HTMLResponse)
    async def spa_fallback(full_path: str):
        index_path = frontend_path / "index.html"
        if index_path.exists():
            return FileResponse(str(index_path), media_type="text/html")
        return JSONResponse({"detail": "Frontend not found"}, status_code=404)
    
    print(f"Frontend served from: {FRONTEND_DIR}")
else:
    print(f"Warning: Frontend directory not found at {FRONTEND_DIR}")
