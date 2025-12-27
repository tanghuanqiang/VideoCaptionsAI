import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

from src.config import OUTPUTS_DIR
from src.db import init_db
from src.utils.model_loader import get_whisper_model
from src.utils.task_queue import burn_queue
from src.services.cleanup import cleanup_old_files, periodic_cleanup
from src.services.handlers import burn_task_handler, asr_task_handler

# Routers
from src.routers import auth, upload, asr, burn, copilot, tasks

# Prometheus metrics
try:
    from prometheus_client import generate_latest, CONTENT_TYPE_LATEST
    PROMETHEUS_AVAILABLE = True
except ImportError:
    PROMETHEUS_AVAILABLE = False

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Load model
    print("Starting up: Preloading Whisper model...")
    try:
        get_whisper_model()
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
    
    yield
    # Shutdown: Clean up if needed
    print("Shutting down...")
    await burn_queue.stop()

app = FastAPI(title="Subtitle Tools API", version="1.0.0", lifespan=lifespan)

# Initialize DB
init_db()

app.add_middleware(
    CORSMiddleware,
    # allow_origins=["*"],  # Invalid with allow_credentials=True
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition", "Content-Length"],
)

app.mount("/static", StaticFiles(directory="static"), name="static")
app.mount("/outputs", StaticFiles(directory=OUTPUTS_DIR), name="outputs")

# Include Routers
app.include_router(auth.router)
app.include_router(upload.router)
app.include_router(asr.router)
app.include_router(burn.router)
app.include_router(copilot.router)
app.include_router(tasks.router)

@app.get("/metrics")
async def metrics():
    if not PROMETHEUS_AVAILABLE:
        return JSONResponse({"error": "Prometheus client not installed"}, status_code=501)
    return StreamingResponse(
        generate_latest(), media_type=CONTENT_TYPE_LATEST
    )
