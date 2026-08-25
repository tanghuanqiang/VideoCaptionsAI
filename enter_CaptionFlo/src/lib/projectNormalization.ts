import type { AssStyle, CaptionUnit, WordTimestamp } from "@/types/subtitleTypes";
import type { CaptionGroup, CaptionReviewStatus } from "@/types/captionModel";

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : null;
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function normalizeReviewStatus(value: unknown): CaptionReviewStatus | undefined {
  return value === "draft" || value === "needs-review" || value === "reviewed" ? value : undefined;
}

function normalizeWords(value: unknown, groupStartMs: number, groupEndMs: number): WordTimestamp[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const words = value.flatMap((item) => {
    const entry = record(item);
    if (!entry) return [];
    const word = stringValue(entry.word).trim();
    const start = Math.max(groupStartMs, finiteNumber(entry.start, groupStartMs / 1000) * 1000);
    const end = Math.min(groupEndMs, finiteNumber(entry.end, groupEndMs / 1000) * 1000);
    if (!word || end <= start) return [];
    return [{ word, start: start / 1000, end: end / 1000, timingSource: entry.timingSource === "asr-word" ? "asr-word" as const : "estimated" as const }];
  });
  return words.length ? words : undefined;
}

function normalizeUnits(value: unknown, groupId: string, groupStartMs: number, groupEndMs: number): CaptionUnit[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item, index) => {
    const entry = record(item);
    if (!entry) return [];
    const text = stringValue(entry.text);
    const startMs = Math.max(groupStartMs, finiteNumber(entry.startMs, groupStartMs));
    const endMs = Math.min(groupEndMs, finiteNumber(entry.endMs, groupEndMs));
    if (!text || endMs <= startMs) return [];
    return [{
      id: `${groupId}-unit-${index + 1}`,
      text,
      startMs,
      endMs,
      overrides: record(entry.overrides) ? entry.overrides as CaptionUnit["overrides"] : {},
      timingSource: entry.timingSource === "asr-word" ? "asr-word" : "estimated",
      order: index,
    }];
  });
}

export function normalizeCaptionGroup(value: unknown, index: number, durationMs: number, fallbackStyleId: string): CaptionGroup | null {
  const entry = record(value);
  if (!entry) return null;
  const id = stringValue(entry.id).trim() || `caption-${index + 1}`;
  const text = stringValue(entry.text);
  const rawStartMs = Math.max(0, finiteNumber(entry.startMs, 0));
  const startMs = durationMs > 0 ? Math.min(rawStartMs, Math.max(0, durationMs - 1)) : rawStartMs;
  const rawEndMs = finiteNumber(entry.endMs, startMs + 1000);
  const maxEnd = durationMs > 0 ? durationMs : Number.POSITIVE_INFINITY;
  const endMs = Math.min(maxEnd, Math.max(startMs + 1, rawEndMs));
  const group: CaptionGroup = {
    id,
    text,
    secondaryText: stringValue(entry.secondaryText).trim() || undefined,
    speaker: stringValue(entry.speaker).trim() || undefined,
    reviewStatus: normalizeReviewStatus(entry.reviewStatus),
    startMs,
    endMs,
    baseStyleId: stringValue(entry.baseStyleId, fallbackStyleId),
    overrides: record(entry.overrides) ? entry.overrides as CaptionGroup["overrides"] : {},
    units: [],
    effect: record(entry.effect) ? entry.effect as CaptionGroup["effect"] : undefined,
  };
  group.words = normalizeWords(entry.words, startMs, endMs);
  group.units = normalizeUnits(entry.units, id, startMs, endMs);
  return group;
}

export function normalizeCaptionGroups(value: unknown, durationMs: number, fallbackStyleId: string): CaptionGroup[] {
  if (!Array.isArray(value)) return [];
  const used = new Set<string>();
  return value.flatMap((item, index) => {
    const group = normalizeCaptionGroup(item, index, durationMs, fallbackStyleId);
    if (!group) return [];
    let id = group.id;
    let suffix = 2;
    while (used.has(id)) id = `${group.id}-${suffix++}`;
    used.add(id);
    return [{ ...group, id, units: group.units.map((unit, unitIndex) => ({ ...unit, id: `${id}-unit-${unitIndex + 1}` })) }];
  }).sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
}

export function normalizeStyles(value: unknown, fallback: AssStyle[]): AssStyle[] {
  if (!Array.isArray(value)) return fallback;
  const styles = value.filter((item): item is AssStyle => !!record(item) && typeof (item as UnknownRecord).id === "string");
  return styles.length ? styles : fallback;
}
