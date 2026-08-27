import type { AssStyle } from "@/types/subtitleTypes";
import type {
  CaptionGroup,
  CaptionOverrides,
  CaptionUnit,
} from "@/types/captionModel";

/**
 * ASS builder — the single source of truth shared by preview (JASSUB/libass)
 * and export (backend FFmpeg + libass). Both render the SAME string, so what
 * you see is what you get.
 */

/** Reference render resolution. Overrides use this coordinate space. */
export const PLAY_RES_X = 1280;
export const PLAY_RES_Y = 720;

/** "#RRGGBB" (+ optional 0..1 opacity) -> ASS "&HAABBGGRR". Alpha is inverted (00=opaque). */
export function hexToAss(hex: string | undefined, opacity = 1): string {
  const fallback = "FFFFFF";
  const clean = (hex ?? "").replace("#", "").trim();
  const rgb = clean.length === 6 ? clean : fallback;
  const r = rgb.slice(0, 2);
  const g = rgb.slice(2, 4);
  const b = rgb.slice(4, 6);
  const a = Math.round((1 - Math.min(Math.max(opacity, 0), 1)) * 255)
    .toString(16)
    .padStart(2, "0")
    .toUpperCase();
  return `&H${a}${b}${g}${r}`.toUpperCase();
}

function boolToAss(v: boolean | undefined): number {
  return v ? -1 : 0;
}

/** ms -> "H:MM:SS.cs" ASS timestamp. */
export function msToAssTime(ms: number): string {
  const total = Math.max(0, ms);
  const h = Math.floor(total / 3600000);
  const m = Math.floor((total % 3600000) / 60000);
  const s = Math.floor((total % 60000) / 1000);
  const cs = Math.floor((total % 1000) / 10);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(
    cs,
  ).padStart(2, "0")}`;
}

/** Escape text for an ASS dialogue line. */
function escapeText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\N")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}");
}

function sanitizeStyleName(name: string): string {
  return name.replace(/[,\n]/g, " ").trim() || "Default";
}

/** Build the [V4+ Styles] Style line for one AssStyle. */
export function buildStyleLine(style: AssStyle): string {
  const fields = [
    sanitizeStyleName(style.Name),
    style.FontName || "Arial",
    Math.round(style.FontSize ?? 48),
    hexToAss(style.PrimaryColour, (style.PrimaryAlpha ?? 255) / 255),
    hexToAss(style.SecondaryColour ?? "#000000"),
    hexToAss(style.OutlineColour ?? "#000000"),
    hexToAss(style.BackColour ?? "#000000"),
    boolToAss(style.Bold),
    boolToAss(style.Italic),
    boolToAss(style.Underline),
    boolToAss(style.StrikeOut),
    style.ScaleX ?? 100,
    style.ScaleY ?? 100,
    style.Spacing ?? 0,
    style.Angle ?? 0,
    style.BorderStyle ?? 1,
    style.Outline ?? 2,
    style.Shadow ?? 0,
    style.Alignment ?? 2,
    style.MarginL ?? 10,
    style.MarginR ?? 10,
    style.MarginV ?? 20,
    style.Encoding ?? 1,
  ];
  return `Style: ${fields.join(",")}`;
}

/** Inline override tags derived from group-level overrides (relative to base style). */
function groupOverrideTags(
  o: CaptionOverrides,
  resX: number,
  resY: number,
): string {
  const tags: string[] = [];
  if (o.fontFamily) tags.push(`\\fn${o.fontFamily}`);
  if (o.fontSize != null) tags.push(`\\fs${Math.round(o.fontSize)}`);
  if (o.primaryColor != null || o.opacity != null) {
    const c = hexToAss(o.primaryColor ?? "#FFFFFF", o.opacity ?? 1);
    // \c sets primary color; \1a sets primary alpha
    if (o.primaryColor != null) tags.push(`\\c${c.slice(0, 2)}${c.slice(2)}`);
    if (o.opacity != null) {
      const a = c.slice(2, 4);
      tags.push(`\\1a&H${a}&`);
    }
  }
  if (o.outlineColor != null) tags.push(`\\3c${hexToAss(o.outlineColor)}`);
  if (o.outlineWidth != null) tags.push(`\\bord${o.outlineWidth}`);
  if (o.shadowWidth != null) tags.push(`\\shad${o.shadowWidth}`);
  if (o.scaleX != null) tags.push(`\\fscx${o.scaleX}`);
  if (o.scaleY != null) tags.push(`\\fscy${o.scaleY}`);
  if (o.rotation != null) tags.push(`\\frz${o.rotation}`);
  if (o.letterSpacing != null) tags.push(`\\fsp${o.letterSpacing}`);
  // Position offset via \pos, anchored at frame center + offset.
  if (o.x != null || o.y != null) {
    const px = resX / 2 + (o.x ?? 0);
    const py = resY / 2 + (o.y ?? 0);
    tags.push(`\\pos(${Math.round(px)},${Math.round(py)})`);
  }
  return tags.length ? `{${tags.join("")}}` : "";
}

/** Inline override + effect tags for a single unit (char/word). */
function unitTags(unit: CaptionUnit, baseFontSize: number): string {
  const o = unit.overrides;
  const tags: string[] = [];
  if (o.fontSize != null) tags.push(`\\fs${Math.round(o.fontSize)}`);
  else if (unit.effect?.type === "emphasis")
    tags.push(`\\fs${Math.round(baseFontSize * 1.12)}`);
  if (o.primaryColor != null) tags.push(`\\c${hexToAss(o.primaryColor)}`);
  if (o.opacity != null) {
    const c = hexToAss("#FFFFFF", o.opacity);
    tags.push(`\\1a&H${c.slice(2, 4)}&`);
  }
  if (o.x != null || o.y != null) {
    // Per-unit absolute positioning is uncommon; apply small org shift via \fsp fallback ignored.
  }
  if (unit.effect?.type === "highlight") {
    // Glow-ish emphasis via border color pulse using \t transform.
    tags.push(`\\t(\\3c${hexToAss(o.primaryColor ?? "#FFFFFF")}\\bord3)`);
  }
  return tags.length ? `{${tags.join("")}}` : "";
}

/** Build the dialogue text (with karaoke \k for reveal) for a group. */
function buildDialogueText(
  group: CaptionGroup,
  baseStyle: AssStyle,
  resX: number,
  resY: number,
): string {
  const prefix = groupOverrideTags(group.overrides, resX, resY);
  const secondary = group.secondaryText?.trim()
    ? `\\N{\\r\\fs${Math.max(12, Math.round((group.overrides.fontSize ?? baseStyle.FontSize ?? 48) * 0.68))}\\1a&H18&}${escapeText(group.secondaryText.trim())}`
    : "";

  if (group.units.length === 0) {
    return prefix + escapeText(group.text) + secondary;
  }

  const baseFont = group.overrides.fontSize ?? baseStyle.FontSize ?? 48;
  const hasReveal = group.units.some((u) => u.effect?.type === "reveal");

  const body = group.units
    .map((u) => {
      const tags = unitTags(u, baseFont);
      if (hasReveal) {
        // Karaoke timing in centiseconds for progressive reveal.
        const durCs = Math.max(1, Math.round((u.endMs - u.startMs) / 10));
        const kTag = `{\\k${durCs}}`;
        return `${kTag}${tags}${escapeText(u.text)}`;
      }
      return `${tags}${escapeText(u.text)}`;
    })
    .join("");

  return prefix + body + secondary;
}

export interface BuildAssOptions {
  playResX?: number;
  playResY?: number;
  title?: string;
}

/** Build a complete ASS document from groups + styles. */
export function buildAss(
  groups: CaptionGroup[],
  styles: AssStyle[],
  options: BuildAssOptions = {},
): string {
  const resX = options.playResX ?? PLAY_RES_X;
  const resY = options.playResY ?? PLAY_RES_Y;

  const styleById = new Map(styles.map((s) => [s.id, s]));
  const fallback = styles[0];

  const header = [
    "[Script Info]",
    `Title: ${options.title ?? "VideoCaptionsAI"}`,
    "ScriptType: v4.00+",
    "WrapStyle: 0",
    "ScaledBorderAndShadow: yes",
    `PlayResX: ${resX}`,
    `PlayResY: ${resY}`,
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    ...styles.map(buildStyleLine),
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];

  const events = groups.map((g) => {
    const base = styleById.get(g.baseStyleId) ?? fallback;
    const styleName = sanitizeStyleName(base.Name);
    const text = buildDialogueText(g, base, resX, resY);
    return `Dialogue: 0,${msToAssTime(g.startMs)},${msToAssTime(
      g.endMs,
    )},${styleName},,0,0,0,,${text}`;
  });

  return [...header, ...events].join("\n");
}
