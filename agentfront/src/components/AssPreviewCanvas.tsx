import { useEffect, useMemo, useRef, useState } from "react";
import type { AssStyle, Subtitle } from "../types/subtitleTypes";
import { compileCaptionsToAss } from "../utils/captionCompiler";
import { createLibassAdapter } from "../utils/assRenderAdapter";
import type { AssRenderAdapter } from "../utils/assRenderTypes";
import type { VideoContentRect } from "../utils/CoordinateMapper";

interface Props {
  subtitles: Subtitle[];
  styles: AssStyle[];
  videoRef: React.RefObject<HTMLVideoElement | null>;
  playResX: number;
  playResY: number;
  contentRect: VideoContentRect;
  enabled: boolean;
  onRendererState?: (ready: boolean) => void;
}

const AssPreviewCanvas: React.FC<Props> = ({ subtitles, styles, videoRef, playResX, playResY, contentRect, enabled, onRendererState }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const adapterRef = useRef<AssRenderAdapter | null>(null);
  const renderInFlight = useRef(false);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [error, setError] = useState("");
  const assText = useMemo(() => compileCaptionsToAss(subtitles, styles, { playResX, playResY }), [subtitles, styles, playResX, playResY]);
  const fonts = useMemo(() => ["/fonts/NotoSansSC-Regular.ttf"], []);

  useEffect(() => {
    let disposed = false;
    adapterRef.current?.dispose?.();
    adapterRef.current = null;
    onRendererState?.(false);
    if (!enabled) {
      setStatus("idle");
      return () => { disposed = true; };
    }

    setStatus("loading");
    setError("");
    createLibassAdapter({ assText, width: playResX, height: playResY, fonts, fallbackFont: "/fonts/NotoSansSC-Regular.ttf" }).then(adapter => {
      if (disposed) {
        adapter.dispose?.();
        return;
      }
      adapterRef.current = adapter;
      setStatus("ready");
      onRendererState?.(true);
    }).catch(reason => {
      if (disposed) return;
      const message = reason instanceof Error ? reason.message : String(reason);
      setError(message);
      setStatus("error");
      onRendererState?.(false);
    });

    return () => {
      disposed = true;
      adapterRef.current?.dispose?.();
      adapterRef.current = null;
      onRendererState?.(false);
    };
  }, [assText, fonts, playResX, playResY, enabled, onRendererState]);

  useEffect(() => {
    if (!enabled || status !== "ready") return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = playResX;
    canvas.height = playResY;
    const context = canvas.getContext("2d");
    if (!context) return;

    let raf = 0;
    let stopped = false;
    const draw = async () => {
      if (stopped || renderInFlight.current || !adapterRef.current) return;
      renderInFlight.current = true;
      try {
        const frame = await adapterRef.current.renderFrame({
          assText,
          timeMs: Math.round((video?.currentTime || 0) * 1000),
          width: playResX,
          height: playResY,
          fonts,
        });
        if (frame instanceof ImageData) context.putImageData(frame, 0, 0);
        else {
          const image = new ImageData(new Uint8ClampedArray(frame), playResX, playResY);
          context.putImageData(image, 0, 0);
        }
      } catch (reason) {
        const message = reason instanceof Error ? reason.message : String(reason);
        setError(message);
        setStatus("error");
        onRendererState?.(false);
      } finally {
        renderInFlight.current = false;
      }
    };
    const tick = () => {
      void draw();
      if (!stopped && video && !video.paused) raf = requestAnimationFrame(tick);
    };
    const onTime = () => void draw();
    video?.addEventListener("timeupdate", onTime);
    video?.addEventListener("play", tick);
    void draw();
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      video?.removeEventListener("timeupdate", onTime);
      video?.removeEventListener("play", tick);
    };
  }, [assText, enabled, fonts, onRendererState, playResX, playResY, status, videoRef]);

  if (!enabled) return null;
  return <>
    {status === "ready" && <canvas ref={canvasRef} aria-label="ASS 预览" style={{ position: "absolute", left: contentRect.left, top: contentRect.top, width: contentRect.width, height: contentRect.height, pointerEvents: "none", zIndex: 20 }} />}
    {status === "loading" && <div style={{ position: "absolute", right: 12, top: 12, zIndex: 30, padding: "4px 8px", background: "rgba(0,0,0,.7)", color: "#fff", fontSize: 12 }}>ASS 渲染器加载中...</div>}
    {status === "error" && <div title={error} style={{ position: "absolute", right: 12, top: 12, zIndex: 30, padding: "4px 8px", background: "rgba(180,50,50,.85)", color: "#fff", fontSize: 12 }}>ASS 预览不可用</div>}
  </>;
};

export default AssPreviewCanvas;
