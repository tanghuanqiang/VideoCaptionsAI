import React, { useState, useRef, useEffect } from "react";
import "./Toolbar.css";
import type { ASRResponse, Subtitle, AssStyle, SubtitleEvent } from "../types/subtitleTypes";
import toAssColor from "../utils/toAssColor";
import DownloadProgress from "./DownloadProgress";
import { useAuth } from "../context/AuthContext";
import { toSRT, toASS, downloadFile } from "../utils/subtitleUtils";


interface ToolbarProps {
  title: string;
  setVideoFile: React.Dispatch<React.SetStateAction<File | null>>;
  videoFile: File | null;
  onSubtitlesUpdate: (resp: ASRResponse) => void;
  styles: AssStyle[];
  subtitles: Subtitle[];
  theme: 'dark' | 'light';
  toggleTheme: () => void;
  playResX?: number;
  playResY?: number;
}

const Toolbar: React.FC<ToolbarProps> = ({ title, setVideoFile, videoFile, onSubtitlesUpdate, styles, subtitles, theme, toggleTheme, playResX = 1920, playResY = 1080 }) => {
  const { token } = useAuth();
  const [recognizing, setRecognizing] = useState(false);
  const [videoHeight, setVideoHeight] = useState<number | null>(null);
  const [videoWidth, setVideoWidth] = useState<number | null>(null);
  const [currentXhr, setCurrentXhr] = useState<XMLHttpRequest | null>(null);
  const [processingTimer, setProcessingTimer] = useState<NodeJS.Timeout | null>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  const [downloadProgress, setDownloadProgress] = useState<{
    isVisible: boolean;
    progress: number;
    status: 'uploading' | 'processing' | 'downloading' | 'completed' | 'error';
    fileName: string;
    errorMessage?: string;
    isMinimized: boolean;
  }>({
    isVisible: false,
    progress: 0,
    status: 'uploading',
    fileName: '',
    isMinimized: false,
  });

  // Close export menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
        setShowExportMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleExport = (format: 'srt' | 'ass' | 'txt') => {
      if (subtitles.length === 0) {
          alert("没有可导出的字幕");
          return;
      }

      if (format === 'srt') {
          const content = toSRT(subtitles);
          downloadFile(content, 'subtitles.srt', 'text/plain');
      } else if (format === 'ass') {
          const content = toASS(subtitles, styles, playResX, playResY);
          downloadFile(content, 'subtitles.ass', 'text/plain');
      } else if (format === 'txt') {
          // Export as [Time] Text format
          const content = subtitles.map(s => `[${s.start} - ${s.end}] ${s.text}`).join('\n');
          downloadFile(content, 'subtitles.txt', 'text/plain');
      }
      setShowExportMenu(false);
  };




  const doASR = async (file: File) => {
    setRecognizing(true);
    try {
      // 1. 尝试在前端提取音频
      let fileToUpload: File | Blob = file;
      try {
        console.log("开始前端音频提取...");
        const audioBlob = await ffmpegService.extractAudio(file);
        console.log("音频提取成功，大小:", audioBlob.size);
        // 创建一个新的 File 对象，或者直接使用 Blob
        fileToUpload = new File([audioBlob], "audio.mp3", { type: "audio/mp3" });
      } catch (err) {
        console.warn("前端音频提取失败，将回退到上传原始视频:", err);
        // 提取失败则上传原视频
      }

      const formData = new FormData();
      formData.append("file", fileToUpload);
      
      const resp = await fetch("/api/asr/", { 
        method: "POST", 
        body: formData,
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      if (!resp.ok) throw new Error("识别失败");
      const data = await resp.json();
      const secondsToTimeStr = (seconds: number) => {
        if (typeof seconds !== "number" || isNaN(seconds)) return "00:00:00.00";
        const s = Math.floor(seconds % 60);
        const m = Math.floor((seconds / 60) % 60);
        const h = Math.floor(seconds / 3600);
        const ms = Math.round((seconds - Math.floor(seconds)) * 100);
        return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}.${ms.toString().padStart(2, "0")}`;
      };
      
      const formatted = (data.events || []).map((item: SubtitleEvent) => ({
        id: item.id,
        start: secondsToTimeStr(Number(item.start)),
        end: secondsToTimeStr(Number(item.end)),
        text: item.text,
        style: item.style || "Default",
        group: item.speaker || "",
      }));
      const asrResponse: ASRResponse = {
        language: data.language || "",
        resolution: data.resolution || "",
        fps: data.fps || "",
        events: formatted,
      };
      onSubtitlesUpdate(asrResponse);
    } catch (e) {
      alert("字幕识别失败：" + e);
    } finally {
      setRecognizing(false);
    }
  };



  return (
    <>
      <div className="toolbar">
        <span className="toolbar-title">{title}</span>
        <div className="toolbar-actions toolbar-actions-left">
          <label htmlFor="video-upload" className="toolbar-btn">
            <span>导入视频</span>
            <input
              id="video-upload"
              type="file"
              accept="video/*"
              style={{ display: "none" }}
              onChange={e => {
                const file = e.target.files?.[0];
                if (file) {
                  setVideoFile(file);
                  const url = URL.createObjectURL(file);
                  const video = document.createElement("video");
                  video.preload = "metadata"; video.src = url;
                  video.onloadedmetadata = () => { setVideoWidth(video.videoWidth); setVideoHeight(video.videoHeight); URL.revokeObjectURL(url); };
                }
              }}
            />
          </label>
          <button type="button" className="toolbar-btn" onClick={toggleTheme} title={theme === 'dark' ? "切换到亮色模式" : "切换到暗色模式"}>
            {theme === 'dark' ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5"></circle>
                <line x1="12" y1="1" x2="12" y2="3"></line>
                <line x1="12" y1="21" x2="12" y2="23"></line>
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                <line x1="1" y1="12" x2="3" y2="12"></line>
                <line x1="21" y1="12" x2="23" y2="12"></line>
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
              </svg>
            )}
          </button>
        </div>
        <div className="toolbar-actions toolbar-actions-right">
          <div className="export-dropdown-container" ref={exportMenuRef} style={{ position: 'relative', display: 'inline-block' }}>
            <button 
                type="button" 
                onClick={() => setShowExportMenu(!showExportMenu)}
                className="toolbar-btn export-btn"
            >
                导出字幕 ▼
            </button>
            {showExportMenu && (
                <div className="export-dropdown-menu" style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    backgroundColor: 'var(--ant-color-bg-container)',
                    border: '1px solid var(--ant-color-border)',
                    borderRadius: '4px',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                    zIndex: 1000,
                    minWidth: '120px',
                    marginTop: '4px'
                }}>
                    <div className="export-menu-item" onClick={() => handleExport('srt')}>导出 SRT</div>
                    <div className="export-menu-item" onClick={() => handleExport('ass')}>导出 ASS</div>
                    <div className="export-menu-item" onClick={() => handleExport('txt')}>导出 TXT</div>
                </div>
            )}
          </div>
          <button
            type="button"
            className="toolbar-btn"
            disabled={downloadProgress.isVisible}
            style={{ opacity: downloadProgress.isVisible ? 0.6 : 1, cursor: downloadProgress.isVisible ? "not-allowed" : "pointer" }}
            onClick={async () => {
              if (!videoFile) {
                alert("请先导入视频文件");
                return;
              }
              if (downloadProgress.isVisible) {
                return;
              }
              if (processingTimer) {
                clearTimeout(processingTimer);
                setProcessingTimer(null);
              }
              let fileName: string = "";
              
              try {
                const defaultName = `${videoFile.name.replace(/\.[^/.]+$/, "")}_with_subtitles.mp4`;
                const userInput = window.prompt("请输入保存的文件名:", defaultName);
                if (!userInput) {
                  return; // 用户取消了
                }
                fileName = userInput;
              } catch {
                console.log("用户取消了文件保存选择");
                return;
              }

              // 显示下载进度对话框
              setDownloadProgress({
                isVisible: true,
                progress: 0,
                status: 'uploading',
                fileName: fileName,
                errorMessage: undefined, // 清除之前的错误信息
                isMinimized: false,
              });

              try {
                const assFileContent = `\n[Script Info]\nScriptType: v4.00+\nPlayResX:${videoWidth}\nPlayResY:${videoHeight}\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n${styles.map(style => `Style: ${style.Name},${style.FontName},${style.FontSize},${toAssColor(style.PrimaryColour || "#000000", style.PrimaryAlpha)},${toAssColor(style.SecondaryColour || "#000000", style.SecondaryAlpha)},${toAssColor(style.OutlineColour || "#000000",style.OutlineAlpha)},${toAssColor(style.BackColour || "#000000",style.BackAlpha)},${style.Bold ? 1 : 0},${style.Italic ? 1 : 0},${style.Underline ? 1 : 0},${style.StrikeOut ? 1 : 0},${style.ScaleX},${style.ScaleY},${style.Spacing},${style.Angle},${style.BorderStyle},${style.Outline},${style.Shadow},${style.Alignment},${style.MarginL},${style.MarginR},${style.MarginV},${style.Encoding}`).join('\n')}\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n${subtitles.map(sub => `Dialogue: 0,${sub.start},${sub.end},${sub.style},,0,0,0,,${sub.text}`).join('\n')}`;
                const assBlob = new Blob([assFileContent], { type: "text/plain" });
                const assFile = new File([assBlob], "subtitles.ass", { type: "text/plain" });

                // 使用 XMLHttpRequest 以支持真实进度监控
                console.log("开始导出视频...");
                
                const formData = new FormData();
                formData.append("file", videoFile);
                formData.append("ass_file", assFile);
                formData.append("output_filename", fileName);

                const xhr = new XMLHttpRequest();
                setCurrentXhr(xhr); // 保存xhr实例以支持取消
                
                // 监听上传进度
                xhr.upload.addEventListener('progress', (event) => {
                  if (event.lengthComputable) {
                    const uploadProgress = Math.round((event.loaded / event.total) * 30); // 上传占30%
                    setDownloadProgress(prev => ({
                      ...prev,
                      status: 'uploading',
                      progress: uploadProgress,
                    }));
                  }
                });

                // 监听下载进度
                xhr.addEventListener('progress', (event) => {
                  if (event.lengthComputable) {
                    const downloadProgress = Math.round((event.loaded / event.total) * 1) + 99; // 下载只占1%，从99%开始
                    setDownloadProgress(prev => ({
                      ...prev,
                      status: 'downloading',
                      progress: downloadProgress,
                    }));
                  }
                });

                // 监听状态变化
                xhr.addEventListener('readystatechange', () => {
                  if (xhr.readyState === XMLHttpRequest.HEADERS_RECEIVED) {
                    // 开始接收响应，切换到处理完成状态
                    setDownloadProgress(prev => ({
                      ...prev,
                      status: 'downloading',
                      progress: 99,
                    }));
                  }
                });

                // 设置响应处理
                xhr.onload = function() {
                  if (xhr.status === 200) {
                    try {
                      console.log('收到服务器响应，准备下载文件...');
                      // 获取响应的blob数据
                      const blob = new Blob([xhr.response], { type: 'video/mp4' });
                      console.log('创建Blob成功，大小:', blob.size, 'bytes');
                      
                      // 创建下载链接
                      const downloadUrl = window.URL.createObjectURL(blob);
                      const downloadLink = document.createElement('a');
                      downloadLink.href = downloadUrl;
                      downloadLink.download = fileName; // 使用用户指定的文件名
                      downloadLink.style.display = 'none';
                      
                      console.log('开始下载文件:', fileName);
                      document.body.appendChild(downloadLink);
                      downloadLink.click();
                      document.body.removeChild(downloadLink);
                      
                      // 清理URL对象
                      setTimeout(() => {
                        window.URL.revokeObjectURL(downloadUrl);
                        console.log('清理完成');
                      }, 100);

                      // 更新进度为完成
                      setDownloadProgress(prev => ({
                        ...prev,
                        status: 'completed',
                        progress: 100,
                      }));

                      // 清理定时器
                      if (processingTimer) {
                        clearTimeout(processingTimer);
                        setProcessingTimer(null);
                      }

                    } catch (downloadError) {
                      console.error('下载处理失败:', downloadError);
                      // 清理定时器
                      if (processingTimer) {
                        clearTimeout(processingTimer);
                        setProcessingTimer(null);
                      }
                      setDownloadProgress(prev => ({
                        ...prev,
                        status: 'error',
                        errorMessage: '文件下载失败: ' + (downloadError instanceof Error ? downloadError.message : '未知错误'),
                      }));
                    }
                  } else {
                    // 清理定时器
                    if (processingTimer) {
                      clearTimeout(processingTimer);
                      setProcessingTimer(null);
                    }
                    setDownloadProgress(prev => ({
                      ...prev,
                      status: 'error',
                      errorMessage: `服务器错误: ${xhr.status}`,
                    }));
                  }
                };

                xhr.onerror = function() {
                  // 清理可能存在的处理进度定时器
                  if (processingTimer) {
                    clearInterval(processingTimer);
                    setProcessingTimer(null);
                  }
                  setDownloadProgress(prev => ({
                    ...prev,
                    status: 'error',
                    errorMessage: '网络请求失败',
                  }));
                };

                // 当上传完成时，切换到处理状态
                xhr.upload.onload = function() {
                  setDownloadProgress(prev => ({
                    ...prev,
                    status: 'processing',
                    progress: 30,
                  }));
                  
                  // 智能模拟视频处理进度 - 真实的处理体验
                  let currentProgress = 30;
                  
                  const updateProcessingProgress = () => {
                    // 检查请求是否已被取消
                    if (xhr.readyState === XMLHttpRequest.UNSENT || xhr.readyState === XMLHttpRequest.DONE) {
                      setProcessingTimer(null);
                      return;
                    }
                    
                    setDownloadProgress(prev => {
                      if (prev.status !== 'processing') {
                        setProcessingTimer(null);
                        return prev;
                      }
                      
                      currentProgress += getProgressIncrement(currentProgress);
                      
                      // 确保不超过99%
                      if (currentProgress >= 99) {
                        currentProgress = 99;
                        setProcessingTimer(null);
                      }
                      
                      return { ...prev, progress: Math.floor(currentProgress) };
                    });
                    
                    // 如果还没达到99%，继续更新
                    if (currentProgress < 99) {
                      const nextDelay = getUpdateDelay(currentProgress);
                      const timer = setTimeout(updateProcessingProgress, nextDelay);
                      setProcessingTimer(timer);
                    }
                  };
                  
                  // 根据当前进度计算增量 - 渐进式减速，80%附近极慢
                  const getProgressIncrement = (progress: number) => {
                    // 添加微小的随机变化，让进度更自然
                    const baseIncrement = (() => {
                      if (progress < 40) return 2.2; // 30-40%: 快速增长
                      if (progress < 50) return 1.8; // 40-50%: 中等速度
                      if (progress < 60) return 1.4; // 50-60%: 稍慢
                      if (progress < 68) return 1.0; // 60-68%: 更慢
                      if (progress < 75) return 0.7; // 68-75%: 开始明显变慢
                      if (progress < 78) return 0.3; // 75-78%: 很慢
                      if (progress < 80) return 0.15; // 78-80%: 极慢，营造瓶颈感
                      if (progress < 81) return 0.05; // 80-81%: 几乎停滞
                      if (progress < 82) return 0.1; // 81-82%: 微量进展
                      if (progress < 85) return 0.2; // 82-85%: 缓慢恢复
                      if (progress < 90) return 0.4; // 85-90%: 稍微加速
                      if (progress < 95) return 0.3; // 90-95%: 保持稳定
                      return 0.15; // 95-99%: 等待真实下载
                    })();
                    
                    // 在79-82%区间添加更大的随机性和停滞概率
                    let randomFactor;
                    if (progress >= 79 && progress <= 82) {
                      // 在80%附近有30%的概率完全停滞，70%的概率缓慢前进
                      if (Math.random() < 0.3) {
                        randomFactor = 0; // 完全停滞
                      } else {
                        randomFactor = 0.2 + Math.random() * 0.8; // 20%-100%的进展
                      }
                    } else {
                      randomFactor = 0.8 + Math.random() * 0.4; // 正常的80%-120%随机性
                    }
                    
                    return baseIncrement * randomFactor;
                  };
                  
                  // 根据当前进度计算更新间隔 - 80%附近频繁更新但进展缓慢
                  const getUpdateDelay = (progress: number) => {
                    const baseDelay = (() => {
                      if (progress < 40) return 800;  // 0.8秒 - 快速更新
                      if (progress < 50) return 1000; // 1秒
                      if (progress < 60) return 1200; // 1.2秒
                      if (progress < 68) return 1500; // 1.5秒
                      if (progress < 75) return 2000; // 2秒 - 开始变慢
                      if (progress < 78) return 2500; // 2.5秒
                      if (progress < 80) return 1800; // 1.8秒 - 更频繁的更新，但进展慢
                      if (progress < 82) return 2200; // 2.2秒 - 让用户看到努力但缓慢
                      if (progress < 85) return 2800; // 2.8秒 - 逐渐恢复
                      if (progress < 90) return 2000; // 2秒 - 继续处理
                      if (progress < 95) return 2500; // 2.5秒
                      return 3000; // 3秒，最后阶段
                    })();
                    
                    // 在79-82%区间保持相对稳定的更新间隔，让停滞感更明显
                    let randomFactor;
                    if (progress >= 79 && progress <= 82) {
                      // 80%附近保持较小的时间波动，让停滞感更一致
                      randomFactor = 0.8 + Math.random() * 0.4; // 80%-120%的较小随机性
                    } else {
                      randomFactor = 0.7 + Math.random() * 0.6; // 正常的70%-130%随机性
                    }
                    
                    return Math.floor(baseDelay * randomFactor);
                  };
                  
                  // 开始处理进度更新
                  updateProcessingProgress();
                };

                // 设置请求参数
                xhr.responseType = 'arraybuffer'; // 重要：设置为arraybuffer以正确处理二进制数据
                xhr.open('POST', '/api/burn/');
                xhr.setRequestHeader('Authorization', `Bearer ${token}`);
                xhr.send(formData);

              } catch (error) {
                setDownloadProgress(prev => ({
                  ...prev,
                  status: 'error',
                  errorMessage: error instanceof Error ? error.message : '导出失败',
                }));
              } finally {
                setCurrentXhr(null); // 清理xhr引用
              }
            }}
          >导出视频</button>
        </div>
      </div>
      
      {downloadProgress.isVisible && (
        <DownloadProgress
          isVisible={downloadProgress.isVisible}
          progress={downloadProgress.progress}
          status={downloadProgress.status}
          fileName={downloadProgress.fileName}
          errorMessage={downloadProgress.errorMessage}
          isMinimized={downloadProgress.isMinimized}
          onMinimize={() => setDownloadProgress(prev => ({ ...prev, isMinimized: !prev.isMinimized }))}
          onCancel={() => {
            // 取消当前的XMLHttpRequest
            if (currentXhr) {
              currentXhr.abort();
              setCurrentXhr(null);
            }
            // 清理处理进度定时器
            if (processingTimer) {
              clearTimeout(processingTimer);
              setProcessingTimer(null);
            }
            setDownloadProgress(prev => ({ ...prev, isVisible: false }));
          }}
        />
      )}
    </>
  );
};

export default Toolbar;
