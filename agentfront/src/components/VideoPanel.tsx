import React, { useRef, useEffect, useState } from "react";
import { getVideoContentRect, type VideoContentRect } from "../utils/CoordinateMapper";

interface VideoPanelProps {
  videoUrl: string;
  updateRect: () => void;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  children?: React.ReactNode;
  onContentRectChange?: (rect: VideoContentRect) => void;
  videoWidth?: number;
  videoHeight?: number;
}

const VideoPanel: React.FC<VideoPanelProps> = ({
  videoUrl, updateRect, videoRef, children,
  onContentRectChange, videoWidth, videoHeight,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  const recalcRect = () => {
    if (!containerRef.current || !onContentRectChange) return;
    const cr = containerRef.current.getBoundingClientRect();
    const contentRect = getVideoContentRect(
      cr.width, cr.height,
      videoWidth || 1920, videoHeight || 1080
    );
    onContentRectChange(contentRect);
  };

  useEffect(() => {
    recalcRect();
    const obs = new ResizeObserver(() => recalcRect());
    if (containerRef.current) obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, [videoWidth, videoHeight]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onMeta = () => recalcRect();
    video.addEventListener("loadedmetadata", onMeta);
    video.addEventListener("loadeddata", onMeta);
    return () => {
      video.removeEventListener("loadedmetadata", onMeta);
      video.removeEventListener("loadeddata", onMeta);
    };
  }, [videoRef]);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%", height: "100%", position: "relative",
        background: "#111", display: "flex",
        justifyContent: "center", alignItems: "center",
      }}
    >
      {videoUrl ? (
        <>
          <video
            ref={videoRef} src={videoUrl} controls
            style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
            onLoadedData={() => { updateRect(); recalcRect(); }}
          />
          <div
            id="subtitle-overlay-container"
            style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 10 }}
          />
        </>
      ) : (
        <div style={{ color: "#666" }}>请选择视频文件</div>
      )}
      {children}
    </div>
  );
};

export default React.memo(VideoPanel);
