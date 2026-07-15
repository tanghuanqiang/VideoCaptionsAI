import React from "react"; // Ensure React is imported for React.memo

interface VideoPanelProps {
  videoUrl: string;
  updateRect: () => void;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  children?: React.ReactNode;
}

const VideoPanel: React.FC<VideoPanelProps> = ({ videoUrl, updateRect, videoRef, children }) => {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        background: "#111",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      {videoUrl ? (
        <>
          <video
            ref={videoRef}
            src={videoUrl}
            controls
            style={{
              maxWidth: "100%",
              maxHeight: "100%",
              objectFit: "contain",
            }}
            onLoadedData={updateRect}
          />
          <div
            id="subtitle-overlay-container"
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: "none",
              zIndex: 10,
            }}
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
