# VideoCaptionsAI Copilot Instructions

## 🧠 Project Overview
VideoCaptionsAI is a local-first video subtitle generation and editing application. It combines a **React/Tauri frontend** for the UI with a **Python/FastAPI backend** for heavy AI processing (Whisper ASR, LLM optimization) and media manipulation (ffmpeg).

## 🏗 Architecture & Tech Stack

### Frontend (`agentfront/`)
- **Framework:** React 18 + TypeScript + Vite
- **Desktop Shell:** Tauri (Rust) for native capabilities
- **UI Library:** Tailwind CSS + `react-grid-layout` (for draggable panels)
- **State Management:** Context API (`AuthContext`) + Local State
- **AI Client:** LangChain.js (`src/agents/subtitleAgent.ts`)
- **Media Processing:** `@ffmpeg/ffmpeg` (WASM) for lightweight tasks, HTML5 Video for preview.

### Backend (`VideoSubs/`)
- **Framework:** FastAPI (`src/app.py`)
- **AI Orchestration:** LangGraph (`src/agent/SubsAI.py`)
- **ASR Model:** OpenAI Whisper (local execution)
- **Media Processing:** `ffmpeg-python` wrapper around system `ffmpeg`
- **Data Models:** Pydantic (`src/agent/Subs.py`)

## 🚀 Critical Workflows

### 1. Development Environment
- **Backend:**
  ```bash
  cd VideoSubs
  # Install dependencies
  pip install -e .
  # Start API server (http://127.0.0.1:8000)
  uvicorn src.app:app --reload
  ```
- **Frontend:**
  ```bash
  cd agentfront
  # Web mode (http://localhost:5173)
  yarn dev
  # Desktop mode
  yarn tauri dev
  ```

### 2. Model Management
- **Download Whisper Models:**
  Run the interactive downloader before starting the backend to avoid timeouts.
  ```bash
  python VideoSubs/src/utils/download_models.py
  ```

### 3. API & Proxy
- The frontend proxies API requests (`/api`, `/register`, `/token`) to `http://127.0.0.1:8000` via `vite.config.ts`.
- **Do not hardcode** `localhost:8000` in frontend code; use relative paths (e.g., `/api/upload`).

## 🧩 Key Patterns & Conventions

### AI Agents (LangGraph)
- **Location:** `VideoSubs/src/agent/SubsAI.py`
- **Structure:** Uses `StateGraph` with a `chatbot` node and a `tools` node.
- **Tools:** Defined in `VideoSubs/src/tools/subtitle_tools.py`.
- **State:** TypedDict `State` containing `messages` and `files`.
- **Streaming:** The backend supports SSE (Server-Sent Events) for streaming AI responses to the frontend.

### Subtitle Handling
- **Internal Format:** JSON/Pydantic models during processing.
- **Styling:** ASS (Advanced Substation Alpha) format is used for rich styling (fonts, colors, positioning).
- **Export:** Supports burning (hard subs) via ffmpeg and soft export (SRT/ASS).

### Frontend Components
- **Layout:** The editor uses a grid layout. Components like `SubtitleEditor`, `VideoPanel`, and `SubtitleStylePanel` are designed to be draggable.
- **Video Sync:** `useVideoScale` hook manages video resizing and coordinate mapping for subtitle preview.

## ⚠️ Common Pitfalls
- **FFmpeg Paths:** Ensure `ffmpeg` is in the system PATH for the backend to work.
- **WASM vs Native:** The frontend uses WASM ffmpeg for some tasks, while the backend uses system ffmpeg. Be clear about which context you are modifying.
- **Environment Variables:** API keys (`TAVILY_API_KEY`, `LLM_API_KEY`) must be set in `.env` in the project root.

## 🧪 Testing
- **Backend Tests:** `pytest VideoSubs/tests`
- **Frontend:** Manual testing via `yarn dev` is currently the primary method.
