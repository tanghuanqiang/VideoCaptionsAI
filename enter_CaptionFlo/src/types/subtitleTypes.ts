export interface WordTimestamp {
  word: string;
  start: number;
  end: number;
  timingSource?: "asr-word" | "estimated";
}

export interface CaptionOverrides {
  fontFamily?: string;
  fontSize?: number;
  primaryColor?: string;
  opacity?: number;
  outlineColor?: string;
  outlineWidth?: number;
  shadowColor?: string;
  shadowWidth?: number;
  x?: number;
  y?: number;
  scaleX?: number;
  scaleY?: number;
  rotation?: number;
  letterSpacing?: number;
}

export type CaptionEffectType = "whole" | "reveal" | "highlight" | "emphasis";

export interface CaptionEffect {
  type: CaptionEffectType;
  params?: Record<string, unknown>;
}

export interface CaptionUnit {
  id: string;
  text: string;
  startMs: number;
  endMs: number;
  overrides: CaptionOverrides;
  timingSource: "asr-word" | "estimated";
  order: number;
}

export interface SubtitleEvent {
  id: string;
  start: number;
  end: number;
  text: string;
  secondaryText?: string;
  speaker?: string;
  reviewStatus?: "draft" | "needs-review" | "reviewed";
  contentTag?: "chapter" | "highlight";
  words?: WordTimestamp[];
  style?: string;
  overrides?: CaptionOverrides;
  units?: CaptionUnit[];
  effect?: CaptionEffect;
}

export interface AssStyle {
  id: string;
  Name: string;
  FontName: string;
  FontSize: number;
  PrimaryColour: string;
  SecondaryColour?: string;
  OutlineColour?: string;
  BackColour?: string;
  Bold?: boolean;
  Italic?: boolean;
  Underline?: boolean;
  StrikeOut?: boolean;
  ScaleX?: number;
  ScaleY?: number;
  Spacing?: number;
  Angle?: number;
  BorderStyle?: number;
  Outline?: number;
  Shadow?: number;
  Alignment?: number;
  MarginL?: number;
  MarginR?: number;
  MarginV?: number;
  Encoding?: number;
  PrimaryAlpha?: number;
  SecondaryAlpha?: number;
  OutlineAlpha?: number;
  BackAlpha?: number;
}

export interface SubtitleDoc {
  language?: string;
  resolution?: {
    width: number;
    height: number;
  };
  fps?: number;
  events?: SubtitleEvent[];
}

export interface Subtitle {
  id: string;
  start: string | number;
  end: string | number;
  text: string;
  secondaryText?: string;
  speaker?: string;
  contentTag?: "chapter" | "highlight";
  style: string;
  group: string;
  selected?: boolean;
  layer?: number;
  overrides?: CaptionOverrides;
  units?: CaptionUnit[];
  effect?: CaptionEffect;
  words?: WordTimestamp[];
}

export type ASRResponse = {
  language: string;
  resolution: string;
  fps: string;
  events: Array<{
    id: string;
    start: string;
    end: string;
    text: string;
    style?: string;
    speaker?: string;
    words?: WordTimestamp[];
    overrides?: CaptionOverrides;
    units?: CaptionUnit[];
    effect?: CaptionEffect;
  }>;
  recommended_style?: AssStyle;
};
