import type { CaptionGroup } from "@/types/captionModel";

export interface ContentChapter {
  startMs: number;
  title: string;
  confirmed?: boolean;
}

export interface ContentHighlight {
  startMs: number;
  endMs: number;
  text: string;
  secondaryText?: string;
  speaker?: string;
  score: number;
  confirmed?: boolean;
}

const CHAPTER_GAP_MS = 3500;

function timestamp(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function parseTimestamp(value: string): number | null {
  const parts = value.trim().split(":").map(Number);
  if (parts.some((part) => !Number.isFinite(part))) return null;
  if (parts.length === 2) return (parts[0] * 60 + parts[1]) * 1000;
  if (parts.length === 3) return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
  return null;
}

function compact(text: string): string {
  return text.replace(/\s+/gu, " ").trim();
}

function titleFromCaption(text: string): string {
  const graphemes = Array.from(compact(text));
  if (graphemes.length <= 28) return graphemes.join("");
  return `${graphemes.slice(0, 27).join("")}…`;
}

function highlightScore(group: CaptionGroup): number {
  const text = compact(group.text);
  const length = Array.from(text).length;
  let score = length >= 8 && length <= 38 ? 2 : 0;
  if (/\d+(?:\.\d+)?(?:[%％]|倍|个|天|小时|分钟|秒|元|万|亿|[kKmM])?/u.test(text)) score += 3;
  if (/\b[A-Za-z][A-Za-z0-9+.#-]{1,}\b/u.test(text)) score += 2;
  if (/(?:关键|重点|方法|步骤|如何|为什么|核心|结论|秘诀|建议)/u.test(text)) score += 2;
  if (/[“「][^”」]+[”」]/u.test(text)) score += 1;
  return score;
}

export function deriveContentChapters(groups: CaptionGroup[]): ContentChapter[] {
  const ordered = [...groups]
    .filter((group) => compact(group.text))
    .sort((a, b) => a.startMs - b.startMs);
  if (ordered.length === 0) return [];

  const confirmed = ordered.filter((group) => group.contentTag === "chapter").map((group) => ({
    startMs: group.startMs,
    title: titleFromCaption(group.text),
    confirmed: true,
  }));
  const confirmedStarts = new Set(confirmed.map((chapter) => chapter.startMs));
  const inferred = ordered.flatMap((group, index) => {
    const previous = ordered[index - 1];
    const gapMs = previous ? group.startMs - previous.endMs : CHAPTER_GAP_MS;
    return gapMs >= CHAPTER_GAP_MS && !confirmedStarts.has(group.startMs)
      ? [{ startMs: group.startMs, title: titleFromCaption(group.text), confirmed: false }]
      : [];
  });
  return [...confirmed, ...inferred].sort((a, b) => a.startMs - b.startMs);
}

export function deriveContentHighlights(groups: CaptionGroup[], limit = 5): ContentHighlight[] {
  return [...groups]
    .filter((group) => compact(group.text))
    .map((group) => ({
      startMs: group.startMs,
      endMs: group.endMs,
      text: compact(group.text),
      secondaryText: group.secondaryText?.trim() || undefined,
      speaker: group.speaker?.trim() || undefined,
      score: highlightScore(group) + (group.contentTag === "highlight" ? 100 : 0),
      confirmed: group.contentTag === "highlight",
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.startMs - b.startMs)
    .slice(0, limit)
    .sort((a, b) => a.startMs - b.startMs);
}

export function buildContentPackageMarkdown(projectName: string, groups: CaptionGroup[]): string {
  const chapters = deriveContentChapters(groups);
  const highlights = deriveContentHighlights(groups);
  const title = compact(projectName) || "未命名项目";
  const lines = [`# ${title} 内容清单`, "", "## 章节候选"];

  lines.push(...(
    chapters.length
      ? chapters.map((chapter) => `- [${timestamp(chapter.startMs)}] ${chapter.title}`)
      : ["- 未检测到明显的段落停顿"]
  ));

  lines.push("", "## 高光候选");
  lines.push(...(
    highlights.length
      ? highlights.flatMap((highlight) => [
        `- [${timestamp(highlight.startMs)} - ${timestamp(highlight.endMs)}] ${highlight.text}`,
        ...(highlight.speaker ? [`  - 说话人：${highlight.speaker}`] : []),
        ...(highlight.secondaryText ? [`  - ${highlight.secondaryText}`] : []),
      ])
      : ["- 未检测到足够明确的高光信号"]
  ));

  return `${lines.join("\n")}\n`;
}

export function contentPackageFilename(projectName: string): string {
  const safeName = compact(projectName)
    .replace(/[<>:"/\\|?*]/gu, "-")
    .slice(0, 80) || "captions";
  return `${safeName}-content-package.md`;
}

export function buildContentPackageJson(projectName: string, groups: CaptionGroup[]): string {
  return JSON.stringify({
    projectName: compact(projectName) || "未命名项目",
    generatedAt: new Date().toISOString(),
    chapters: deriveContentChapters(groups),
    highlights: deriveContentHighlights(groups),
  }, null, 2) + "\n";
}

export function contentPackageJsonFilename(projectName: string): string {
  const safeName = compact(projectName).replace(/[<>:"/\\|?*]/gu, "-").slice(0, 80) || "captions";
  return `${safeName}-content-package.json`;
}

function csvCell(value: string | undefined): string {
  return `"${(value ?? "").replace(/"/gu, '""')}"`;
}

export function buildCaptionReviewCsv(groups: CaptionGroup[]): string {
  const header = ["开始", "结束", "说话人", "审校状态", "审校备注", "主字幕", "副字幕"];
  const rows = [...groups]
    .sort((a, b) => a.startMs - b.startMs)
    .map((group) => [
      timestamp(group.startMs),
      timestamp(group.endMs),
      group.speaker,
      group.reviewStatus ?? "draft",
      group.reviewNote,
      compact(group.text),
      group.secondaryText?.trim(),
    ].map(csvCell).join(","));
  return `\uFEFF${[header.map(csvCell).join(","), ...rows].join("\r\n")}\r\n`;
}

function parseCsvRow(row: string): string[] {
  const values: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < row.length; index += 1) {
    const char = row[index];
    if (char === "\"" && quoted && row[index + 1] === "\"") { value += "\""; index += 1; continue; }
    if (char === "\"") { quoted = !quoted; continue; }
    if (char === "," && !quoted) { values.push(value); value = ""; continue; }
    value += char;
  }
  values.push(value);
  return values;
}

export function importCaptionReviewCsv(csv: string, groups: CaptionGroup[]): { groups: CaptionGroup[]; updated: number } {
  const rows = csv.replace(/^\uFEFF/u, "").split(/\r?\n/u).filter(Boolean);
  if (rows.length < 2) return { groups, updated: 0 };
  const header = parseCsvRow(rows[0]);
  const indexOf = (name: string) => header.indexOf(name);
  const startIndex = indexOf("开始");
  const endIndex = indexOf("结束");
  if (startIndex < 0 || endIndex < 0) return { groups, updated: 0 };
  const speakerIndex = indexOf("说话人");
  const reviewIndex = indexOf("审校状态");
  const noteIndex = indexOf("审校备注");
  const textIndex = indexOf("主字幕");
  const secondaryIndex = indexOf("副字幕");
  let updated = 0;
  const next = groups.map((group) => {
    const row = rows.slice(1).map(parseCsvRow).find((values) => {
      const start = parseTimestamp(values[startIndex] ?? "");
      const end = parseTimestamp(values[endIndex] ?? "");
      return start !== null && end !== null && Math.abs(start - group.startMs) <= 20 && Math.abs(end - group.endMs) <= 20;
    });
    if (!row) return group;
    updated += 1;
    const review = row[reviewIndex] === "reviewed" || row[reviewIndex] === "needs-review" || row[reviewIndex] === "draft" ? row[reviewIndex] : group.reviewStatus;
    const text = !group.locked && textIndex >= 0 && row[textIndex] !== undefined ? row[textIndex] : group.text;
    return {
      ...group,
      text,
      secondaryText: !group.locked && secondaryIndex >= 0 ? row[secondaryIndex] || undefined : group.secondaryText,
      speaker: !group.locked && speakerIndex >= 0 ? row[speakerIndex] || undefined : group.speaker,
      reviewStatus: review,
      reviewNote: noteIndex >= 0 ? row[noteIndex] || undefined : group.reviewNote,
      units: text !== group.text ? [] : group.units,
      words: text !== group.text ? undefined : group.words,
      effect: text !== group.text ? undefined : group.effect,
    };
  });
  return { groups: next, updated };
}

export function captionReviewFilename(projectName: string): string {
  const safeName = compact(projectName)
    .replace(/[<>:"/\\|?*]/gu, "-")
    .slice(0, 80) || "captions";
  return `${safeName}-review-sheet.csv`;
}

export function buildCaptionGlossaryCsv(glossary: Array<{ preferred: string; variants: string[] }>): string {
  const header = ["标准术语", "旧写法"];
  const rows = glossary.map((entry) => [entry.preferred, entry.variants.join("、")].map(csvCell).join(","));
  return `\uFEFF${[header.map(csvCell).join(","), ...rows].join("\r\n")}\r\n`;
}

export function importCaptionGlossaryCsv(csv: string): Array<{ preferred: string; variants: string[] }> {
  const rows = csv.replace(/^\uFEFF/u, "").split(/\r?\n/u).filter(Boolean).map(parseCsvRow);
  if (rows.length < 2) return [];
  const preferredIndex = rows[0].indexOf("标准术语");
  const variantsIndex = rows[0].indexOf("旧写法");
  if (preferredIndex < 0 || variantsIndex < 0) return [];
  return rows.slice(1).flatMap((row) => {
    const preferred = row[preferredIndex]?.trim() ?? "";
    const variants = [...new Set((row[variantsIndex] ?? "").split(/[、，,\n]/u).map((value) => value.trim()).filter((value) => value && value !== preferred))];
    return preferred && variants.length ? [{ preferred, variants }] : [];
  });
}
