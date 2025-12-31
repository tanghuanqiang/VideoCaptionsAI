import { useEffect, useMemo, useRef, useState, useCallback } from 'react'; // Added useCallback
// import reactLogo from './assets/react.svg'
// import viteLogo from '/vite.svg'
import './App.css'

// import React from "react";
import "./App.css";
import Toolbar from "./components/Toolbar";
import VideoPanel from "./components/VideoPanel";
import SubtitleEditor from "./components/SubtitleEditor";
import VideoTimeline from "./components/VideoTimeline";
import { defaultStyle } from "./constants";

import GridLayout from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import SubtitleStylePanel from './components/SubtitleStylePanel';
import SubtitlePreview from './components/SubtitlePreview';
import SidebarCopilot from './components/SidebarCopilot';
import type { Message } from './components/SidebarCopilot';
import type { AssStyle, Subtitle, ASRResponse } from './types/subtitleTypes';

import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/Login';
import { calculateLayers } from './utils/subtitleUtils';
import { useHistory } from './hooks/useHistory';

function MainApp() {
  // Copilot 侧边栏开关
  const [copilotOpen, setCopilotOpen] = useState(false);
  // Copilot 消息历史
  const [copilotMessages, setCopilotMessages] = useState<Message[]>([]);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  
  // Use useHistory for subtitles state
  const { 
    state: subtitles, 
    set: setSubtitles, 
    undo, 
    redo, 
    canUndo, 
    canRedo,
    reset: resetSubtitles
  } = useHistory<Subtitle[]>([]);

  const [selectedSubtitleIds, setSelectedSubtitleIds] = useState<string[]>([]);
  const [layoutWidth, setLayoutWidth] = useState(window.innerWidth);
  const [rect, setRect] = useState({ w: 0, h: 0, left: 0, top: 0 });
  const [layoutHeight, setLayoutHeight] = useState(window.innerHeight - 56); // header 高度 56px
  const videoRef = useRef<HTMLVideoElement>(null); // Explicitly define videoRef type
  // ASS字幕的PlayRes设置，从视频分辨率获取
  const [playResX, setPlayResX] = useState<number>(1920);
  const [playResY, setPlayResY] = useState<number>(1080);

  // 主题状态管理
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  // Keyboard shortcuts for Undo/Redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  useEffect(() => {
    let timeoutId: number;
    const handleResize = () => {
      window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => {
        setLayoutWidth(window.innerWidth);
        setLayoutHeight(window.innerHeight - 56);
      }, 100);
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.clearTimeout(timeoutId);
    };
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
    { i: "timeline", x: 0, y: 4*alpha, w: 12*alpha, h: 2*alpha, minW: 3*alpha, minH: 1*alpha },
    { i: "subtitle", x: 7*alpha, y: 0, w: 5*alpha, h: 4*alpha, minW: 2*alpha, minH: 2*alpha },
    { i: "style", x: 12*alpha, y: 0, w: 4*alpha, h: 7*alpha, minW: 2*alpha, minH: 2*alpha },
  ];
  const videoUrl = useMemo(() => videoFile ? URL.createObjectURL(videoFile) : "", [videoFile]);

  const handleSubtitleSelect = useCallback((subtitle: Subtitle, e?: React.MouseEvent) => {
      if (e?.ctrlKey || e?.metaKey) {
          setSelectedSubtitleIds(prev => {
              const isSelected = prev.includes(subtitle.id);
              if (isSelected) {
                  return prev.filter(id => id !== subtitle.id);
              } else {
                  return [...prev, subtitle.id];
              }
          });
          return; // Don't seek when multi-selecting
      }

      setSelectedSubtitleIds([subtitle.id]);
      if (videoRef.current) {
          let time = 0;
          if (typeof subtitle.start === 'number') {
              time = subtitle.start;
          } else if (typeof subtitle.start === 'string') {
              const parts = subtitle.start.split(':');
              if (parts.length === 3) {
                 const h = parseInt(parts[0], 10);
                 const m = parseInt(parts[1], 10);
                 const s = parseFloat(parts[2]);
                 time = h * 3600 + m * 60 + s;
              }
          }
          if (time >= 0) {
              videoRef.current.currentTime = time;
          }
      }
  }, []);

  const handleSubtitleDelete = useCallback((subtitle: Subtitle) => {
    setSubtitles(prev => prev.filter(s => s.id !== subtitle.id));
    setSelectedSubtitleIds(prev => prev.filter(id => id !== subtitle.id));
  }, [setSubtitles]);

  // Keyboard delete support
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Delete' || e.key === 'Backspace') {
            // Check if input is active
            const active = document.activeElement as HTMLElement;
            if (active?.tagName === 'INPUT' || active?.tagName === 'TEXTAREA' || active?.isContentEditable) {
                return;
            }
            
            if (selectedSubtitleIds.length > 0) {
                setSubtitles(prev => prev.filter(s => !selectedSubtitleIds.includes(s.id)));
                setSelectedSubtitleIds([]);
            }
        }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedSubtitleIds, setSubtitles]);

  const handleSubtitleUpdate = useCallback((updatedSub: Subtitle, transient: boolean = false) => {
    setSubtitles(prev => prev.map(sub => sub.id === updatedSub.id ? updatedSub : sub), { transient });
  }, [setSubtitles]);

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
            
            const layered = calculateLayers(formatted);
            setSubtitles(layered);

            if (resp.recommended_style) {
              console.log("应用推荐样式:", resp.recommended_style);
              setStyles(prev => {
                const newStyle = resp.recommended_style!;
                // 确保 ID 存在
                if (!newStyle.id) newStyle.id = newStyle.Name;
                
                const exists = prev.find(s => s.Name === newStyle.Name);
                if (exists) {
                  return prev.map(s => s.Name === newStyle.Name ? newStyle : s);
                } else {
                  return [...prev, newStyle];
                }
              });
              setSelectedStyle(resp.recommended_style.Name);
            }
          }}
          styles={styles}
          subtitles={subtitles}
          theme={theme}
          toggleTheme={toggleTheme}
          playResX={playResX}
          playResY={playResY}
          copilotOpen={copilotOpen}
          toggleCopilot={() => setCopilotOpen(v => !v)}
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
        {/* Copilot 侧边栏开关按钮已移动到 Toolbar */}

        <GridLayout
          className="layout"
          layout={layout}
          cols={16 * alpha}
          rowHeight={layoutHeight / (9 * alpha)}
          width={layoutWidth}
          draggableHandle=".panel-header"
          draggableCancel="input, textarea, select, .nodrag"
          style={{ height: "100%", width: '100%', minWidth: 0 }}
          onDragStop={() => updateRect()} // Update rect when dragging stops
          onResizeStop={() => updateRect()} // Update rect when resizing stops
        >
          <div
            key="video"
            style={{
              background: "var(--ant-color-bg-container)",
              borderRadius: 16,
              boxShadow: "0 4px 24px rgba(0,0,0,0.18)",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div className="panel-header" style={{ 
              cursor: "move", 
              background: "var(--ant-color-primary)", 
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
          <div key="timeline" style={{
              background: "var(--ant-color-bg-container)",
              borderRadius: 16,
              boxShadow: "0 4px 24px rgba(0,0,0,0.18)",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden"
          }}>
             <div className="panel-header" style={{
                  cursor: "move",
                  background: "var(--ant-color-primary)",
                  color: "#fff",
                  padding: "8px 16px",
                  fontWeight: "bold",
                  borderTopLeftRadius: 16,
                  borderTopRightRadius: 16,
                  flex: "0 0 auto"
              }}>
                  视频进度
              </div>
              <div style={{ flex: 1, minHeight: 0 }}>
                  <VideoTimeline 
                    videoRef={videoRef} 
                    videoUrl={videoUrl} 
                    subtitles={subtitles}
                    onSubtitleSelect={handleSubtitleSelect}
                    onSubtitleUpdate={handleSubtitleUpdate}
                    onSubtitleDelete={handleSubtitleDelete}
                    selectedSubtitleIds={selectedSubtitleIds}
                  />
              </div>
          </div>
          <div key="subtitle" className="subtitle-panel" style={{
            background: "var(--ant-color-bg-container)", 
            borderRadius: 16, 
            boxShadow: "0 4px 24px rgba(0,0,0,0.18)", 
            display: "flex",
            flexDirection: "column",
            position: "relative",
            minHeight: 0
          }}>
            <div className="panel-header" style={{
              cursor: "move", 
              background: "var(--ant-color-primary)", 
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
                selectedIds={selectedSubtitleIds}
                setSelectedIds={setSelectedSubtitleIds}
                videoRef={videoRef}
              />
            </div>
          
          </div>
          <div key="style" style={{
              background: "var(--ant-color-bg-container)",
              borderRadius: 16,
              boxShadow: "0 4px 24px rgba(0,0,0,0.18)",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden"
          }}>
              <div className="panel-header" style={{
                  cursor: "move",
                  background: "var(--ant-color-primary)",
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

function App() {
  return (
    <AuthProvider>
      <AuthGuard />
    </AuthProvider>
  );
}

function AuthGuard() {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <MainApp /> : <Login />;
}

export default App;