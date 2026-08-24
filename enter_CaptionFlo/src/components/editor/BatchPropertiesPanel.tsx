import { Layers, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEditor } from "@/state/EditorContext";
import { toast } from "sonner";
import {
  ColorField,
  FieldRow,
  NumberField,
  SectionTitle,
} from "./PropertyControls";
import type { CaptionGroup, CaptionOverrides } from "@/types/captionModel";

/** Returns the shared value, or undefined when values differ (mixed). */
function shared<T>(items: (T | undefined)[]): { value: T | undefined; mixed: boolean } {
  const first = items[0];
  const allSame = items.every((v) => v === first);
  return { value: allSame ? first : undefined, mixed: !allSame };
}

export function BatchPropertiesPanel({ groups }: { groups: CaptionGroup[] }) {
  const { dispatch } = useEditor();
  const ids = groups.map((g) => g.id);

  const fontSize = shared(groups.map((g) => g.overrides.fontSize));
  const color = shared(groups.map((g) => g.overrides.primaryColor));
  const outlineColor = shared(groups.map((g) => g.overrides.outlineColor));
  const outlineWidth = shared(groups.map((g) => g.overrides.outlineWidth));
  const opacity = shared(groups.map((g) => g.overrides.opacity));

  const reset = () => {
    dispatch({ type: "RESET_GROUP_OVERRIDES", ids });
    toast.success(`已重置 ${ids.length} 条字幕的局部属性`, {
      action: { label: "撤销", onClick: () => dispatch({ type: "UNDO" }) },
    });
  };

  const apply = (patch: CaptionOverrides) => {
    dispatch({ type: "UPDATE_GROUP_OVERRIDES", ids, patch });
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-4 pb-2 pt-3.5">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-foreground/60" />
          <h2 className="text-sm font-semibold">批量编辑</h2>
          <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[11px] text-primary">
            {groups.length} 条
          </span>
        </div>
        <Button variant="ghost" size="xs" onClick={reset}>
          <RotateCcw /> 重置
        </Button>
      </div>

      <div className="scrollbar-thin flex-1 overflow-y-auto px-4 pb-4">
        <p className="mb-1 text-xs text-foreground/50">
          相同值显示实际值，不同值显示为「混合」。修改某个属性仅覆盖该属性。
        </p>

        <SectionTitle>字体</SectionTitle>
        <FieldRow label="字号">
          <NumberField
            value={fontSize.value}
            mixed={fontSize.mixed}
            onChange={(v) => apply({ fontSize: v })}
            min={8}
            max={200}
            suffix="px"
          />
        </FieldRow>
        <FieldRow label="主色">
          <ColorField
            value={color.value}
            mixed={color.mixed}
            onChange={(v) => apply({ primaryColor: v })}
          />
        </FieldRow>
        <FieldRow label="不透明度">
          <NumberField
            value={opacity.value}
            mixed={opacity.mixed}
            onChange={(v) => apply({ opacity: v })}
            min={0}
            max={1}
            step={0.1}
          />
        </FieldRow>

        <SectionTitle>描边</SectionTitle>
        <FieldRow label="描边色">
          <ColorField
            value={outlineColor.value}
            mixed={outlineColor.mixed}
            onChange={(v) => apply({ outlineColor: v })}
          />
        </FieldRow>
        <FieldRow label="描边宽">
          <NumberField
            value={outlineWidth.value}
            mixed={outlineWidth.mixed}
            onChange={(v) => apply({ outlineWidth: v })}
            min={0}
            max={10}
            suffix="px"
          />
        </FieldRow>

        <SectionTitle>批量操作</SectionTitle>
        <div className="flex gap-2">
          <Button
            variant="subtle"
            size="sm"
            className="flex-1"
            onClick={() => dispatch({ type: "MERGE_SELECTED" })}
          >
            合并所选
          </Button>
          <Button
            variant="subtle"
            size="sm"
            className="flex-1"
            onClick={() => {
              dispatch({ type: "DELETE_SELECTED" });
              toast.success("已删除所选字幕", {
                action: { label: "撤销", onClick: () => dispatch({ type: "UNDO" }) },
              });
            }}
          >
            删除所选
          </Button>
        </div>
      </div>
    </div>
  );
}
