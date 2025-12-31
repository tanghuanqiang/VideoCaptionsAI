import type { DriveStep } from "driver.js";

export const basicWorkflowSteps: DriveStep[] = [
  {
    element: '.toolbar-actions-left',
    popover: {
      title: '1. 导入视频',
      description: '点击这里导入你需要制作字幕的视频文件。',
      side: "bottom",
      align: 'start'
    }
  },
  {
    element: 'button[title="语音识别"]',
    popover: {
      title: '2. 语音识别',
      description: '导入视频后，点击此按钮开始自动识别字幕。你可以选择不同的识别质量模式。',
      side: "bottom",
      align: 'start'
    }
  },
  {
    element: '.subtitle-editor',
    popover: {
      title: '3. 编辑字幕',
      description: '识别完成后，字幕会显示在这里。你可以手动修改内容，或者使用 Copilot 进行智能修改。',
      side: "right",
      align: 'start'
    }
  },
  {
    element: '.export-btn',
    popover: {
      title: '4. 导出结果',
      description: '完成后，点击这里导出 SRT、ASS 字幕文件或直接导出带有硬字幕的视频。',
      side: "bottom",
      align: 'end'
    }
  }
];

export const editingShortcutsSteps: DriveStep[] = [
  {
    element: '.subtitle-editor',
    popover: {
      title: '字幕编辑',
      description: '点击字幕块即可编辑文本。使用上下键切换字幕。',
      side: "right",
      align: 'start'
    }
  },
  {
    element: '.video-timeline',
    popover: {
      title: '时间轴操作',
      description: 'Alt + 滚轮：缩放时间轴。\nCtrl + 左键：多选字幕块。\n拖动边缘调整字幕时长。',
      side: "top",
      align: 'center'
    }
  },
  {
    element: '.copilot-toggle-btn',
    popover: {
      title: 'Copilot 助手',
      description: '点击打开侧边栏，使用 AI 助手快速翻译、校对或调整字幕样式。',
      side: "bottom",
      align: 'end'
    }
  }
];

export const stylingSteps: DriveStep[] = [
  {
    element: '.subtitle-style-panel',
    popover: {
      title: '样式编辑',
      description: '在这里调整字幕的字体、颜色、大小和位置。支持 ASS 高级样式。',
      side: "left",
      align: 'start'
    }
  },
  {
    element: '.video-preview',
    popover: {
      title: '实时预览',
      description: '样式修改会实时反映在视频预览中。',
      side: "left",
      align: 'center'
    }
  }
];
