import { useEffect, useMemo, useRef, useState, useCallback } from 'react'; // Added useCallback
// import reactLogo from './assets/react.svg'
// import viteLogo from '/vite.svg'
import './App.css'

// import React from "react";
import "./App.css";
import Toolbar from "./components/Toolbar";
import VideoPanel from "./components/VideoPanel";
import SubtitleEditor from "./components/SubtitleEditor";
// import VideoTimeline from "./components/VideoTimeline";
import { defaultStyle } from "./constants";

import GridLayout from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import SubtitleStylePanel from './components/SubtitleStylePanel';
import SubtitlePreview from './components/SubtitlePreview';
import SidebarCopilot from './components/SidebarCopilot';
import type { Message } from './components/SidebarCopilot';

export interface AssStyle {
  id: string;
  Name: string;
  FontName: string;
  FontSize: number;
  PrimaryColour: string;
  SecondaryColour?: string;
  OutlineColour?: string;
  BackColour?: string;
  Bold?: boolean;
  Italic?: boolean;
  Underline?: boolean;
  StrikeOut?: boolean;
  ScaleX?: number;
  ScaleY?: number;
  Spacing?: number;
  Angle?: number;
  BorderStyle?: number;
  Outline?: number;
  Shadow?: number;
  Alignment?: number;
  MarginL?: number;
  MarginR?: number;
  MarginV?: number;
  Encoding?: number;
  PrimaryAlpha?: number;
  SecondaryAlpha?: number;
  OutlineAlpha?: number;
  BackAlpha?: number;
}
export type Subtitle = {
  id: string;
  start: string;
  end: string;
  text: string;
  style: string;
  group: string;
};

export type ASRResponse = {
  language: string;
  resolution: string;
  fps: string;
  events: Array<{
    id: string;
    start: string;
    end: string;
    text: string;
    style?: string;
    speaker?: string;
  }>;

};

function App() {
  // Copilot 侧边栏开关
  const [copilotOpen, setCopilotOpen] = useState(false);
  // Copilot 消息历史
  const [copilotMessages, setCopilotMessages] = useState<Message[]>([]);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [subtitles, setSubtitles] = useState<Subtitle[]>([]);
  const [layoutWidth, setLayoutWidth] = useState(window.innerWidth);
  const [rect, setRect] = useState({ w: 0, h: 0, left: 0, top: 0 });
  const [layoutHeight, setLayoutHeight] = useState(window.innerHeight - 56); // header 高度 56px
  const videoRef = useRef<HTMLVideoElement>(null); // Explicitly define videoRef type
  // ASS字幕的PlayRes设置，从视频分辨率获取
  const [playResX, setPlayResX] = useState<number>(1920);
  const [playResY, setPlayResY] = useState<number>(1080);

  useEffect(() => {
    const handleResize = () => setLayoutWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const handleResize = () => setLayoutHeight(window.innerHeight - 56);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // 监听视频文件变化，获取视频分辨率作为PlayRes
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleVideoMetadata = () => {
      if (video.videoWidth && video.videoHeight) {
        setPlayResX(video.videoWidth);
        setPlayResY(video.videoHeight);
        console.log(`视频分辨率更新: ${video.videoWidth}x${video.videoHeight}`);
      }
    };

    video.addEventListener("loadedmetadata", handleVideoMetadata);
    video.addEventListener("loadeddata", handleVideoMetadata);

    // 如果视频已经加载，立即获取分辨率
    if (video.readyState >= 1) {
      handleVideoMetadata();
    }

    return () => {
      video.removeEventListener("loadedmetadata", handleVideoMetadata);
      video.removeEventListener("loadeddata", handleVideoMetadata);
    };
  }, [videoFile]); // 当视频文件变化时重新设置

  const updateRect = useCallback(() => {
    const domRect = videoRef.current?.getBoundingClientRect();
    if (domRect) {
      setRect((prevRect) => {
        if (
          prevRect.w === domRect.width &&
          prevRect.h === domRect.height &&
          prevRect.left === domRect.left &&
          prevRect.top === domRect.top
        ) {
          return prevRect; // Avoid unnecessary state updates
        }
        return {
          w: domRect.width,
          h: domRect.height,
          left: domRect.left,
          top: domRect.top,
        };
      });
    } else {
      console.warn("Video dimensions are zero, retrying...");
      setTimeout(updateRect, 100); // Retry after a short delay
    }
  }, [videoRef]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    video.addEventListener("loadedmetadata", updateRect);
    video.addEventListener("loadeddata", updateRect);
    window.addEventListener("resize", updateRect);

    updateRect(); // Initial call

    return () => {
      video.removeEventListener("loadedmetadata", updateRect);
      video.removeEventListener("loadeddata", updateRect);
      window.removeEventListener("resize", updateRect);
    };
  }, [videoRef, layoutWidth, layoutHeight, updateRect]); // Added updateRect to dependencies

  // 用于样式同步
  const [styles, setStyles] = useState<AssStyle[]>([defaultStyle]);
  const [selectedStyle, setSelectedStyle] = useState<string>(styles[0].Name);
  // 拖拽布局配置
  const alpha = 5;
  const layout = [
    { i: "video", x: 0, y: 0, w: 7*alpha, h: 4*alpha, minW: 3*alpha, minH: 2*alpha },
    { i: "subtitle", x: 7*alpha, y: 0, w: 5*alpha, h: 4*alpha, minW: 2*alpha, minH: 2*alpha },
    { i: "style", x: 12*alpha, y: 0, w: 4*alpha, h: 6*alpha, minW: 2*alpha, minH: 2*alpha },
  ];
  const videoUrl = useMemo(() => videoFile ? URL.createObjectURL(videoFile) : "", [videoFile]);

  return (
    <div className="app-container">
      <header>
        <Toolbar
          title="AI字幕识别生成器"
          setVideoFile={setVideoFile}
          videoFile={videoFile}
          onSubtitlesUpdate={(resp: ASRResponse) => {
            const subsArr = resp.events || [];
            console.log("ASR返回的字幕数据：", resp);
            
            const formatted: Subtitle[] = subsArr.map((item) => ({
              id: item.id,
              start: item.start,
              end: item.end,
              text: item.text,
              style: item.style || "Default",
              group: item.speaker || "",
            }));
            setSubtitles(formatted);
          }}
          styles={styles}
          subtitles={subtitles}
        />
      </header>
      {/* 预览字幕 */}
      <SubtitlePreview 
        rect={rect} 
        subtitles={subtitles} 
        styles={styles}
        videoRef={videoRef} 
        playResX={playResX}  
        playResY={playResY}  
      />
      <main className="main-content">
        {/* Copilot 侧边栏开关按钮，模仿 VSCode，固定在左下角 */}
        <button
          className="copilot-toggle-btn"
          style={{
            position: 'fixed',
            right: copilotOpen ? 374 : 24, // 侧边栏宽度350+间距24
            bottom: 32,
            zIndex: 10000,
            background: copilotOpen ? '#23272e' : '#222c38',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            width: 40,
            height: 40,
            boxShadow: copilotOpen ? '0 2px 8px #0006' : '0 1px 4px #0003',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background 0.2s,right 0.2s',
          }}
          title={copilotOpen ? '关闭 Copilot 侧边栏' : '打开 Copilot 侧边栏'}
          onClick={() => setCopilotOpen(v => !v)}
        >
          {/* VSCode 风格的侧边栏图标 */}
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
            <rect x="2" y="2" width="6" height="18" rx="2" fill="#0078d4"/>
            <rect x="10" y="2" width="10" height="18" rx="2" fill="#444"/>
            <rect x="12.5" y="5" width="5" height="2" rx="1" fill="#888"/>
            <rect x="12.5" y="9" width="5" height="2" rx="1" fill="#888"/>
            <rect x="12.5" y="13" width="5" height="2" rx="1" fill="#888"/>
          </svg>
        </button>

        <GridLayout
          className="layout"
          layout={layout}
          cols={16 * alpha}
          rowHeight={layoutHeight / (9 * alpha)}
          width={layoutWidth}
          draggableHandle=".panel-header"
          style={{ height: "100%", width: '100%', minWidth: 0 }}
          onDragStop={() => updateRect()} // Update rect when dragging stops
          onResizeStop={() => updateRect()} // Update rect when resizing stops
        >
          <div
            key="video"
            style={{
              background: "#222",
              borderRadius: 16,
              boxShadow: "0 4px 24px rgba(0,0,0,0.18)",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div className="panel-header" style={{ 
              cursor: "move", 
              background: "#23272e", 
              color: "#fff", 
              padding: "8px 16px", 
              fontWeight: "bold", 
              borderTopLeftRadius: 16, 
              borderTopRightRadius: 16,
              flexShrink: 0  // 防止 header 被压缩
            }}>
              视频面板
            </div>
            {/* 关键：这个容器负责为视频提供正确的空间 */}
            <div style={{ 
              flex: 1,           // 占据剩余空间
              minHeight: 0,      // 允许缩小
              position: 'relative'
            }}>
              <VideoPanel
                videoUrl={videoUrl}
                updateRect={updateRect}
                videoRef={videoRef}
              />
            </div>
           
          </div>
          <div key="subtitle" className="subtitle-panel" style={{
            background: "#23272e", 
            borderRadius: 16, 
            boxShadow: "0 4px 24px rgba(0,0,0,0.18)", 
            display: "flex",
            flexDirection: "column",
            position: "relative",
            minHeight: 0
          }}>
            <div className="panel-header" style={{
              cursor: "move", 
              background: "#353a42", 
              color: "#fff", 
              padding: "8px 16px", 
              fontWeight: "bold", 
              borderTopLeftRadius: 16, 
              borderTopRightRadius: 16,
              flex: "0 0 auto"
            }}>
              字幕内容
            </div>
            <div className="subtitle-editor-scroll">
              <SubtitleEditor
                subtitles={subtitles}
                setSubtitles={setSubtitles}
                styles={styles}
                selectedStyle={selectedStyle}
              />
            </div>
          
          </div>
          <div key="style" style={{
              background: "#23272e",
              borderRadius: 16,
              boxShadow: "0 4px 24px rgba(0,0,0,0.18)",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden"
          }}>
              <div className="panel-header" style={{
                  cursor: "move",
                  background: "#353a42",
                  color: "#fff",
                  padding: "8px 16px",
                  fontWeight: "bold",
                  borderTopLeftRadius: 16,
                  borderTopRightRadius: 16,
                  flex: "0 0 auto"
              }}>
                  字幕样式
              </div>
              {/* 这个新添加的 div 才是真正的可滚动区域 */}
              <div style={{ flex: "1 1 0", overflowY: "auto" }}>
                  <SubtitleStylePanel
                      styles={styles}
                      setStyles={setStyles}
                      selectedStyle={selectedStyle}
                      setSelectedStyle={setSelectedStyle}
                  />
              </div>
             
          </div>
        </GridLayout>
        {/* Copilot 侧边栏 */}
        {copilotOpen && (
          <SidebarCopilot
            messages={copilotMessages}
            setMessages={setCopilotMessages}
            setSubtitles={setSubtitles}
            setStyles={setStyles}
            subtitles={subtitles}
            styles={styles}
            videoFile={videoFile}
          />
        )}
      </main>
      {/* <footer>
        <VideoTimeline />
      </footer> */}
    </div>
  );
}

export default App;