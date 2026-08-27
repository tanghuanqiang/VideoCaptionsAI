import { useEffect, useMemo, useState } from "react";
import { Gauge, Palette, SlidersHorizontal, Sparkles } from "lucide-react";
import { useEditor } from "@/state/EditorContext";
import { StylePresetsPanel } from "./StylePresetsPanel";
import { CaptionPropertiesPanel } from "./CaptionPropertiesPanel";
import { BatchPropertiesPanel } from "./BatchPropertiesPanel";
import { UnitPropertiesPanel } from "./UnitPropertiesPanel";
import { UnitPicker } from "./UnitPicker";
import { CaptionQualityPanel } from "./CaptionQualityPanel";
import { ContentOptimizationPanel } from "./ContentOptimizationPanel";
import { analyzeCaptionQuality } from "@/lib/captionQuality";
import { cn } from "@/lib/utils";

type RightTab = "props" | "presets" | "quality" | "optimize";

export function RightPanel() {
  const { selectedGroups, selectedUnit, state } = useEditor();
  const hasSelection = selectedGroups.length > 0 || !!selectedUnit;
  const qualityIssueCount = useMemo(
    () => analyzeCaptionQuality(state.doc.groups, state.doc.durationMs, state.doc.qualityProfile).issues.length,
    [state.doc.groups, state.doc.durationMs, state.doc.qualityProfile],
  );
  const [tab, setTab] = useState<RightTab>(hasSelection ? "props" : "presets");

  // When the selection state changes, follow it by default (user can still switch back).
  useEffect(() => {
    setTab((current) => current === "quality" || current === "optimize" ? current : (hasSelection ? "props" : "presets"));
  }, [hasSelection]);

  let propsContent: React.ReactNode;
  if (selectedUnit) {
    propsContent = (
      <UnitPropertiesPanel group={selectedUnit.group} unitId={selectedUnit.unitId} />
    );
  } else if (selectedGroups.length === 1) {
    propsContent = (
      <div className="flex h-full flex-col">
        <div className="flex-1 overflow-hidden">
          <CaptionPropertiesPanel group={selectedGroups[0]} />
        </div>
        <UnitPicker group={selectedGroups[0]} />
      </div>
    );
  } else if (selectedGroups.length > 1) {
    propsContent = <BatchPropertiesPanel groups={selectedGroups} />;
  } else {
    // Nothing selected: prompt to select or use presets.
    propsContent = (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
        <SlidersHorizontal className="h-6 w-6 text-foreground/30" />
        <p className="text-xs text-foreground/50">
          选中一条字幕以编辑其属性，或切换到「样式预设」批量应用样式。
        </p>
      </div>
    );
  }

  return (
    <aside className="glass-panel flex h-full w-80 shrink-0 flex-col rounded-xl">
      {/* Tab switcher */}
      <div className="flex items-center gap-1 border-b border-border/60 p-2">
        <TabButton
          active={tab === "props"}
          onClick={() => setTab("props")}
          icon={<SlidersHorizontal className="h-3.5 w-3.5" />}
          label="属性"
        />
        <TabButton
          active={tab === "presets"}
          onClick={() => setTab("presets")}
          icon={<Palette className="h-3.5 w-3.5" />}
          label="样式预设"
        />
        <TabButton
          active={tab === "quality"}
          onClick={() => setTab("quality")}
          icon={<Gauge className="h-3.5 w-3.5" />}
          label={`体检${qualityIssueCount ? ` (${qualityIssueCount})` : ""}`}
        />
        <TabButton
          active={tab === "optimize"}
          onClick={() => setTab("optimize")}
          icon={<Sparkles className="h-3.5 w-3.5" />}
          label="优化"
        />
      </div>

      <div className="min-h-0 flex-1">
        {tab === "props"
          ? propsContent
          : tab === "presets"
            ? <StylePresetsPanel />
            : tab === "quality"
              ? <CaptionQualityPanel />
              : <ContentOptimizationPanel />}
      </div>
    </aside>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition-colors",
        active
          ? "bg-foreground/10 text-foreground"
          : "text-foreground/55 hover:bg-foreground/5",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
