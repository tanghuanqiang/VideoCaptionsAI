import React from "react"; // Ensure React is imported for React.memo
// import type { Subtitle, AssStyle } from "../App";

interface VideoPanelProps {
  videoUrl: string;
  updateRect: () => void;
  videoRef: React.RefObject<HTMLVideoElement | null>;
}

const VideoPanel: React.FC<VideoPanelProps> = ({ videoUrl, updateRect, videoRef }) => {
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
        </>
      ) : (
        <div style={{ color: "#666" }}>请选择视频文件</div>
      )}
    </div>
  );
};

export default React.memo(VideoPanel);