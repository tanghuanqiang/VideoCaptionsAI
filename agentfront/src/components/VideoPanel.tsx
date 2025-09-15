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

// interface VideoPanelProps {
//   videoUrl: string;
//   subtitles: Subtitle[];
//   styles: AssStyle[];
// }

// const parseTime = (timeStr: string): number => {
//   // 格式：hh:mm:ss.cs
//   const [h, m, rest] = timeStr.split(":");
//   const [s, cs] = rest.split(".");
//   return (
//     parseInt(h) * 3600 +
//     parseInt(m) * 60 +
//     parseInt(s) +
//     parseInt(cs) / 100
//   );
// };

// const VideoPanel: React.FC<VideoPanelProps> = ({ videoUrl, subtitles, styles }) => {
//   const videoRef = useRef<HTMLVideoElement>(null);
//   const [currentTime, setCurrentTime] = useState(0);
//   const [activeSub, setActiveSub] = useState<Subtitle | null>(null);

//   // 更新播放时间
//   const handleTimeUpdate = () => {
//     if (videoRef.current) {
//       setCurrentTime(videoRef.current.currentTime);
//     }
//   };

//   // 根据时间找字幕
//   useEffect(() => {
//     if (!subtitles.length) {
//       setActiveSub(null);
//       return;
//     }
//     const found = subtitles.find(
//       (s) => parseTime(s.start) <= currentTime && currentTime < parseTime(s.end)
//     );
//     setActiveSub(found || null);
//   }, [currentTime, subtitles]);

//   // 找样式
//   // const getStyle = (styleName: string) => {
//   //   const s = styles.find((st) => st.Name === styleName);
//   //   if (!s) return {};
//   //   return {
//   //     fontFamily: s.FontName,
//   //     fontSize: `${s.FontSize}px`,
//   //     color: s.PrimaryColour || "white",
//   //     textShadow: s.Outline ? `0 0 ${s.Outline}px black` : "0 0 2px black",
//   //     fontWeight: s.Bold ? "bold" : "normal",
//   //     fontStyle: s.Italic ? "italic" : "normal",
//   //     textAlign: "center" as const,
//   //     whiteSpace: "pre-wrap" as const,
//   //   };
//   // };
//   const getStyle = (styleName: string) => {
//     const s = styles.find((st) => st.Name === styleName);
//     if (!s) return {};

//     // 假设一个基础的视频分辨率，例如1920x1080
//     const BASE_WIDTH = 1920; 
//     const BASE_HEIGHT = 1080; 

//     // 获取当前视频画面的实际尺寸
//     const videoElement = videoRef.current;
//     if (!videoElement) return {};
//     const videoWidth = videoElement.offsetWidth;
//     const videoHeight = videoElement.offsetHeight;

//     // 根据视频画面的缩放比例来调整字体大小
//     const scaleFactor = Math.min(videoWidth / BASE_WIDTH, videoHeight / BASE_HEIGHT);
//     const scaledFontSize = s.FontSize * scaleFactor;

//     return {
//       fontFamily: s.FontName,
//       fontSize: `${scaledFontSize}px`, // 使用计算后的动态字体大小
//       color: s.PrimaryColour || "white",
//       textShadow: s.Outline ? `0 0 ${s.Outline}px black` : "0 0 2px black",
//       fontWeight: s.Bold ? "bold" : "normal",
//       fontStyle: s.Italic ? "italic" : "normal",
//       textAlign: "center" as const,
//       whiteSpace: "pre-wrap" as const,
//       // ... 其他样式
//     };
//   };

//   return (
//     <div
//       className="video-panel"
//       style={{
//         width: "100%",
//         height: "100%",
//         position: "relative",
//         backgroundColor: "#111",
//         display: "flex",
//         justifyContent: "center",
//         alignItems: "center",
//       }}
//     >
//       {videoUrl ? (
//         <video
//           ref={videoRef}
//           src={videoUrl}
//           controls
//           onTimeUpdate={handleTimeUpdate}
//           style={{
//             maxWidth: "100%",
//             maxHeight: "100%",
//             objectFit: "contain",
//           }}
//         />
//       ) : (
//         <div style={{ color: "#666" }}>请选择视频文件</div>
//       )}

//       {/* 字幕层 */}
//       {activeSub && (
//         <div
//           className="subtitle-layer"
//           style={{
//             position: "absolute",
//             bottom: "10%", // 预留进度条空间
//             left: "50%",
//             transform: "translateX(-50%)",
//             textAlign: "center",
//             width: "90%",
//             pointerEvents: "none",
//             ...getStyle(activeSub.style),
//           }}
//         >
//           {activeSub.text}
//         </div>
//       )}
//     </div>
//   );
// };

// export default VideoPanel;
