import { useRef, useState } from "react";
import {
  FileVideo,
  FolderOpen,
  Sparkles,
  Save,
  Download,
  Sun,
  Moon,
  Keyboard,
  Scissors,
  Pencil,
  Undo2,
  Redo2,
  ChevronDown,
  Bot,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useEditor } from "@/state/EditorContext";
import { recognitionQualities, type RecognitionQuality } from "@/constants";
import type { Theme } from "@/hooks/useTheme";
import { cn } from "@/lib/utils";

interface TopBarProps {
  theme: Theme;
  onToggleTheme: () => void;
  quality: RecognitionQuality;
  onQualityChange: (q: RecognitionQuality) => void;
  onImportVideo: () => void;
  onImportProject: () => void;
  onRunAsr: () => void;
  onSave: () => void;
  onExport: (kind: "subtitle" | "video") => void;
  onShowShortcuts: () => void;
  onToggleCopilot: () => void;
}

export function TopBar(props: TopBarProps) {
  const { state, dispatch, canUndo, canRedo } = useEditor();
  const { doc, mode, video, asr } = state;
  const [editingName, setEditingName] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  const hasVideo = video === "loaded";
  const asrBusy = asr.status === "running";

  return (
    <header className="glass-panel z-30 flex h-14 shrink-0 items-center gap-3 rounded-xl px-4">
      {/* Left: product + project */}
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Sparkles className="h-4 w-4" />
        </div>
        <div className="min-w-0 leading-tight">
          <p className="text-[11px] text-foreground/50">AI 字幕工作台</p>
          {editingName ? (
            <input
              ref={nameRef}
              defaultValue={doc.projectName}
              autoFocus
              onBlur={(e) => {
                dispatch({ type: "SET_PROJECT_NAME", name: e.target.value || "未命名项目" });
                setEditingName(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
              className="w-40 rounded border border-primary bg-card px-1 text-sm font-medium outline-none"
            />
          ) : (
            <button
              onClick={() => setEditingName(true)}
              className="truncate text-sm font-medium hover:text-primary"
              title="点击重命名项目"
            >
              {doc.projectName}
            </button>
          )}
        </div>
      </div>

      <div className="mx-1 h-6 w-px bg-border" />

      {/* Center: workflow */}
      <div className="flex items-center gap-1.5">
        <Button variant="subtle" size="sm" onClick={props.onImportVideo}>
          <FileVideo /> 导入视频
        </Button>
        <Button variant="subtle" size="sm" onClick={props.onImportProject}>
          <FolderOpen /> 导入项目
        </Button>

        {/* ASR + quality */}
        <div className="flex items-center overflow-hidden rounded-md">
          <Button
            variant="default"
            size="sm"
            className="rounded-r-none"
            disabled={!hasVideo || asrBusy}
            onClick={props.onRunAsr}
          >
            <Sparkles /> {asrBusy ? "识别中…" : "语音识别"}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="default"
                size="sm"
                className="rounded-l-none border-l border-primary-foreground/20 px-1.5"
                disabled={!hasVideo || asrBusy}
              >
                <ChevronDown />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel>识别质量</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={props.quality}
                onValueChange={(v) => props.onQualityChange(v as RecognitionQuality)}
              >
                {recognitionQualities.map((q) => (
                  <DropdownMenuRadioItem key={q.value} value={q.value}>
                    <div>
                      <p className="text-sm">{q.label}</p>
                      <p className="text-[11px] text-foreground/50">{q.hint}</p>
                    </div>
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Edit / Cut mode toggle */}
        <div className="ml-1 flex items-center overflow-hidden rounded-md bg-foreground/5 p-0.5">
          <button
            onClick={() => dispatch({ type: "SET_MODE", mode: "edit" })}
            className={cn(
              "flex items-center gap-1 rounded px-2.5 py-1 text-xs transition-colors",
              mode === "edit" ? "bg-card shadow-soft" : "text-foreground/60",
            )}
          >
            <Pencil className="h-3.5 w-3.5" /> 编辑
          </button>
          <button
            onClick={() => dispatch({ type: "SET_MODE", mode: "cut" })}
            className={cn(
              "flex items-center gap-1 rounded px-2.5 py-1 text-xs transition-colors",
              mode === "cut" ? "bg-primary text-primary-foreground" : "text-foreground/60",
            )}
          >
            <Scissors className="h-3.5 w-3.5" /> 切割
          </button>
        </div>
      </div>

      <div className="flex-1" />

      {/* Right: undo/redo, save, export, copilot, theme, help */}
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={!canUndo}
          onClick={() => dispatch({ type: "UNDO" })}
          title="撤销 (Cmd+Z)"
        >
          <Undo2 />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={!canRedo}
          onClick={() => dispatch({ type: "REDO" })}
          title="重做 (Cmd+Shift+Z)"
        >
          <Redo2 />
        </Button>

        <div className="mx-1 h-6 w-px bg-border" />

        <Button variant="ghost" size="icon-sm" onClick={props.onToggleCopilot} title="AI Copilot">
          <Bot />
        </Button>
        <Button variant="subtle" size="sm" onClick={props.onSave}>
          <Save /> 保存
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="default" size="sm" disabled={doc.groups.length === 0}>
              <Download /> 导出 <ChevronDown />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => props.onExport("subtitle")}>
              导出字幕文件（ASS / SRT）
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => props.onExport("video")}>
              导出视频（硬字幕烧录）
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="mx-1 h-6 w-px bg-border" />

        <Button variant="ghost" size="icon-sm" onClick={props.onToggleTheme} title="切换主题">
          {props.theme === "dark" ? <Sun /> : <Moon />}
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={props.onShowShortcuts} title="快捷键">
          <Keyboard />
        </Button>
      </div>
    </header>
  );
}
