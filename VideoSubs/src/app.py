import asyncio
import os
import sys
import warnings
import logging
from pathlib import Path

warnings.filterwarnings("ignore", category=UserWarning, module="langchain_tavily")

from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, StreamingResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

# ---- Logging ----
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("VideoCaptionsAI")

# ---- Path resolution ----
if getattr(sys, "frozen", False):
    _EXE_DIR = Path(sys.executable).parent
    _BUNDLE_DIR = Path(sys._MEIPASS)
else:
    _EXE_DIR = Path(__file__).resolve().parent.parent
    _BUNDLE_DIR = _EXE_DIR

DB_PATH = str(_EXE_DIR / "video_subs.db")
OUTPUTS_DIR = str(_EXE_DIR / "outputs")
FRONTEND_DIR = str(_BUNDLE_DIR / "frontend_dist")
OUTPUTS_DIR = os.environ.get("OUTPUTS_DIR", OUTPUTS_DIR)

# ---- Fix whisper assets for PyInstaller ----
if getattr(sys, "frozen", False):
    _wa = os.path.join(sys._MEIPASS, "whisper", "assets")
    if os.path.isdir(_wa):
        import whisper.audio as _whisper_audio
        _orig = _whisper_audio.mel_filters

        def _patched(device, n_mels: int):
            import numpy as np, torch
            _ap = os.path.join(sys._MEIPASS, "whisper", "assets", "mel_filters.npz")
            if os.path.exists(_ap):
                _whisper_audio._MEL_FILTERS_PATH = _ap
            return _orig(device, n_mels)

        _whisper_audio.mel_filters = _patched
        logger.info("Whisper assets patched: %s", _wa)

os.makedirs(OUTPUTS_DIR, exist_ok=True)
os.environ["OUTPUTS_DIR"] = OUTPUTS_DIR

# ---- Config & DB ----
from src.config_manager import set_config_path
set_config_path(str(_EXE_DIR / "config.json"))

import src.config as config
config.OUTPUTS_DIR = OUTPUTS_DIR

import src.db as db_module
db_module.SQLALCHEMY_DATABASE_URL = f"sqlite:///{DB_PATH}"
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
db_module.engine = create_engine(db_module.SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
db_module.SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=db_module.engine)

from src.db import init_db
from src.utils.model_loader import get_whisper_model
from src.utils.task_queue import burn_queue
from src.services.cleanup import cleanup_old_files, periodic_cleanup

# Fix task queue persistence path
burn_queue.persistence_file = os.path.join(OUTPUTS_DIR, "queue_state.json")

# Routers
from src.routers import upload, asr, burn, copilot, tasks, history

# Prometheus
try:
    from prometheus_client import generate_latest, CONTENT_TYPE_LATEST
    PROMETHEUS_AVAILABLE = True
except ImportError:
    PROMETHEUS_AVAILABLE = False


# ---- Handlers ----
from src.services.handlers import burn_task_handler, asr_task_handler


@asynccontextmanager
async def lifespan(app: FastAPI):
    import io
    try:
        sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    except Exception:
        pass

    logger.info("Preloading Whisper model...")
    import concurrent.futures
    loop = asyncio.get_event_loop()
    try:
        await loop.run_in_executor(None, get_whisper_model)
        logger.info("Whisper model preloaded")
    except Exception as e:
        logger.error("Failed to preload Whisper model: %s", e)

    burn_queue.register_handler("burn_task", burn_task_handler)
    burn_queue.register_handler("asr_task", asr_task_handler)
    logger.info("Starting task queue...")
    await burn_queue.start()
    logger.info("Task queue started")

    cleanup_old_files()
    asyncio.create_task(periodic_cleanup())

    yield
    logger.info("Shutting down...")
    await burn_queue.stop()


app = FastAPI(title="VideoCaptionsAI", version="1.0.0", lifespan=lifespan)

init_db()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition", "Content-Length"],
)

# Mount outputs
app.mount("/outputs", StaticFiles(directory=OUTPUTS_DIR), name="outputs")

# Routers
app.include_router(upload.router, prefix="/api")
app.include_router(asr.router, prefix="/api")
app.include_router(burn.router, prefix="/api")
app.include_router(copilot.router, prefix="/api")
app.include_router(tasks.router, prefix="/api")
app.include_router(history.router, prefix="/api")


# ---- Global exception handler ----
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled exception on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error", "type": type(exc).__name__},
    )


# ---- Health check ----
@app.get("/health")
async def health_check():
    return JSONResponse({
        "status": "ok",
        "version": "1.0.0",
        "whisper_loaded": bool(getattr(get_whisper_model, "_current_model", None) or True),
    })


# ---- Metrics ----
@app.get("/metrics")
async def metrics():
    if not PROMETHEUS_AVAILABLE:
        return JSONResponse({"error": "Prometheus not installed"}, status_code=501)
    return StreamingResponse(generate_latest(), media_type=CONTENT_TYPE_LATEST)


# ---- Config API ----
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
    return JSONResponse(get_config())


@app.post("/api/config")
async def api_update_config(body: ConfigUpdate):
    updates = {k: v for k, v in body.dict().items() if v}
    if updates:
        config = update_config(updates)
        try:
            reload_agent()
        except Exception as e:
            logger.warning("Failed to reload agent: %s", e)
        return JSONResponse(config)
    return JSONResponse(get_config())


# ---- Frontend SPA ----
frontend_path = Path(FRONTEND_DIR)
if frontend_path.exists() and frontend_path.is_dir():
    app.mount("/assets", StaticFiles(directory=str(frontend_path / "assets")), name="frontend_assets")

    @app.get("/vite.svg")
    async def vite_svg():
        svg_path = frontend_path / "vite.svg"
        if svg_path.exists():
            return FileResponse(str(svg_path))
        return JSONResponse({"detail": "Not Found"}, status_code=404)

    for subdir in ["ffmpeg-core", "fonts"]:
        sp = frontend_path / subdir
        if sp.exists() and sp.is_dir():
            app.mount(f"/{subdir}", StaticFiles(directory=str(sp)), name=f"frontend_{subdir}")

    from fastapi.responses import HTMLResponse

    @app.get("/{full_path:path}", response_class=HTMLResponse)
    async def spa_fallback(full_path: str):
        ip = frontend_path / "index.html"
        if ip.exists():
            return FileResponse(str(ip), media_type="text/html")
        return JSONResponse({"detail": "Frontend not found"}, status_code=404)

    logger.info("Frontend served from: %s", FRONTEND_DIR)
else:
    logger.warning("Frontend directory not found at %s", FRONTEND_DIR)
