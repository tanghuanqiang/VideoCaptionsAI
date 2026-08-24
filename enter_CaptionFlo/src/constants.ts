import type { AssStyle } from "./types/subtitleTypes";

export const defaultStyle: AssStyle = {
  id: "Default",
  Name: "Default",
  FontName: "Noto Sans SC",
  FontSize: 64,
  PrimaryColour: "#FFFFFF",
  SecondaryColour: "#000000",
  OutlineColour: "#000000",
  BackColour: "#000000",
  Bold: false,
  Italic: false,
  Underline: false,
  StrikeOut: false,
  ScaleX: 100,
  ScaleY: 100,
  Spacing: 0,
  Angle: 0,
  BorderStyle: 1,
  Outline: 2,
  Shadow: 2,
  Alignment: 2,
  MarginL: 10,
  MarginR: 10,
  MarginV: 10,
  Encoding: 1,
  PrimaryAlpha: 255,
  SecondaryAlpha: 0,
  OutlineAlpha: 255,
  BackAlpha: 255,
};

export interface StylePreset {
  id: string;
  name: string;
  description: string;
  style: AssStyle;
}

/** Style presets initialize captions in bulk (base style + local overrides model). */
export const stylePresets: StylePreset[] = [
  {
    id: "classic-white",
    name: "经典白字",
    description: "白字黑描边，通用稳妥",
    style: {
      ...defaultStyle,
      id: "classic-white",
      Name: "经典白字",
      PrimaryColour: "#FFFFFF",
      OutlineColour: "#000000",
      Outline: 2,
      Shadow: 1,
    },
  },
  {
    id: "shortvideo-highlight",
    name: "短视频高亮",
    description: "大号加粗，黄色高亮关键词",
    style: {
      ...defaultStyle,
      id: "shortvideo-highlight",
      Name: "短视频高亮",
      FontSize: 72,
      Bold: true,
      PrimaryColour: "#FFFFFF",
      SecondaryColour: "#FFD60A",
      OutlineColour: "#000000",
      Outline: 3,
      Shadow: 2,
    },
  },
  {
    id: "variety",
    name: "综艺花字",
    description: "彩色粗描边，活泼夸张",
    style: {
      ...defaultStyle,
      id: "variety",
      Name: "综艺花字",
      FontSize: 76,
      Bold: true,
      PrimaryColour: "#FFEB3B",
      OutlineColour: "#E5006D",
      Outline: 4,
      Shadow: 0,
    },
  },
  {
    id: "minimal",
    name: "极简字幕",
    description: "细体无描边，克制留白",
    style: {
      ...defaultStyle,
      id: "minimal",
      Name: "极简字幕",
      FontSize: 56,
      Bold: false,
      PrimaryColour: "#F5F5F7",
      OutlineColour: "#000000",
      Outline: 0,
      Shadow: 1,
    },
  },
  {
    id: "neon",
    name: "霓虹强调",
    description: "冷色发光风，夜景与电子感",
    style: {
      ...defaultStyle,
      id: "neon",
      Name: "霓虹强调",
      FontSize: 68,
      Bold: true,
      PrimaryColour: "#00E5FF",
      OutlineColour: "#0A2A6B",
      Outline: 2,
      Shadow: 3,
    },
  },
  {
    id: "blackbox-white",
    name: "黑底白字",
    description: "黑底衬托，强可读性",
    style: {
      ...defaultStyle,
      id: "blackbox-white",
      Name: "黑底白字",
      FontSize: 60,
      PrimaryColour: "#FFFFFF",
      OutlineColour: "#000000",
      BackColour: "#000000",
      BorderStyle: 3,
      Outline: 0,
      Shadow: 0,
    },
  },
];

export type RecognitionQuality = "fast" | "balanced" | "high";

export const recognitionQualities: Array<{
  value: RecognitionQuality;
  label: string;
  model: string;
  hint: string;
}> = [
  { value: "fast", label: "快速", model: "small", hint: "速度优先，适合草稿" },
  { value: "balanced", label: "均衡", model: "medium", hint: "速度与精度兼顾" },
  { value: "high", label: "高精度", model: "large-v3", hint: "精度优先，耗时较长" },
];
