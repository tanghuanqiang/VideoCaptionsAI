import type { CaptionGroup } from "@/types/captionModel";

export type CaptionQualityIssueKind =
  | "invalid-duration"
  | "overlap"
  | "short-duration"
  | "fast-reading"
  | "long-caption";

export type CaptionQualitySeverity = "error" | "warning" | "info";

export interface CaptionQualityIssue {
  id: string;
  groupId: string;
  kind: CaptionQualityIssueKind;
  severity: CaptionQualitySeverity;
  message: string;
  detail: string;
  repairable: boolean;
}

export interface CaptionQualityReport {
  score: number;
  issues: CaptionQualityIssue[];
  repairableGroupIds: string[];
  segmentableGroupIds: string[];
}

const MIN_DISPLAY_MS = 800;
const MIN_GAP_MS = 80;
const MAX_CJK_CHARS_PER_SECOND = 8;
const MAX_LATIN_WORDS_PER_SECOND = 3;
const MAX_CJK_CHARS = 22;
const MAX_LATIN_WORDS = 12;
const MIN_SEGMENT_DISPLAY_MS = 800;

function graphemeCount(text: string): number {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const Segmenter = (
      Intl as typeof Intl & {
        Segmenter: new (
          locales?: string | string[],
          options?: { granularity?: string },
        ) => { segment(value: string): Iterable<unknown> };
      }
    ).Segmenter;
    return Array.from(new Segmenter("zh", { granularity: "grapheme" }).segment(text)).length;
  }
  return Array.from(text).length;
}

function readingLoad(text: string) {
  const compact = text.replace(/\s+/gu, "");
  const cjkCharacters = (compact.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu) ?? []).length;
  const latinWords = (text.match(/[A-Za-zÀ-ÖØ-öø-ÿ]+(?:['-][A-Za-zÀ-ÖØ-öø-ÿ]+)*/gu) ?? []).length;
  return { cjkCharacters, latinWords, visibleCharacters: graphemeCount(compact) };
}

function recommendedDurationMs(group: CaptionGroup): number {
  const load = readingLoad(group.text);
  const cjkDuration = (load.cjkCharacters / MAX_CJK_CHARS_PER_SECOND) * 1000;
  const latinDuration = (load.latinWords / MAX_LATIN_WORDS_PER_SECOND) * 1000;
  return Math.max(MIN_DISPLAY_MS, Math.ceil(Math.max(cjkDuration, latinDuration) / 100) * 100);
}

function findCaptionSplitIndex(text: string): number | null {
  const graphemes = Array.from(text);
  const minSideLength = Math.max(3, Math.ceil(graphemes.length * 0.25));
  if (graphemes.length < minSideLength * 2) return null;

  const midpoint = graphemes.length / 2;
  const candidates: Array<{ index: number; punctuation: boolean }> = [];
  graphemes.forEach((grapheme, index) => {
    const splitIndex = index + 1;
    if (splitIndex < minSideLength || graphemes.length - splitIndex < minSideLength) return;
    if (/[，。！？；、,.!?;:：]/u.test(grapheme)) {
      candidates.push({ index: splitIndex, punctuation: true });
    } else if (/\s/u.test(grapheme)) {
      candidates.push({ index, punctuation: false });
    }
  });

  if (candidates.length > 0) {
    return candidates.sort((a, b) => {
      const aScore = Math.abs(a.index - midpoint) - (a.punctuation ? 0.65 : 0);
      const bScore = Math.abs(b.index - midpoint) - (b.punctuation ? 0.65 : 0);
      return aScore - bScore;
    })[0].index;
  }

  return Math.round(midpoint);
}

function splitWordsAtTime(group: CaptionGroup, splitMs: number, splitRatio: number) {
  const left = [] as NonNullable<CaptionGroup["words"]>;
  const right = [] as NonNullable<CaptionGroup["words"]>;
  for (const word of group.words ?? []) {
    const midpoint = ((word.start + word.end) * 1000) / 2;
    (midpoint < splitMs ? left : right).push(word);
  }
  if (group.words && group.words.length > 1 && (!left.length || !right.length)) {
    const boundary = Math.min(
      group.words.length - 1,
      Math.max(1, Math.round(group.words.length * splitRatio)),
    );
    return { left: group.words.slice(0, boundary), right: group.words.slice(boundary) };
  }
  return { left, right };
}

function splitUnitsAtTime(
  group: CaptionGroup,
  splitMs: number,
  splitRatio: number,
  leftId: string,
  rightId: string,
) {
  const left = [] as CaptionGroup["units"];
  const right = [] as CaptionGroup["units"];
  for (const unit of group.units) {
    const midpoint = (unit.startMs + unit.endMs) / 2;
    (midpoint < splitMs ? left : right).push(unit);
  }
  if (group.units.length > 1 && (!left.length || !right.length)) {
    const boundary = Math.min(
      group.units.length - 1,
      Math.max(1, Math.round(group.units.length * splitRatio)),
    );
    left.splice(0, left.length, ...group.units.slice(0, boundary));
    right.splice(0, right.length, ...group.units.slice(boundary));
  }
  const withNewIds = (units: CaptionGroup["units"], groupId: string) =>
    units.map((unit, index) => ({ ...unit, id: `${groupId}-unit-${index + 1}`, order: index }));
  return { left: withNewIds(left, leftId), right: withNewIds(right, rightId) };
}

/**
 * Detect issues that make a subtitle hard to read without changing the source timing.
 * CJK characters and Latin words use separate speed limits so mixed-language captions
 * are not judged by a one-size-fits-all character-per-second metric.
 */
export function analyzeCaptionQuality(
  groups: CaptionGroup[],
  videoDurationMs?: number,
): CaptionQualityReport {
  const ordered = [...groups].sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
  const issues: CaptionQualityIssue[] = [];
  const repairableGroupIds = new Set<string>();
  const segmentableGroupIds = new Set<string>();

  ordered.forEach((group, index) => {
    const durationMs = group.endMs - group.startMs;
    const durationSeconds = durationMs / 1000;
    const load = readingLoad(group.text);
    const next = ordered[index + 1];
    const availableEndMs = next
      ? next.startMs - MIN_GAP_MS
      : videoDurationMs && videoDurationMs > 0
        ? videoDurationMs
        : Number.POSITIVE_INFINITY;
    const canExtend = availableEndMs >= group.startMs + recommendedDurationMs(group);

    if (durationMs <= 0) {
      issues.push({
        id: `${group.id}:invalid-duration`,
        groupId: group.id,
        kind: "invalid-duration",
        severity: "error",
        message: "字幕时长无效",
        detail: "结束时间需要晚于开始时间",
        repairable: false,
      });
    } else {
      if (durationMs < MIN_DISPLAY_MS) {
        issues.push({
          id: `${group.id}:short-duration`,
          groupId: group.id,
          kind: "short-duration",
          severity: "warning",
          message: "停留时间过短",
          detail: `当前 ${(durationMs / 1000).toFixed(1)} 秒，建议至少 ${(recommendedDurationMs(group) / 1000).toFixed(1)} 秒`,
          repairable: canExtend,
        });
        if (canExtend) repairableGroupIds.add(group.id);
      }

      const cjkRate = load.cjkCharacters / durationSeconds;
      const latinRate = load.latinWords / durationSeconds;
      if (cjkRate > MAX_CJK_CHARS_PER_SECOND || latinRate > MAX_LATIN_WORDS_PER_SECOND) {
        const metric = cjkRate > MAX_CJK_CHARS_PER_SECOND
          ? `${cjkRate.toFixed(1)} 字/秒`
          : `${latinRate.toFixed(1)} 词/秒`;
        issues.push({
          id: `${group.id}:fast-reading`,
          groupId: group.id,
          kind: "fast-reading",
          severity: "warning",
          message: "阅读节奏过快",
          detail: `${metric}，建议延长停留或拆分字幕`,
          repairable: canExtend,
        });
        if (canExtend) repairableGroupIds.add(group.id);
      }
    }

    if (load.cjkCharacters > MAX_CJK_CHARS || load.latinWords > MAX_LATIN_WORDS || load.visibleCharacters > 36) {
      const canSegment = durationMs >= MIN_SEGMENT_DISPLAY_MS * 2 && findCaptionSplitIndex(group.text) !== null;
      issues.push({
        id: `${group.id}:long-caption`,
        groupId: group.id,
        kind: "long-caption",
        severity: "info",
        message: "字幕文本偏长",
        detail: "建议在语义停顿处拆分为更短的字幕",
        repairable: canSegment,
      });
      if (canSegment) segmentableGroupIds.add(group.id);
    }

    if (next && group.endMs > next.startMs) {
      issues.push({
        id: `${group.id}:overlap`,
        groupId: group.id,
        kind: "overlap",
        severity: "error",
        message: "与下一条字幕重叠",
        detail: `重叠 ${((group.endMs - next.startMs) / 1000).toFixed(1)} 秒`,
        repairable: false,
      });
    }
  });

  const penalty = issues.reduce((total, issue) => total + (
    issue.severity === "error" ? 18 : issue.severity === "warning" ? 8 : 3
  ), 0);
  return {
    score: Math.max(0, 100 - penalty),
    issues,
    repairableGroupIds: [...repairableGroupIds],
    segmentableGroupIds: [...segmentableGroupIds],
  };
}

/** Extend only the end time, keeping a small gap before the next subtitle. */
export function repairCaptionTiming(
  groups: CaptionGroup[],
  groupIds: string[],
  videoDurationMs?: number,
): CaptionGroup[] {
  const ids = new Set(groupIds);
  const ordered = [...groups].sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
  const repaired = new Map<string, CaptionGroup>();

  ordered.forEach((group, index) => {
    if (!ids.has(group.id)) return;
    const next = ordered[index + 1];
    const latestEndMs = next
      ? next.startMs - MIN_GAP_MS
      : videoDurationMs && videoDurationMs > 0
        ? videoDurationMs
        : Number.POSITIVE_INFINITY;
    const targetEndMs = group.startMs + recommendedDurationMs(group);
    const endMs = Math.min(targetEndMs, latestEndMs);
    if (endMs > group.endMs) repaired.set(group.id, { ...group, endMs });
  });

  return groups.map((group) => repaired.get(group.id) ?? group);
}

/**
 * Split long captions at their nearest natural pause. Timing stays inside the
 * original interval, while word/unit timing data is assigned to its new segment.
 */
export function repairCaptionSegmentation(
  groups: CaptionGroup[],
  groupIds: string[],
): CaptionGroup[] {
  const ids = new Set(groupIds);
  const result: CaptionGroup[] = [];

  for (const group of groups) {
    const splitIndex = ids.has(group.id) ? findCaptionSplitIndex(group.text) : null;
    const durationMs = group.endMs - group.startMs;
    if (!splitIndex || durationMs < MIN_SEGMENT_DISPLAY_MS * 2) {
      result.push(group);
      continue;
    }

    const graphemes = Array.from(group.text);
    const leftText = graphemes.slice(0, splitIndex).join("").trimEnd();
    const rightText = graphemes.slice(splitIndex).join("").trimStart();
    if (!leftText || !rightText) {
      result.push(group);
      continue;
    }

    const splitRatio = splitIndex / graphemes.length;
    const splitMs = Math.round(group.startMs + durationMs * splitRatio);
    if (splitMs - group.startMs < MIN_SEGMENT_DISPLAY_MS || group.endMs - splitMs < MIN_SEGMENT_DISPLAY_MS) {
      result.push(group);
      continue;
    }

    const leftId = `${group.id}-part-1`;
    const rightId = `${group.id}-part-2`;
    const words = splitWordsAtTime(group, splitMs, splitRatio);
    const units = splitUnitsAtTime(group, splitMs, splitRatio, leftId, rightId);
    result.push(
      {
        ...group,
        id: leftId,
        text: leftText,
        endMs: splitMs,
        units: units.left,
        words: words.left.length ? words.left : undefined,
        effect: undefined,
      },
      {
        ...group,
        id: rightId,
        text: rightText,
        startMs: splitMs,
        units: units.right,
        words: words.right.length ? words.right : undefined,
        effect: undefined,
      },
    );
  }

  return result;
}
