import type { CaptionGlossaryEntry, CaptionGroup } from "@/types/captionModel";

export interface CaptionGlossaryIssue {
  entryId: string;
  groupId: string;
  preferred: string;
  variant: string;
}

function variantsFor(entry: CaptionGlossaryEntry): string[] {
  return [...new Set(entry.variants.map((value) => value.trim()).filter((value) => value && value !== entry.preferred))];
}

function replaceVariant(text: string, variant: string, preferred: string): string {
  const escaped = variant.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const flags = /[A-Za-z]/u.test(variant) ? "giu" : "gu";
  return text.replace(new RegExp(escaped, flags), preferred);
}

export function findCaptionGlossaryIssues(
  groups: CaptionGroup[],
  glossary: CaptionGlossaryEntry[],
): CaptionGlossaryIssue[] {
  return groups.flatMap((group) => glossary.flatMap((entry) => variantsFor(entry).flatMap((variant) => {
    const expression = new RegExp(
      variant.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"),
      /[A-Za-z]/u.test(variant) ? "iu" : "u",
    );
    return expression.test(group.text) ? [{ entryId: entry.id, groupId: group.id, preferred: entry.preferred, variant }] : [];
  })));
}

/** Apply preferred terminology while preserving confirmed, protected captions. */
export function applyCaptionGlossary(
  groups: CaptionGroup[],
  glossary: CaptionGlossaryEntry[],
): CaptionGroup[] {
  return groups.map((group) => {
    if (group.locked) return group;
    const text = glossary.reduce(
      (current, entry) => variantsFor(entry).reduce(
        (next, variant) => replaceVariant(next, variant, entry.preferred),
        current,
      ),
      group.text,
    );
    return text === group.text ? group : { ...group, text, units: [], words: undefined, effect: undefined };
  });
}
