# 历史记录功能说明

## 概述
新增的历史记录功能允许用户查看和管理所有视频编辑历史记录。

## 功能特性

### 1. 后端API (VideoSubs/src/routers/history.py)
- `GET /api/history` - 获取用户的编辑历史列表
  - 支持分页 (skip, limit)
  - 支持按状态筛选 (processing, completed, failed)
- `GET /api/history/{id}` - 获取单个历史记录详情
- `POST /api/history` - 创建新的历史记录
- `PATCH /api/history/{id}` - 更新历史记录
- `DELETE /api/history/{id}` - 删除历史记录

### 2. 数据库模型 (VideoSubs/src/db.py)
新增 `VideoEditHistory` 表:
- `file_uuid` - 文件唯一标识
- `original_filename` - 原始文件名
- `thumbnail_path` - 缩略图路径
- `subtitle_file` - 字幕文件路径
- `output_file` - 输出视频路径
- `status` - 状态 (processing/completed/failed)
- `metadata` - 额外元数据 (JSON)
- `created_at` / `updated_at` - 时间戳

### 3. 前端组件 (agentfront/src/components/VideoHistory.tsx)
- 显示历史记录列表
- 支持按状态筛选
- 支持分页
- 可下载输出视频和字幕文件
- 可删除历史记录
- 可加载历史项目到编辑器

### 4. UI集成 (agentfront/src/App.tsx)
- 在工具栏添加历史记录按钮
- 页面状态切换 (editor/history)
- 历史记录组件集成

## 使用方法

### 查看历史记录
1. 点击工具栏右侧的"历史记录"图标按钮
2. 浏览所有已处理的视频
3. 使用筛选器按状态查看

### 管理历史记录
- **下载视频**: 点击"下载"按钮下载烧录后的视频
- **下载字幕**: 点击"字幕"按钮下载字幕文件
- **加载项目**: 点击"加载"按钮将历史项目加载到编辑器
- **删除记录**: 点击删除图标删除历史记录

### 自动记录
- 每次执行ASR（语音识别）时自动创建历史记录
- 记录包含视频时长、字幕数量等元数据

## 技术细节

### 数据流
1. 用户上传视频并执行ASR
2. 创建历史记录，状态为 `processing`
3. ASR完成后，记录字幕信息
4. 烧录完成后，更新 `output_file` 路径，状态改为 `completed`

### 样式
- 使用暗色主题 (可适配亮色主题)
- 响应式设计
- 状态颜色编码:
  - 处理中: 蓝色
  - 已完成: 绿色
  - 失败: 红色

## 未来改进
- [ ] 生成视频缩略图
- [ ] 支持批量删除
- [ ] 添加搜索功能
- [ ] 导出/导入历史记录
- [ ] 添加标签和分类
