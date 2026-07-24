import React, { useState, useRef, useEffect } from "react";
import "./Toolbar.css";
import type { ASRResponse, Subtitle, AssStyle, SubtitleEvent } from "../types/subtitleTypes";
import DownloadProgress from "./DownloadProgress";
import { toSRT, toASS, downloadFile } from "../utils/subtitleUtils";
import { ffmpegService } from "../utils/ffmpegService";
import { driver } from "driver.js";
import "driver.js/dist/driver.css";
import "./DriverDarkTheme.css";
import { basicWorkflowSteps, editingShortcutsSteps, stylingSteps } from "../utils/tutorialSteps";
// import { getRecommendedModeText } from "../utils/deviceDetection";


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
  copilotOpen: boolean;
  toggleCopilot: () => void;
  onImportProject: (file: File) => void | Promise<void>;
}

const Toolbar: React.FC<ToolbarProps> = ({ title, setVideoFile, videoFile, onSubtitlesUpdate, styles, subtitles, theme, toggleTheme, playResX = 1920, playResY = 1080, copilotOpen, toggleCopilot, onImportProject }) => {
  // Auth removed - no login required
  const [recognizing, setRecognizing] = useState(false);
  const [asrError, setAsrError] = useState<string | null>(null);
  const [videoHeight, setVideoHeight] = useState<number | null>(null);
  const [videoWidth, setVideoWidth] = useState<number | null>(null);
  const [videoDuration, setVideoDuration] = useState<number | null>(null); // 视频时长（秒）
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [asrQuality, setAsrQuality] = useState<'standard' | 'high' | 'professional'>('standard');
  const exportMenuRef = useRef<HTMLDivElement>(null);

  const [showTutorialMenu, setShowTutorialMenu] = useState(false);
  const tutorialMenuRef = useRef<HTMLDivElement>(null);

  const startTutorial = (type: 'basic' | 'shortcuts' | 'styling') => {
    setShowTutorialMenu(false);
    let steps = basicWorkflowSteps;
    if (type === 'shortcuts') steps = editingShortcutsSteps;
    if (type === 'styling') steps = stylingSteps;

    const driverObj = driver({
      showProgress: true,
      steps: steps,
      popoverClass: 'tutorial-popover',
      nextBtnText: '下一步',
      prevBtnText: '上一步',
      doneBtnText: '完成',
    });
    driverObj.drive();
  };

  const [downloadProgress, setDownloadProgress] = useState<{
    isVisible: boolean;
    progress: number;
    status: 'uploading' | 'processing' | 'downloading' | 'completed' | 'error';
    fileName: string;
    errorMessage?: string;
    isMinimized: boolean;
    estimatedDuration?: number;
  }>({
    isVisible: false,
    progress: 0,
    status: 'uploading',
    fileName: '',
    isMinimized: false,
  });

  // Update video duration when videoFile changes
  useEffect(() => {
    if (videoFile) {
      const url = URL.createObjectURL(videoFile);
      const video = document.createElement("video");
      video.preload = "metadata";
      video.src = url;
      video.onloadedmetadata = () => {
        setVideoWidth(video.videoWidth);
        setVideoHeight(video.videoHeight);
        setVideoDuration(video.duration);
        URL.revokeObjectURL(url);
      };
    }
  }, [videoFile]);

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
        setShowExportMenu(false);
      }
      if (tutorialMenuRef.current && !tutorialMenuRef.current.contains(event.target as Node)) {
        setShowTutorialMenu(false);
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




  const handleExportVideo = async () => {
    if (!videoFile) {
      alert("请先导入视频文件");
      return;
    }
    if (downloadProgress.isVisible) {
      return;
    }

    // 强制使用后端渲染
    const useBackend = true;

    let fileName: string = "";
    try {
      const defaultName = `${videoFile.name.replace(/\.[^/.]+$/, "")}_with_subtitles.mp4`;
      const userInput = window.prompt("请输入保存的文件名:", defaultName);
      if (!userInput) {
        return;
      }
      fileName = userInput;
    } catch {
      console.log("用户取消了文件保存选择");
      return;
    }

    if (useBackend) {
      // 后端烧录模式
      await handleBackendBurn(fileName);
    }
  };


  // 后端烧录逻辑
  const handleBackendBurn = async (fileName: string) => {
    // 提前计算预估时间，以便在上传阶段就能显示
    let estimatedProcessingTime = 60; // 默认值
    if (videoDuration) {
        // 基础处理系数 (服务器通常比实时快)
        const baseFactor = 0.5;

        // 分辨率系数
        let resolutionFactor = 1.0;
        if (videoWidth && videoHeight) {
            const pixelCount = videoWidth * videoHeight;
            const basePixels = 1920 * 1080; // 1080p基准
            resolutionFactor = Math.sqrt(pixelCount / basePixels); // 使用平方根平滑增长
        }

        estimatedProcessingTime = videoDuration * baseFactor * resolutionFactor;

        // 加上固定的开销时间 (上传处理、启动ffmpeg等)
        estimatedProcessingTime += 5;

        // 限制最小和最大预估时间
        estimatedProcessingTime = Math.max(10, Math.min(600, estimatedProcessingTime));
    }

    setDownloadProgress({
      isVisible: true,
      progress: 0,
      status: 'uploading',
      fileName: fileName,
      errorMessage: undefined,
      isMinimized: false,
      estimatedDuration: estimatedProcessingTime, // 初始设置预估时间
    });

    try {
      // Use shared toASS function (single source of truth, avoids duplicates)
      const assFileContent = toASS(subtitles, styles, videoWidth || 1920, videoHeight || 1080);

      // 上传文件到后端
      const formData = new FormData();
      formData.append('file', videoFile!);
      formData.append('ass_file', new Blob([assFileContent], { type: 'text/plain' }), 'subtitles.ass');

      console.log("📤 开始上传文件到服务器...");

      // 使用 XMLHttpRequest 以获取上传进度
      const result = await new Promise<{ task_id: string }>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/burn/');

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const percentComplete = Math.round((event.loaded / event.total) * 100);
            // 上传阶段占用 0-30% 的总进度
            const mappedProgress = Math.floor(percentComplete * 0.3);
            setDownloadProgress(prev => ({
              ...prev,
              progress: mappedProgress,
              status: 'uploading'
            }));
          }
        };

        xhr.onload = () => {
          if (xhr.status === 413) {
            reject(new Error('文件过大，超过服务器限制'));
            return;
          }

          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const response = JSON.parse(xhr.responseText);
              resolve(response);
            } catch {
              reject(new Error('Invalid JSON response'));
            }
          } else {
            reject(new Error(`上传失败: ${xhr.status} ${xhr.statusText}`));
          }
        };

        xhr.onerror = () => reject(new Error('Network error'));
        xhr.send(formData);
      });

      const taskId = result.task_id;

      console.log(`✅ 任务已提交，任务ID: ${taskId}`);
      console.log(`🎥 视频时长: ${videoDuration ? videoDuration.toFixed(1) : '未知'}秒`);

      // 上传完成，设置为30%并开始处理
      setDownloadProgress(prev => ({ ...prev, progress: 30, status: 'processing' }));
      console.log("🔄 开始基于时长的进度预测...");

      // 轮询任务状态（传递视频时长用于智能预测）
      await pollTaskStatus(taskId, fileName, videoDuration || 60, estimatedProcessingTime);

    } catch (error) {
      console.error("后端烧录失败:", error);
      setDownloadProgress(prev => ({
        ...prev,
        status: 'error',
        errorMessage: error instanceof Error ? error.message : '导出失败',
      }));
    }
  };

  // 轮询后端任务状态（基于视频时长的倍计时进度）
  const pollTaskStatus = async (taskId: string, fileName: string, videoDurationSeconds: number, estimatedProcessingTime: number) => {
    console.log(`🔍 pollTaskStatus 启动 - taskId: ${taskId}, 视频时长: ${videoDurationSeconds}s`);

    const maxAttempts = 300;
    let attempts = 0;
    let progressInterval: number | null = null;
    let isCompleted = false;

    // 从30%到99%需要增长69%
    const totalProgressSteps = 69;
    const progressIntervalMs = (estimatedProcessingTime * 1000) / totalProgressSteps;

    console.log(`🎥 视频: ${videoDurationSeconds.toFixed(1)}s | 预估: ${estimatedProcessingTime.toFixed(1)}s | 间隔: ${progressIntervalMs.toFixed(0)}ms`);

    // 启动倍计时进度：从30%平滑增长到99%
    console.log(`⏱️ 启动倍计时进度，预计${estimatedProcessingTime.toFixed(1)}秒完成`);
    progressInterval = setInterval(() => {
      if (!isCompleted) {
        setDownloadProgress(prev => {
          if (prev.progress < 99 && prev.status === 'processing') {
            return { ...prev, progress: Math.min(prev.progress + 1, 99) };
          }
          return prev;
        });
      }
    }, progressIntervalMs);

    const poll = async (): Promise<void> => {
      try {
        const response = await fetch(`/api/burn/task/${taskId}`);

        if (!response.ok) {
          throw new Error(`查询任务状态失败: ${response.statusText}`);
        }

        const taskInfo = await response.json();
        console.log(`任务状态: ${taskInfo.status}, 后端进度: ${taskInfo.progress}%`);

        // 更新进度条（如果后端有真实进度，则使用后端进度，否则保持前端估算）
        if (taskInfo.status === 'processing' && taskInfo.progress > 0) {
          // 清除前端的估算定时器，改用后端真实进度
          if (progressInterval) {
            clearInterval(progressInterval);
            progressInterval = null;
          }
          setDownloadProgress(prev => ({
            ...prev,
            progress: Math.max(prev.progress, taskInfo.progress), // 确保进度不倒退
            status: 'processing'
          }));
        }

        if (taskInfo.status === 'completed') {
          // 任务完成
          isCompleted = true;

          console.log("✅ 任务完成，准备下载...");

          setDownloadProgress(prev => ({ ...prev, status: 'downloading' }));

          // 下载文件
          await downloadFromBackend(taskId, fileName);
          return;
        }

        if (taskInfo.status === 'failed' || taskInfo.status === 'cancelled') {
          isCompleted = true;
          throw new Error(taskInfo.error || '任务失败');
        }

        // 继续轮询
        attempts++;
        if (attempts >= maxAttempts) {
          isCompleted = true;
          throw new Error('任务超时');
        }

        setTimeout(() => poll(), 1500); // 每1.5秒轮询一次（减少服务器负载）
      } catch (error) {
        isCompleted = true;
        console.error('轮询任务状态失败:', error);
        setDownloadProgress(prev => ({
          ...prev,
          status: 'error',
          errorMessage: error instanceof Error ? error.message : '查询失败',
        }));
      }
    };

    await poll();
  };

  // 从后端下载烧录完成的视频
  const downloadFromBackend = async (taskId: string, fileName: string) => {
    try {
      setDownloadProgress(prev => ({ ...prev, progress: 100, status: 'completed' }));

      // 使用带 Token 的 URL 直接触发浏览器下载，避免 fetch/blob 的 CORS 和内存问题
      const encodedFileName = encodeURIComponent(fileName);
      const downloadUrl = `/api/burn/download/${taskId}?filename=${encodedFileName}`;

      const downloadLink = document.createElement('a');
      downloadLink.href = downloadUrl;
      downloadLink.download = fileName; // 浏览器可能会优先使用 Content-Disposition
      downloadLink.style.display = 'none';
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);

      console.log("已触发视频下载");
    } catch (error) {
      console.error('下载触发失败:', error);
      setDownloadProgress(prev => ({
        ...prev,
        status: 'error',
        errorMessage: error instanceof Error ? error.message : '下载失败',
      }));
    }
  };

  const doASR = async (file: File) => {
    setRecognizing(true);
    setAsrError(null);
    try {
      // 1. 尝试在前端提取音频（根据质量模式选择参数）
      let fileToUpload: File | Blob = file;
      let audioOptions;

      // 根据质量模式配置音频压缩参数
      switch (asrQuality) {
        case 'professional':
          audioOptions = { sampleRate: 48000, bitrate: '192k', channels: 2 };
          break;
        case 'high':
          audioOptions = { sampleRate: 44100, bitrate: '128k', channels: 2 };
          break;
        default: // 'standard'
          audioOptions = { sampleRate: 16000, bitrate: '64k', channels: 1 };
      }

      try {
        console.log("开始前端音频提取...", audioOptions);
        const audioBlob = await ffmpegService.extractAudio(file, audioOptions);
        console.log("音频提取成功，大小:", audioBlob.size);
        // 创建一个新的 File 对象，或者直接使用 Blob
        fileToUpload = new File([audioBlob], "audio.mp3", { type: "audio/mp3" });
      } catch (err) {
        console.warn("前端音频提取失败，将回退到上传原始视频:", err);
        // 提取失败则上传原视频
      }

      const formData = new FormData();
      formData.append("file", fileToUpload);
      formData.append("quality", asrQuality);
      if (videoWidth) formData.append("width", videoWidth.toString());
      if (videoHeight) formData.append("height", videoHeight.toString());

      const resp = await fetch("/api/asr/", {
        method: "POST",
        body: formData,
      });

      if (resp.status === 413) {
        throw new Error("文件过大，超过服务器限制");
      }

      if (!resp.ok) {
        const payload = await resp.json().catch(() => null);
        const detail = payload?.detail;
        const message = typeof detail === "string" ? detail : detail?.message;
        throw new Error(message || `识别失败（HTTP ${resp.status}）`);
      }

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
        words: item.words,
        units: item.units,
        overrides: item.overrides,
        effect: item.effect,
      }));
      const asrResponse: ASRResponse = {
        language: data.language || "",
        resolution: data.resolution || "",
        fps: data.fps || "",
        events: formatted,
        recommended_style: data.recommended_style,
      };
      onSubtitlesUpdate(asrResponse);
      if (formatted.length === 0) {
        setAsrError("未识别到可用语音，请检查视频是否包含清晰的人声音轨。");
      }
    } catch (e) {
      const rawMessage = e instanceof Error ? e.message : "识别失败，请稍后重试。";
      const message = e instanceof TypeError ? "无法连接语音识别服务，请确认后端已启动（127.0.0.1:8000）。" : rawMessage;
      setAsrError(message);
      console.error("ASR request failed", e);
    } finally {
      setRecognizing(false);
    }
  };



  return (
    <>
      <div className="toolbar">
        <span className="toolbar-title">{title}</span>
        <div className="toolbar-actions toolbar-actions-left toolbar-main-group">
          {/* Tutorial Button */}
          <div style={{ position: 'relative' }} ref={tutorialMenuRef}>
            <button
              className="toolbar-btn toolbar-btn-compact toolbar-tutorial"
              style={{ minWidth: 'auto', padding: '0 12px', gap: '6px', whiteSpace: 'nowrap' }}
              onClick={() => setShowTutorialMenu(!showTutorialMenu)}
              title="使用教程"
            >
              <span>💡</span>
              <span>使用教程</span>
            </button>
            {showTutorialMenu && (
              <div className="tutorial-menu" style={{ left: 0, right: 'auto' }}>
                <div className="tutorial-menu-item" onClick={() => startTutorial('basic')}>
                  <span className="tutorial-icon">🚀</span> 基础流程教学
                </div>
                <div className="tutorial-menu-item" onClick={() => startTutorial('shortcuts')}>
                  <span className="tutorial-icon">⌨️</span> 编辑与快捷键
                </div>
                <div className="tutorial-menu-item" onClick={() => startTutorial('styling')}>
                  <span className="tutorial-icon">🎨</span> 样式与预览
                </div>
              </div>
            )}
          </div>
          <label
            htmlFor="project-upload"
            className="toolbar-btn toolbar-btn-compact toolbar-project-import"
            style={{ minWidth: "118px", padding: "0 14px", gap: "6px", whiteSpace: "nowrap", flexShrink: 0 }}
            title={"\u5bfc\u5165\u9879\u76ee"}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 7h6l2 2h10v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
              <path d="M12 12v6m-3-3 3 3 3-3" />
            </svg>
            <span>{"\u5bfc\u5165\u9879\u76ee"}</span>
            <input
              id="project-upload"
              type="file"
              accept=".json,application/json"
              style={{ display: "none" }}
              onChange={event => {
                const file = event.target.files?.[0];
                if (file) void onImportProject(file);
                event.currentTarget.value = "";
              }}
            />
          </label>

          <label htmlFor="video-upload" className="toolbar-btn toolbar-btn-primary toolbar-import">
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
                  video.onloadedmetadata = () => {
                    setVideoWidth(video.videoWidth);
                    setVideoHeight(video.videoHeight);
                    setVideoDuration(video.duration); // 获取视频时长
                    URL.revokeObjectURL(url);
                  };
                }
              }}
            />
          </label>
          {/* ASR Button 恢复语音识别按钮 */}
          <button
            type="button"
            className="toolbar-btn toolbar-btn-primary toolbar-asr"
            style={{ margin: '0 8px' }}
            disabled={!videoFile || recognizing}
            onClick={() => videoFile && !recognizing && doASR(videoFile)}
            title="语音识别"
          >
            {recognizing ? "识别中..." : "语音识别"}
          </button>
          {/* ASR质量模式选择 */}
          <select
            value={asrQuality}
            onChange={(e) => setAsrQuality(e.target.value as 'standard' | 'high' | 'professional')}
            className="toolbar-select"
            style={{ margin: '0 8px', cursor: 'pointer' }}
            title="识别质量模式"
          >
            <option value="standard">标准(small)</option>
            <option value="high">高质量(medium)</option>
            <option value="professional">专业(large-v3)</option>
          </select>
          <button type="button" className="toolbar-icon-btn" onClick={toggleTheme} title={theme === 'dark' ? "切换到亮色模式" : "切换到暗色模式"}>
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
        <div className="toolbar-actions toolbar-actions-right toolbar-output-group">
          <div className="export-dropdown-container" ref={exportMenuRef} style={{ position: 'relative', display: 'inline-block' }}>
            <button
                type="button"
                onClick={() => setShowExportMenu(!showExportMenu)}
                className="toolbar-btn toolbar-btn-compact export-btn"
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

          {/* Copilot Toggle Button */}
          <button
            className={`copilot-toggle-btn ${copilotOpen ? 'open' : ''}`}
            style={{
              position: 'static',
              margin: '0 12px',
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              padding: 0,
              minWidth: '36px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)', // Keep some shadow
            }}
            title={copilotOpen ? '关闭 Copilot 侧边栏' : '打开 Copilot 侧边栏'}
            onClick={toggleCopilot}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z" />
            </svg>
          </button>

          <button
            type="button"
            className="toolbar-btn toolbar-btn-primary toolbar-btn-compact toolbar-video-export"
            disabled={downloadProgress.isVisible}
            style={{ opacity: downloadProgress.isVisible ? 0.6 : 1, cursor: downloadProgress.isVisible ? "not-allowed" : "pointer" }}
            onClick={handleExportVideo}
          >导出视频</button>
        </div>
      </div>
      {asrError && (
        <div className="toolbar-notice" role="alert">
          <span>{asrError}</span>
          <button type="button" className="toolbar-notice-close" onClick={() => setAsrError(null)} aria-label="关闭提示">×</button>
        </div>
      )}
      {downloadProgress.isVisible && (
        <DownloadProgress
          isVisible={downloadProgress.isVisible}
          progress={downloadProgress.progress}
          status={downloadProgress.status}
          fileName={downloadProgress.fileName}
          errorMessage={downloadProgress.errorMessage}
          isMinimized={downloadProgress.isMinimized}
          onMinimize={() => setDownloadProgress(prev => ({ ...prev, isMinimized: !prev.isMinimized }))}
          estimatedDuration={downloadProgress.estimatedDuration}
          onCancel={() => {
            setDownloadProgress(prev => ({ ...prev, isVisible: false }));
          }}
        />
      )}
    </>
  );
};

export default Toolbar;
