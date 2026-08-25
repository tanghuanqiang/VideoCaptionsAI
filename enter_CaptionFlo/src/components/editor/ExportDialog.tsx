import { CheckCircle2, AlertCircle, Loader2, FileText, Film, ShieldAlert } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useEditor } from "@/state/EditorContext";
import { cn } from "@/lib/utils";
import { analyzeCaptionQuality } from "@/lib/captionQuality";

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: "subtitle" | "video";
  format: "ass" | "srt";
  onFormatChange: (f: "ass" | "srt") => void;
  onConfirm: () => void;
  onRetry: () => void;
}

export function ExportDialog({
  open,
  onOpenChange,
  kind,
  format,
  onFormatChange,
  onConfirm,
  onRetry,
}: ExportDialogProps) {
  const { state } = useEditor();
  const ex = state.exportState;
  const isSubtitle = kind === "subtitle";
  const running = ex.status === "running";
  const done = ex.status === "success";
  const failed = ex.status === "error";
  const idle = ex.status === "idle";
  const quality = analyzeCaptionQuality(state.doc.groups, state.doc.durationMs, state.doc.qualityProfile);
  const errors = quality.issues.filter((issue) => issue.severity === "error").length;
  const warnings = quality.issues.filter((issue) => issue.severity === "warning").length;
  const reviewed = state.doc.groups.filter((group) => group.reviewStatus === "reviewed").length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-float sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isSubtitle ? <FileText className="h-4 w-4" /> : <Film className="h-4 w-4" />}
            {isSubtitle ? "导出字幕文件" : "导出视频"}
          </DialogTitle>
          <DialogDescription>
            {isSubtitle
              ? "选择字幕格式并导出。"
              : "将字幕硬烧录到视频，保持原画质。"}
          </DialogDescription>
        </DialogHeader>

        {idle && isSubtitle && (
          <div className="flex gap-2">
            {(["ass", "srt"] as const).map((f) => (
              <button
                key={f}
                onClick={() => onFormatChange(f)}
                className={cn(
                  "flex-1 rounded-lg border p-3 text-left transition-colors",
                  format === f
                    ? "border-primary bg-primary/10"
                    : "border-border hover:bg-foreground/5",
                )}
              >
                <p className="text-sm font-medium uppercase">{f}</p>
                <p className="text-[11px] text-foreground/50">
                  {f === "ass" ? "保留完整样式与特效" : "通用简单格式"}
                </p>
              </button>
            ))}
          </div>
        )}

        {idle && (
          <div className={cn(
            "mt-3 rounded-md border px-3 py-2.5 text-xs",
            errors > 0 ? "border-destructive/30 bg-destructive/10" : warnings > 0 ? "border-warning/30 bg-warning/10" : "border-success/25 bg-success/10",
          )}>
            <div className="flex items-center gap-2 font-medium">
              <ShieldAlert className="h-4 w-4" />
              <span>{errors > 0 ? "存在质量错误，请确认后导出" : warnings > 0 ? "可以导出，但建议先处理提醒" : "导出检查通过"}</span>
            </div>
            <p className="mt-1 text-[11px] text-foreground/60">
              {errors} 个错误 · {warnings} 个提醒 · 已审校 {reviewed}/{state.doc.groups.length} 条
            </p>
          </div>
        )}

        {running && (
          <div className="space-y-3 py-2">
            <div className="flex items-center gap-2 text-sm">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              {ex.label || "处理中"}
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-foreground/10">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${ex.progress}%` }}
              />
            </div>
            <p className="text-right font-mono text-xs text-foreground/50">{ex.progress}%</p>
          </div>
        )}

        {done && (
          <div className="flex flex-col items-center gap-2 py-4 text-center">
            <CheckCircle2 className="h-10 w-10 text-success" />
            <p className="text-sm font-medium">导出成功</p>
            <p className="text-xs text-foreground/50">{ex.resultName}</p>
          </div>
        )}

        {failed && (
          <div className="flex flex-col items-center gap-2 py-4 text-center">
            <AlertCircle className="h-10 w-10 text-destructive" />
            <p className="text-sm font-medium">导出失败</p>
            <p className="text-xs text-foreground/50">{ex.error}</p>
          </div>
        )}

        <DialogFooter>
          {idle && (
            <Button onClick={onConfirm}>
              开始导出
            </Button>
          )}
          {done && (
            <Button onClick={() => onOpenChange(false)}>完成</Button>
          )}
          {failed && (
            <>
              <Button variant="subtle" onClick={() => onOpenChange(false)}>
                关闭
              </Button>
              <Button onClick={onRetry}>重试</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
