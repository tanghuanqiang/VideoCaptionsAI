import { useMemo } from "react";
import { FileOutput, Highlighter, MessageSquareText, Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
  applyKeywordHighlights,
  findFillerWordIssues,
  findKeywordHighlightIssues,
  repairFillerWords,
} from "@/lib/captionTextTools";
import {
  buildContentPackageMarkdown,
  buildContentPackageJson,
  buildCaptionReviewCsv,
  captionReviewFilename,
  contentPackageFilename,
  contentPackageJsonFilename,
  deriveContentChapters,
  deriveContentHighlights,
} from "@/lib/contentPackage";
import { useEditor } from "@/state/EditorContext";

export function ContentOptimizationPanel() {
  const { state, dispatch } = useEditor();
  const fillerIssues = useMemo(
    () => findFillerWordIssues(state.doc.groups),
    [state.doc.groups],
  );
  const totalFillers = fillerIssues.reduce((total, issue) => total + issue.count, 0);
  const keywordIssues = useMemo(
    () => findKeywordHighlightIssues(state.doc.groups),
    [state.doc.groups],
  );
  const keywordCount = keywordIssues.reduce((total, issue) => total + issue.terms.length, 0);
  const chapters = useMemo(() => deriveContentChapters(state.doc.groups), [state.doc.groups]);
  const highlights = useMemo(() => deriveContentHighlights(state.doc.groups), [state.doc.groups]);

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

  const highlightKeywords = () => {
    const next = applyKeywordHighlights(
      state.doc.groups,
      keywordIssues.map((issue) => issue.groupId),
    );
    if (next.every((group, index) => group.units === state.doc.groups[index]?.units)) {
      toast.info("没有可安全强调的数字或术语");
      return;
    }
    dispatch({ type: "SET_GROUPS", groups: next, commit: true });
    toast.success(`已强调 ${keywordCount} 个数字或术语`);
  };

  const exportContentPackage = () => {
    const markdown = buildContentPackageMarkdown(state.doc.projectName, state.doc.groups);
    const url = URL.createObjectURL(new Blob([markdown], { type: "text/markdown;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = contentPackageFilename(state.doc.projectName);
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    toast.success("内容清单已导出");
  };

  const exportContentPackageJson = () => {
    const json = buildContentPackageJson(state.doc.projectName, state.doc.groups);
    const url = URL.createObjectURL(new Blob([json], { type: "application/json;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = contentPackageJsonFilename(state.doc.projectName);
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    toast.success("内容清单 JSON 已导出");
  };

  const exportReviewSheet = () => {
    const csv = buildCaptionReviewCsv(state.doc.groups);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = captionReviewFilename(state.doc.projectName);
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    toast.success("审校表已导出");
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
        {fillerIssues.length === 0 && keywordCount === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
            <MessageSquareText className="h-7 w-7 text-success" />
            <p className="text-sm font-medium">文稿节奏干净</p>
            <p className="text-xs text-foreground/50">没有检测到可安全清理或强调的内容。</p>
          </div>
        ) : fillerIssues.length === 0 ? (
          <div className="flex items-center gap-2 rounded-md px-2.5 py-2 text-foreground/55">
            <MessageSquareText className="h-4 w-4 text-success" />
            <p className="text-xs">没有检测到可安全清理的口头填充词。</p>
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

        <div className="mt-3 border-t border-border/60 px-2 pt-3">
          <div className="flex items-center gap-2">
            <Highlighter className="h-4 w-4 text-primary" />
            <div>
              <p className="text-xs font-medium">数字与术语强调</p>
              <p className="mt-0.5 text-[11px] text-foreground/50">不会覆盖已有逐字设计</p>
            </div>
          </div>
          {keywordCount > 0 ? (
            <>
              <button
                onClick={highlightKeywords}
                className="mt-2 flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-primary/25 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
              >
                <Highlighter className="h-3.5 w-3.5" />
                强调 {keywordCount} 个数字与术语
              </button>
              <p className="mt-2 truncate text-[11px] text-foreground/55">
                {keywordIssues.flatMap((issue) => issue.terms).join("、")}
              </p>
            </>
          ) : (
            <p className="mt-2 text-[11px] text-foreground/50">没有可安全自动强调的内容。</p>
          )}
        </div>

        <div className="mt-3 border-t border-border/60 px-2 pt-3">
          <div className="flex items-center gap-2">
            <FileOutput className="h-4 w-4 text-primary" />
            <div>
              <p className="text-xs font-medium">章节与高光清单</p>
              <p className="mt-0.5 text-[11px] text-foreground/50">
                {chapters.length} 个章节候选，{highlights.length} 个高光候选
              </p>
            </div>
          </div>
          <button
            onClick={exportContentPackage}
            className="mt-2 flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-primary/25 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
          >
            <FileOutput className="h-3.5 w-3.5" />
            导出内容清单
          </button>
          <button
            onClick={exportReviewSheet}
            className="mt-2 flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-border text-xs font-medium text-foreground/75 transition-colors hover:bg-foreground/5"
          >
            <FileOutput className="h-3.5 w-3.5" />
            导出审校 CSV
          </button>
          <button
            onClick={exportContentPackageJson}
            className="mt-2 flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-border text-xs font-medium text-foreground/75 transition-colors hover:bg-foreground/5"
          >
            <FileOutput className="h-3.5 w-3.5" />
            导出内容清单 JSON
          </button>
        </div>
      </div>
    </div>
  );
}
