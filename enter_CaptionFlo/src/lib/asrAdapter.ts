import type { ASRResponse } from "@/types/subtitleTypes";
import type { CaptionGroup } from "@/types/captionModel";
import { subtitleToCaptionGroup } from "@/types/captionModel";

/** Convert a backend ASRResponse into editor CaptionGroups. */
export function asrResponseToGroups(res: ASRResponse): CaptionGroup[] {
  return res.events.map((evt) =>
    subtitleToCaptionGroup(
      {
        id: evt.id,
        start: evt.start,
        end: evt.end,
        text: evt.text,
        speaker: evt.speaker,
        style: evt.style ?? "recommended",
        group: "",
        overrides: evt.overrides,
        units: evt.units,
        effect: evt.effect,
        words: evt.words,
      },
      evt.style ?? "recommended",
    ),
  );
}
