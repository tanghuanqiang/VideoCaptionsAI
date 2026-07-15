# VideoCaptionsAI

AI-powered video subtitle recognition, style editing, and hard-burning tool.  
**Stack**: FastAPI + React + Whisper + LangGraph + FFmpeg

## Quickstart (Dev)

### Prerequisites
- Python 3.9+
- Node.js 18+ & pnpm (`npm i -g pnpm`)
- FFmpeg (on PATH: `ffmpeg -version` must work)

### 1. Clone & Setup Backend

```bash
cd VideoSubs
python -m venv venv
.\venv\Scripts\activate   # Windows
# source venv/bin/activate  # macOS/Linux

pip install -r requirements.txt
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` — fill in your keys:

```ini
# Required for AI Copilot (get from https://platform.openai.com/api-keys)
LLM_API_KEY=sk-your-key-here
LLM_MODEL_NAME=gpt-4o
LLM_OPENAI_BASE=https://api.openai.com/v1

# Required for web search in Copilot (get from https://tavily.com)
TAVILY_API_KEY=tvly-your-key-here

# Optional: LangSmith tracing (https://smith.langchain.com)
LANGSMITH_API_KEY=lsv2_pt_your-key-here

# Whisper model: tiny/base/small/medium/large-v3 (default: large-v3)
WHISPER_MODEL=large-v3
```

> **Security**: `.env` is gitignored. Never commit real keys.  
> Copilot works without API keys, but will show a "please configure" message.

### 3. Build Frontend

```bash
cd ../agentfront
pnpm install
pnpm build
```

### 4. Start Dev Server

```bash
cd ../VideoSubs
uvicorn src.app:app --host 0.0.0.0 --port 8000 --reload
```

Open **http://127.0.0.1:8000** — the frontend is served by the same server.

### 5. (Optional) Desktop Window

```bash
python main_exe.py
```

This opens a desktop-style browser window + system tray icon.  
Supports LAN access: other devices on the same network can connect.

---

## Build Windows Installer

### One-Click Build

```bash
cd VideoSubs
python build.py
```

This runs: clean → frontend build → PyInstaller → Inno Setup → `VideoCaptionsAI_Setup.exe`

### Manual Steps

```bash
# 1. Build frontend
cd agentfront && pnpm build

# 2. Copy frontend to backend
Copy-Item -Recurse -Force dist\* ..\VideoSubs\frontend_dist\

# 3. Build exe
cd ..\VideoSubs
pyinstaller build_exe.spec --noconfirm

# 4. Build installer (requires Inno Setup)
iscc installer.iss
```

---

## API Overview

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/asr/` | Upload video/audio → get recognized subtitles (JSON) |
| `POST` | `/api/burn/` | Upload video + ASS file → get burned video |
| `POST` | `/api/copilot/send` | Send instruction to AI Copilot with context |
| `GET` | `/api/copilot/sse` | SSE stream for Copilot responses |
| `GET` | `/api/config` | Get/update Copilot settings (API key, model, etc.) |
| `POST` | `/api/config` | Update Copilot configuration |
| `GET` | `/api/history` | Get task history list (paginated) |
| `GET` | `/api/tasks/{id}` | Query task status/progress |

---

## Running Tests

```bash
cd VideoSubs
pip install pytest

# Fast tests (no heavy imports)
python -m pytest tests/unit_tests/ -v -k "not AppImport"

# All tests
python -m pytest tests/unit_tests/ -v

# Integration tests (requires test video)
$env:TEST_VIDEO_PATH = "C:\path\to\test.mp4"
python -m pytest tests/integration_tests/ -v
```

---

## Project Structure

```
VideoCaptionsAI/
├── agentfront/              # React frontend (Vite + TypeScript)
│   └── src/components/      # VideoPanel, SubtitlePreview, Copilot, etc.
├── VideoSubs/               # Python backend
│   ├── src/
│   │   ├── agent/           # LangGraph AI Copilot logic
│   │   ├── routers/         # FastAPI routes (ASR, burn, copilot, etc.)
│   │   ├── services/        # Business logic (handlers, storage, cleanup)
│   │   ├── tools/           # Core tools (Whisper, FFmpeg, ASS)
│   │   ├── utils/           # Model loader, task queue
│   │   └── app.py           # Application entry point
│   ├── frontend_dist/       # Built frontend (served by FastAPI)
│   ├── tests/               # Unit & integration tests
│   ├── build.py             # One-click build script
│   ├── build_exe.spec       # PyInstaller spec
│   └── installer.iss        # Inno Setup script
└── .github/workflows/       # CI/CD
    └── build.yml            # Auto test → build → release on tag
```

---

## FAQ

**Q: `ffmpeg not found`?**  
Install FFmpeg and ensure it's on PATH (`ffmpeg -version`).

**Q: Whisper is slow?**  
Default model is `large-v3`. Set `WHISPER_MODEL=small` in `.env` for faster (less accurate) results. GPU (CUDA) speeds it up dramatically.

**Q: First request hangs?**  
Whisper model is downloading (~3 GB for large-v3). Check terminal logs. Pre-download with `python src/utils/download_models.py`.

**Q: Copilot not responding?**  
Click the gear icon in the Copilot panel and enter your OpenAI-compatible API key + base URL.

**Q: Port already in use?**  
The app auto-selects a free port. Check `app.port` file or terminal output. Or set `PORT=8000` env var.

## License

MIT