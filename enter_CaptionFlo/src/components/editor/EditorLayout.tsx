import { useCallback, useMemo, useRef, useState, type ChangeEvent } from "react";
import { toast } from "sonner";
import { useEditor, type EditorDoc } from "@/state/EditorContext";
import { useTheme } from "@/hooks/useTheme";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { subtitleService } from "@/services/subtitleService";
import type { VideoReference } from "@/services/subtitleService";
import { asrResponseToGroups } from "@/lib/asrAdapter";
import { buildAss } from "@/lib/assBuilder";
import { DEMO_VIDEO_NAME, DEMO_VIDEO_URL } from "@/services/mockData";
import { API_CONFIG } from "@/services/apiConfig";
import { defaultStyle, stylePresets, type RecognitionQuality } from "@/constants";
import {
  DEFAULT_CAPTION_QUALITY_PROFILE,
  isCaptionQualityProfile,
} from "@/lib/captionQuality";
import { TopBar } from "./TopBar";
import { SubtitleList } from "./SubtitleList";
import { VideoStage } from "./VideoStage";
import { Timeline } from "./Timeline";
import { RightPanel } from "./RightPanel";
import { CopilotPanel } from "./CopilotPanel";
import { ExportDialog } from "./ExportDialog";
import { KeyboardHints } from "./KeyboardHints";

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function normalizeProjectDoc(raw: unknown): EditorDoc | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const payload = isRecord(value.project) ? value.project : value;
  if (!payload || typeof payload !== "object") return null;
  const doc = payload as Record<string, unknown>;
  const resolution = isRecord(doc.resolution) ? doc.resolution : {};
  const selection = isRecord(doc.selection) ? doc.selection : {};

  return {
    projectName: typeof doc.projectName === "string" && doc.projectName.trim()
      ? doc.projectName
      : "未命名项目",
    videoUrl: typeof doc.videoUrl === "string" ? doc.videoUrl : null,
    videoName: typeof doc.videoName === "string" ? doc.videoName : null,
    videoFileId: typeof doc.videoFileId === "string" ? doc.videoFileId : null,
    videoPath: typeof doc.videoPath === "string" ? doc.videoPath : null,
    durationMs: typeof doc.durationMs === "number" && Number.isFinite(doc.durationMs)
      ? doc.durationMs
      : 0,
    qualityProfile: isCaptionQualityProfile(doc.qualityProfile)
      ? doc.qualityProfile
      : DEFAULT_CAPTION_QUALITY_PROFILE,
    resolution: {
      width: typeof resolution.width === "number" && Number.isFinite(resolution.width)
        ? resolution.width
        : 1280,
      height: typeof resolution.height === "number" && Number.isFinite(resolution.height)
        ? resolution.height
        : 720,
    },
    groups: Array.isArray(doc.groups) ? (doc.groups as EditorDoc["groups"]) : [],
    styles: Array.isArray(doc.styles) && doc.styles.length
      ? (doc.styles as EditorDoc["styles"])
      : [defaultStyle, ...stylePresets.map((p) => p.style)],
    selection: {
      groupIds: stringArray(selection.groupIds),
      unitIds: stringArray(selection.unitIds),
    },
  };
}

function parseResolutionText(value: unknown): { width: number; height: number } | null {
  if (typeof value !== "string") return null;
  const match = value.match(/^(\d+)\s*x\s*(\d+)$/i);
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }
  return { width, height };
}

function triggerDownload(url: string, filename: string) {
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noreferrer";
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  if (url.startsWith("blob:")) {
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}

export function EditorLayout() {
  const { state, dispatch } = useEditor();
  const { theme, toggleTheme } = useTheme();
  const [quality, setQuality] = useState<RecognitionQuality>("fast");
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [format, setFormat] = useState<"ass" | "srt">("ass");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedVideoRef = useMemo<VideoReference>(() => (
    state.doc.videoFileId
      ? { fileUuid: state.doc.videoFileId }
      : state.doc.videoPath
        ? { filePath: state.doc.videoPath }
        : state.doc.videoUrl && !state.doc.videoUrl.startsWith("blob:")
          ? state.doc.videoUrl
          : null
  ), [state.doc.videoFileId, state.doc.videoPath, state.doc.videoUrl]);

  // ---- Playback helpers for shortcuts ----
  const togglePlay = useCallback(
    () => dispatch({ type: "SET_PLAYING", playing: !state.isPlaying }),
    [dispatch, state.isPlaying],
  );
  const seek = useCallback(
    (delta: number) =>
      dispatch({ type: "SET_CURRENT_MS", ms: Math.max(0, state.currentMs + delta) }),
    [dispatch, state.currentMs],
  );
  useKeyboardShortcuts({ onTogglePlay: togglePlay, onSeek: seek });

  // ---- Import video ----
  const handleImportVideo = useCallback(() => {
    if (API_CONFIG.USE_MOCK) {
      dispatch({ type: "LOAD_VIDEO", url: DEMO_VIDEO_URL, name: DEMO_VIDEO_NAME });
      dispatch({ type: "ASR_RESET" });
      toast.success("已导入示例视频");
      return;
    }
    fileInputRef.current?.click();
  }, [dispatch]);

  const handleFileSelected = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      try {
        toast.info("正在上传视频到后端...");
        const uploaded = await subtitleService.uploadVideo(file);
        dispatch({
          type: "LOAD_VIDEO",
          url: uploaded.url,
          name: uploaded.filename || file.name,
          fileId: uploaded.uuid,
          filePath: uploaded.path,
        });
        dispatch({ type: "ASR_RESET" });
        toast.success(`已导入 ${uploaded.filename || file.name}`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "视频上传失败");
      }
    },
    [dispatch],
  );

  // ---- Import project ----
  const handleImportProject = useCallback(async () => {
    try {
      const data = await subtitleService.loadProject();
      const doc = normalizeProjectDoc(data);
      if (!doc) {
        toast.info("暂无可导入的项目");
        return;
      }
      dispatch({ type: "LOAD_PROJECT", doc });
      toast.success("项目已导入");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "项目导入失败");
    }
  }, [dispatch]);

  // ---- Run ASR ----
  const handleRunAsr = useCallback(async () => {
    if (state.video !== "loaded") {
      toast.error("请先导入视频");
      return;
    }
    if (!selectedVideoRef) {
      toast.error("当前视频没有可用的后端引用，请重新导入视频");
      return;
    }

    dispatch({ type: "ASR_START" });
    try {
      const res = await subtitleService.runAsr(quality, selectedVideoRef, (p, label) =>
        dispatch({ type: "ASR_PROGRESS", progress: p, label: label ?? "" }),
      );
      const groups = asrResponseToGroups(res);
      const styles = res.recommended_style
        ? [defaultStyle, res.recommended_style, ...stylePresets.map((p) => p.style)]
        : undefined;
      const parsedResolution = parseResolutionText(res.resolution);
      if (parsedResolution) {
        dispatch({ type: "SET_RESOLUTION", ...parsedResolution });
      }
      dispatch({ type: "ASR_SUCCESS", groups, styles });
      toast.success(`识别完成，生成 ${groups.length} 条字幕`);
    } catch (err) {
      dispatch({ type: "ASR_ERROR", error: err instanceof Error ? err.message : "未知错误" });
      toast.error(err instanceof Error ? err.message : "语音识别失败");
    }
  }, [dispatch, quality, selectedVideoRef, state.video]);

  // ---- Save ----
  const handleSave = useCallback(async () => {
    try {
      await subtitleService.saveProject(state.doc);
      toast.success("项目已保存");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "保存失败");
    }
  }, [state.doc]);

  // ---- Export ----
  const [exportKind, setExportKind] = useState<"subtitle" | "video">("subtitle");

  const openExport = useCallback(
    (kind: "subtitle" | "video") => {
      dispatch({ type: "EXPORT_RESET" });
      setExportKind(kind);
      setExportOpen(true);
    },
    [dispatch],
  );

  const runExport = useCallback(async () => {
    dispatch({ type: "EXPORT_START", kind: exportKind });
    try {
      const onProgress = (p: number, label?: string) =>
        dispatch({ type: "EXPORT_PROGRESS", progress: p, label: label ?? "" });
      const ass = buildAss(state.doc.groups, state.doc.styles, {
        playResX: state.doc.resolution.width,
        playResY: state.doc.resolution.height,
        title: state.doc.projectName,
      });
      const payload = {
        ass,
        format,
        projectName: state.doc.projectName,
        videoName: state.doc.videoName,
        videoUrl: state.doc.videoUrl,
        videoFileId: state.doc.videoFileId,
        videoPath: state.doc.videoPath,
        resolution: state.doc.resolution,
      };
      const result =
        exportKind === "subtitle"
          ? await subtitleService.exportSubtitle(format, payload, onProgress)
          : await subtitleService.exportVideo(payload, onProgress);
      triggerDownload(result.url, result.filename);
      dispatch({ type: "EXPORT_SUCCESS", resultName: result.filename });
      toast.success("导出完成");
    } catch (err) {
      dispatch({ type: "EXPORT_ERROR", error: err instanceof Error ? err.message : "未知错误" });
      toast.error(err instanceof Error ? err.message : "导出失败");
    }
  }, [dispatch, exportKind, format, state.doc]);

  return (
    <div className="flex h-full w-full flex-col gap-2 bg-background p-2">
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={handleFileSelected}
      />

      <TopBar
        theme={theme}
        onToggleTheme={toggleTheme}
        quality={quality}
        onQualityChange={setQuality}
        onImportVideo={handleImportVideo}
        onImportProject={handleImportProject}
        onRunAsr={handleRunAsr}
        onSave={handleSave}
        onExport={openExport}
        onShowShortcuts={() => setShortcutsOpen(true)}
        onToggleCopilot={() => setCopilotOpen((v) => !v)}
      />

      {/* Middle: list | stage | properties | copilot */}
      <div className="flex min-h-0 flex-1 gap-2">
        <SubtitleList />
        <main className="min-h-0 min-w-0 flex-1">
          <VideoStage onImportVideo={handleImportVideo} onRunAsr={handleRunAsr} />
        </main>
        <RightPanel />
        <CopilotPanel open={copilotOpen} onClose={() => setCopilotOpen(false)} />
      </div>

      {/* Bottom: timeline */}
      <div className="h-52 shrink-0">
        <Timeline />
      </div>

      <ExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        kind={exportKind}
        format={format}
        onFormatChange={setFormat}
        onConfirm={runExport}
        onRetry={runExport}
      />
      <KeyboardHints open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </div>
  );
}
