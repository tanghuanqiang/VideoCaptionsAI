import { Check, Plus, Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEditor } from "@/state/EditorContext";
import { stylePresets, defaultStyle } from "@/constants";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function StylePresetsPanel() {
  const { state, dispatch } = useEditor();
  const { groups, styles } = state.doc;

  const applyToAll = (styleId: string) => {
    if (groups.length === 0) {
      toast.info("暂无字幕可应用");
      return;
    }
    dispatch({
      type: "APPLY_STYLE",
      ids: groups.map((g) => g.id),
      styleId,
    });
    toast.success("已应用样式到全部字幕", {
      action: { label: "撤销", onClick: () => dispatch({ type: "UNDO" }) },
    });
  };

  const createStyle = () => {
    const id = `style-${Date.now().toString(16)}`;
    dispatch({
      type: "ADD_STYLE",
      style: { ...defaultStyle, id, Name: `自定义样式 ${styles.length}` },
    });
    toast.success("已创建新样式");
  };

  return (
    <div className="flex h-full flex-col">
      <div className="px-4 pb-2 pt-3.5">
        <div className="flex items-center gap-2">
          <Palette className="h-4 w-4 text-foreground/60" />
          <h2 className="text-sm font-semibold">样式预设</h2>
        </div>
        <p className="mt-1 text-xs text-foreground/50">
          预设用于批量初始化字幕，单条与单字属性通过局部覆盖修改。
        </p>
      </div>

      <div className="scrollbar-thin flex-1 overflow-y-auto px-3 pb-3">
        <div className="space-y-2">
          {stylePresets.map((preset) => (
            <div
              key={preset.id}
              className="solid-surface group rounded-lg p-3 transition-colors hover:border-primary/40"
            >
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{preset.name}</p>
                  <p className="truncate text-[11px] text-foreground/50">
                    {preset.description}
                  </p>
                </div>
                <Button
                  variant="subtle"
                  size="xs"
                  onClick={() => applyToAll(preset.id)}
                >
                  应用
                </Button>
              </div>
              <StylePreview preset={preset} />
            </div>
          ))}
        </div>

        <Button
          variant="glass"
          className="mt-3 w-full"
          size="sm"
          onClick={createStyle}
        >
          <Plus /> 新建样式
        </Button>
      </div>
    </div>
  );
}

function StylePreview({ preset }: { preset: (typeof stylePresets)[number] }) {
  const s = preset.style;
  return (
    <div className="mt-2 flex h-12 items-center justify-center rounded-md bg-stage">
      <span
        style={{
          color: s.PrimaryColour,
          fontWeight: s.Bold ? 800 : 500,
          fontFamily: s.FontName,
          textShadow: `0 0 ${s.Outline}px ${s.OutlineColour}, 0 1px 2px rgba(0,0,0,.6)`,
          background: s.BorderStyle === 3 ? s.BackColour : "transparent",
          padding: s.BorderStyle === 3 ? "2px 8px" : 0,
          borderRadius: 4,
          fontSize: 16,
        }}
      >
        字幕预览 Aa
      </span>
    </div>
  );
}

export function StyleAssignRow({
  currentStyleId,
  onSelect,
}: {
  currentStyleId: string;
  onSelect: (id: string) => void;
}) {
  const { state } = useEditor();
  return (
    <div className="flex flex-wrap gap-1.5">
      {state.doc.styles.map((s) => (
        <button
          key={s.id}
          onClick={() => onSelect(s.id)}
          className={cn(
            "rounded-md px-2 py-1 text-[11px] transition-colors",
            currentStyleId === s.id
              ? "bg-primary text-primary-foreground"
              : "bg-foreground/5 text-foreground/70 hover:bg-foreground/10",
          )}
        >
          {currentStyleId === s.id && <Check className="mr-1 inline h-3 w-3" />}
          {s.Name}
        </button>
      ))}
    </div>
  );
}
