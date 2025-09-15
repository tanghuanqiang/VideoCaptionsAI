
# 项目简介

本仓库包含两个智能视频字幕相关项目：VideoSubs（后端服务）与 AgentFront（桌面端）。

---

## VideoSubs

**简介**：轻量级后端服务，专注于智能视频字幕处理，集成 Whisper 语音识别、LangGraph+LLM AI 优化、字幕样式编辑与硬字幕烧录。

**主要功能**：
- Whisper 离线语音识别，自动生成结构化字幕
- LangGraph+LLM AI 批量优化字幕内容与样式
- ffmpeg 硬字幕烧录导出
- SSE 实时流式输出，支持前端实时编辑体验
- API 支持字幕识别、烧录、AI Copilot 指令等

**技术栈**：Python + FastAPI + Whisper + LangGraph + LangChain + ffmpeg + PyTorch

**快速开发/使用**：
1. 安装依赖
   ```powershell
   cd VideoSubs
   pip install -e .
   ```

2. 启动服务前，参考配置方法（推荐）：
   1. 复制 `.env.example` 为 `.env`，填写你的 Key：
      ```powershell
      copy .env.example .env
      # 然后用编辑器打开 `.env` 填入你的值
      ```
   2. `.env` 放在仓库根目录，`src/agent/SubsAI.py` 会自动加载（需要 `python-dotenv`）。
   3. 下面是 `.env` 中常用变量及获取链接（把它们全部放到 `.env` 中）：
      - `TAVILY_API_KEY` — Tavily 搜索/工具整合 Key。获取文档：[Tavily Search Docs](https://python.langchain.ac.cn/docs/integrations/tools/tavily_search/)
      - `LLM_API_KEY` — 通用 LLM Key（OpenAI 或兼容服务）。如果使用 OpenAI，请在 OpenAI 控制台创建 API Key；若使用兼容端点，把该 Key 填入。[阿里云模型 Studio](https://help.aliyun.com/zh/model-studio/new-free-quota)
      - `LLM_MODEL_NAME` — 可选，覆盖默认模型名称（例如 `qwen-turbo`）。
      - `LLM_OPENAI_BASE` — 可选，覆盖 OpenAI 兼容的 base URL（例如阿里/自托管兼容端点）。
      - `LANGSMITH_API_KEY` — 可选，用于 LangSmith/监控（如果你使用该服务）。
      - `WHISPER_MODEL` — 可选，指定 Whisper 模型（默认 `large-v3`，可改为 `medium`/`small` 以节省资源）。

3. 首次建议先下载 Whisper large-v3 模型（推荐使用工具脚本）
   ```powershell
   python src/utils/download_models.py
   # 或快速下载（非交互式）
   python -c "import whisper; whisper.load_model('large-v3')"
   ```

4. 启动服务
   ```powershell
   uvicorn src.app:app --reload
   ```

**联系方式**：
- Email: 1803206379@qq.com
- WeChat: wNANAfREEDOM
- GitHub Issues/PR

---

## AgentFront

**简介**：桌面级视频字幕处理工具，集成自动语音识别（ASR）、字幕可视化编辑、ASS样式定制、硬字幕烧录导出，以及可选 AI Copilot 智能建议。

**主要功能**：
- 自动语音识别生成字幕
- 字幕批量编辑、样式调整、实时预览
- ASS 字幕样式面板，支持字体、颜色、描边、阴影等
- 一键硬字幕烧录导出 MP4
- AI Copilot 智能批量润色/修正建议
- Tauri 打包为跨平台桌面应用

**技术栈**：React + TypeScript + Vite + Tauri (Rust) + FastAPI (Python) + ffmpeg/whisper

**快速开发/使用**：
1. 克隆仓库并安装依赖
   ```powershell
   git clone <repo-url>
   cd agentfront
   yarn install
   ```
2. 启动前端开发
   ```powershell
   yarn dev
   ```
3. 启动后端（可选 FastAPI 示例）
   > 启动前请先获取 API Key，并复制 `.env.example` 为 `.env`，用编辑器填写你的 Key。
   ```powershell
   copy .env.example .env
   # 编辑 .env 文件，填写你的 Key
   # 推荐首次下载 Whisper large-v3 模型
   python src/utils/download_models.py
   # 或快速下载（非交互式）
   python -c "import whisper; whisper.load_model('large-v3')"
   pip install -e .
   uvicorn src.app:app --reload 
   ```
4. 启动桌面端（可选）
   ```powershell
   yarn tauri dev
   ```

**联系方式**：Email: 1803206379@qq.com

---

如需更多帮助或反馈，欢迎通过邮箱或 GitHub Issue 联系。

