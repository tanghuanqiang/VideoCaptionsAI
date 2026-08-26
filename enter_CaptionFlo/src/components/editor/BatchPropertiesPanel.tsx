import { Layers, RotateCcw, Timer, Wand2 } from "lucide-react";
import { useState } from "react";
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
  const [prefix, setPrefix] = useState("");
  const [suffix, setSuffix] = useState("");
  const [normalizeWhitespace, setNormalizeWhitespace] = useState(false);
  const ids = groups.map((g) => g.id);

  const fontSize = shared(groups.map((g) => g.overrides.fontSize));
  const color = shared(groups.map((g) => g.overrides.primaryColor));
  const outlineColor = shared(groups.map((g) => g.overrides.outlineColor));
  const outlineWidth = shared(groups.map((g) => g.overrides.outlineWidth));
  const opacity = shared(groups.map((g) => g.overrides.opacity));
  const speaker = shared(groups.map((g) => g.speaker));
  const reviewStatus = shared(groups.map((g) => g.reviewStatus ?? "draft"));
  const locked = shared(groups.map((g) => g.locked ?? false));

  const reset = () => {
    dispatch({ type: "RESET_GROUP_OVERRIDES", ids });
    toast.success(`已重置 ${ids.length} 条字幕的局部属性`, {
      action: { label: "撤销", onClick: () => dispatch({ type: "UNDO" }) },
    });
  };

  const apply = (patch: CaptionOverrides) => {
    dispatch({ type: "UPDATE_GROUP_OVERRIDES", ids, patch });
  };

  const applyMetadata = (patch: { speaker?: string; secondaryText?: string; reviewStatus?: CaptionReviewStatus; locked?: boolean }) =>
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
        <FieldRow label="保护字幕">
          <select
            value={locked.mixed ? "mixed" : locked.value ? "locked" : "unlocked"}
            onChange={(e) => {
              if (e.target.value === "locked") applyMetadata({ locked: true });
              if (e.target.value === "unlocked") applyMetadata({ locked: false });
            }}
            className="h-8 w-32 rounded-md border border-input bg-card px-2 text-xs"
          >
            {locked.mixed && <option value="mixed">混合</option>}
            <option value="unlocked">可编辑</option>
            <option value="locked">已保护</option>
          </select>
        </FieldRow>
        <FieldRow label="副字幕">
          <TextField value={shared(groups.map((g) => g.secondaryText)).value} mixed={shared(groups.map((g) => g.secondaryText)).mixed} onChange={(v) => applyMetadata({ secondaryText: v.trim() || undefined })} />
        </FieldRow>
        <div className="mt-2 rounded-md border border-border/60 p-2">
          <div className="mb-1 flex items-center gap-1 text-[11px] font-medium text-foreground/65"><Wand2 className="h-3.5 w-3.5" /> 文本变换</div>
          <div className="grid grid-cols-2 gap-2">
            <input value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder="前缀" className="h-8 rounded-md border border-input bg-card px-2 text-xs" />
            <input value={suffix} onChange={(e) => setSuffix(e.target.value)} placeholder="后缀" className="h-8 rounded-md border border-input bg-card px-2 text-xs" />
          </div>
          <label className="mt-2 flex items-center gap-2 text-[11px] text-foreground/60">
            <input type="checkbox" checked={normalizeWhitespace} onChange={(e) => setNormalizeWhitespace(e.target.checked)} />
            统一空白字符
          </label>
          <Button
            variant="subtle"
            size="sm"
            className="mt-2 w-full"
            disabled={!prefix && !suffix && !normalizeWhitespace}
            onClick={() => {
              dispatch({ type: "TRANSFORM_SELECTED_TEXT", prefix, suffix, normalizeWhitespace });
              toast.success(`已变换 ${ids.length} 条字幕文本`);
            }}
          >
            应用到所选字幕
          </Button>
        </div>
        <div className="mt-2 rounded-md border border-border/60 p-2">
          <div className="mb-1 flex items-center gap-1 text-[11px] font-medium text-foreground/65"><Timer className="h-3.5 w-3.5" /> 时间校准</div>
          <div className="flex gap-2">
            <Button variant="subtle" size="sm" className="flex-1" onClick={() => dispatch({ type: "SHIFT_SELECTED_TIME", deltaMs: -100 })}>前移 100ms</Button>
            <Button variant="subtle" size="sm" className="flex-1" onClick={() => dispatch({ type: "SHIFT_SELECTED_TIME", deltaMs: 100 })}>后移 100ms</Button>
          </div>
          <Button variant="ghost" size="sm" className="mt-1 w-full" onClick={() => dispatch({ type: "NORMALIZE_SELECTED_TIMING", gapMs: 0 })}>按当前时长连续排列</Button>
          <div className="mt-2 flex gap-2">
            <Button variant="ghost" size="sm" className="flex-1" onClick={() => dispatch({ type: "RIPPLE_SHIFT_AFTER_SELECTED", deltaMs: -500 })}>后续前移 0.5 秒</Button>
            <Button variant="ghost" size="sm" className="flex-1" onClick={() => dispatch({ type: "RIPPLE_SHIFT_AFTER_SELECTED", deltaMs: 500 })}>后续后移 0.5 秒</Button>
          </div>
          <p className="mt-1 text-[10px] text-foreground/45">从所选字幕之后波纹移位，已保护字幕保持不动。</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="subtle"
            size="sm"
            className="flex-1"
            onClick={() => {
              dispatch({ type: "DUPLICATE_SELECTED" });
              toast.success(`已复制 ${ids.length} 条字幕，偏移 250ms`);
            }}
          >
            复制所选
          </Button>
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
