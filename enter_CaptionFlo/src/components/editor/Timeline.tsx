import { useMemo, useRef, useState } from "react";
import { Scissors, Film, Captions } from "lucide-react";
import { useEditor } from "@/state/EditorContext";
import { formatClock, isGroupEstimated } from "@/lib/editorUtils";
import { graphemesOf } from "@/types/captionModel";
import { cn } from "@/lib/utils";
import type { CaptionGroup } from "@/types/captionModel";

const PX_PER_SEC = 80;

export function Timeline() {
  const { state, dispatch } = useEditor();
  const { doc, currentMs, mode } = state;
  const scrollRef = useRef<HTMLDivElement>(null);

  const durationMs = doc.durationMs || 20000;
  const totalWidth = (durationMs / 1000) * PX_PER_SEC;

  const ticks = useMemo(() => {
    const arr: number[] = [];
    const step = 1000; // 1s
    for (let ms = 0; ms <= durationMs; ms += step) arr.push(ms);
    return arr;
  }, [durationMs]);

  const msToX = (ms: number) => (ms / 1000) * PX_PER_SEC;

  const handleRulerClick = (e: React.MouseEvent) => {
    if (mode === "cut") return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left + (scrollRef.current?.scrollLeft ?? 0);
    dispatch({ type: "SET_CURRENT_MS", ms: (x / PX_PER_SEC) * 1000 });
  };

  return (
    <div className="glass-panel flex h-full flex-col rounded-xl">
      <div className="flex items-center justify-between px-4 py-2">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">时间轴</h2>
          {mode === "cut" && (
            <span className="flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary">
              <Scissors className="h-3 w-3" /> 切割模式：点击字幕文字位置进行拆分
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-[11px] text-foreground/50">
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-timing-asr" /> 已校准
          </span>
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-timing-estimated" /> 估算
          </span>
        </div>
      </div>

      <div ref={scrollRef} className="scrollbar-thin relative flex-1 overflow-x-auto overflow-y-hidden">
        <div className="relative" style={{ width: Math.max(totalWidth, 800) }}>
          {/* Ruler */}
          <div
            className="relative h-6 border-b border-border/60 bg-background/40"
            onClick={handleRulerClick}
          >
            {ticks.map((ms) => (
              <div
                key={ms}
                className="absolute top-0 flex h-full flex-col justify-between"
                style={{ left: msToX(ms) }}
              >
                <span className="pl-1 text-[10px] tabular-nums text-foreground/40">
                  {formatClock(ms)}
                </span>
                <span className="h-1.5 w-px bg-border" />
              </div>
            ))}
          </div>

          {/* Video track */}
          <TrackLabelRow icon={<Film className="h-3 w-3" />} label="视频">
            <div className="mx-0 my-1 h-8 rounded-md bg-gradient-to-r from-foreground/15 to-foreground/5 ring-1 ring-inset ring-foreground/10" style={{ width: totalWidth }} />
          </TrackLabelRow>

          {/* Subtitle track */}
          <TrackLabelRow icon={<Captions className="h-3 w-3" />} label="字幕">
            <div className="relative h-11" style={{ width: totalWidth }}>
              {doc.groups.map((g) => (
                <SubtitleClip
                  key={g.id}
                  group={g}
                  x={msToX(g.startMs)}
                  width={Math.max(msToX(g.endMs - g.startMs), 12)}
                />
              ))}
            </div>
          </TrackLabelRow>

          {/* Playhead */}
          <div
            className="pointer-events-none absolute bottom-0 top-0 z-20 w-px bg-primary"
            style={{ left: msToX(currentMs) }}
          >
            <div className="absolute -left-1.5 -top-0.5 h-3 w-3 rounded-full bg-primary shadow" />
          </div>
        </div>
      </div>
    </div>
  );
}

function TrackLabelRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex items-stretch">
      <div className="sticky left-0 z-10 flex w-16 shrink-0 items-center gap-1 border-r border-border/60 bg-background/60 px-2 text-[11px] text-foreground/50 backdrop-blur">
        {icon}
        {label}
      </div>
      <div className="flex-1 px-1 py-0.5">{children}</div>
    </div>
  );
}

function SubtitleClip({
  group,
  x,
  width,
}: {
  group: CaptionGroup;
  x: number;
  width: number;
}) {
  const { state, dispatch } = useEditor();
  const selected = state.doc.selection.groupIds.includes(group.id);
  const estimated = isGroupEstimated(group);
  const isCut = state.mode === "cut";
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const graphemes = graphemesOf(group.text);

  const handleClick = (e: React.MouseEvent) => {
    if (isCut) {
      if (hoverIndex !== null && hoverIndex > 0 && hoverIndex < graphemes.length) {
        dispatch({ type: "SPLIT_GROUP", groupId: group.id, graphemeIndex: hoverIndex });
      }
      return;
    }
    if (e.metaKey || e.ctrlKey) {
      const ids = state.doc.selection.groupIds;
      const next = ids.includes(group.id)
        ? ids.filter((id) => id !== group.id)
        : [...ids, group.id];
      dispatch({ type: "SELECT", selection: { groupIds: next, unitIds: [] } });
    } else {
      dispatch({ type: "SELECT", selection: { groupIds: [group.id], unitIds: [] } });
      dispatch({ type: "SET_CURRENT_MS", ms: group.startMs });
    }
  };

  const handleMove = (e: React.MouseEvent) => {
    if (!isCut) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    setHoverIndex(Math.round(ratio * graphemes.length));
  };

  return (
    <div
      onClick={handleClick}
      onMouseMove={handleMove}
      onMouseLeave={() => setHoverIndex(null)}
      className={cn(
        "absolute top-1 flex h-9 items-center overflow-hidden rounded-md px-2 text-[11px] transition-colors",
        isCut ? "cursor-crosshair" : "cursor-pointer",
        selected
          ? "bg-primary/25 ring-2 ring-primary"
          : "bg-primary/12 ring-1 ring-inset ring-primary/25 hover:bg-primary/20",
      )}
      style={{ left: x, width }}
      title={group.text}
    >
      <span
        className={cn(
          "absolute left-0 top-0 h-full w-0.5",
          estimated ? "bg-timing-estimated" : "bg-timing-asr",
        )}
      />
      <span className="truncate pl-1 text-foreground/85">{group.text}</span>

      {/* Cut hint line */}
      {isCut && hoverIndex !== null && hoverIndex > 0 && hoverIndex < graphemes.length && (
        <span
          className="pointer-events-none absolute inset-y-0 z-10 w-px border-l border-dashed border-primary"
          style={{ left: `${(hoverIndex / graphemes.length) * 100}%` }}
        >
          <Scissors className="absolute -left-1.5 -top-1 h-3 w-3 text-primary" />
        </span>
      )}
    </div>
  );
}
