import type { CaptionGroup } from "@/types/captionModel";

export interface FillerWordIssue {
  groupId: string;
  count: number;
  tokens: string[];
}

export interface KeywordHighlightIssue {
  groupId: string;
  terms: string[];
}

const CHINESE_FILLER = "(?:嗯+|呃+|额+|啊+|唔+|那个)";
const ENGLISH_FILLER = "(?:um+|uh+|erm+|hmm+)";

function matchesInText(text: string): string[] {
  const chinese = new RegExp(
    `(?:^|[，。！？、\\s])(${CHINESE_FILLER})(?=$|[，。！？、\\s])`,
    "gu",
  );
  const english = new RegExp(`\\b(${ENGLISH_FILLER})\\b`, "giu");
  return [
    ...Array.from(text.matchAll(chinese), (match) => match[1]),
    ...Array.from(text.matchAll(english), (match) => match[1]),
  ];
}

export function findFillerWordIssues(groups: CaptionGroup[]): FillerWordIssue[] {
  return groups.flatMap((group) => {
    const tokens = matchesInText(group.text);
    return tokens.length ? [{ groupId: group.id, count: tokens.length, tokens }] : [];
  });
}

export function removeFillerWords(text: string): string {
  const cleaned = text
    .replace(new RegExp(`^\\s*${CHINESE_FILLER}(?:[，、]\\s*)?`, "gu"), "")
    .replace(new RegExp(`([，。！？、])\\s*${CHINESE_FILLER}(?:[，、]\\s*)?`, "gu"), "$1")
    .replace(new RegExp(`^\\s*${ENGLISH_FILLER}(?:[,;:]\\s*)?`, "giu"), "")
    .replace(new RegExp(`([,;:])\\s*${ENGLISH_FILLER}(?:[,;:]\\s*)?`, "giu"), "$1 ")
    .replace(new RegExp(`\\b${ENGLISH_FILLER}\\b\\s*`, "giu"), "")
    .replace(/[ \t]{2,}/gu, " ")
    .replace(/\s+([，。！？、,.!?;:])/gu, "$1")
    .trim();
  return cleaned;
}

/**
 * Text edits invalidate word-level timings and visual effects. Clear them so
 * preview and exported ASS always render the cleaned text rather than stale units.
 */
export function repairFillerWords(groups: CaptionGroup[], groupIds: string[]): CaptionGroup[] {
  const ids = new Set(groupIds);
  return groups.map((group) => {
    if (!ids.has(group.id) || group.locked) return group;
    const text = removeFillerWords(group.text);
    if (!text || text === group.text) return group;
    return { ...group, text, units: [], words: undefined, effect: undefined };
  });
}

/** Insert one readable line break near the visual midpoint without changing timing. */
export function smartLineBreak(text: string, maxLineLength = 18): string {
  if (text.includes("\n")) return text;
  const graphemes = Array.from(text.trim());
  if (graphemes.length <= maxLineLength) return text;
  const midpoint = Math.floor(graphemes.length / 2);
  const candidates = graphemes
    .map((value, index) => ({ value, index: index + 1 }))
    .filter(({ value, index }) => index >= 3 && graphemes.length - index >= 3 && /[，。！？；、,.!?;:\s]/u.test(value));
  const split = candidates.sort((a, b) => Math.abs(a.index - midpoint) - Math.abs(b.index - midpoint))[0]?.index ?? midpoint;
  const left = graphemes.slice(0, split).join("").trimEnd();
  const right = graphemes.slice(split).join("").trimStart();
  return left && right ? `${left}\n${right}` : text;
}

export function applySmartLineBreak(group: CaptionGroup): CaptionGroup {
  const text = smartLineBreak(group.text);
  return text === group.text ? group : { ...group, text, units: [], words: undefined, effect: undefined };
}

function emphasisRanges(text: string): Array<{ start: number; end: number; text: string }> {
  const patterns = [
    /[“「][^”」]{1,16}[”」]/gu,
    /\d+(?:\.\d+)?(?:[%％]|倍|个|天|小时|分钟|秒|元|万|亿|[kKmM])?/gu,
    /\b[A-Za-z][A-Za-z0-9+.#-]{1,}\b/gu,
  ];
  const ranges = patterns.flatMap((pattern) =>
    Array.from(text.matchAll(pattern), (match) => ({
      start: match.index ?? 0,
      end: (match.index ?? 0) + match[0].length,
      text: match[0],
    })),
  );
  return ranges
    .sort((a, b) => a.start - b.start || b.end - a.end)
    .reduce<Array<{ start: number; end: number; text: string }>>((accepted, range) => {
      const overlaps = accepted.some((item) => range.start < item.end && item.start < range.end);
      return overlaps || accepted.length >= 3 ? accepted : [...accepted, range];
    }, []);
}

export function findKeywordHighlightIssues(groups: CaptionGroup[]): KeywordHighlightIssue[] {
  return groups.flatMap((group) => {
    if (group.units.length > 0) return [];
    const terms = emphasisRanges(group.text).map((range) => range.text);
    return terms.length ? [{ groupId: group.id, terms }] : [];
  });
}

function buildHighlightUnits(group: CaptionGroup) {
  const ranges = emphasisRanges(group.text);
  if (ranges.length === 0) return group.units;
  const graphemes = Array.from(group.text);
  const durationMs = Math.max(0, group.endMs - group.startMs);
  let offset = 0;
  return graphemes.map((text, index) => {
    const start = offset;
    offset += text.length;
    const highlighted = ranges.some((range) => start < range.end && range.start < offset);
    return {
      id: `${group.id}-unit-${index + 1}`,
      text,
      startMs: group.startMs + Math.floor((durationMs * index) / graphemes.length),
      endMs: group.startMs + Math.floor((durationMs * (index + 1)) / graphemes.length),
      overrides: {},
      timingSource: "estimated" as const,
      order: index,
      effect: highlighted ? { type: "highlight" as const } : undefined,
    };
  });
}

/** Apply local, explainable emphasis without overwriting existing unit-level edits. */
export function applyKeywordHighlights(groups: CaptionGroup[], groupIds: string[]): CaptionGroup[] {
  const ids = new Set(groupIds);
  return groups.map((group) => {
    if (!ids.has(group.id) || group.locked || group.units.length > 0) return group;
    const units = buildHighlightUnits(group);
    return units.length ? { ...group, units } : group;
  });
}
