<div align="center">
<h1>VideoSubs · 智能视频字幕后端</h1>
<p>集 字幕识别 (Whisper) · AI 优化 (LangGraph + LLM) · 样式编辑 · 硬字幕导出 于一体的轻量后端服务</p>
</div>

# VideoSubs

VideoSubs 是 VideoCaptionsAI 的后端服务，负责处理所有繁重的音视频任务和 AI 逻辑。

## 🏗 框架设计

- **API 服务**: FastAPI (Python 3.12+) - 提供 RESTful API 和 SSE 流式接口
- **AI 编排**: LangGraph - 管理复杂的 AI 工作流（识别 -> 优化 -> 格式化）
- **语音识别**: OpenAI Whisper - 本地运行的高精度 ASR 模型
- **媒体处理**: FFmpeg (via `ffmpeg-python`) - 视频转码、音频提取、硬字幕烧录
- **数据验证**: Pydantic - 确保数据结构的一致性

---

## 🚀 快速开始

### 环境要求
- Python 3.12+
- FFmpeg (必须添加到系统 PATH)
- NVIDIA GPU (可选，推荐用于加速 Whisper)

### 方式一：Docker Compose (推荐)
在项目根目录运行：
```bash
docker-compose up --build
```
后端服务将在 `http://localhost:8000` 启动。

### 方式二：本地开发

1. **创建虚拟环境**
   ```bash
   cd VideoSubs
   python -m venv venv
   
   # Windows
   .\venv\Scripts\activate
   # Linux/Mac
   source venv/bin/activate
   ```

2. **安装依赖**
   ```bash
   pip install -e .
   ```
   > **注意**: 如果你有 NVIDIA 显卡，建议安装 CUDA 版本的 PyTorch 以获得更好的性能。
   > ```bash
   > pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118
   > ```

3. **配置环境变量**
   复制根目录的 `.env.example` 到 `.env` 并填入 API Keys。

4. **下载 Whisper 模型 (可选但推荐)**
   首次运行会自动下载，但建议预先下载以避免超时。
   ```bash
   python src/utils/download_models.py
   ```

5. **启动服务**
   ```bash
   uvicorn src.app:app --reload
   ```
   服务将在 `http://localhost:8000` 启动。

---

## 🔌 API 概览

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/asr/` | 上传视频/音频，返回识别后的字幕 JSON |
| `POST` | `/burn/` | 上传视频和 ASS 字幕文件，返回烧录后的视频 |
| `POST` | `/copilot/send` | 向 AI 发送指令和上下文 |
| `GET` | `/copilot/sse` | 建立 SSE 连接，接收 AI 的流式响应 |

---

## 📁 目录结构

```
VideoSubs/
├── src/
│   ├── agent/           # LangGraph AI 代理逻辑
│   ├── tools/           # 工具集 (Whisper, FFmpeg, ASS 处理)
│   ├── routers/         # FastAPI 路由定义
│   ├── services/        # 业务逻辑服务
│   ├── utils/           # 通用工具函数
│   ├── app.py           # 应用入口
│   └── config.py        # 配置管理
├── outputs/             # 临时输出目录 (视频、字幕等)
├── tests/               # 测试用例
└── pyproject.toml       # 项目依赖配置
```

---

## 🛠 常见问题

**Q: 启动时报错 `ffmpeg not found`?**
A: 请确保 FFmpeg 已安装并添加到系统的 PATH 环境变量中。在终端运行 `ffmpeg -version` 检查。

**Q: Whisper 识别速度很慢?**
A: 默认使用 CPU 运行。如果可能，请配置 CUDA 环境并安装 GPU 版本的 PyTorch。或者在 `.env` 中将 `WHISPER_MODEL` 设置为更小的模型 (如 `small` 或 `medium`)。

**Q: 首次请求卡住很久?**
A: 可能是正在下载 Whisper 模型。请查看终端日志，或使用 `src/utils/download_models.py` 预先下载。

---

## 🤝 贡献

欢迎提交 Pull Requests 来改进代码或增加新功能。请确保通过所有测试。

## 📄 许可证

MIT License

