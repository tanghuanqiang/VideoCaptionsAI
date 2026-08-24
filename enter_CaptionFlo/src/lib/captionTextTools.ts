import type { CaptionGroup } from "@/types/captionModel";

export interface FillerWordIssue {
  groupId: string;
  count: number;
  tokens: string[];
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
    if (!ids.has(group.id)) return group;
    const text = removeFillerWords(group.text);
    if (!text || text === group.text) return group;
    return { ...group, text, units: [], words: undefined, effect: undefined };
  });
}
