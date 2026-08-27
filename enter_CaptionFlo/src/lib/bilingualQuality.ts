import type { CaptionGroup } from "@/types/captionModel";

export interface BilingualCaptionIssue {
  groupId: string;
  kind: "missing-secondary" | "source-copied" | "secondary-too-long";
  message: string;
}

export function analyzeBilingualCaptions(groups: CaptionGroup[]): BilingualCaptionIssue[] {
  return groups.flatMap((group) => {
    const primary = group.text.trim();
    const secondary = group.secondaryText?.trim() ?? "";
    if (!secondary) return [{ groupId: group.id, kind: "missing-secondary" as const, message: "缺少副字幕" }];
    if (primary && secondary === primary) return [{ groupId: group.id, kind: "source-copied" as const, message: "副字幕仍为待翻译原文" }];
    if (Array.from(secondary).length > Math.max(72, Array.from(primary).length * 2.5)) {
      return [{ groupId: group.id, kind: "secondary-too-long" as const, message: "副字幕明显偏长" }];
    }
    return [];
  });
}

/** Prepare missing secondary fields for a human or translation vendor; this never claims to translate. */
export function prepareSecondaryCaptions(groups: CaptionGroup[]): CaptionGroup[] {
  return groups.map((group) => (
    group.locked || group.secondaryText?.trim() ? group : { ...group, secondaryText: group.text }
  ));
}
