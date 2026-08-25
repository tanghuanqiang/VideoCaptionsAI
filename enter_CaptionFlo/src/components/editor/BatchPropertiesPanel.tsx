import { Layers, RotateCcw, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEditor } from "@/state/EditorContext";
import { toast } from "sonner";
import {
  ColorField,
  FieldRow,
  NumberField,
  SectionTitle,
  TextField,
} from "./PropertyControls";
import type { CaptionGroup, CaptionOverrides, CaptionReviewStatus } from "@/types/captionModel";

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
  const speaker = shared(groups.map((g) => g.speaker));
  const reviewStatus = shared(groups.map((g) => g.reviewStatus ?? "draft"));

  const reset = () => {
    dispatch({ type: "RESET_GROUP_OVERRIDES", ids });
    toast.success(`已重置 ${ids.length} 条字幕的局部属性`, {
      action: { label: "撤销", onClick: () => dispatch({ type: "UNDO" }) },
    });
  };

  const apply = (patch: CaptionOverrides) => {
    dispatch({ type: "UPDATE_GROUP_OVERRIDES", ids, patch });
  };

  const applyMetadata = (patch: { speaker?: string; secondaryText?: string; reviewStatus?: CaptionReviewStatus }) =>
    dispatch({ type: "UPDATE_GROUP_METADATA", ids, patch });

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
        <FieldRow label="说话人">
          <TextField value={speaker.value} mixed={speaker.mixed} onChange={(v) => applyMetadata({ speaker: v.trim() || undefined })} />
        </FieldRow>
        <FieldRow label="审校状态">
          <select
            value={reviewStatus.mixed ? "mixed" : reviewStatus.value ?? "draft"}
            onChange={(e) => e.target.value !== "mixed" && applyMetadata({ reviewStatus: e.target.value as CaptionReviewStatus })}
            className="h-8 w-32 rounded-md border border-input bg-card px-2 text-xs"
          >
            {reviewStatus.mixed && <option value="mixed">混合</option>}
            <option value="draft">草稿</option>
            <option value="needs-review">待复核</option>
            <option value="reviewed">已审校</option>
          </select>
        </FieldRow>
        <FieldRow label="副字幕">
          <TextField value={shared(groups.map((g) => g.secondaryText)).value} mixed={shared(groups.map((g) => g.secondaryText)).mixed} onChange={(v) => applyMetadata({ secondaryText: v.trim() || undefined })} />
        </FieldRow>
        <div className="mt-2 rounded-md border border-border/60 p-2">
          <div className="mb-1 flex items-center gap-1 text-[11px] font-medium text-foreground/65"><Timer className="h-3.5 w-3.5" /> 时间校准</div>
          <div className="flex gap-2">
            <Button variant="subtle" size="sm" className="flex-1" onClick={() => dispatch({ type: "SHIFT_SELECTED_TIME", deltaMs: -100 })}>前移 100ms</Button>
            <Button variant="subtle" size="sm" className="flex-1" onClick={() => dispatch({ type: "SHIFT_SELECTED_TIME", deltaMs: 100 })}>后移 100ms</Button>
          </div>
          <Button variant="ghost" size="sm" className="mt-1 w-full" onClick={() => dispatch({ type: "NORMALIZE_SELECTED_TIMING", gapMs: 0 })}>按当前时长连续排列</Button>
        </div>
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
