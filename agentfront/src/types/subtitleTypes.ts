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
    Name: string;
    Fontname: string;
    Fontsize: number;
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
    BorderStyle?: number;  // 1: outline 3: box
    Outline?: number;
    Shadow?: number;
    Alignment?: number;    // 1..9 (Numpad)
    MarginL?: number;
    MarginR?: number;
    MarginV?: number;
    Encoding?: number;     // 0:ANSI, 1:Default etc
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
