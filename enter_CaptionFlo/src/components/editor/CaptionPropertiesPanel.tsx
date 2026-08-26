import { Copy, Lock, RotateCcw, SlidersHorizontal, Unlock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useEditor } from "@/state/EditorContext";
import { formatMs } from "@/lib/editorUtils";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { graphemesOf } from "@/types/captionModel";
import { applySmartLineBreak } from "@/lib/captionTextTools";
import {
  ColorField,
  FieldRow,
  NumberField,
  SectionTitle,
} from "./PropertyControls";
import { StyleAssignRow } from "./StylePresetsPanel";
import type { CaptionContentTag, CaptionGroup, CaptionOverrides, CaptionReviewStatus } from "@/types/captionModel";

export function CaptionPropertiesPanel({ group }: { group: CaptionGroup }) {
  const { dispatch, styleById } = useEditor();
  const style = styleById(group.baseStyleId);
  const o = group.overrides;
  const isLocked = group.locked === true;
  const durationSeconds = Math.max(0.001, (group.endMs - group.startMs) / 1000);
  const charsPerSecond = graphemesOf(group.text).length / durationSeconds;
  const readingTone = charsPerSecond > 9 ? "text-destructive" : charsPerSecond > 7 ? "text-warning-foreground" : "text-success";

  const setOverride = (patch: CaptionOverrides) =>
    dispatch({ type: "UPDATE_GROUP_OVERRIDES", ids: [group.id], patch });

  const setText = (text: string) =>
    dispatch({ type: "UPDATE_GROUP", id: group.id, patch: { text }, commit: true });

  const setSecondaryText = (secondaryText: string) =>
    dispatch({
      type: "UPDATE_GROUP",
      id: group.id,
      patch: { secondaryText: secondaryText.trim() || undefined },
      commit: true,
    });

  const setSpeaker = (speaker: string) =>
    dispatch({
      type: "UPDATE_GROUP",
      id: group.id,
      patch: { speaker: speaker.trim() || undefined },
      commit: true,
    });

  const setReviewStatus = (reviewStatus: CaptionReviewStatus) =>
    dispatch({ type: "UPDATE_GROUP", id: group.id, patch: { reviewStatus }, commit: true });

  const setReviewNote = (reviewNote: string) =>
    dispatch({ type: "UPDATE_GROUP", id: group.id, patch: { reviewNote: reviewNote.trim() || undefined }, commit: true });

  const setContentTag = (contentTag?: CaptionContentTag) =>
    dispatch({ type: "UPDATE_GROUP", id: group.id, patch: { contentTag }, commit: true });

  const setTime = (patch: { startMs?: number; endMs?: number }) =>
    dispatch({ type: "UPDATE_GROUP", id: group.id, patch, commit: true });

  const reset = () => {
    dispatch({ type: "RESET_GROUP_OVERRIDES", ids: [group.id] });
    toast.success("已重置当前字幕的局部属性", {
      action: { label: "撤销", onClick: () => dispatch({ type: "UNDO" }) },
    });
  };

  const copyTimedCaption = async () => {
    const timestamp = `${formatMs(group.startMs)} → ${formatMs(group.endMs)}`;
    const speaker = group.speaker ? `${group.speaker}: ` : "";
    const secondary = group.secondaryText ? `\n${group.secondaryText}` : "";
    try {
      await navigator.clipboard.writeText(`[${timestamp}] ${speaker}${group.text}${secondary}`);
      toast.success("已复制带时间码字幕");
    } catch {
      toast.error("无法访问剪贴板");
    }
  };

  const smartBreak = () => {
    const next = applySmartLineBreak(group);
    if (next.text === group.text) {
      toast.info("当前字幕无需断行");
      return;
    }
    dispatch({ type: "UPDATE_GROUP", id: group.id, patch: next, commit: true });
    toast.success("已按语义停顿插入断行");
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-4 pb-2 pt-3.5">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-foreground/60" />
          <h2 className="text-sm font-semibold">字幕属性</h2>
        </div>
        <Button variant="ghost" size="xs" onClick={reset}>
          <RotateCcw /> 重置
        </Button>
        <Button
          variant="ghost"
          size="xs"
          onClick={() => dispatch({ type: "UPDATE_GROUP_METADATA", ids: [group.id], patch: { locked: !isLocked } })}
          title={isLocked ? "解除字幕保护" : "保护已确认字幕"}
        >
          {isLocked ? <Lock /> : <Unlock />}
        </Button>
        <Button variant="ghost" size="xs" onClick={copyTimedCaption} title="复制带时间码字幕">
          <Copy />
        </Button>
      </div>

      <div className="scrollbar-thin flex-1 overflow-y-auto px-4 pb-4">
        {isLocked && (
          <div className="mb-3 flex items-center gap-2 rounded-md border border-warning/30 bg-warning/10 px-2.5 py-2 text-xs text-foreground/70">
            <Lock className="h-3.5 w-3.5 text-warning-foreground" />
            已保护：仅可更新审校状态和备注。
          </div>
        )}
        <SectionTitle>文本</SectionTitle>
        <div className="mb-1 flex justify-end">
          <Button variant="ghost" size="xs" onClick={smartBreak} title="按语义停顿智能断行">智能断行</Button>
        </div>
        <Textarea
          value={group.text}
          onChange={(e) => setText(e.target.value)}
          disabled={isLocked}
          className="min-h-16 resize-none bg-card text-sm"
          placeholder="输入字幕文本"
        />
        <SectionTitle>副字幕</SectionTitle>
        <Textarea
          value={group.secondaryText ?? ""}
          onChange={(e) => setSecondaryText(e.target.value)}
          disabled={isLocked}
          className="min-h-14 resize-none bg-card text-sm"
          placeholder="可选：输入第二语言或辅助说明"
        />
        <SectionTitle>说话人</SectionTitle>
        <input
          value={group.speaker ?? ""}
          onChange={(e) => setSpeaker(e.target.value)}
          disabled={isLocked}
          className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus:border-primary"
          placeholder="可选：例如 主持人、嘉宾 A"
        />
        <SectionTitle>审校状态</SectionTitle>
        <div className="grid grid-cols-3 gap-1 rounded-md bg-foreground/5 p-1">
          {([
            ["draft", "草稿"],
            ["needs-review", "待复核"],
            ["reviewed", "已审校"],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setReviewStatus(value)}
              className={cn(
                "rounded px-1 py-1.5 text-[11px] transition-colors",
                (group.reviewStatus ?? "draft") === value
                  ? "bg-card font-medium text-primary shadow-soft"
                  : "text-foreground/55 hover:bg-card/60",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <SectionTitle>审校备注</SectionTitle>
        <Textarea
          value={group.reviewNote ?? ""}
          onChange={(e) => setReviewNote(e.target.value)}
          className="min-h-14 resize-none bg-card text-sm"
          placeholder="记录修改意见、术语说明或交接信息"
        />
        <SectionTitle>内容资产</SectionTitle>
        <div className="grid grid-cols-3 gap-1 rounded-md bg-foreground/5 p-1">
          {([[undefined, "普通"], ["chapter", "章节"], ["highlight", "高光"]] as const).map(([value, label]) => (
            <button
              key={label}
              onClick={() => setContentTag(value)}
              className={cn(
                "rounded px-1 py-1.5 text-[11px] transition-colors",
                group.contentTag === value ? "bg-card font-medium text-primary shadow-soft" : "text-foreground/55 hover:bg-card/60",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <SectionTitle>基础样式</SectionTitle>
        <StyleAssignRow
          currentStyleId={group.baseStyleId}
          onSelect={(id) =>
            dispatch({ type: "APPLY_STYLE", ids: [group.id], styleId: id })
          }
        />

        <SectionTitle>字体</SectionTitle>
        <FieldRow label="字号">
          <NumberField
            value={o.fontSize ?? style.FontSize}
            onChange={(v) => setOverride({ fontSize: v })}
            min={8}
            max={200}
            suffix="px"
          />
        </FieldRow>
        <FieldRow label="主色">
          <ColorField
            value={o.primaryColor ?? style.PrimaryColour}
            onChange={(v) => setOverride({ primaryColor: v })}
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

        <SectionTitle>位置与变形</SectionTitle>
        <FieldRow label="X 偏移">
          <NumberField value={o.x ?? 0} onChange={(v) => setOverride({ x: v })} suffix="px" />
        </FieldRow>
        <FieldRow label="Y 偏移">
          <NumberField value={o.y ?? 0} onChange={(v) => setOverride({ y: v })} suffix="px" />
        </FieldRow>
        <FieldRow label="横向缩放">
          <NumberField
            value={o.scaleX ?? style.ScaleX ?? 100}
            onChange={(v) => setOverride({ scaleX: v })}
            suffix="%"
          />
        </FieldRow>
        <FieldRow label="纵向缩放">
          <NumberField
            value={o.scaleY ?? style.ScaleY ?? 100}
            onChange={(v) => setOverride({ scaleY: v })}
            suffix="%"
          />
        </FieldRow>
        <FieldRow label="旋转">
          <NumberField
            value={o.rotation ?? style.Angle ?? 0}
            onChange={(v) => setOverride({ rotation: v })}
            suffix="°"
          />
        </FieldRow>

        <SectionTitle>描边与阴影</SectionTitle>
        <FieldRow label="描边色">
          <ColorField
            value={o.outlineColor ?? style.OutlineColour}
            onChange={(v) => setOverride({ outlineColor: v })}
          />
        </FieldRow>
        <FieldRow label="描边宽">
          <NumberField
            value={o.outlineWidth ?? style.Outline ?? 0}
            onChange={(v) => setOverride({ outlineWidth: v })}
            min={0}
            max={10}
            suffix="px"
          />
        </FieldRow>
        <FieldRow label="阴影宽">
          <NumberField
            value={o.shadowWidth ?? style.Shadow ?? 0}
            onChange={(v) => setOverride({ shadowWidth: v })}
            min={0}
            max={10}
            suffix="px"
          />
        </FieldRow>

        <SectionTitle>时间范围</SectionTitle>
        <div className="mb-2 grid grid-cols-2 gap-2 rounded-md bg-foreground/5 px-2.5 py-2 text-[11px]">
          <div>
            <span className="block text-foreground/45">阅读速度</span>
            <span className={cn("font-mono tabular-nums", readingTone)}>{charsPerSecond.toFixed(1)} 字/秒</span>
          </div>
          <div>
            <span className="block text-foreground/45">可读性提示</span>
            <span className="text-foreground/65">{charsPerSecond > 9 ? "建议延长或拆分" : charsPerSecond > 7 ? "接近上限" : "节奏舒适"}</span>
          </div>
        </div>
        <FieldRow label="开始">
          <NumberField
            value={group.startMs}
            onChange={(v) => setTime({ startMs: v })}
            step={10}
            width="w-24"
            suffix="ms"
          />
        </FieldRow>
        <FieldRow label="结束">
          <NumberField
            value={group.endMs}
            onChange={(v) => setTime({ endMs: v })}
            step={10}
            width="w-24"
            suffix="ms"
          />
        </FieldRow>
        <p className="mt-1 text-right font-mono text-[11px] text-foreground/45">
          时长 {formatMs(group.endMs - group.startMs)}
        </p>
      </div>
    </div>
  );
}
