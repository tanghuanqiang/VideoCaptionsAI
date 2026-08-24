import { useState } from "react";
import { ChevronDown, ChevronUp, Type } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEditor } from "@/state/EditorContext";
import {
  splitGroupByCharacters,
  splitGroupByWords,
} from "@/types/captionModel";
import { cn } from "@/lib/utils";
import type { CaptionGroup } from "@/types/captionModel";

/** Lets the user break a caption into units and pick a single char/word. */
export function UnitPicker({ group }: { group: CaptionGroup }) {
  const { state, dispatch } = useEditor();
  const [open, setOpen] = useState(true);
  const activeUnitId = state.doc.selection.unitIds?.[0];

  const splitInto = (mode: "char" | "word") => {
    const next =
      mode === "char"
        ? splitGroupByCharacters(group, group.words)
        : splitGroupByWords(group, group.words);
    dispatch({
      type: "UPDATE_GROUP",
      id: group.id,
      patch: { units: next.units },
      commit: true,
    });
  };

  return (
    <div className="border-t border-border/60 bg-background/40">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-2.5 text-xs font-medium text-foreground/70"
      >
        <span className="flex items-center gap-2">
          <Type className="h-3.5 w-3.5" /> 单字 / 单词覆盖
        </span>
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
      </button>

      {open && (
        <div className="px-4 pb-4">
          <div className="mb-2 flex gap-2">
            <Button variant="subtle" size="xs" className="flex-1" onClick={() => splitInto("char")}>
              按字拆分
            </Button>
            <Button variant="subtle" size="xs" className="flex-1" onClick={() => splitInto("word")}>
              按词拆分
            </Button>
          </div>

          {group.units.length === 0 ? (
            <p className="text-[11px] text-foreground/40">
              先拆分为字或词，再点击单个单元编辑其颜色与效果。
            </p>
          ) : (
            <div className="flex flex-wrap gap-1">
              {group.units.map((u) => (
                <button
                  key={u.id}
                  onClick={() =>
                    dispatch({
                      type: "SELECT",
                      selection: { groupIds: [group.id], unitIds: [u.id] },
                    })
                  }
                  className={cn(
                    "min-w-7 rounded-md px-1.5 py-1 text-[13px] transition-colors",
                    activeUnitId === u.id
                      ? "bg-primary text-primary-foreground"
                      : "bg-foreground/5 hover:bg-foreground/10",
                  )}
                  style={{ color: activeUnitId === u.id ? undefined : u.overrides.primaryColor }}
                >
                  {u.text}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
