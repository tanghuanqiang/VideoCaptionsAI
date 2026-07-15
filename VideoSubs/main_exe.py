"""
VideoCaptionsAI - Windows Desktop Application Entry Point
System tray + local server. Supports LAN access.
"""
import sys
import os
from pathlib import Path

def _setup_logging():
    if getattr(sys, "frozen", False):
        _STARTUP_LOG = Path(sys.executable).parent / "startup.log"
    else:
        _STARTUP_LOG = Path(__file__).resolve().parent / "startup.log"
    try:
        _startup_fp = open(str(_STARTUP_LOG), "w", encoding="utf-8", buffering=1)
        sys.stdout = _startup_fp
        sys.stderr = _startup_fp
    except Exception:
        pass
    print("VideoCaptionsAI starting...", flush=True)


import subprocess
import threading
import time
import logging
import socket
import ctypes
import traceback as _tb

if getattr(sys, "frozen", False):
    _EXE_DIR = Path(sys.executable).parent
else:
    _EXE_DIR = Path(__file__).resolve().parent

LOG_FILE = _EXE_DIR / "app.log"
PID_FILE = _EXE_DIR / "app.pid"
PORT_FILE = _EXE_DIR / "app.port"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.FileHandler(LOG_FILE, encoding="utf-8")],
)
log = logging.getLogger("VideoCaptionsAI")

def is_already_running():
    if not PID_FILE.exists():
        return False
    try:
        old_pid = int(PID_FILE.read_text().strip())
        PROCESS_QUERY_LIMITED_INFO = 0x1000
        handle = ctypes.windll.kernel32.OpenProcess(PROCESS_QUERY_LIMITED_INFO, False, old_pid)
        if handle:
            ctypes.windll.kernel32.CloseHandle(handle)
            return True
    except Exception:
        pass
    try:
        PID_FILE.unlink()
    except Exception:
        pass
    return False

def register_instance():
    PID_FILE.write_text(str(os.getpid()))
    PORT_FILE.write_text(str(PORT))

def show_already_running():
    try:
        port = 58000
        if PORT_FILE.exists():
            try:
                port = int(PORT_FILE.read_text().strip())
            except Exception:
                pass
        msg = f"VideoCaptionsAI is already running.\n\nCheck the system tray icon or visit http://127.0.0.1:{port}"
        ctypes.windll.user32.MessageBoxTimeoutW(0, msg, "VideoCaptionsAI", 0x40, 0, 5000)
    except Exception:
        pass

ICON_PATH = _EXE_DIR / "_internal" / "icon.ico" if getattr(sys, "frozen", False) else _EXE_DIR / "icon.ico"
HOST = "0.0.0.0"

def find_free_port():
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.bind(("", 0))
    port = sock.getsockname()[1]
    sock.close()
    return port

PORT = int(os.environ.get("PORT", "0")) or find_free_port()

def find_browser():
    browsers = [
        os.path.expandvars(r"%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"),
        os.path.expandvars(r"%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"),
        os.path.expandvars(r"%ProgramFiles%\Google\Chrome\Application\chrome.exe"),
        os.path.expandvars(r"%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"),
        os.path.expandvars(r"%LocalAppData%\Google\Chrome\Application\chrome.exe"),
    ]
    for path in browsers:
        if os.path.exists(path):
            return path
    return None

def open_desktop_window():
    url = f"http://127.0.0.1:{PORT}"
    browser_path = find_browser()
    if browser_path:
        try:
            subprocess.Popen(
                [browser_path, f"--app={url}", "--new-window", "--window-size=1400,900"],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                creationflags=0x08000000,
            )
            log.info("Desktop window opened")
            return
        except Exception as e:
            log.warning("Browser app mode failed: %s", e)
    import webbrowser
    webbrowser.open(url)

def run_server():
    import uvicorn
    from src.app import app
    def serve():
        uvicorn.run(app, host=HOST, port=PORT, log_level="info")
    t = threading.Thread(target=serve, daemon=True)
    t.start()
    time.sleep(3)
    log.info("Server listening on http://0.0.0.0:%d", PORT)

def get_lan_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"

def create_tray_icon():
    import pystray
    from PIL import Image
    if ICON_PATH.exists():
        image = Image.open(ICON_PATH)
    else:
        image = Image.new("RGB", (64, 64), color="#3a7bd5")
    image = image.resize((32, 32), Image.LANCZOS)
    lan_ip = get_lan_ip()

    def on_open():
        open_desktop_window()

    def on_open_browser():
        import webbrowser
        webbrowser.open(f"http://127.0.0.1:{PORT}")

    def on_quit():
        icon.stop()
        try:
            PID_FILE.unlink(missing_ok=True)
            PORT_FILE.unlink(missing_ok=True)
        except Exception:
            pass
        os._exit(0)

    menu = pystray.Menu(
        pystray.MenuItem("打开桌面窗口", on_open, default=True),
        pystray.MenuItem("浏览器打开", on_open_browser),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem(f"局域网: http://{lan_ip}:{PORT}", None, enabled=False),
        pystray.MenuItem(f"本机: http://127.0.0.1:{PORT}", None, enabled=False),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem("退出", on_quit),
    )
    icon = pystray.Icon("VideoCaptionsAI", image, f"VideoCaptionsAI (:{PORT})", menu)
    return icon

def main():
    _setup_logging()
    log.info("=" * 50)
    log.info("  VideoCaptionsAI v1.0.0 - Port %d", PORT)
    log.info("=" * 50)
    print(f"VideoCaptionsAI started on port {PORT}", flush=True)

    if is_already_running():
        show_already_running()
        sys.exit(0)

    os.chdir(str(_EXE_DIR))
    register_instance()

    log.info("Starting tray icon...")
    threading.Thread(target=lambda: create_tray_icon().run(), daemon=True).start()

    log.info("Opening desktop window...")
    threading.Thread(target=open_desktop_window, daemon=True).start()

    lan_ip = get_lan_ip()
    log.info("Ready. LAN: http://%s:%d", lan_ip, PORT)

    import uvicorn
    from src.app import app
    uvicorn.run(app, host=HOST, port=PORT, log_level="info")

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"FATAL: {e}", flush=True)
        _tb.print_exc()
        log.exception("Fatal startup error")
        try:
            ctypes.windll.user32.MessageBoxW(0, f"Startup Error: {e}\n\nCheck {LOG_FILE} for details.", "VideoCaptionsAI Error", 0x10)
        except Exception:
            pass
        sys.exit(1)