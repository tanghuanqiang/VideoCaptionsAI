import { useCallback, useEffect, useRef, useState } from "react";
import { Play, Pause, SkipBack, SkipForward, Film, Loader2, AlertCircle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEditor } from "@/state/EditorContext";
import { formatMs } from "@/lib/editorUtils";
import { AssRenderer } from "./AssRenderer";

interface VideoStageProps {
  onImportVideo: () => void;
  onRunAsr: () => void;
}

export function VideoStage({ onImportVideo, onRunAsr }: VideoStageProps) {
  const { state, dispatch } = useEditor();
  const videoRef = useRef<HTMLVideoElement>(null);
  const backgroundVideoRef = useRef<HTMLVideoElement>(null);
  const [rendererReady, setRendererReady] = useState(false);
  const { doc, currentMs, isPlaying, video, asr } = state;

  // Keep the blurred background video in step with the subtitle-bearing video.
  useEffect(() => {
    const foreground = videoRef.current;
    const background = backgroundVideoRef.current;
    if (!foreground) return;

    if (isPlaying) {
      foreground.play().catch(() => dispatch({ type: "SET_PLAYING", playing: false }));
      background?.play().catch(() => {});
    } else {
      foreground.pause();
      background?.pause();
    }
  }, [isPlaying, dispatch]);

  // Keep currentMs updated during playback and correct background drift occasionally.
  useEffect(() => {
    const foreground = videoRef.current;
    const background = backgroundVideoRef.current;
    if (!foreground) return;
    let raf = 0;
    const tick = () => {
      if (background && Math.abs(background.currentTime - foreground.currentTime) > 0.25) {
        background.currentTime = foreground.currentTime;
      }
      dispatch({ type: "SET_CURRENT_MS", ms: foreground.currentTime * 1000 });
      raf = requestAnimationFrame(tick);
    };
    if (isPlaying) raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying, dispatch]);

  const handleLoaded = useCallback(() => {
    const foreground = videoRef.current;
    const background = backgroundVideoRef.current;
    if (foreground) {
      dispatch({ type: "SET_DURATION", durationMs: foreground.duration * 1000 });
      if (foreground.videoWidth && foreground.videoHeight) {
        dispatch({
          type: "SET_RESOLUTION",
          width: foreground.videoWidth,
          height: foreground.videoHeight,
        });
      }
    }
    if (foreground && background && Number.isFinite(foreground.currentTime)) {
      background.currentTime = foreground.currentTime;
    }
    setRendererReady(true);
  }, [dispatch]);

  const seek = useCallback(
    (ms: number) => {
      const foreground = videoRef.current;
      const background = backgroundVideoRef.current;
      const clamped = Math.max(0, Math.min(ms, doc.durationMs || ms));
      if (foreground) foreground.currentTime = clamped / 1000;
      if (background) background.currentTime = clamped / 1000;
      dispatch({ type: "SET_CURRENT_MS", ms: clamped });
    },
    [dispatch, doc.durationMs],
  );

  // Reset renderer readiness when the video source changes.
  useEffect(() => {
    setRendererReady(false);
    if (backgroundVideoRef.current) backgroundVideoRef.current.currentTime = 0;
  }, [doc.videoUrl]);

  return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center gap-3 p-6">
      <div
        className="relative flex min-h-0 w-full max-w-4xl flex-1 items-center justify-center overflow-hidden rounded-2xl bg-stage shadow-float ring-1 ring-foreground/10"
        style={{ containerType: "size" } as React.CSSProperties}
      >
        {video === "loaded" && doc.videoUrl ? (
          <>
            <video
              ref={backgroundVideoRef}
              src={doc.videoUrl}
              muted
              playsInline
              preload="metadata"
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover opacity-45 blur-2xl"
              onLoadedMetadata={() => {
                const foreground = videoRef.current;
                const background = backgroundVideoRef.current;
                if (foreground && background) background.currentTime = foreground.currentTime;
              }}
            />
            <div className="relative z-10 flex h-full w-full items-center justify-center">
              <video
                ref={videoRef}
                src={doc.videoUrl}
                className="h-full w-full object-contain"
                onLoadedMetadata={handleLoaded}
                onClick={() => dispatch({ type: "SET_PLAYING", playing: !isPlaying })}
                playsInline
              />
              <AssRenderer videoRef={videoRef} ready={rendererReady} />
            </div>
          </>
        ) : (
          <EmptyStage onImportVideo={onImportVideo} />
        )}

        {asr.status === "running" && <AsrRunningOverlay progress={asr.progress} label={asr.label} />}
        {asr.status === "error" && (
          <AsrErrorOverlay error={asr.error} onRetry={onRunAsr} />
        )}
      </div>

      {video === "loaded" && (
        <PlaybackControls
          currentMs={currentMs}
          durationMs={doc.durationMs}
          isPlaying={isPlaying}
          onSeek={seek}
          onTogglePlay={() => dispatch({ type: "SET_PLAYING", playing: !isPlaying })}
        />
      )}
    </div>
  );
}

function PlaybackControls({
  currentMs,
  durationMs,
  isPlaying,
  onSeek,
  onTogglePlay,
}: {
  currentMs: number;
  durationMs: number;
  isPlaying: boolean;
  onSeek: (ms: number) => void;
  onTogglePlay: () => void;
}) {
  const progress = durationMs > 0
    ? Math.min(100, Math.max(0, (currentMs / durationMs) * 100))
    : 0;

  return (
    <div className="glass-panel flex w-full max-w-4xl shrink-0 items-center gap-3 rounded-xl px-3 py-2">
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => onSeek(currentMs - 5000)}
        aria-label="后退 5 秒"
      >
        <SkipBack />
      </Button>
      <Button
        variant="default"
        size="icon-sm"
        onClick={onTogglePlay}
        aria-label={isPlaying ? "暂停" : "播放"}
      >
        {isPlaying ? <Pause /> : <Play />}
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => onSeek(currentMs + 5000)}
        aria-label="前进 5 秒"
      >
        <SkipForward />
      </Button>
      <div className="relative mx-2 h-1.5 flex-1 rounded-full bg-foreground/15">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-primary"
          style={{ width: `${progress}%` }}
        />
        <input
          type="range"
          min={0}
          max={durationMs || 0}
          value={currentMs}
          onChange={(e) => onSeek(Number(e.target.value))}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          aria-label="播放进度"
        />
      </div>
      <span className="min-w-[92px] text-right font-mono text-xs tabular-nums text-foreground/80">
        {formatMs(currentMs)} / {formatMs(durationMs)}
      </span>
    </div>
  );
}

function EmptyStage({ onImportVideo }: { onImportVideo: () => void }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-foreground/5 ring-1 ring-foreground/10">
        <Film className="h-7 w-7 text-foreground/50" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground/90">还没有导入视频</p>
        <p className="text-xs text-foreground/50">导入视频后即可开始识别与编辑字幕</p>
      </div>
      <Button onClick={onImportVideo} className="mt-1">
        导入视频
      </Button>
    </div>
  );
}

function AsrRunningOverlay({ progress, label }: { progress: number; label: string }) {
  return (
    <div className="pointer-events-none absolute right-3 top-3 z-30 max-w-xs rounded-xl border border-white/10 bg-black/55 px-3 py-2 text-white shadow-lg backdrop-blur-md">
      <div className="flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        <p className="truncate text-xs font-medium text-white/90">{label || "正在识别"}</p>
      </div>
      <div className="mt-2 h-1.5 w-48 overflow-hidden rounded-full bg-white/15">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${progress}%` }}
        />
      </div>
      <p className="mt-1 text-right font-mono text-[10px] text-white/60">{progress}%</p>
    </div>
  );
}

function AsrErrorOverlay({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  return (
    <div className="absolute left-3 top-3 z-30 max-w-sm rounded-xl border border-destructive/20 bg-black/65 px-3 py-2 text-white shadow-lg backdrop-blur-md">
      <div className="flex items-center gap-2">
        <AlertCircle className="h-4 w-4 text-destructive" />
        <p className="text-sm font-medium text-white/90">识别失败</p>
      </div>
      <p className="mt-1 text-xs text-white/60">{error}</p>
      <Button variant="glass" size="sm" onClick={onRetry} className="mt-2 text-white">
        <RotateCcw /> 重试
      </Button>
    </div>
  );
}
