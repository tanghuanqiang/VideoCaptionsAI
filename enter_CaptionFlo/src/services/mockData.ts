import type { ASRResponse, AssStyle } from "@/types/subtitleTypes";
import { defaultStyle } from "@/constants";

/** A short, freely-usable sample clip for demo purposes. */
export const DEMO_VIDEO_URL =
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4";

export const DEMO_VIDEO_NAME = "示例短片.mp4";

export const mockRecommendedStyle: AssStyle = {
  ...defaultStyle,
  id: "recommended",
  Name: "推荐样式",
  FontSize: 68,
  Bold: true,
  PrimaryColour: "#FFFFFF",
  OutlineColour: "#000000",
  Outline: 3,
  Shadow: 2,
};

/** Simulated Whisper ASR response, shaped exactly like the backend. */
export const mockAsrResponse: ASRResponse = {
  language: "zh",
  resolution: "1280x720",
  fps: "30",
  recommended_style: mockRecommendedStyle,
  events: [
    {
      id: "evt-1",
      start: "0.40",
      end: "3.20",
      text: "欢迎使用 AI 字幕工作台",
      style: "recommended",
      words: [
        { word: "欢迎", start: 0.4, end: 1.0, timingSource: "asr-word" },
        { word: "使用", start: 1.0, end: 1.6, timingSource: "asr-word" },
        { word: "AI", start: 1.6, end: 2.0, timingSource: "asr-word" },
        { word: "字幕", start: 2.0, end: 2.6, timingSource: "asr-word" },
        { word: "工作台", start: 2.6, end: 3.2, timingSource: "asr-word" },
      ],
    },
    {
      id: "evt-2",
      start: "3.40",
      end: "6.80",
      text: "导入视频后即可自动生成字幕",
      style: "recommended",
      words: [
        { word: "导入", start: 3.4, end: 4.0, timingSource: "asr-word" },
        { word: "视频", start: 4.0, end: 4.6, timingSource: "asr-word" },
        { word: "后", start: 4.6, end: 4.9, timingSource: "estimated" },
        { word: "即可", start: 4.9, end: 5.5, timingSource: "asr-word" },
        { word: "自动", start: 5.5, end: 6.1, timingSource: "asr-word" },
        { word: "生成字幕", start: 6.1, end: 6.8, timingSource: "estimated" },
      ],
    },
    {
      id: "evt-3",
      start: "7.00",
      end: "10.50",
      text: "支持快速切割与合并字幕",
      style: "recommended",
    },
    {
      id: "evt-4",
      start: "10.80",
      end: "14.20",
      text: "还能单独修改每个字的颜色和效果",
      style: "recommended",
    },
    {
      id: "evt-5",
      start: "14.50",
      end: "18.00",
      text: "最后一键导出字幕或烧录视频",
      style: "recommended",
    },
  ],
};
