# VideoCaptionsAI - 智能视频字幕处理系统

AI驱动的视频字幕识别、编辑、样式设计和硬字幕烧录一体化解决方案。

## 功能展示

### 1. 字幕编辑与样式设计
- **智能布局**：可拖拽的面板式布局，支持视频预览、字幕编辑、样式设计三个区域
- **实时编辑**：支持字幕文本的实时编辑，所见即所得
- **样式设计**：完整的ASS样式编辑面板，支持字体、颜色、描边、阴影等专业设置

### 2. 自动语音识别生成字幕
- **AI语音识别**：基于Whisper模型的高精度语音转文字
- **批量处理**：自动识别并生成时间轴精确的字幕条目
- **智能断句**：AI智能分段，确保字幕显示效果自然流畅

### 3. 硬字幕烧录导出
- **一键烧录**：将设计好的字幕永久烧录到视频中
- **实时进度**：显示详细的处理进度和预计完成时间
- **高质量输出**：保持原视频画质，默认保存到用户的下载路径

### 4. AI Copilot 智能助手
- **智能润色**：AI自动优化字幕内容，提升表达质量
- **批量处理**：支持对整个字幕项目进行智能优化
- **样式建议**：AI提供专业的字幕样式设计建议
- **交互式编辑**：通过自然语言与AI对话，完成复杂的编辑任务

---

## 核心特性

- **专业级字幕制作**：支持ASS格式的完整样式系统，包括字体、颜色、描边、阴影、对齐等
- **AI智能优化**：集成大语言模型，自动优化字幕内容和样式，提升表达质量
- **实时预览**：所见即所得的字幕预览，确保最终效果与设计一致
- **一键导出**：高质量硬字幕烧录，支持多种视频格式输出
- **桌面应用**：Windows 单文件安装，双击即用，支持系统托盘
- **局域网访问**：启动后可浏览器访问，方便团队协作

---

## 架构设计

本项目采用 PyInstaller 打包的单文件架构，Python FastAPI 提供全栈服务。

### 前端 (`agentfront/`)
- **核心框架**: React 18 + TypeScript + Vite
- **UI 组件**: Tailwind CSS + `react-grid-layout` (拖拽布局)
- **媒体处理**: `@ffmpeg/ffmpeg` (WASM) 前端视频预览
- **状态管理**: Context API + Local State

### 后端 (`VideoSubs/`)
- **API 服务**: FastAPI - 高性能 Python Web 框架
- **AI 编排**: LangGraph - 管理复杂的 AI 工作流和状态
- **语音识别**: OpenAI Whisper (本地离线运行)
- **媒体处理**: FFmpeg 子进程调用 (字幕烧录)
- **桌面打包**: PyInstaller → 单文件 Windows EXE + Inno Setup 安装器
- **系统托盘**: pystray (Windows 系统托盘图标，支持桌面窗口/浏览器两种模式)

---

## 快速开始

### 方式一：下载安装包 (推荐)

1. 从 [Releases](https://github.com/tanghuanqiang/VideoCaptionsAI/releases) 下载最新 `VideoCaptionsAI_Setup.exe`
2. 运行安装器，选择安装目录
3. 安装完成后双击桌面快捷方式启动
4. 系统托盘出现图标，自动打开桌面窗口
5. 局域网内其他设备可通过 `http://你的IP:端口` 访问 (端口号查看托盘菜单)

首次启动后，在应用内设置 AI Copilot 的 API Key 即可使用智能助手功能。

### 方式二：开发环境运行

**环境要求**
- Python 3.10+
- Node.js 18+
- pnpm
- FFmpeg (需添加到系统 PATH)

**启动步骤**

1. **克隆项目**
   ```bash
   git clone https://github.com/tanghuanqiang/VideoCaptionsAI.git
   cd VideoCaptionsAI
   cp .env.example .env
   # 编辑 .env 填入 API Keys
   ```

2. **构建前端**
   ```bash
   cd agentfront
   pnpm install
   pnpm build
   ```

3. **启动后端服务**
   ```bash
   cd VideoSubs
   
   # 创建并激活虚拟环境 (推荐)
   python -m venv venv
   # Windows:
   .\venv\Scripts\activate
   # Linux/Mac:
   source venv/bin/activate
   
   pip install -r requirements.txt
   
   # 启动服务
   uvicorn src.app:app --reload
   ```
   后端将在 `http://localhost:8000` 启动，首次启动会自动加载 Whisper 模型。

4. **Copilot 配置 (可选)**
   启动后在浏览器打开 `http://localhost:8000`，点击 Copilot 侧边栏，设置你的 LLM API Key：
   - API Base URL (默认 OpenAI，支持阿里云 DashScope 等兼容接口)
   - API Key
   - 模型名称 (如 `gpt-4o`、`qwen-turbo` 等)

   或直接编辑 `VideoSubs/config.json` (该文件不会被提交到 git)：
   ```json
   {
     "llm_api_base": "https://api.openai.com/v1",
     "llm_api_key": "sk-your-key-here",
     "llm_model_name": "gpt-4o"
   }
   ```

5. **开发前端 (可选)**
   如需修改前端代码并热更新：
   ```bash
   cd agentfront
   pnpm dev
   ```
   开发服务器在 `http://localhost:5173` 启动，API 请求代理到后端 `:8000`。

---

## 配置说明

### AI Copilot 配置
Copilot 智能助手需要配置大语言模型 API。支持所有 OpenAI 兼容接口。

**方式一：应用内配置** (推荐)
启动后在 Copilot 侧边栏直接填写 API Base URL、API Key 和模型名称，设置会保存到本地 `config.json`。

**方式二：手动编辑**
编辑 `VideoSubs/config.json`：
```json
{
  "llm_api_base": "https://api.openai.com/v1",
  "llm_api_key": "sk-your-api-key",
  "llm_model_name": "gpt-4o",
  "tavily_api_key": "your-tavily-key"
}
```
> **注意**: `config.json` 已在 `.gitignore` 中排除，不会被提交到 Git。

### 打包发布
```bash
# 1. 构建前端
cd agentfront && pnpm install && pnpm build
# 2. 复制到后端
cp -r dist/* ../VideoSubs/frontend_dist/
# 3. PyInstaller 打包
cd ../VideoSubs
pyinstaller build_exe.spec --noconfirm
# 4. Inno Setup 安装器
iscc installer.iss
```

---

## 项目现状与发展规划

### 已实现
- ✅ Whisper 离线语音识别 (支持 tiny/base/small/medium/large-v3)
- ✅ FastAPI 服务框架 + React 前端
- ✅ LangGraph + LLM AI 优化架构
- ✅ ASS 样式编辑面板 (字体/颜色/描边/阴影/对齐/斜体等)
- ✅ 硬字幕烧录导出
- ✅ Windows 单文件安装器 (.exe)
- ✅ 系统托盘 + 桌面窗口 + 浏览器局域网访问
- ✅ 字幕拖拽定位 + 缩放 (字号调整)
- ✅ Copilot 智能助手 (可配置 API Base/Key/Model)
- ✅ 单实例运行 (避免重复打开)

### 短期目标 (1-2 个月)
1. **完善核心编辑功能** - 时间轴编辑、批量操作
2. **提升用户体验** - 界面优化、性能提升、错误处理
3. **多语言翻译集成** - 支持字幕自动翻译功能

### 中期目标 (3-6 个月)
1. **AI 功能扩展** - 智能断句、说话人识别、情感分析
2. **协作功能** - 多人协作编辑、云端同步
3. **字幕格式扩展** - SRT、VTT 等格式支持

### 长期愿景 (6 个月以上)
1. **专业级功能** - 音视频同步、字幕特效、高级样式
2. **平台扩展** - macOS、Linux 支持
3. **生态建设** - 插件系统、第三方集成、开放 API

---

如需更多帮助或反馈，欢迎通过 GitHub Issue 联系。
