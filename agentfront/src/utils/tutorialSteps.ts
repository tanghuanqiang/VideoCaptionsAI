import type { DriveStep } from "driver.js";

export const basicWorkflowSteps: DriveStep[] = [
  {
    element: '.toolbar-import',
    popover: {
      title: '1. 导入视频',
      description: '先导入视频或音频。导入后，中央预览和底部时间轴会自动显示媒体信息。',
      side: "bottom",
      align: 'start'
    }
  },
  {
    element: '.toolbar-asr',
    popover: {
      title: '2. 语音识别',
      description: '在识别质量下拉框中选择标准、高质量或专业模式，再点击语音识别。识别结果会保留词级时间戳，便于后续逐字裂变。',
      side: "bottom",
      align: 'start'
    }
  },
  {
    element: '.subtitle-editor',
    popover: {
      title: '3. 编辑字幕',
      description: '识别完成后，在字幕编辑器中修改文本和时间。选中多条字幕可以统一初始化样式，选中单条或单字可以在属性面板中微调。',
      side: "right",
      align: 'start'
    }
  },
  {
    element: '.export-btn',
    popover: {
      title: '4. 导出结果',
      description: '导出字幕可选择 SRT、ASS 或 TXT；需要交付成片时，使用右侧的导出视频进行 FFmpeg 硬字幕渲染。',
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
      description: '点击字幕块即可编辑文本。使用上下键切换字幕，也可以在时间轴中拖动边缘调整起止时间。',
      side: "right",
      align: 'start'
    }
  },
  {
    element: '.video-timeline',
    popover: {
      title: '时间轴操作',
      description: 'Alt + 滚轮：缩放时间轴。\nCtrl + 左键：多选字幕块。\n拖动边缘：调整字幕时长。\n拆分面板：按字符、词语或标点快速裂变。',
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
      description: '样式预设用于批量初始化；属性面板用于覆盖当前字幕或单个字的字体、颜色、大小、位置、描边和阴影。',
      side: "left",
      align: 'start'
    }
  },
  {
    element: '.video-preview',
    popover: {
      title: '实时预览',
      description: '样式修改会实时反映在视频预览中。导出 ASS 或视频时会使用同一套 ASS 编译规则进行渲染。',
      side: "left",
      align: 'center'
    }
  }
];
