export interface SubtitleEvent {
    id: string;
    start: number;
    end: number;
    text: string;
    speaker?: string;
    words?: Array<Record<string, any>>;
    style?: string;
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
  start: string | number; // Allow number for easier calculation
  end: string | number;
  text: string;
  style: string;
  group: string;
  selected?: boolean;
  layer?: number;
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
  }>;
};

