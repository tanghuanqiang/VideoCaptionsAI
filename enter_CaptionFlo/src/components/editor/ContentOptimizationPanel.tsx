import { useMemo } from "react";
import { MessageSquareText, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { findFillerWordIssues, repairFillerWords } from "@/lib/captionTextTools";
import { useEditor } from "@/state/EditorContext";

export function ContentOptimizationPanel() {
  const { state, dispatch } = useEditor();
  const fillerIssues = useMemo(
    () => findFillerWordIssues(state.doc.groups),
    [state.doc.groups],
  );
  const totalFillers = fillerIssues.reduce((total, issue) => total + issue.count, 0);

  const focusIssue = (groupId: string) => {
    const group = state.doc.groups.find((item) => item.id === groupId);
    if (!group) return;
    dispatch({ type: "SELECT", selection: { groupIds: [group.id], unitIds: [] } });
    dispatch({ type: "SET_CURRENT_MS", ms: group.startMs });
  };

  const cleanFillers = () => {
    const next = repairFillerWords(
      state.doc.groups,
      fillerIssues.map((issue) => issue.groupId),
    );
    if (next.every((group, index) => group.text === state.doc.groups[index]?.text)) {
      toast.info("没有可安全清理的口头词");
      return;
    }
    dispatch({ type: "SET_GROUPS", groups: next, commit: true });
    toast.success(`已清理 ${totalFillers} 处口头填充词`);
  };

  if (state.doc.groups.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
        <MessageSquareText className="h-6 w-6 text-foreground/30" />
        <p className="text-xs text-foreground/50">完成语音识别后，可在这里处理文稿节奏。</p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-border/60 px-4 py-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <div>
            <p className="text-sm font-semibold">文稿优化</p>
            <p className="mt-0.5 text-[11px] text-foreground/50">口头填充词仅改字幕文字，不剪辑音频</p>
          </div>
        </div>
        {totalFillers > 0 && (
          <button
            onClick={cleanFillers}
            className="mt-3 flex h-8 w-full items-center justify-center gap-1.5 rounded-md bg-primary text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Sparkles className="h-3.5 w-3.5" />
            清理 {totalFillers} 处口头词
          </button>
        )}
      </div>

      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-2">
        {fillerIssues.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
            <MessageSquareText className="h-7 w-7 text-success" />
            <p className="text-sm font-medium">文稿节奏干净</p>
            <p className="text-xs text-foreground/50">没有检测到可安全清理的口头填充词。</p>
          </div>
        ) : (
          <ul className="space-y-1.5">
            {fillerIssues.map((issue) => (
              <li key={issue.groupId}>
                <button
                  onClick={() => focusIssue(issue.groupId)}
                  className="flex w-full items-start gap-2 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-foreground/5"
                >
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <MessageSquareText className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs font-medium">检测到 {issue.count} 处口头填充词</span>
                    <span className="mt-0.5 block truncate text-[11px] leading-4 text-foreground/55">
                      {issue.tokens.join("、")}
                    </span>
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
