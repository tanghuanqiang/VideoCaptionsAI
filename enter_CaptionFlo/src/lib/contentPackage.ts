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
  const header = ["开始", "结束", "说话人", "审校状态", "主字幕", "副字幕"];
  const rows = [...groups]
    .sort((a, b) => a.startMs - b.startMs)
    .map((group) => [
      timestamp(group.startMs),
      timestamp(group.endMs),
      group.speaker,
      group.reviewStatus ?? "draft",
      compact(group.text),
      group.secondaryText?.trim(),
    ].map(csvCell).join(","));
  return `\uFEFF${[header.map(csvCell).join(","), ...rows].join("\r\n")}\r\n`;
}

export function captionReviewFilename(projectName: string): string {
  const safeName = compact(projectName)
    .replace(/[<>:"/\\|?*]/gu, "-")
    .slice(0, 80) || "captions";
  return `${safeName}-review-sheet.csv`;
}
