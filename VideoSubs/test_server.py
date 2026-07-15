import sys, os, subprocess, threading, time, logging, socket
from pathlib import Path

if getattr(sys, "frozen", False):
    _EXE_DIR = Path(sys.executable).parent
else:
    _EXE_DIR = Path(__file__).resolve().parent

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s", handlers=[logging.FileHandler(_EXE_DIR / "app.log", encoding="utf-8")])
log = logging.getLogger("test")

if str(_EXE_DIR) not in sys.path:
    sys.path.insert(0, str(_EXE_DIR))

import uvicorn
from src.app import app

sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
sock.bind(("", 0))
PORT = sock.getsockname()[1]
sock.close()

log.info("Starting on port %d", PORT)
config = uvicorn.Config(app, host="0.0.0.0", port=PORT, log_level="info")
server = uvicorn.Server(config)
server.run()
