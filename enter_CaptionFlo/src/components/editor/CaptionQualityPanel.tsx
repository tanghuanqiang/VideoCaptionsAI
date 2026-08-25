import { useMemo } from "react";
import { AlertCircle, CheckCircle2, Gauge, Info, Scissors, Timer, TriangleAlert, WandSparkles } from "lucide-react";
import { toast } from "sonner";
import {
  analyzeCaptionQuality,
  captionQualityProfiles,
  repairCaptionSegmentation,
  repairCaptionOverlaps,
  repairCaptionTiming,
  type CaptionQualityIssue,
} from "@/lib/captionQuality";
import { useEditor } from "@/state/EditorContext";
import { cn } from "@/lib/utils";

const severityClass = {
  error: "bg-destructive/10 text-destructive",
  warning: "bg-warning/15 text-warning-foreground",
  info: "bg-primary/10 text-primary",
};

function IssueIcon({ issue }: { issue: CaptionQualityIssue }) {
  if (issue.kind === "short-duration") return <Timer className="h-4 w-4" />;
  if (issue.kind === "fast-reading") return <Gauge className="h-4 w-4" />;
  if (issue.severity === "error") return <AlertCircle className="h-4 w-4" />;
  if (issue.severity === "info") return <Info className="h-4 w-4" />;
  return <TriangleAlert className="h-4 w-4" />;
}

export function CaptionQualityPanel() {
  const { state, dispatch } = useEditor();
  const report = useMemo(
    () => analyzeCaptionQuality(state.doc.groups, state.doc.durationMs, state.doc.qualityProfile),
    [state.doc.groups, state.doc.durationMs, state.doc.qualityProfile],
  );
  const errors = report.issues.filter((issue) => issue.severity === "error").length;
  const warnings = report.issues.filter((issue) => issue.severity === "warning").length;
  const overlapCount = report.issues.filter((issue) => issue.kind === "overlap").length;
  const speakerStats = useMemo(() => {
    const map = new Map<string, { count: number; duration: number; pending: number }>();
    for (const group of state.doc.groups) {
      const key = group.speaker?.trim() || "未标注";
      const current = map.get(key) ?? { count: 0, duration: 0, pending: 0 };
      current.count += 1;
      current.duration += Math.max(0, group.endMs - group.startMs);
      if ((group.reviewStatus ?? "draft") !== "reviewed") current.pending += 1;
      map.set(key, current);
    }
    return [...map.entries()].sort((a, b) => b[1].duration - a[1].duration);
  }, [state.doc.groups]);

  const focusIssue = (issue: CaptionQualityIssue) => {
    const group = state.doc.groups.find((item) => item.id === issue.groupId);
    if (!group) return;
    dispatch({ type: "SELECT", selection: { groupIds: [group.id], unitIds: [] } });
    dispatch({ type: "SET_CURRENT_MS", ms: group.startMs });
  };

  const repairAll = () => {
    const next = repairCaptionTiming(
      state.doc.groups,
      report.repairableGroupIds,
      state.doc.durationMs,
      state.doc.qualityProfile,
    );
    if (next.every((group, index) => group.endMs === state.doc.groups[index]?.endMs)) {
      toast.info("没有可安全延长的字幕");
      return;
    }
    dispatch({ type: "SET_GROUPS", groups: next, commit: true });
    toast.success(`已优化 ${report.repairableGroupIds.length} 条字幕的停留时间`);
  };

  const splitLongCaptions = () => {
    const next = repairCaptionSegmentation(
      state.doc.groups,
      report.segmentableGroupIds,
      state.doc.qualityProfile,
    );
    if (next.length === state.doc.groups.length) {
      toast.info("没有可安全拆分的长字幕");
      return;
    }
    dispatch({ type: "SET_GROUPS", groups: next, commit: true });
    toast.success(`已按停顿拆分 ${report.segmentableGroupIds.length} 条长字幕`);
  };

  const fixOverlaps = () => {
    if (overlapCount === 0) return;
    dispatch({ type: "SET_GROUPS", groups: repairCaptionOverlaps(state.doc.groups), commit: true });
    toast.success(`已修复 ${overlapCount} 处时间重叠`);
  };

  if (state.doc.groups.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
        <Gauge className="h-6 w-6 text-foreground/30" />
        <p className="text-xs text-foreground/50">完成语音识别后，可在这里检查字幕阅读体验。</p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-border/60 px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold">字幕节奏体检</p>
            <p className="mt-0.5 text-[11px] text-foreground/50">阅读速度、停留时间、文本长度与时间重叠</p>
          </div>
          <div className={cn(
            "flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold tabular-nums",
            report.score >= 90 ? "bg-success/15 text-success" : report.score >= 70 ? "bg-warning/15 text-warning-foreground" : "bg-destructive/10 text-destructive",
          )}>
            {report.score}
          </div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-1 rounded-md bg-foreground/5 p-0.5">
          {Object.entries(captionQualityProfiles).map(([id, value]) => (
            <button
              key={id}
              onClick={() => dispatch({ type: "SET_QUALITY_PROFILE", profile: id as keyof typeof captionQualityProfiles })}
              className={cn(
                "min-w-0 rounded px-1.5 py-1.5 text-[11px] font-medium transition-colors",
                state.doc.qualityProfile === id
                  ? "bg-card text-foreground shadow-soft"
                  : "text-foreground/55 hover:bg-foreground/5",
              )}
              title={value.hint}
            >
              {value.label}
            </button>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-3 text-[11px] text-foreground/60">
          <span>{errors} 个错误</span>
          <span>{warnings} 个需关注</span>
          <span>{report.issues.length} 个问题</span>
        </div>
        {report.repairableGroupIds.length > 0 && (
          <button
            onClick={repairAll}
            className="mt-3 flex h-8 w-full items-center justify-center gap-1.5 rounded-md bg-primary text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <WandSparkles className="h-3.5 w-3.5" />
            一键延长 {report.repairableGroupIds.length} 条字幕
          </button>
        )}
        {report.segmentableGroupIds.length > 0 && (
          <button
            onClick={splitLongCaptions}
            className="mt-2 flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-primary/25 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
          >
            <Scissors className="h-3.5 w-3.5" />
            按停顿拆分 {report.segmentableGroupIds.length} 条长字幕
          </button>
        )}
        {overlapCount > 0 && (
          <button
            onClick={fixOverlaps}
            className="mt-2 flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-destructive/25 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10"
          >
            修复 {overlapCount} 处时间重叠
          </button>
        )}
      </div>

      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-2">
        <div className="mb-3 rounded-md border border-border/60 p-2.5">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium">说话人与审校分布</span>
            <span className="text-[10px] text-foreground/45">{speakerStats.length} 位</span>
          </div>
          <div className="space-y-1.5">
            {speakerStats.slice(0, 5).map(([speaker, stat]) => (
              <div key={speaker} className="flex items-center justify-between gap-2 text-[11px]">
                <span className="min-w-0 truncate text-foreground/75">{speaker}</span>
                <span className="shrink-0 tabular-nums text-foreground/50">{stat.count} 条 · {stat.pending} 待审</span>
              </div>
            ))}
          </div>
        </div>
        {report.issues.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
            <CheckCircle2 className="h-7 w-7 text-success" />
            <p className="text-sm font-medium">阅读节奏良好</p>
            <p className="text-xs text-foreground/50">当前字幕没有检测到需要处理的可读性问题。</p>
          </div>
        ) : (
          <ul className="space-y-1.5">
            {report.issues.map((issue) => (
              <li key={issue.id}>
                <button
                  onClick={() => focusIssue(issue)}
                  className="flex w-full items-start gap-2 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-foreground/5"
                >
                  <span className={cn("mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md", severityClass[issue.severity])}>
                    <IssueIcon issue={issue} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs font-medium">{issue.message}</span>
                    <span className="mt-0.5 block text-[11px] leading-4 text-foreground/55">{issue.detail}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
