import type { AssStyle, CaptionOverrides, Subtitle } from "../types/subtitleTypes";
import toAssColor from "./toAssColor";

export interface CaptionCompilerOptions {
  playResX: number;
  playResY: number;
}

const assTime = (seconds: number): string => {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = Math.floor(safe % 60);
  const cs = Math.floor((safe - Math.floor(safe)) * 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
};

const parseSubtitleTime = (time: string | number): number => {
  if (typeof time === "number") return Number.isFinite(time) ? time : 0;
  const parts = time.replace(",", ".").split(":");
  if (parts.length === 3) return Number(parts[0]) * 3600 + Number(parts[1]) * 60 + Number(parts[2]);
  return Number(parts[0]) || 0;
};

const escapeAssText = (text: string): string => text
  .replace(/\\/g, "\\\\")
  .replace(/[\r\n]+/g, "\\N")
  .replace(/\uFEFF/g, "");

const colorTag = (tag: string, color?: string, alpha?: number): string => {
  if (!color) return "";
  return `\\${tag}${toAssColor(color, alpha)}`;
};

const overrideTags = (style: AssStyle, overrides: CaptionOverrides = {}): string => {
  const opacityTag = overrides.opacity !== undefined
    ? `\\1a&H${Math.round((1 - Math.max(0, Math.min(1, overrides.opacity))) * 255).toString(16).padStart(2, "0").toUpperCase()}&`
    : "";
  const tags = [
    overrides.fontSize !== undefined ? `\\fs${Math.round(overrides.fontSize)}` : "",
    colorTag("c", overrides.primaryColor, overrides.opacity === undefined ? style.PrimaryAlpha : Math.round(overrides.opacity * 255)),
    opacityTag,
    colorTag("3c", overrides.outlineColor),
    overrides.outlineWidth !== undefined ? `\\bord${overrides.outlineWidth}` : "",
    colorTag("4c", overrides.shadowColor),
    overrides.shadowWidth !== undefined ? `\\shad${overrides.shadowWidth}` : "",
    overrides.x !== undefined && overrides.y !== undefined ? `\\pos(${Math.round(overrides.x)},${Math.round(overrides.y)})` : "",
    overrides.scaleX !== undefined ? `\\fscx${Math.round(overrides.scaleX)}` : "",
    overrides.scaleY !== undefined ? `\\fscy${Math.round(overrides.scaleY)}` : "",
    overrides.rotation !== undefined ? `\\frz${Math.round(overrides.rotation)}` : "",
    overrides.letterSpacing !== undefined ? `\\fsp${overrides.letterSpacing}` : "",
  ].filter(Boolean);
  return tags.length ? `{${tags.join("")}}` : "";
};

const styleLine = (style: AssStyle): string => {
  const color = (value: string | undefined, alpha?: number) => toAssColor(value || "#000000", alpha);
  return `Style: ${style.Name},${style.FontName},${style.FontSize},${color(style.PrimaryColour, style.PrimaryAlpha)},${color(style.SecondaryColour, style.SecondaryAlpha)},${color(style.OutlineColour, style.OutlineAlpha)},${color(style.BackColour, style.BackAlpha)},${style.Bold ? -1 : 0},${style.Italic ? -1 : 0},${style.Underline ? -1 : 0},${style.StrikeOut ? -1 : 0},${style.ScaleX ?? 100},${style.ScaleY ?? 100},${style.Spacing ?? 0},${style.Angle ?? 0},${style.BorderStyle ?? 1},${style.Outline ?? 2},${style.Shadow ?? 0},${style.Alignment ?? 2},${style.MarginL ?? 10},${style.MarginR ?? 10},${style.MarginV ?? 10},${style.Encoding ?? 1}`;
};

const compileEvents = (sub: Subtitle, style: AssStyle): string[] => {
  const start = parseSubtitleTime(sub.start);
  const end = parseSubtitleTime(sub.end);
  const baseTags = overrideTags(style, sub.overrides);
  const units = (sub.units || []).slice().sort((a, b) => a.order - b.order);
  const effect = sub.effect?.type || (units.length ? "whole" : "whole");

  if (!units.length || effect === "whole") {
    return [`Dialogue: ${sub.layer || 0},${assTime(start)},${assTime(end)},${sub.style || style.Name},,0,0,0,,${baseTags}${escapeAssText(sub.text)}`];
  }

  if (effect === "reveal" || effect === "highlight") {
    // Karaoke keeps one layout box, so CJK glyphs do not jump as earlier units appear.
    const secondaryTag = effect === "reveal" ? "{\\2a&HFF&}" : "";
    const karaoke = units.map(unit => `{\\kf${Math.max(1, Math.round((unit.endMs - unit.startMs) / 10))}}${escapeAssText(unit.text)}`).join("");
    return [`Dialogue: ${sub.layer || 0},${assTime(start)},${assTime(end)},${sub.style || style.Name},,0,0,0,,${baseTags}${secondaryTag}${karaoke}`];
  }

  return units.map((unit, index) => {
    const unitStart = Math.max(start, unit.startMs / 1000);
    const unitEnd = Math.min(end, unit.endMs / 1000);
    const emphasis = `{\\t(${Math.round(unitStart * 1000)},${Math.round(unitEnd * 1000)},\\fscx110\\fscy110)}`;
    return `Dialogue: ${(sub.layer || 0) + index},${assTime(unitStart)},${assTime(unitEnd)},${sub.style || style.Name},,0,0,0,,${baseTags}${overrideTags(style, unit.overrides)}${emphasis}${escapeAssText(unit.text)}`;
  });
};

export const compileCaptionsToAss = (subtitles: Subtitle[], styles: AssStyle[], options: CaptionCompilerOptions): string => {
  const usableStyles = styles.length ? styles : [{ Name: "Default", FontName: "Arial", FontSize: 64, PrimaryColour: "#FFFFFF" } as AssStyle];
  const header = `[Script Info]\n; Script generated by VideoCaptionsAI\nScriptType: v4.00+\nPlayResX: ${options.playResX}\nPlayResY: ${options.playResY}\nWrapStyle: 0\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n${usableStyles.map(styleLine).join("\n")}\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`;
  const events = subtitles.flatMap(sub => compileEvents(sub, styles.find(style => style.Name === sub.style) || usableStyles[0]));
  return `${header}${events.join("\n")}`;
};
