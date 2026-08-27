import { Type, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEditor } from "@/state/EditorContext";
import { cn } from "@/lib/utils";
import {
  ColorField,
  FieldRow,
  NumberField,
  SectionTitle,
} from "./PropertyControls";
import type { CaptionEffectType, CaptionGroup, CaptionOverrides } from "@/types/captionModel";

const effectOptions: Array<{ value: CaptionEffectType; label: string }> = [
  { value: "whole", label: "无" },
  { value: "highlight", label: "高亮" },
  { value: "emphasis", label: "强调" },
  { value: "reveal", label: "逐字显现" },
];

export function UnitPropertiesPanel({
  group,
  unitId,
}: {
  group: CaptionGroup;
  unitId: string;
}) {
  const { dispatch } = useEditor();
  const unit = group.units.find((u) => u.id === unitId);
  if (!unit) return null;

  const o = unit.overrides;

  const setOverride = (patch: CaptionOverrides) =>
    dispatch({ type: "UPDATE_UNIT", groupId: group.id, unitId, patch });

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-4 pb-2 pt-3.5">
        <div className="flex items-center gap-2">
          <Type className="h-4 w-4 text-foreground/60" />
          <h2 className="text-sm font-semibold">单字 / 单词属性</h2>
        </div>
        <Button
          variant="ghost"
          size="xs"
          onClick={() =>
            dispatch({ type: "SELECT", selection: { groupIds: [group.id], unitIds: [] } })
          }
        >
          <ArrowLeft /> 返回
        </Button>
      </div>

      <div className="scrollbar-thin flex-1 overflow-y-auto px-4 pb-4">
        <div className="solid-surface flex items-center justify-center rounded-lg py-4">
          <span className="text-2xl font-semibold" style={{ color: o.primaryColor }}>
            {unit.text}
          </span>
        </div>

        <SectionTitle>外观</SectionTitle>
        <FieldRow label="颜色">
          <ColorField
            value={o.primaryColor}
            onChange={(v) => setOverride({ primaryColor: v })}
          />
        </FieldRow>
        <FieldRow label="字号">
          <NumberField
            value={o.fontSize}
            onChange={(v) => setOverride({ fontSize: v })}
            min={8}
            max={200}
            suffix="px"
          />
        </FieldRow>
        <FieldRow label="不透明度">
          <NumberField
            value={o.opacity ?? 1}
            onChange={(v) => setOverride({ opacity: v })}
            min={0}
            max={1}
            step={0.1}
          />
        </FieldRow>

        <SectionTitle>位置</SectionTitle>
        <FieldRow label="X 偏移">
          <NumberField value={o.x ?? 0} onChange={(v) => setOverride({ x: v })} suffix="px" />
        </FieldRow>
        <FieldRow label="Y 偏移">
          <NumberField value={o.y ?? 0} onChange={(v) => setOverride({ y: v })} suffix="px" />
        </FieldRow>

        <SectionTitle>动画效果</SectionTitle>
        <div className="grid grid-cols-4 gap-1.5">
          {effectOptions.map((opt) => {
            const active = (unit.effect?.type ?? "whole") === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() =>
                  dispatch({
                    type: "SET_UNIT_EFFECT",
                    groupId: group.id,
                    unitId,
                    effect: opt.value === "whole" ? undefined : { type: opt.value },
                  })
                }
                className={cn(
                  "rounded-md px-1 py-1.5 text-[11px] transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "bg-foreground/5 text-foreground/70 hover:bg-foreground/10",
                )}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
