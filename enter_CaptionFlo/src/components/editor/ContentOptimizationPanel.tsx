import { useMemo, useRef, useState } from "react";
import { BookText, FileOutput, Highlighter, Languages, MessageSquareText, Plus, Replace, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import {
  applyKeywordHighlights,
  findFillerWordIssues,
  findKeywordHighlightIssues,
  repairFillerWords,
} from "@/lib/captionTextTools";
import { applyCaptionGlossary, findCaptionGlossaryIssues } from "@/lib/captionGlossary";
import { analyzeBilingualCaptions, prepareSecondaryCaptions } from "@/lib/bilingualQuality";
import {
  buildContentPackageMarkdown,
  buildContentPackageJson,
  buildCaptionReviewCsv,
  buildCaptionGlossaryCsv,
  importCaptionGlossaryCsv,
  importCaptionReviewCsv,
  captionReviewFilename,
  contentPackageFilename,
  contentPackageJsonFilename,
  deriveContentChapters,
  deriveContentHighlights,
} from "@/lib/contentPackage";
import { useEditor } from "@/state/EditorContext";

export function ContentOptimizationPanel() {
  const { state, dispatch } = useEditor();
  const reviewFileRef = useRef<HTMLInputElement>(null);
  const glossaryFileRef = useRef<HTMLInputElement>(null);
  const [searchText, setSearchText] = useState("");
  const [replacementText, setReplacementText] = useState("");
  const [preferredTerm, setPreferredTerm] = useState("");
  const [termVariants, setTermVariants] = useState("");
  const replaceCount = useMemo(
    () => searchText ? state.doc.groups.filter((group) => group.text.includes(searchText)).length : 0,
    [searchText, state.doc.groups],
  );
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
  const glossaryIssues = useMemo(
    () => findCaptionGlossaryIssues(state.doc.groups, state.doc.glossary)
      .filter((issue) => !state.doc.groups.find((group) => group.id === issue.groupId)?.locked),
    [state.doc.glossary, state.doc.groups],
  );
  const bilingualIssues = useMemo(() => analyzeBilingualCaptions(state.doc.groups), [state.doc.groups]);
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

  const importReviewSheet = async (file: File) => {
    const csv = await file.text();
    const result = importCaptionReviewCsv(csv, state.doc.groups);
    if (result.updated === 0) {
      toast.error("没有找到可匹配的字幕时间码");
      return;
    }
    dispatch({ type: "SET_GROUPS", groups: result.groups, commit: true });
    toast.success(`已回导 ${result.updated} 条审校记录`);
  };

  const addGlossaryEntry = () => {
    const preferred = preferredTerm.trim();
    const variants = [...new Set(termVariants.split(/[，,\n]/u).map((value) => value.trim()).filter((value) => value && value !== preferred))];
    if (!preferred || variants.length === 0) {
      toast.error("请填写标准术语和至少一个旧写法");
      return;
    }
    dispatch({
      type: "SET_GLOSSARY",
      glossary: [...state.doc.glossary, { id: `term-${Date.now()}`, preferred, variants }],
    });
    setPreferredTerm("");
    setTermVariants("");
  };

  const applyGlossary = () => {
    const next = applyCaptionGlossary(state.doc.groups, state.doc.glossary);
    if (next.every((group, index) => group.text === state.doc.groups[index]?.text)) {
      toast.info("术语已保持一致");
      return;
    }
    dispatch({ type: "SET_GROUPS", groups: next, commit: true });
    toast.success(`已统一 ${glossaryIssues.length} 处术语写法`);
  };

  const exportGlossary = () => {
    const csv = buildCaptionGlossaryCsv(state.doc.glossary);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${state.doc.projectName || "captions"}-glossary.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  const importGlossary = async (file: File) => {
    const entries = importCaptionGlossaryCsv(await file.text());
    if (entries.length === 0) {
      toast.error("未找到可导入的术语表记录");
      return;
    }
    const seen = new Set(state.doc.glossary.map((entry) => entry.preferred.toLocaleLowerCase()));
    const merged = [...state.doc.glossary];
    entries.forEach((entry) => {
      if (seen.has(entry.preferred.toLocaleLowerCase())) return;
      seen.add(entry.preferred.toLocaleLowerCase());
      merged.push({ ...entry, id: `term-${Date.now()}-${merged.length + 1}` });
    });
    dispatch({ type: "SET_GLOSSARY", glossary: merged });
    toast.success(`已导入 ${merged.length - state.doc.glossary.length} 个术语`);
  };

  const prepareSecondary = () => {
    const next = prepareSecondaryCaptions(state.doc.groups);
    const added = next.filter((group, index) => group.secondaryText !== state.doc.groups[index]?.secondaryText).length;
    if (added === 0) {
      toast.info("没有缺失的副字幕需要准备");
      return;
    }
    dispatch({ type: "SET_GROUPS", groups: next, commit: true });
    toast.success(`已为 ${added} 条字幕创建待翻译副字幕`);
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
      <input
        ref={reviewFileRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void importReviewSheet(file);
        }}
      />
      <input
        ref={glossaryFileRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void importGlossary(file);
        }}
      />
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
        <div className="mb-3 border-b border-border/60 px-2 pb-3">
          <div className="flex items-center gap-2">
            <Replace className="h-4 w-4 text-primary" />
            <div>
              <p className="text-xs font-medium">查找与替换</p>
              <p className="mt-0.5 text-[11px] text-foreground/50">修改文本会清空受影响字幕的逐字时间</p>
            </div>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <input value={searchText} onChange={(e) => setSearchText(e.target.value)} placeholder="查找" className="h-8 rounded-md border border-input bg-card px-2 text-xs" />
            <input value={replacementText} onChange={(e) => setReplacementText(e.target.value)} placeholder="替换为" className="h-8 rounded-md border border-input bg-card px-2 text-xs" />
          </div>
          <button
            disabled={!searchText || replaceCount === 0}
            onClick={() => {
              dispatch({ type: "REPLACE_TEXT", search: searchText, replacement: replacementText });
              toast.success(`已替换 ${replaceCount} 条字幕`);
            }}
            className="mt-2 flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-primary/25 text-xs font-medium text-primary transition-colors hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            替换全部（{replaceCount} 条）
          </button>
        </div>
        <div className="mb-3 border-b border-border/60 px-2 pb-3">
          <div className="flex items-center gap-2">
            <BookText className="h-4 w-4 text-primary" />
            <div>
              <p className="text-xs font-medium">项目术语表</p>
              <p className="mt-0.5 text-[11px] text-foreground/50">{state.doc.glossary.length} 个术语，{glossaryIssues.length} 处待统一</p>
            </div>
          </div>
          <div className="mt-2 grid grid-cols-[1fr_1.25fr_auto] gap-1.5">
            <input value={preferredTerm} onChange={(event) => setPreferredTerm(event.target.value)} placeholder="标准写法" className="h-8 min-w-0 rounded-md border border-input bg-card px-2 text-xs" />
            <input value={termVariants} onChange={(event) => setTermVariants(event.target.value)} placeholder="旧写法，逗号分隔" className="h-8 min-w-0 rounded-md border border-input bg-card px-2 text-xs" />
            <button onClick={addGlossaryEntry} className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-foreground/65 hover:bg-foreground/5" title="添加术语"><Plus className="h-4 w-4" /></button>
          </div>
          {state.doc.glossary.length > 0 && (
            <>
              <div className="mt-2 space-y-1">
                {state.doc.glossary.map((entry) => (
                  <div key={entry.id} className="flex items-center gap-2 rounded-md bg-foreground/5 px-2 py-1.5 text-[11px]">
                    <span className="min-w-0 flex-1 truncate font-medium">{entry.preferred}</span>
                    <span className="min-w-0 flex-[1.5] truncate text-foreground/50">{entry.variants.join("、")}</span>
                    <button
                      onClick={() => dispatch({ type: "SET_GLOSSARY", glossary: state.doc.glossary.filter((item) => item.id !== entry.id) })}
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-foreground/45 hover:bg-foreground/10 hover:text-destructive"
                      title="移除术语"
                    ><X className="h-3.5 w-3.5" /></button>
                  </div>
                ))}
              </div>
              <button
                disabled={glossaryIssues.length === 0}
                onClick={applyGlossary}
                className="mt-2 flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-primary/25 text-xs font-medium text-primary transition-colors hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <BookText className="h-3.5 w-3.5" />
                统一术语（{glossaryIssues.length} 处）
              </button>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button onClick={exportGlossary} className="flex h-8 items-center justify-center gap-1 rounded-md border border-border text-xs text-foreground/70 hover:bg-foreground/5"><FileOutput className="h-3.5 w-3.5" />导出术语表</button>
                <button onClick={() => glossaryFileRef.current?.click()} className="flex h-8 items-center justify-center gap-1 rounded-md border border-border text-xs text-foreground/70 hover:bg-foreground/5"><BookText className="h-3.5 w-3.5" />导入术语表</button>
              </div>
            </>
          )}
        </div>
        <div className="mb-3 border-b border-border/60 px-2 pb-3">
          <div className="flex items-center gap-2">
            <Languages className="h-4 w-4 text-primary" />
            <div>
              <p className="text-xs font-medium">双语交付检查</p>
              <p className="mt-0.5 text-[11px] text-foreground/50">{bilingualIssues.length ? `${bilingualIssues.length} 条需要处理` : "副字幕已具备交付条件"}</p>
            </div>
          </div>
          {bilingualIssues.length > 0 && (
            <>
              <button onClick={prepareSecondary} className="mt-2 flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-primary/25 text-xs font-medium text-primary hover:bg-primary/10">
                <Languages className="h-3.5 w-3.5" />创建缺失的待翻译副字幕
              </button>
              <div className="mt-2 space-y-1">
                {bilingualIssues.slice(0, 3).map((issue) => (
                  <button key={`${issue.groupId}-${issue.kind}`} onClick={() => focusIssue(issue.groupId)} className="block w-full truncate rounded px-1.5 py-1 text-left text-[11px] text-foreground/55 hover:bg-foreground/5">{issue.message}</button>
                ))}
              </div>
            </>
          )}
        </div>
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
            onClick={() => reviewFileRef.current?.click()}
            className="mt-2 flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-border text-xs font-medium text-foreground/75 transition-colors hover:bg-foreground/5"
          >
            <FileOutput className="h-3.5 w-3.5" />
            回导审校 CSV
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
