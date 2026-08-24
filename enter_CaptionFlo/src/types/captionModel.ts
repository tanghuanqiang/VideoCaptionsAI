import type {
  AssStyle,
  CaptionEffect,
  CaptionOverrides,
  CaptionUnit,
  Subtitle,
  WordTimestamp,
} from "./subtitleTypes";

export type {
  CaptionEffect,
  CaptionOverrides,
  CaptionUnit,
  CaptionEffectType,
  WordTimestamp,
} from "./subtitleTypes";
export type TimingSource = "asr-word" | "estimated";
export type CaptionReviewStatus = "draft" | "needs-review" | "reviewed";

export interface CaptionGroup {
  id: string;
  text: string;
  secondaryText?: string;
  speaker?: string;
  reviewStatus?: CaptionReviewStatus;
  startMs: number;
  endMs: number;
  baseStyleId: string;
  overrides: CaptionOverrides;
  units: CaptionUnit[];
  effect?: CaptionEffect;
  words?: WordTimestamp[];
}

export type CaptionSelection = {
  groupIds: string[];
  unitIds?: string[];
};

const splitGraphemes = (text: string): string[] => {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const Segmenter = (
      Intl as typeof Intl & {
        Segmenter: new (
          locales?: string | string[],
          options?: { granularity?: string },
        ) => {
          segment(value: string): Iterable<{ segment: string }>;
        };
      }
    ).Segmenter;
    return Array.from(
      new Segmenter("zh", { granularity: "grapheme" }).segment(text),
      (item) => item.segment,
    );
  }
  return Array.from(text);
};

export const captionGroupToSubtitle = (group: CaptionGroup): Subtitle => ({
  id: group.id,
  start: group.startMs / 1000,
  end: group.endMs / 1000,
  text: group.text,
  secondaryText: group.secondaryText,
  speaker: group.speaker,
  reviewStatus: group.reviewStatus,
  style: group.baseStyleId,
  group: "",
  overrides: group.overrides,
  units: group.units,
  effect: group.effect,
  words: group.words,
});

export const toSeconds = (value: string | number): number => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parts = value.replace(",", ".").split(":");
  if (parts.length === 3)
    return Number(parts[0]) * 3600 + Number(parts[1]) * 60 + Number(parts[2]);
  return Number(parts[0]) || 0;
};

export const subtitleToCaptionGroup = (
  subtitle: Subtitle,
  styleId = subtitle.style || "Default",
): CaptionGroup => ({
  id: subtitle.id,
  text: subtitle.text,
  secondaryText: subtitle.secondaryText,
  speaker: subtitle.speaker,
  reviewStatus: subtitle.reviewStatus,
  startMs: Math.round(toSeconds(subtitle.start) * 1000),
  endMs: Math.round(toSeconds(subtitle.end) * 1000),
  baseStyleId: styleId,
  overrides: subtitle.overrides || {},
  units: subtitle.units || [],
  effect: subtitle.effect,
  words: subtitle.words,
});

export const splitGroupByCharacters = (
  group: CaptionGroup,
  words?: WordTimestamp[],
): CaptionGroup => {
  if (words?.length) {
    const units: CaptionUnit[] = [];
    words.forEach((word, wordIndex) => {
      const chars = splitGraphemes(word.word).filter(Boolean);
      const startMs = Math.round(word.start * 1000);
      const endMs = Math.round(word.end * 1000);
      const duration = Math.max(0, endMs - startMs);
      chars.forEach((text, charIndex) =>
        units.push({
          id: `${group.id}-unit-${units.length + 1}`,
          text,
          startMs: startMs + Math.floor((duration * charIndex) / chars.length),
          endMs:
            startMs + Math.floor((duration * (charIndex + 1)) / chars.length),
          overrides: {},
          timingSource: word.timingSource || "asr-word",
          order: wordIndex + charIndex / Math.max(1, chars.length),
        }),
      );
    });
    return {
      ...group,
      units: units.map((unit, index) => ({ ...unit, order: index })),
    };
  }
  const chars = splitGraphemes(group.text).filter(Boolean);
  if (chars.length === 0) return { ...group, units: [] };
  const duration = Math.max(0, group.endMs - group.startMs);
  return {
    ...group,
    units: chars.map((text, index) => ({
      id: `${group.id}-unit-${index + 1}`,
      text,
      startMs: group.startMs + Math.floor((duration * index) / chars.length),
      endMs: group.startMs + Math.floor((duration * (index + 1)) / chars.length),
      overrides: {},
      timingSource: "estimated" as const,
      order: index,
    })),
  };
};

export const splitGroupByWords = (
  group: CaptionGroup,
  words?: WordTimestamp[],
): CaptionGroup => {
  const source = words?.length
    ? words
    : group.text
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((word, index, all) => ({
          word,
          start:
            (group.startMs + ((group.endMs - group.startMs) * index) / all.length) /
            1000,
          end:
            (group.startMs +
              ((group.endMs - group.startMs) * (index + 1)) / all.length) /
            1000,
          timingSource: "estimated" as const,
        }));
  return {
    ...group,
    units: source.map((item, index) => ({
      id: `${group.id}-unit-${index + 1}`,
      text: item.word,
      startMs: Math.round(item.start * 1000),
      endMs: Math.round(item.end * 1000),
      overrides: {},
      timingSource: item.timingSource || "estimated",
      order: index,
    })),
  };
};

export const splitGroupByPunctuation = (group: CaptionGroup): CaptionGroup => {
  const matches = [
    ...group.text.matchAll(/[^，。！？；,.!?;]+[，。！？；,.!?;]?/gu),
  ].map((match) => match[0]);
  if (matches.length <= 1) return splitGroupByCharacters(group);
  const duration = Math.max(0, group.endMs - group.startMs);
  let offset = 0;
  const units = matches.map((text, index) => {
    const startMs =
      group.startMs + Math.floor((duration * offset) / group.text.length);
    offset += text.length;
    const endMs =
      group.startMs + Math.floor((duration * offset) / group.text.length);
    return {
      id: `${group.id}-unit-${index + 1}`,
      text,
      startMs,
      endMs,
      overrides: {},
      timingSource: "estimated" as const,
      order: index,
    };
  });
  return { ...group, units };
};

export const mergeCaptionGroups = (
  groups: CaptionGroup[],
): CaptionGroup | null => {
  if (groups.length === 0) return null;
  const ordered = [...groups].sort((a, b) => a.startMs - b.startMs);
  const first = ordered[0];
  const mergedUnits = ordered
    .flatMap((group) => group.units)
    .map((unit, index) => ({
      ...unit,
      id: `${first.id}-unit-${index + 1}`,
      order: index,
    }));
  return {
    ...first,
    text: ordered.map((group) => group.text).join(""),
    secondaryText: mergeSecondaryText(ordered.map((group) => group.secondaryText)),
    speaker: mergeSpeaker(ordered.map((group) => group.speaker)),
    reviewStatus: mergeReviewStatus(ordered.map((group) => group.reviewStatus)),
    startMs: Math.min(...ordered.map((group) => group.startMs)),
    endMs: Math.max(...ordered.map((group) => group.endMs)),
    units: mergedUnits,
    words: ordered.flatMap((group) => group.words || []),
  };
};

function mergeSecondaryText(parts: Array<string | undefined>): string | undefined {
  const text = parts.filter((part): part is string => !!part?.trim());
  if (text.length === 0) return undefined;
  return text.reduce((merged, part) => {
    if (!merged) return part;
    const needsSpace = /[A-Za-z0-9]$/u.test(merged) && /^[A-Za-z0-9]/u.test(part);
    return `${merged}${needsSpace ? " " : ""}${part}`;
  }, "");
}

function mergeSpeaker(parts: Array<string | undefined>): string | undefined {
  const speakers = [...new Set(parts.map((part) => part?.trim()).filter(Boolean))];
  return speakers.length === 1 ? speakers[0] : undefined;
}

function mergeReviewStatus(parts: Array<CaptionReviewStatus | undefined>): CaptionReviewStatus {
  return parts.every((status) => status === "reviewed") ? "reviewed" : "needs-review";
}

export const mergeOverrides = (
  style: AssStyle | undefined,
  overrides: CaptionOverrides,
): CaptionOverrides => ({
  fontFamily: style?.FontName,
  fontSize: style?.FontSize,
  primaryColor: style?.PrimaryColour,
  outlineColor: style?.OutlineColour,
  outlineWidth: style?.Outline,
  shadowWidth: style?.Shadow,
  x: overrides.x,
  y: overrides.y,
  ...overrides,
});

/**
 * Split a single subtitle into two at a grapheme position.
 * Returns [left, right] subtitles with evenly split time and inherited style.
 */
export const splitSubtitleAtGraphemeIndex = (
  subtitle: Subtitle,
  splitIndex: number,
  styleId: string,
): [Subtitle, Subtitle] | null => {
  const graphemes = splitGraphemes(subtitle.text).filter(Boolean);
  if (graphemes.length < 2 || splitIndex <= 0 || splitIndex >= graphemes.length)
    return null;
  const startSec = toSeconds(subtitle.start);
  const endSec = toSeconds(subtitle.end);
  const duration = endSec - startSec;
  const midSec = startSec + (duration * splitIndex) / graphemes.length;
  const leftText = graphemes.slice(0, splitIndex).join("");
  const rightText = graphemes.slice(splitIndex).join("");
  const secondary = splitSecondaryText(subtitle.secondaryText, splitIndex / graphemes.length);
  const left: Subtitle = {
    ...subtitle,
    id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
    text: leftText,
    secondaryText: secondary.left,
    end: midSec,
    style: styleId,
    overrides: { ...(subtitle.overrides || {}) },
    units: [],
    effect: undefined,
  };
  const right: Subtitle = {
    ...subtitle,
    id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
    text: rightText,
    secondaryText: secondary.right,
    start: midSec,
    style: styleId,
    overrides: { ...(subtitle.overrides || {}) },
    units: [],
    effect: undefined,
  };
  return [left, right];
};

/** Split a CaptionGroup into two at a grapheme position (editor-native). */
export const splitCaptionGroupAtGrapheme = (
  group: CaptionGroup,
  splitIndex: number,
): [CaptionGroup, CaptionGroup] | null => {
  const graphemes = splitGraphemes(group.text).filter(Boolean);
  if (graphemes.length < 2 || splitIndex <= 0 || splitIndex >= graphemes.length)
    return null;
  const duration = group.endMs - group.startMs;
  const midMs = Math.round(group.startMs + (duration * splitIndex) / graphemes.length);
  const secondary = splitSecondaryText(group.secondaryText, splitIndex / graphemes.length);
  const makeId = () => `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const left: CaptionGroup = {
    ...group,
    id: makeId(),
    text: graphemes.slice(0, splitIndex).join(""),
    secondaryText: secondary.left,
    startMs: group.startMs,
    endMs: midMs,
    overrides: { ...group.overrides },
    units: [],
    effect: undefined,
  };
  const right: CaptionGroup = {
    ...group,
    id: makeId(),
    text: graphemes.slice(splitIndex).join(""),
    secondaryText: secondary.right,
    startMs: midMs,
    endMs: group.endMs,
    overrides: { ...group.overrides },
    units: [],
    effect: undefined,
  };
  return [left, right];
};

export const graphemesOf = (text: string): string[] =>
  splitGraphemes(text).filter(Boolean);

export function splitSecondaryText(
  text: string | undefined,
  ratio: number,
): { left?: string; right?: string } {
  if (!text?.trim()) return {};
  const graphemes = splitGraphemes(text).filter(Boolean);
  const splitIndex = Math.min(
    graphemes.length - 1,
    Math.max(1, Math.round(graphemes.length * ratio)),
  );
  const left = graphemes.slice(0, splitIndex).join("");
  const right = graphemes.slice(splitIndex).join("");
  return { left: left || undefined, right: right || undefined };
}
