# AgentFront — 快速使用指南

最小化说明、开发快速上手与常用命令。

主要功能：ASR 自动生成字幕、可视化编辑、ASS 样式定制、硬字幕烧录导出、可选 AI Copilot 建议。

快速上手（开发）

- 安装依赖：

```powershell
git clone <repo-url>
cd agentfront
yarn install
```

- 启动前端（开发模式）：

```powershell
yarn dev
```

- 启动后端（可选，若使用仓内 FastAPI 示例）：

```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r backend/requirements.txt
python backend/main.py
```

- 启动 Tauri 桌面（可选）：

```powershell
yarn tauri dev
```

核心使用流程

- 导入视频 → 自动识别（/asr/）→ 编辑字幕 → 调整样式 → 导出（/burn/）

重要文件与目录

- `src/`：前端源码（components、hooks、utils）
- `src-tauri/`：Tauri / Rust 代码
- `backend/`：后端示例（FastAPI）

隐私与注意事项

- 联系方式（保留）： `1803206379@qq.com`  
- 已将 `src-tauri/target/` 添加到 `.gitignore`，避免提交构建产物。若历史中存在构建文件并需彻底移除，请通知我以说明清理步骤（会重写历史）。

更多信息或遇到问题，请通过 GitHub Issues 反馈（附复现步骤与日志）。

# AI 字幕识别与硬字幕生成桌面应用 (Tauri + React + FastAPI)

一款集 “自动语音识别 (ASR) → 字幕编辑 → 样式调校 → 预览 → 硬字幕烧录导出” 于一体的桌面工具。前端使用 **React + TypeScript + Vite + react-grid-layout** 构建可拖拽布局，后端使用 **FastAPI** 调度音视频工具（Whisper / ffmpeg 等），通过 **Tauri** 打包为跨平台桌面应用。

> 目标：让非专业用户也能快速完成长视频字幕的生成、微调与成片导出；同时为进阶用户提供可扩展的样式与 AI 智能改写 (Copilot) 能力。

---

## ✨ 主要功能

- 🔊 自动语音识别：上传视频后调用后端 `/asr/` 返回分段字幕时间轴与文本。
- 📝 字幕编辑器：批量增删、全选、修改开始/结束时间与文本，支持多条字幕滚动管理。
- 🎨 ASS 字幕样式面板：可调整字体、字号、颜色（含 alpha）、描边、阴影、对齐、缩放、行距等；与预览同步。
- 👀 实时字幕预览：根据视频 <video> 元素矩形动态定位，预览最终渲染位置与样式。
- 🔥 硬字幕烧录：调用 `/burn/` 生成嵌入字幕的 mp4 文件并自动下载。
- 🤖 AI Copilot（可选）：通过 SSE `/copilot/sse` 流式返回建议，规范化 JSON 代码块便于自动解析应用。
- 🧩 可拖拽布局：视频 / 字幕 / 样式 面板可在网格中自由拖动与缩放。
- 🖥️ 桌面运行：Tauri 提供轻量原生窗口、文件权限与未来可集成本地保存 / 系统对话框。

---

## 🧱 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| 前端 | React 18 + TS + Vite | 快速开发与 HMR |
| UI | react-grid-layout | 网格化拖拽 / 缩放布局 |
| 打包 | Tauri | 跨平台桌面（Rust + WebView） |
| 后端 | FastAPI | 提供 API / SSE / 文件响应 |
| 处理 | ffmpeg / whisper(假定) | 媒体探测、转码、ASR、硬字幕烧录 |
| 协议 | SSE | Copilot 流式输出 |

---

## 📁 目录结构（摘录）

```
agentfront/
  src/                 前端源码
    components/        主要功能组件 (Toolbar / SubtitleEditor / SubtitleStylePanel / Preview ...)
    hooks/             自定义 hooks
    utils/             工具函数 (toAssColor 等)
  src-tauri/           Tauri 配置与 Rust 入口
  public/              静态资源与示例视频/字幕
  outputs/ (后端运行后)  任务输出/烧录结果（通过静态挂载）
backend (示例 app.py)  FastAPI 服务（你当前示例同仓或单独）
```

---

## 🔧 环境要求

- Node.js >= 18
- Rust (Tauri 构建需要) + cargo
- Python >= 3.9 (FastAPI 后端)
- 已安装 ffmpeg & ffprobe (需在 PATH 中)
- （可选）GPU / whisper 模型文件

---

## 🚀 快速开始

### 1. 克隆并安装依赖
```bash
git clone <repo-url>
cd agentfront
yarn install   # 或 pnpm install / npm install
```

### 2. 启动后端 (FastAPI)
```bash
python -m venv venv
source venv/Scripts/activate  # Windows PowerShell 可用: .\venv\Scripts\Activate.ps1
pip install fastapi uvicorn
# 安装你实际需要的 asr / ffmpeg 依赖，比如: pip install openai-whisper
uvicorn app:app --reload --host 0.0.0.0 --port 8000
```

确保看到日志中挂载的路由：`/asr/` `/burn/` `/copilot/send` `/copilot/sse`。

### 3. 启动前端 (仅 Web 开发模式)
```bash
yarn dev
```
访问 http://localhost:5173

### 4. 启动桌面应用 (Tauri Dev)
```bash
yarn tauri dev
```

---

## 🗂 使用流程

1. 导入视频（点击工具栏“导入视频”）。
2. 点击“自动识别字幕” → 触发 `/asr/` 后端处理 → 返回 events 填充字幕列表。
3. 在“字幕内容”面板增删 / 批量选择 / 修改文本与时间。
4. 在“字幕样式”面板调整字体、描边、颜色、对齐、缩放。
5. 预览面板实时查看渲染效果（字幕随视频区域动态缩放定位）。
6. 点击“导出视频” → 前端组装 ASS → 上传视频 + `subtitles.ass` 到 `/burn/` → 返回 mp4 Blob 并自动下载。
7. （可选）打开 Copilot 侧边栏，输入自然语言让 AI 批量润色 / 修正时间点，解析其返回代码块自动应用。

---

## 🌐 API 简要说明

| 方法 | 路径 | 说明 | 请求 | 响应 |
|------|------|------|------|------|
| POST | `/asr/` | 语音识别 | form-data: file | JSON { events: [...], language, fps, resolution } |
| POST | `/burn/` | 硬字幕烧录 | form-data: file, ass_file | MP4 文件流 (Content-Disposition) |
| POST | `/copilot/send` | 发送指令/上下文 | text + 可选字幕/样式 JSON + 文件 | { status: ok } |
| GET  | `/copilot/sse` | SSE 流 | EventSource | 文本流 (含代码块) |

后端静态：`/outputs/*`、`/static/*` 已挂载，可直接访问生成文件（如保留开发追踪）。

---

## 🎨 ASS 样式字段 (部分)

字段示例：Name / FontName / FontSize / PrimaryColour (&HAA BB GG RR) / Outline / Shadow / Alignment / MarginL / MarginV 等。
前端以 `AssStyle` 接口维护，可扩展透明度 (PrimaryAlpha 等) 并在导出时转为 `Style:` 行；颜色由 `toAssColor` 统一格式化。

---

## ❗ 常见问题 (FAQ)

| 问题 | 可能原因 | 解决建议 |
|------|----------|----------|
| 导出时报 `TypeError: Failed to fetch` | CORS 头不正确 (曾经 * + credentials) | FastAPI CORS: `allow_origins=["*"]`, `allow_credentials=False` 或指定精确域名 + True |
| 没有滚动条 / 把手位置偏移 | 内层 overflow 被覆盖 / 缺少 `min-height:0` | 确保外层容器设置 `position:relative; min-height:0`，滚动容器单一负责 overflow |
| 视频尺寸为 0 | 元数据未加载 | 监听 `loadedmetadata` 再计算尺寸，或延迟重试 |
| 字幕显示错位 | 视频缩放 / 字幕基准分辨率不一致 | 记录原始宽高，按比例映射到预览矩形 |
| 颜色不生效 | ASS 颜色格式错误 | 使用工具函数 `toAssColor(#RRGGBB, alpha)` 输出 `&HAABBGGRR` |
| 下载的 mp4 无字幕 | 生成过程失败 / ffmpeg 缓存路径错误 | 查看后端日志 `final_hard_burn.invoke` 返回路径与 ffmpeg 命令 |

---

## 🧪 后续 Roadmap (可选)

- [ ] 字幕时间轴可视化 (waveform / timeline)
- [ ] 自动分句/合并策略设置
- [ ] 多语言翻译轨道生成
- [ ] 字体文件上传并嵌入
- [ ] 批量任务队列 / 进度条
- [ ] 原生保存对话框 (Tauri fs + dialog)

---

## 🐛 Bug 反馈 & 功能建议

欢迎通过以下渠道反馈：

1. GitHub Issues: 提交时请附：复现步骤 / 期望结果 / 实际结果 / 控制台与后端日志
2. 邮箱: `1803206379@qq.com` 
3. 也可附示例视频（<30s）方便定位

> 建议提供：操作系统 / Node & Python 版本 / ffmpeg 版本 / 是否打包后发生 / 截图。

---

## 📬 联系方式

- Author: @tanghuanqiang
- Email: `1803206379@qq.com` 
- Issue: 欢迎提交 PR / Issue

---

## 📄 License

未显式声明可默认视为私有或补充 MIT：

```
MIT License (建议根据实际情况调整)
Copyright (c) 2025 <Your Name>
```

---

## 🙏 致谢

- FastAPI / Tauri / React / Vite 及其社区
- ffmpeg & whisper 等开源项目

---

## （保留：原 Vite + React 模板 ESLint 说明）

> 以下为最初 scaffold 保留片段，方便后续查阅：

```js
export default tseslint.config([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      ...tseslint.configs.recommendedTypeChecked,
      ...tseslint.configs.strictTypeChecked,
      ...tseslint.configs.stylisticTypeChecked,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
])
```

