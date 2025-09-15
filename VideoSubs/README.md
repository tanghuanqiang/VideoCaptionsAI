<div align="center">
<h1>VideoSubs · 智能视频字幕助手</h1>
<p>集 字幕识别 (Whisper) · AI 优化 (LangGraph + LLM) · 样式编辑 · 硬字幕导出 于一体的轻量后端服务</p>
<img src="./static/studio_ui.png" alt="UI" width="70%" />
</div>

# VideoSubs · 智能视频字幕助手

一个简洁、模块化的视频字幕处理后端：结合 Whisper 离线识别、LangGraph + LLM 的字幕优化、以及基于 `ffmpeg` 的硬字幕烧录。

**技术栈**：Python • FastAPI • Whisper • LangGraph • LangChain • ffmpeg • PyTorch

**核心目标**：快速从视频/音频生成结构化字幕，使用 AI 指令进行增量编辑并导出软/硬字幕。

----

**目录（核心）**
- `src/app.py` — FastAPI 服务（REST + SSE）
- `src/agent/SubsAI.py` — LangGraph 与 LLM/工具编排
- `src/agent/Subs.py` — 字幕与样式数据模型（Pydantic）
- `src/tools/subtitle_tools.py` — Whisper / ffmpeg / ASS / 格式化工具
- `outputs/` — 运行时生成文件

----

**设计要点**
- 最小变更输出：AI 仅返回需要新增/修改/删除的字幕或样式，便于前端增量应用。
- 可组合工具链：LangGraph 将识别、格式化、搜索、人工干预等模块化编排。
- 流式交互：通过 SSE 提供逐步输出，支持实时编辑体验。

----


**环境与安装**

- 要求：`Python 3.12.11`，`ffmpeg` 可执行文件需在 `PATH`。
- 可选：GPU + CUDA 用于加速 Whisper（需安装对应的 `torch`）。

安装依赖：

```powershell
pip install -e .
```

依赖已在 `pyproject.toml` / `requirements.txt` 中声明（Whisper、langgraph、langchain、ffmpeg-python、torch 等）。


获取 API Key：

- Tavily 工具 Key 获取指南：[Tavily Search Docs](https://python.langchain.ac.cn/docs/integrations/tools/tavily_search/)
- 阿里大模型 Key 获取（新用户可免费试用）：[阿里云模型 Studio](https://help.aliyun.com/zh/model-studio/new-free-quota)
- LangChain Key 获取（可选）：[LangChain 设置](https://smith.langchain.com/settings)


配置方法（推荐）：

1. 复制 `.env.example` 为 `.env`，填写你的 Key：

```powershell
copy .env.example .env
# 然后用编辑器打开 `.env` 填入你的值
```

2. `.env` 放在仓库根目录，`src/agent/SubsAI.py` 会自动加载（需要 `python-dotenv`）。

3. 下面是 `.env` 中常用变量及获取链接（把它们全部放到 `.env` 中）：

- `TAVILY_API_KEY` — Tavily 搜索/工具整合 Key。获取文档：[Tavily Search Docs](https://python.langchain.ac.cn/docs/integrations/tools/tavily_search/)
- `LLM_API_KEY` — 通用 LLM Key（OpenAI 或兼容服务）。如果使用 OpenAI，请在 OpenAI 控制台创建 API Key；若使用兼容端点，把该 Key 填入。：[阿里云模型 Studio](https://help.aliyun.com/zh/model-studio/new-free-quota)
- `LLM_MODEL_NAME` — 可选，覆盖默认模型名称（例如 `qwen-turbo`）。
- `LLM_OPENAI_BASE` — 可选，覆盖 OpenAI 兼容的 base URL（例如阿里/自托管兼容端点）。
- `LANGSMITH_API_KEY` — 可选，用于 LangSmith/监控（如果你使用该服务）。
- `WHISPER_MODEL` — 可选，指定 Whisper 模型（默认 `large-v3`，可改为 `medium`/`small` 以节省资源）。


----

**快速开始（开发）**

启动服务：

```powershell
uvicorn src.app:app --reload 
```
直至出现Application startup complete.才表示启动完成


注意：Whisper 大模型（如 `large-v3`）在首次运行时会自动下载，但下载时间较长且对磁盘和带宽要求高。为了避免首次运行卡住，建议先手动下载模型。


在项目根目录（即包含 `src/` 的目录）运行以下脚本来下载模型：

```powershell
# 运行交互式下载工具（请在项目根目录执行）
python src\utils\download_models.py
```

如果你只想快速下载 `large-v3`（非交互式），可以在项目根目录或任何位置运行：

```powershell
python -c "import whisper; whisper.load_model('large-v3')"
```

下载后的模型将缓存到用户目录的 Whisper 缓存（通常为 `~/.cache/whisper`），启动服务时会优先使用该缓存，避免重复下载。

常用接口：
- `POST /asr/` — 上传 `file`（视频/音频），返回字幕 JSON。
- `POST /burn/` — 上传 `file`（视频）和 `ass_file`（ASS 字幕），返回烧录后 MP4。
- `POST /copilot/send` — 向 AI 发送指令：`text`, `subtitles_json`, `styles_json`，可附带 `video`/`files`。
- `GET /copilot/sse` — 订阅 SSE，接收 AI 处理的逐步输出（EventSource）。

示例（浏览器接收 SSE）：

```js
const es = new EventSource('/copilot/sse');
es.onmessage = e => { console.log('chunk:', e.data); };
```

----

**打包与部署（建议）**

- 推荐使用虚拟环境或容器化部署；可用 `gunicorn` + `uvicorn` worker 在生产环境运行。

生产示例：

```powershell
pip install gunicorn
gunicorn -k uvicorn.workers.UvicornWorker src.app:app -w 4 --bind 0.0.0.0:8000
```

（仓库当前未包含 Dockerfile，如需我可以帮助添加）

----

**开发与扩展建议**
- 将任务元信息持久化（SQLite/Redis），便于任务管理与重试。
- 提供软字幕下载、翻译节点与批量处理队列。
- 添加 Dockerfile、CI（测试/lint）与自动化发布流程。

----

**常见问题（速览）**
- ffmpeg 找不到文件：检查 `outputs/` 路径和权限，查看日志中的 ffmpeg 命令。
- Whisper 运行缓慢：CPU + large 模型会慢，建议使用 `medium` 或 GPU + CUDA 的 `torch`。
- SSE 粒度过细：后端逐字符推送，前端可合并为段落显示以减少渲染。

----

**贡献与报告问题**

提交 Issue/PR 时请包含：复现步骤、API 调用示例与相关日志（例如 ffmpeg stderr 最后若干行）。

----

**联系方式**
- Email: `1803206379@qq.com`
- WeChat: `wNANAfREEDOM`
- GitHub: 提交 Issues 或 PR（分支：`main`）

----

许可证：详见仓库根目录 `LICENSE`（MIT）。

欢迎 Star ⭐ 与反馈！


**开发 & 扩展建议**
- 将任务元信息持久化（SQLite/Redis）便于监控与重试。
- 增加软字幕下载与多语言翻译节点。
- 提供 Dockerfile 与 CI（测试 / lint）流水线以便发布镜像。

----

**常见问题（快速解答）**
- ffmpeg 找不到文件：确认传入路径与 `outputs/` 权限，查看 FastAPI 日志中生成的 ffmpeg 命令。
- Whisper 很慢：在 CPU 上运行 `large-v3` 会很慢，建议切换到 `medium` 或使用 GPU + CUDA 的 `torch`。
- SSE 消息粒度：后端当前逐字符推送，前端可自行聚合为段落以减少渲染成本。

----

**贡献 & 报错指南**
- 提交 Issue/PR 请包含复现步骤、调用的 API 与日志片段（如 ffmpeg stderr 的末尾 30 行）。

----

**联系方式**
- Email: `1803206379@qq.com`
- WeChat: `wNANAfREEDOM`
- GitHub: 提交 Issues 或 PR（仓库主分支：`main`）

----

许可证：参见仓库根目录 `LICENSE`（MIT）。

欢迎 Star ⭐ 与反馈！

