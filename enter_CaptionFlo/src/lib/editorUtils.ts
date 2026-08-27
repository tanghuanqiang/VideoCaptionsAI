import type { AssStyle } from "@/types/subtitleTypes";
import type { CaptionGroup, CaptionOverrides } from "@/types/captionModel";

/** ms -> "MM:SS.cs" (centiseconds). */
export function formatMs(ms: number): string {
  const total = Math.max(0, ms);
  const m = Math.floor(total / 60000);
  const s = Math.floor((total % 60000) / 1000);
  const cs = Math.floor((total % 1000) / 10);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(
    cs,
  ).padStart(2, "0")}`;
}

/** ms -> "MM:SS" for compact ruler. */
export function formatClock(ms: number): string {
  const total = Math.max(0, ms);
  const m = Math.floor(total / 60000);
  const s = Math.floor((total % 60000) / 1000);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Whether any word/unit in the group is estimated (vs asr-calibrated). */
export function isGroupEstimated(group: CaptionGroup): boolean {
  if (group.words?.length) {
    return group.words.some((w) => w.timingSource === "estimated");
  }
  if (group.units?.length) {
    return group.units.some((u) => u.timingSource === "estimated");
  }
  return true;
}

export interface EffectiveStyle {
  fontFamily: string;
  fontSize: number;
  color: string;
  outlineColor: string;
  outlineWidth: number;
  shadowWidth: number;
  bold: boolean;
  italic: boolean;
  alignment: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  letterSpacing: number;
  opacity: number;
  backColor?: string;
  borderStyle: number;
  x?: number;
  y?: number;
}

/** Resolve base style + group overrides into concrete render values. */
export function resolveEffectiveStyle(
  style: AssStyle,
  overrides: CaptionOverrides = {},
): EffectiveStyle {
  return {
    fontFamily: overrides.fontFamily ?? style.FontName,
    fontSize: overrides.fontSize ?? style.FontSize,
    color: overrides.primaryColor ?? style.PrimaryColour,
    outlineColor: overrides.outlineColor ?? style.OutlineColour ?? "#000000",
    outlineWidth: overrides.outlineWidth ?? style.Outline ?? 2,
    shadowWidth: overrides.shadowWidth ?? style.Shadow ?? 0,
    bold: style.Bold ?? false,
    italic: style.Italic ?? false,
    alignment: style.Alignment ?? 2,
    scaleX: overrides.scaleX ?? style.ScaleX ?? 100,
    scaleY: overrides.scaleY ?? style.ScaleY ?? 100,
    rotation: overrides.rotation ?? style.Angle ?? 0,
    letterSpacing: overrides.letterSpacing ?? style.Spacing ?? 0,
    opacity: overrides.opacity ?? 1,
    backColor: style.BackColour,
    borderStyle: style.BorderStyle ?? 1,
    x: overrides.x,
    y: overrides.y,
  };
}
