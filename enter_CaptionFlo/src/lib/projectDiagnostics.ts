import type { CaptionGroup } from "@/types/captionModel";

export interface ProjectDiagnostic {
  id: string;
  severity: "error" | "warning";
  groupId?: string;
  message: string;
}

export function diagnoseCaptionGroups(
  groups: CaptionGroup[],
  durationMs: number,
  styleIds: string[] = [],
): ProjectDiagnostic[] {
  const diagnostics: ProjectDiagnostic[] = [];
  const groupIds = new Set<string>();
  const unitIds = new Set<string>();

  for (const group of groups) {
    if (groupIds.has(group.id)) {
      diagnostics.push({ id: `duplicate-group:${group.id}`, severity: "error", groupId: group.id, message: "字幕 ID 重复" });
    }
    groupIds.add(group.id);
    if (group.startMs < 0 || group.endMs <= group.startMs || (durationMs > 0 && group.endMs > durationMs)) {
      diagnostics.push({ id: `range:${group.id}`, severity: "error", groupId: group.id, message: "字幕时间范围非法" });
    }
    if (styleIds.length > 0 && !styleIds.includes(group.baseStyleId)) {
      diagnostics.push({ id: `style:${group.id}`, severity: "warning", groupId: group.id, message: "字幕引用了不存在的样式" });
    }
    for (const unit of group.units) {
      if (unitIds.has(unit.id)) {
        diagnostics.push({ id: `duplicate-unit:${unit.id}`, severity: "error", groupId: group.id, message: "逐字单元 ID 重复" });
      }
      unitIds.add(unit.id);
      if (unit.startMs < group.startMs || unit.endMs > group.endMs || unit.endMs <= unit.startMs) {
        diagnostics.push({ id: `unit-range:${group.id}:${unit.id}`, severity: "error", groupId: group.id, message: "逐字单元超出字幕时间范围" });
      }
    }
    for (const [index, word] of (group.words ?? []).entries()) {
      if (!word.word.trim() || !Number.isFinite(word.start) || !Number.isFinite(word.end) || word.end <= word.start) {
        diagnostics.push({ id: `word-invalid:${group.id}:${index}`, severity: "error", groupId: group.id, message: "词级时间数据非法" });
      } else if (word.start * 1000 < group.startMs || word.end * 1000 > group.endMs) {
        diagnostics.push({ id: `word-range:${group.id}:${index}`, severity: "warning", groupId: group.id, message: "词级时间超出字幕范围" });
      }
    }
  }
  return diagnostics;
}
