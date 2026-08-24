import { useMemo, useState } from "react";
import { Search, ListFilter, Captions } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useEditor } from "@/state/EditorContext";
import { formatMs, isGroupEstimated } from "@/lib/editorUtils";
import { cn } from "@/lib/utils";
import type { CaptionGroup } from "@/types/captionModel";

export function SubtitleList() {
  const { state, dispatch } = useEditor();
  const [query, setQuery] = useState("");
  const [onlyEstimated, setOnlyEstimated] = useState(false);
  const { groups, selection } = state.doc;

  const filtered = useMemo(() => {
    return groups.filter((g) => {
      if (query && !g.text.toLowerCase().includes(query.toLowerCase())) return false;
      if (onlyEstimated && !isGroupEstimated(g)) return false;
      return true;
    });
  }, [groups, query, onlyEstimated]);

  const handleSelect = (group: CaptionGroup, e: React.MouseEvent) => {
    const ids = selection.groupIds;
    if (e.metaKey || e.ctrlKey) {
      const next = ids.includes(group.id)
        ? ids.filter((id) => id !== group.id)
        : [...ids, group.id];
      dispatch({ type: "SELECT", selection: { groupIds: next, unitIds: [] } });
    } else if (e.shiftKey && ids.length > 0) {
      const all = filtered.map((g) => g.id);
      const last = all.indexOf(ids[ids.length - 1]);
      const curr = all.indexOf(group.id);
      const [from, to] = [Math.min(last, curr), Math.max(last, curr)];
      dispatch({ type: "SELECT", selection: { groupIds: all.slice(from, to + 1), unitIds: [] } });
    } else {
      dispatch({ type: "SELECT", selection: { groupIds: [group.id], unitIds: [] } });
      dispatch({ type: "SET_CURRENT_MS", ms: group.startMs });
    }
  };

  return (
    <aside className="glass-panel flex h-full w-72 flex-col rounded-xl">
      <div className="flex items-center justify-between px-4 pb-2 pt-3.5">
        <div className="flex items-center gap-2">
          <Captions className="h-4 w-4 text-foreground/60" />
          <h2 className="text-sm font-semibold">字幕列表</h2>
          <span className="rounded-full bg-foreground/10 px-1.5 py-0.5 text-[11px] tabular-nums text-foreground/60">
            {groups.length}
          </span>
        </div>
        <button
          onClick={() => setOnlyEstimated((v) => !v)}
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-md transition-colors",
            onlyEstimated ? "bg-primary/15 text-primary" : "text-foreground/50 hover:bg-foreground/5",
          )}
          title="仅显示估算时间戳"
        >
          <ListFilter className="h-4 w-4" />
        </button>
      </div>

      <div className="px-3 pb-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-foreground/40" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索字幕文本"
            className="h-8 border-transparent bg-foreground/5 pl-8 text-xs"
          />
        </div>
      </div>

      <div className="scrollbar-thin flex-1 overflow-y-auto px-2 pb-3">
        {filtered.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
            <p className="text-xs text-foreground/40">
              {groups.length === 0 ? "暂无字幕，先进行语音识别" : "没有匹配的字幕"}
            </p>
          </div>
        ) : (
          <ul className="space-y-1.5">
            {filtered.map((g) => {
              const selected = selection.groupIds.includes(g.id);
              const estimated = isGroupEstimated(g);
              return (
                <li key={g.id}>
                  <button
                    onClick={(e) => handleSelect(g, e)}
                    className={cn(
                      "group relative w-full rounded-lg px-3 py-2.5 text-left transition-colors",
                      selected
                        ? "bg-primary/10 ring-1 ring-primary/30"
                        : "hover:bg-foreground/5",
                    )}
                  >
                    {selected && (
                      <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-primary" />
                    )}
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[11px] tabular-nums text-foreground/55">
                        {formatMs(g.startMs)} → {formatMs(g.endMs)}
                      </span>
                      <span
                        className={cn(
                          "flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                          estimated
                            ? "bg-timing-estimated/15 text-timing-estimated"
                            : "bg-timing-asr/15 text-timing-asr",
                        )}
                        title={
                          estimated
                            ? "估算时间戳：由拆分/合并或平均推算，建议人工微调"
                            : "已校准时间戳：来自语音识别逐词对齐"
                        }
                      >
                        <span
                          className={cn(
                            "h-1.5 w-1.5 rounded-full",
                            estimated ? "bg-timing-estimated" : "bg-timing-asr",
                          )}
                        />
                        {estimated ? "估算" : "校准"}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-foreground/90">
                      {g.text || "（空字幕）"}
                    </p>
                    {g.speaker && (
                      <span className="mt-1 inline-flex rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                        {g.speaker}
                      </span>
                    )}
                    {(g.reviewStatus ?? "draft") !== "draft" && (
                      <span className={cn(
                        "ml-1 inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium",
                        g.reviewStatus === "reviewed"
                          ? "bg-success/15 text-success"
                          : "bg-warning/15 text-warning",
                      )}>
                        {g.reviewStatus === "reviewed" ? "已审校" : "待复核"}
                      </span>
                    )}
                    {g.secondaryText && (
                      <p className="mt-1 line-clamp-1 text-[11px] leading-4 text-foreground/50">
                        {g.secondaryText}
                      </p>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}
