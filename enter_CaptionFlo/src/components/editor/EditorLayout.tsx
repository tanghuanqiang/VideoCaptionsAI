import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
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
import { normalizeCaptionGlossary, normalizeCaptionGroups, normalizeProjectMarkers, normalizeSpeakerStyleIds, normalizeStyles } from "@/lib/projectNormalization";
import { TopBar } from "./TopBar";
import { SubtitleList } from "./SubtitleList";
import { VideoStage } from "./VideoStage";
import { Timeline } from "./Timeline";
import { RightPanel } from "./RightPanel";
import { CopilotPanel } from "./CopilotPanel";
import { ExportDialog } from "./ExportDialog";
import { KeyboardHints } from "./KeyboardHints";
import { clearRecoverySnapshot, readRecoverySnapshot, saveRecoverySnapshot } from "@/lib/projectRecovery";

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
    frameRate: typeof doc.frameRate === "number" && Number.isFinite(doc.frameRate)
      ? Math.min(120, Math.max(1, doc.frameRate))
      : 30,
    glossary: normalizeCaptionGlossary(doc.glossary),
    speakerStyleIds: normalizeSpeakerStyleIds(doc.speakerStyleIds),
    markers: normalizeProjectMarkers(doc.markers, typeof doc.durationMs === "number" ? doc.durationMs : 0),
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
    groups: normalizeCaptionGroups(doc.groups, typeof doc.durationMs === "number" ? doc.durationMs : 0, "Default"),
    styles: normalizeStyles(doc.styles, [defaultStyle, ...stylePresets.map((p) => p.style)]),
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

function parseFrameRate(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const parsed = Number(String(value).replace(/fps$/iu, "").trim());
  return Number.isFinite(parsed) && parsed >= 1 && parsed <= 120 ? parsed : null;
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
  const [exportScope, setExportScope] = useState<"all" | "selected">("all");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recoveryPrompted = useRef(false);

  useEffect(() => {
    if (recoveryPrompted.current) return;
    recoveryPrompted.current = true;
    const snapshot = readRecoverySnapshot();
    if (!snapshot || snapshot.doc.groups.length === 0) return;
    const ageMinutes = Math.max(1, Math.round((Date.now() - snapshot.savedAt) / 60_000));
    toast("发现本地恢复草稿", {
      description: `${snapshot.doc.projectName} · ${ageMinutes} 分钟前保存`,
      action: {
        label: "恢复",
        onClick: () => {
          dispatch({ type: "LOAD_PROJECT", doc: snapshot.doc });
          clearRecoverySnapshot();
          toast.success("已恢复本地草稿");
        },
      },
      cancel: { label: "忽略", onClick: clearRecoverySnapshot },
    });
  }, [dispatch]);

  useEffect(() => {
    if (state.doc.groups.length === 0) return;
    const timer = window.setTimeout(() => saveRecoverySnapshot(state.doc), 1200);
    return () => window.clearTimeout(timer);
  }, [state.doc]);

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
      const parsedFrameRate = parseFrameRate(res.fps);
      if (parsedFrameRate) dispatch({ type: "SET_FRAME_RATE", frameRate: parsedFrameRate });
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
      clearRecoverySnapshot();
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
      const exportGroups = exportScope === "selected" && state.doc.selection.groupIds.length > 0
        ? state.doc.groups.filter((group) => state.doc.selection.groupIds.includes(group.id))
        : state.doc.groups;
      const ass = buildAss(exportGroups, state.doc.styles, {
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
  }, [dispatch, exportKind, exportScope, format, state.doc]);

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
        scope={exportScope}
        onScopeChange={setExportScope}
        onConfirm={runExport}
        onRetry={runExport}
      />
      <KeyboardHints open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </div>
  );
}
