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
import KeyboardHints from './components/KeyboardHints';
import type { Message } from './components/SidebarCopilot';
import type { AssStyle, Subtitle, ASRResponse } from './types/subtitleTypes';

import { calculateLayers } from './utils/subtitleUtils';
import type { VideoContentRect } from './utils/CoordinateMapper';
import { useHistory } from './hooks/useHistory';
import { splitGroupByCharacters, subtitleToCaptionGroup, captionGroupToSubtitle } from './types/captionModel';
import CaptionPropertiesPanel from './components/CaptionPropertiesPanel';
import AssPreviewCanvas from './components/AssPreviewCanvas';

function MainApp() {
  // Copilot 侧边栏开关
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(() => localStorage.getItem('onboarding_done') !== 'true');
  const dismissOnboarding = () => { setShowOnboarding(false); localStorage.setItem('onboarding_done', 'true'); };
  // Copilot 消息历史
  const [copilotMessages, setCopilotMessages] = useState<Message[]>([]);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  
  // Use useHistory for subtitles state
  const { 
    state: subtitles, 
    set: setSubtitles, 
    undo, 
    redo, 
  } = useHistory<Subtitle[]>([]);

  const [selectedSubtitleIds, setSelectedSubtitleIds] = useState<string[]>([]);
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [layoutWidth, setLayoutWidth] = useState(window.innerWidth);
  const [, setRect] = useState({ w: 0, h: 0, left: 0, top: 0 });
  const [layoutHeight, setLayoutHeight] = useState(window.innerHeight - 56); // header 高度 56px
  const videoRef = useRef<HTMLVideoElement>(null); // Explicitly define videoRef type
  // ASS字幕的PlayRes设置，从视频分辨率获取
  const [playResX, setPlayResX] = useState<number>(1920);
  const [playResY, setPlayResY] = useState<number>(1080);
  const [contentRect, setContentRect] = useState<VideoContentRect>({ left: 0, top: 0, width: 640, height: 360 });
  const [assPreviewEnabled, setAssPreviewEnabled] = useState(false);
  const [assRendererReady, setAssRendererReady] = useState(false);

  // 主题状态管理
  const [theme, setTheme] = useState<'dark' | 'light'>(() => { const s = localStorage.getItem('theme'); return (s === 'dark' || s === 'light') ? s : 'dark'; });

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
    setTheme(prev => {
      const next = prev === 'dark' ? 'light' : 'dark';
      localStorage.setItem('theme', next);
      return next;
    });
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
  const handleStyleUpdate = useCallback((styleName: string, updates: Partial<AssStyle>) => {
    setStyles(prev => prev.map(s => s.Name === styleName ? { ...s, ...updates } : s));
  }, []);
  const handleAssRendererState = useCallback((ready: boolean) => setAssRendererReady(ready), []);
  const handleImportProject = useCallback(async (file: File) => {
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("\u9879\u76ee\u6587\u4ef6\u5fc5\u987b\u662f JSON \u5bf9\u8c61\u3002");
      }

      const project = parsed as Record<string, unknown>;
      const source = Array.isArray(project.subtitles) ? project.subtitles : project.events;
      if (!Array.isArray(source)) {
        throw new Error("\u9879\u76ee\u4e2d\u7f3a\u5c11 subtitles \u6216 events \u6570\u7ec4\u3002");
      }

      const importedSubtitles: Subtitle[] = source.map((entry, index) => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
          throw new Error(`\u7b2c ${index + 1} \u6761\u5b57\u5e55\u683c\u5f0f\u65e0\u6548\u3002`);
        }
        const item = entry as Record<string, unknown>;
        const start = item.start;
        const end = item.end;
        if ((typeof start !== "string" && typeof start !== "number") || (typeof end !== "string" && typeof end !== "number") || typeof item.text !== "string") {
          throw new Error(`\u7b2c ${index + 1} \u6761\u5b57\u5e55\u7f3a\u5c11\u6709\u6548\u7684 start\u3001end \u6216 text\u3002`);
        }
        return {
          id: typeof item.id === "string" ? item.id : `project-${index + 1}-${Date.now()}`,
          start,
          end,
          text: item.text,
          style: typeof item.style === "string" ? item.style : "Default",
          group: typeof item.group === "string" ? item.group : typeof item.speaker === "string" ? item.speaker : "",
          layer: typeof item.layer === "number" ? item.layer : undefined,
          overrides: item.overrides && typeof item.overrides === "object" ? item.overrides as Subtitle["overrides"] : undefined,
          units: Array.isArray(item.units) ? item.units as Subtitle["units"] : undefined,
          words: Array.isArray(item.words) ? item.words as Subtitle["words"] : undefined,
          effect: item.effect && typeof item.effect === "object" ? item.effect as Subtitle["effect"] : undefined,
        };
      });

      const importedStyles = Array.isArray(project.styles)
        ? project.styles.flatMap((entry, index) => {
            if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
            const style = entry as Partial<AssStyle>;
            if (typeof style.Name !== "string" || !style.Name.trim()) return [];
            return [{ ...defaultStyle, ...style, id: typeof style.id === "string" ? style.id : `project-style-${index + 1}` } as AssStyle];
          })
        : [];
      const nextStyles = importedStyles.length ? importedStyles : styles;
      const requestedStyle = typeof project.selectedStyle === "string" ? project.selectedStyle : null;
      const nextSelectedStyle = requestedStyle && nextStyles.some(style => style.Name === requestedStyle)
        ? requestedStyle
        : nextStyles[0]?.Name || "Default";

      setSubtitles(calculateLayers(importedSubtitles));
      setStyles(nextStyles);
      setSelectedStyle(nextSelectedStyle);
      setSelectedSubtitleIds([]);
      setSelectedUnitId(null);

      const resolution = project.resolution && typeof project.resolution === "object" && !Array.isArray(project.resolution)
        ? project.resolution as Record<string, unknown>
        : null;
      const importedWidth = typeof project.playResX === "number" ? project.playResX : resolution?.width;
      const importedHeight = typeof project.playResY === "number" ? project.playResY : resolution?.height;
      if (typeof importedWidth === "number" && importedWidth > 0) setPlayResX(importedWidth);
      if (typeof importedHeight === "number" && importedHeight > 0) setPlayResY(importedHeight);
    } catch (error) {
      const message = error instanceof Error ? error.message : "\u672a\u77e5\u9519\u8bef";
      window.alert(`\u5bfc\u5165\u9879\u76ee\u5931\u8d25\uff1a${message}`);
    }
  }, [setSubtitles, styles]);

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
          setSelectedUnitId(null);
          return; // Don't seek when multi-selecting
      }

      setSelectedSubtitleIds([subtitle.id]);
      setSelectedUnitId(null);
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

  const handleSeekToTime = useCallback((time: number) => {
    const video = videoRef.current;
    if (video) { video.currentTime = time; }
  }, []);

  const handleSubtitleUpdate = useCallback((updatedSub: Subtitle, transient: boolean = false) => {
    setSubtitles(prev => prev.map(sub => sub.id === updatedSub.id ? updatedSub : sub), { transient });
  }, [setSubtitles]);

  return (
    <>
    <div className="app-container">
      {showOnboarding && (
        <div style={{background:"linear-gradient(135deg,#1a1a2e,#16213e)",color:"#e0e0e0",padding:"14px 24px",display:"flex",alignItems:"center",justifyContent:"space-between",borderBottom:"2px solid #3a7bd5"}}>
          <div style={{display:"flex",alignItems:"center",gap:16}}>
            <span style={{fontSize:24}}>??</span>
            <div>
              <div style={{fontWeight:"bold",fontSize:16,marginBottom:4}}>欢迎使用 AI 字幕识别生成器</div>
              <div style={{fontSize:13,color:"#999",lineHeight:1.6}}>三步上手：导入视频 → 语音识别 → 编辑并导出。右侧 Copilot 提供 AI 辅助。</div>
            </div>
          </div>
          <button onClick={dismissOnboarding} style={{background:"transparent",border:"1px solid #555",color:"#999",borderRadius:4,padding:"6px 16px",cursor:"pointer",fontSize:13}}>我知道了</button>
        </div>
      )}
      <header>
        <Toolbar
          title="AI字幕识别生成器"
          setVideoFile={setVideoFile}
          videoFile={videoFile}
          onSubtitlesUpdate={(resp: ASRResponse) => {
            const subsArr = resp.events || [];
            console.log("ASR返回的字幕数据：", resp);
            
            const formatted: Subtitle[] = subsArr.map((item) => {
              const group = splitGroupByCharacters({
                ...subtitleToCaptionGroup({
                  id: item.id,
                  start: item.start,
                  end: item.end,
                  text: item.text,
                  style: item.style || "Default",
                  group: item.speaker || "",
                }),
                effect: { type: "whole" },
              }, item.words);
              return {
                ...captionGroupToSubtitle(group),
                start: item.start,
                end: item.end,
                group: item.speaker || "",
                words: item.words,
              };
            });
            
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
          onImportProject={handleImportProject}
        />
      </header>
      {/* 预览字幕 */}
      <SubtitlePreview 
        contentRect={contentRect} 
        subtitles={subtitles} 
        styles={styles}
        videoRef={videoRef} 
        playResX={playResX}  
        playResY={playResY}  
        onStyleUpdate={handleStyleUpdate}
        enabled={!assPreviewEnabled || !assRendererReady}
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
              <span>视频预览</span>
              <button type="button" onMouseDown={event => event.stopPropagation()} onClick={() => setAssPreviewEnabled(value => !value)} style={{ marginLeft: "auto", minWidth: 0, padding: "3px 8px", background: assPreviewEnabled ? "#1677ff" : "rgba(255,255,255,.16)" }}>
                {assPreviewEnabled ? "ASS 渲染" : "CSS 预览"}
              </button>
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
                onContentRectChange={setContentRect}
                videoWidth={playResX}
                videoHeight={playResY}
              >
                <AssPreviewCanvas
                  subtitles={subtitles}
                  styles={styles}
                  videoRef={videoRef}
                  playResX={playResX}
                  playResY={playResY}
                  contentRect={contentRect}
                  enabled={assPreviewEnabled}
                  onRendererState={handleAssRendererState}
                />
              </VideoPanel>
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
                  selectedUnitId={selectedUnitId}
                  setSelectedUnitId={setSelectedUnitId}
                videoRef={videoRef}
                onSeekToTime={handleSeekToTime}
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
              }}>{selectedSubtitleIds.length ? "\u5b57\u5e55\u5c40\u90e8\u5c5e\u6027" : "\u5b57\u5e55\u6837\u5f0f"}</div>
              {/* 这个新添加的 div 才是真正的可滚动区域 */}
              <div style={{ flex: "1 1 0", overflowY: "auto" }}>
                  {selectedSubtitleIds.length ? (
                    <CaptionPropertiesPanel
                      subtitles={subtitles}
                      selectedIds={selectedSubtitleIds}
                      selectedUnitId={selectedUnitId}
                      setSubtitles={setSubtitles}
                    />
                  ) : (
                    <SubtitleStylePanel
                      styles={styles}
                      setStyles={setStyles}
                      selectedStyle={selectedStyle}
                      setSelectedStyle={setSelectedStyle}
                      contentRect={contentRect}
                      playResX={playResX}
                      playResY={playResY}
                    />
                  )}
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
    <KeyboardHints />
    </>
  );
}

function App() {
  return <MainApp />;
}


export default App;
