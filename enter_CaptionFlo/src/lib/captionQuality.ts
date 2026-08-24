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
}

const MIN_DISPLAY_MS = 800;
const MIN_GAP_MS = 80;
const MAX_CJK_CHARS_PER_SECOND = 8;
const MAX_LATIN_WORDS_PER_SECOND = 3;
const MAX_CJK_CHARS = 22;
const MAX_LATIN_WORDS = 12;

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
      issues.push({
        id: `${group.id}:long-caption`,
        groupId: group.id,
        kind: "long-caption",
        severity: "info",
        message: "字幕文本偏长",
        detail: "建议在语义停顿处拆分为更短的字幕",
        repairable: false,
      });
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
