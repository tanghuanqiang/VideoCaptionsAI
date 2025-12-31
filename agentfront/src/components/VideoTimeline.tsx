import React, { useEffect, useState, useRef, useCallback, useLayoutEffect } from "react";
import "./VideoTimeline.css";
import type { Subtitle } from "../types/subtitleTypes";
import { parseTime, formatTime } from "../utils/subtitleUtils";

interface VideoTimelineProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  videoUrl: string;
  subtitles?: Subtitle[];
  onSubtitleSelect?: (subtitle: Subtitle, event?: React.MouseEvent) => void;
  onSubtitleUpdate?: (subtitle: Subtitle, transient?: boolean) => void;
  onSubtitleDelete?: (subtitle: Subtitle) => void;
  selectedSubtitleIds?: string[];
}

// 缩略图生成器配置
const THUMB_WIDTH = 106;
const THUMB_HEIGHT = 60;
const MIN_INTERVAL = 0.5; // 增加最小间隔，减少缩略图数量
const BUFFER_RATIO = 2.0; // 增加缓冲区
const MAX_ZOOM = 10; // 限制最大放大倍数

const VideoTimeline: React.FC<VideoTimelineProps> = ({ videoRef, videoUrl, subtitles = [], onSubtitleSelect, onSubtitleUpdate, onSubtitleDelete, selectedSubtitleIds = [] }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 0 });
  // 使用 ref 追踪 visibleRange，以便在异步生成器中访问最新值
  const visibleRangeRef = useRef(visibleRange);

  // 缩略图缓存：Map<time, dataUrl>
  const thumbnailCache = useRef<Map<number, string>>(new Map());
  // 当前显示的缩略图列表
  const [visibleThumbnails, setVisibleThumbnails] = useState<{ time: number; src: string; width: number }[]>([]);
  
  const timelineRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const currentTimeRef = useRef<HTMLSpanElement>(null);
  const animationFrameRef = useRef<number>(0);
  const [isDragging, setIsDragging] = useState(false);
  
  // Scrollbar Refs
  const scrollbarHandleRef = useRef<HTMLDivElement>(null);
  const scrollbarTrackRef = useRef<HTMLDivElement>(null);
  const scrollbarDragRef = useRef<{
      isDragging: boolean;
      startX: number;
      startScrollLeft: number;
  } | null>(null);

  // Subtitle Dragging State
  const dragRef = useRef<{
      isDragging: boolean;
      type: 'move' | 'resize-left' | 'resize-right';
      subtitleId: string;
      startX: number;
      startY: number;
      originalStart: number;
      originalEnd: number;
      originalLayer: number;
  } | null>(null);

  // 生成器专用 video 和 canvas
  const generatorRef = useRef<{ video: HTMLVideoElement; canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D | null } | null>(null);
  const generationQueue = useRef<number[]>([]);
  const isGenerating = useRef(false);
  // 用于强制触发更新的计数器
  const [generationTrigger, setGenerationTrigger] = useState(0);

  // 音频波形数据
  const [audioPeaks, setAudioPeaks] = useState<number[] | null>(null);
  const waveformCanvasRef = useRef<HTMLCanvasElement>(null);

  // 提取音频波形
  useEffect(() => {
    if (!videoUrl) {
        setAudioPeaks(null);
        return;
    }

    const loadAudio = async () => {
        try {
            const response = await fetch(videoUrl);
            const arrayBuffer = await response.arrayBuffer();
            const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
            
            // 提取波形数据
            // 每秒采样 100 个点
            const samplesPerSec = 100;
            const { length, sampleRate } = audioBuffer;
            const width = Math.floor(length / sampleRate * samplesPerSec);
            const sampleSize = Math.floor(sampleRate / samplesPerSec);
            const channelData = audioBuffer.getChannelData(0); // 取第一个声道
            
            const peaks: number[] = [];
            for (let i = 0; i < width; i++) {
                const start = Math.floor(i * sampleSize);
                const end = start + sampleSize;
                let max = 0;
                for (let j = start; j < end; j++) {
                    const val = Math.abs(channelData[j]);
                    if (val > max) max = val;
                }
                peaks.push(max);
            }
            setAudioPeaks(peaks);
            audioContext.close();
        } catch (e) {
            console.error("Failed to load audio waveform:", e);
        }
    };

    loadAudio();
  }, [videoUrl]);

  // 绘制波形
  useEffect(() => {
      const canvas = waveformCanvasRef.current;
      if (!canvas || !audioPeaks || !duration || !timelineRef.current) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const container = timelineRef.current;
      const containerWidth = container.clientWidth;
      // 计算当前可视区域对应的像素宽度
      // visibleRange.start / duration * (containerWidth * zoom) 是左偏移
      // (visibleRange.end - visibleRange.start) / duration * (containerWidth * zoom) 是宽度
      
      const visibleDuration = visibleRange.end - visibleRange.start;
      if (visibleDuration <= 0) return;

      const width = (visibleDuration / duration) * (containerWidth * zoom);
      const height = canvas.clientHeight;
      
      // 设置画布尺寸（考虑设备像素比以保持清晰）
      const dpr = window.devicePixelRatio || 1;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.scale(dpr, dpr);
      
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = "rgba(255, 255, 255, 0.6)"; // 波形颜色
      
      // 计算对应的数据索引
      const samplesPerSec = 100;
      const startIndex = Math.floor(visibleRange.start * samplesPerSec);
      const endIndex = Math.floor(visibleRange.end * samplesPerSec);
      
      // 绘制
      const barWidth = width / (endIndex - startIndex);
      const gap = 0; // 无间隙
      
      for (let i = startIndex; i < endIndex; i++) {
          if (i >= audioPeaks.length) break;
          const peak = audioPeaks[i];
          const x = (i - startIndex) * barWidth;
          const barHeight = peak * height * 0.8; // 留一点上下边距
          
          // 垂直居中绘制
          const y = (height - barHeight) / 2;
          
          ctx.fillRect(x, y, Math.max(1, barWidth - gap), barHeight);
      }
      
  }, [audioPeaks, visibleRange, duration, zoom]);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) video.play();
    else video.pause();
  }, [videoRef]);

  const stepFrame = useCallback((direction: 1 | -1) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime += direction * (1 / 30);
  }, [videoRef]);

  // 键盘快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if (
            e.target instanceof HTMLInputElement || 
            e.target instanceof HTMLTextAreaElement ||
            e.target instanceof HTMLVideoElement ||
            e.target instanceof HTMLButtonElement
        ) return;
        
        switch(e.code) {
            case 'Space':
                e.preventDefault();
                togglePlay();
                break;
            case 'ArrowLeft':
                e.preventDefault();
                stepFrame(-1);
                break;
            case 'ArrowRight':
                e.preventDefault();
                stepFrame(1);
                break;
        }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlay, stepFrame]);

  const updateScrollbar = useCallback(() => {
      if (!timelineRef.current || !scrollbarHandleRef.current) return;
      const container = timelineRef.current;
      const scrollLeft = container.scrollLeft;
      const clientWidth = container.clientWidth;
      const scrollWidth = container.scrollWidth; 

      if (scrollWidth <= clientWidth) {
          scrollbarHandleRef.current.style.width = '100%';
          scrollbarHandleRef.current.style.left = '0%';
          // scrollbarHandleRef.current.style.display = 'none'; 
      } else {
          scrollbarHandleRef.current.style.display = 'block';
          const handleWidthPercent = (clientWidth / scrollWidth) * 100;
          const handleLeftPercent = (scrollLeft / scrollWidth) * 100;
          scrollbarHandleRef.current.style.width = `${handleWidthPercent}%`;
          scrollbarHandleRef.current.style.left = `${handleLeftPercent}%`;
      }
  }, []);

  const updateCursorAndScroll = useCallback(() => {
      const video = videoRef.current;
      const container = timelineRef.current;
      if (!video || !container || !duration) return;

      const now = video.currentTime;
      
      // Update Cursor Position
      if (cursorRef.current) {
          cursorRef.current.style.left = `${(now / duration) * 100}%`;
      }

      // Update Time Display
      if (currentTimeRef.current) {
          currentTimeRef.current.textContent = formatTime(now);
      }

      // Auto Scroll Logic
      if (isPlaying) {
          const rect = container.getBoundingClientRect();
          const contentWidth = container.clientWidth * zoom;
          
          const cursorLeft = (now / duration) * contentWidth;
          const scrollLeft = container.scrollLeft;
          
          const rightThreshold = scrollLeft + rect.width * 0.9;
          
          if (cursorLeft > rightThreshold) {
              const newScrollLeft = cursorLeft - rect.width * 0.2;
              container.scrollLeft = newScrollLeft;
          }
      }
  }, [duration, zoom, isPlaying, videoRef]);

  // Animation Loop
  useEffect(() => {
      if (isPlaying) {
          const loop = () => {
              updateCursorAndScroll();
              animationFrameRef.current = requestAnimationFrame(loop);
          };
          loop();
      } else {
          if (animationFrameRef.current) {
              cancelAnimationFrame(animationFrameRef.current);
          }
      }
      return () => {
          if (animationFrameRef.current) {
              cancelAnimationFrame(animationFrameRef.current);
          }
      };
  }, [isPlaying, updateCursorAndScroll]);

  // Sync UI when not playing (e.g. seeking, initial load)
  useEffect(() => {
      if (!isPlaying) {
          if (cursorRef.current) {
              cursorRef.current.style.left = `${(currentTime / duration) * 100}%`;
          }
          if (currentTimeRef.current) {
              currentTimeRef.current.textContent = formatTime(currentTime);
          }
      }
  }, [currentTime, duration, isPlaying]);

  // 初始化生成器
  useEffect(() => {
    if (!videoUrl) return;
    const video = document.createElement("video");
    video.src = videoUrl;
    video.crossOrigin = "anonymous";
    video.muted = true;
    video.preload = "auto";
    
    const canvas = document.createElement("canvas");
    canvas.width = THUMB_WIDTH;
    canvas.height = THUMB_HEIGHT;
    const ctx = canvas.getContext("2d", { alpha: false });

    generatorRef.current = { video, canvas, ctx };
    
    thumbnailCache.current.clear();
    setVisibleThumbnails([]);
    generationQueue.current = [];
    isGenerating.current = false;

  }, [videoUrl]);

  // 监听主视频事件
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onTimeUpdate = () => {
        if (!isDragging) {
            if (!isPlaying) {
                setCurrentTime(video.currentTime);
                updateCursorAndScroll();
            }
        }
    };
    const onDurationChange = () => setDuration(video.duration);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => {
        setIsPlaying(false);
        setCurrentTime(video.currentTime);
    };

    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("durationchange", onDurationChange);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);

    setDuration(video.duration || 0);
    setCurrentTime(video.currentTime || 0);
    setIsPlaying(!video.paused);

    return () => {
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("durationchange", onDurationChange);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
    };
  }, [videoRef, videoUrl, isDragging, isPlaying, updateCursorAndScroll]);

  // 计算可视范围 - 使用 useLayoutEffect 确保在绘制前计算
  const updateVisibleRange = useCallback(() => {
    if (!timelineRef.current || !duration) return;
    const container = timelineRef.current;
    const rect = container.getBoundingClientRect();
    const scrollLeft = container.scrollLeft;
    // 这里的 contentWidth 必须是实际渲染的宽度
    // 由于我们设置了 .timeline-content { width: ${zoom * 100}% }
    // 所以 contentWidth = container.clientWidth * zoom
    const contentWidth = container.clientWidth * zoom;
    
    if (contentWidth === 0) return;

    // 计算可视时间范围
    const startTime = (scrollLeft / contentWidth) * duration;
    const visibleDuration = (rect.width / contentWidth) * duration;
    const endTime = Math.min(duration, startTime + visibleDuration);
    
    // 添加缓冲区
    const buffer = visibleDuration * BUFFER_RATIO;
    
    setVisibleRange(prev => {
        const newStart = Math.max(0, startTime - buffer);
        const newEnd = Math.min(duration, endTime + buffer);
        // 简单的防抖，避免微小变化触发重渲染
        if (Math.abs(prev.start - newStart) < 0.1 && Math.abs(prev.end - newEnd) < 0.1) {
            return prev;
        }
        visibleRangeRef.current = { start: newStart, end: newEnd };
        return { start: newStart, end: newEnd };
    });
  }, [duration, zoom]);

  // 监听滚动和缩放
  useEffect(() => {
    const container = timelineRef.current;
    if (!container) return;
    
    const handleScroll = () => {
        requestAnimationFrame(() => {
            updateVisibleRange();
            updateScrollbar();
        });
    };
    
    container.addEventListener('scroll', handleScroll);
    // 初始计算
    updateVisibleRange();
    updateScrollbar();
    
    // 监听窗口大小变化
    const handleResize = () => {
        updateVisibleRange();
        updateScrollbar();
    };
    window.addEventListener('resize', handleResize);
    
    return () => {
        container.removeEventListener('scroll', handleScroll);
        window.removeEventListener('resize', handleResize);
    };
  }, [updateVisibleRange, updateScrollbar]);

  // Zoom change should also trigger update
  useEffect(() => {
      updateVisibleRange();
      updateScrollbar();
  }, [zoom, updateVisibleRange, updateScrollbar]);

  // 缩略图生成队列处理
  const processQueue = useCallback(async () => {
    if (isGenerating.current || generationQueue.current.length === 0 || !generatorRef.current) return;
    
    isGenerating.current = true;
    const { video, ctx, canvas } = generatorRef.current;

    try {
        while (generationQueue.current.length > 0) {
            const time = generationQueue.current.shift();
            if (time === undefined) break;

            // 检查是否仍在可视范围内（加宽检查范围，避免边缘闪烁）
            // 如果用户快速滚动，跳过已经不可见的缩略图生成
            const currentRange = visibleRangeRef.current;
            const checkBuffer = 5.0; // 5秒的额外检查范围
            if (time < currentRange.start - checkBuffer || time > currentRange.end + checkBuffer) {
                continue;
            }

            if (thumbnailCache.current.has(time)) continue;

            // 强制设置时间，并等待 seeked 事件
            // 修复：必须严格等待 seeked，不能依赖 currentTime 的近似值
            video.currentTime = time;
            
            await new Promise<void>((resolve) => {
                const onSeeked = () => {
                    video.removeEventListener('seeked', onSeeked);
                    resolve();
                };
                // 只有在 readyState 足够且时间完全匹配时才跳过（极少情况）
                // 为了安全起见，总是等待 seeked 事件，除非超时
                video.addEventListener('seeked', onSeeked);
                
                // 超时保护，防止卡死
                setTimeout(() => {
                    video.removeEventListener('seeked', onSeeked);
                    resolve();
                }, 2000);
            });

            if (ctx) {
                ctx.drawImage(video, 0, 0, THUMB_WIDTH, THUMB_HEIGHT);
                const src = canvas.toDataURL("image/jpeg", 0.6);
                thumbnailCache.current.set(time, src);
                
                // 每生成一张就触发一次更新，让用户看到进度
                // 使用函数式更新避免闭包问题
                setGenerationTrigger(c => c + 1);
                
                // 给一点时间让 UI 线程呼吸
                await new Promise(r => setTimeout(r, 5));
            }
        }
    } catch (e) {
        console.error("Thumbnail generation failed", e);
    } finally {
        isGenerating.current = false;
        // 再次检查队列，防止并发插入
        if (generationQueue.current.length > 0) {
            processQueue();
        }
    }
  }, []);

  // 核心逻辑：构建显示列表
  useEffect(() => {
    if (!duration || !generatorRef.current || !timelineRef.current) return;

    const containerWidth = timelineRef.current.clientWidth;
    if (containerWidth === 0) return;

    // 目标：屏幕上每 120px 显示一张缩略图
    let interval = (120 * duration) / (containerWidth * zoom);
    if (interval < MIN_INTERVAL) interval = MIN_INTERVAL;

    // 生成可视范围内的目标时间点
    const targetTimes: number[] = [];
    const startIdx = Math.floor(visibleRange.start / interval);
    const endIdx = Math.ceil(visibleRange.end / interval);
    
    for (let i = startIdx; i <= endIdx; i++) {
        const t = i * interval;
        if (t >= 0 && t <= duration) {
            // 保留2位小数，避免浮点数精度问题导致缓存不命中
            targetTimes.push(parseFloat(t.toFixed(2)));
        }
    }

    const newVisibleThumbnails: { time: number; src: string; width: number }[] = [];
    const missingTimes: number[] = [];
    
    // 计算每个缩略图的宽度百分比
    const widthPercent = (interval / duration) * 100;
    
    // 计算当前缩略图在屏幕上的实际像素宽度
    // contentWidth = containerWidth * zoom
    // itemWidthPx = (interval / duration) * contentWidth
    const itemWidthPx = (interval / duration) * (containerWidth * zoom);
    // 如果宽度超过缩略图原始宽度的 1.2 倍，则认为发生了拉伸
    const isStretched = itemWidthPx > THUMB_WIDTH * 1.2;

    targetTimes.forEach(time => {
        // 精确匹配缓存
        let cachedSrc = thumbnailCache.current.get(time);
        
        // 如果没有精确匹配，尝试找最近的（容差 interval/2）
        if (!cachedSrc) {
             // 优化：不需要遍历整个 Map，只检查 time 附近的 key
             // 但 Map key 是无序的。
             // 暂时只做精确匹配，因为 interval 是固定的，只要 zoom 不变，time 就是固定的
             // 当 zoom 变化时，interval 变化，time 也会变化，此时确实需要重新生成
             // 为了复用，我们可以尝试寻找 "包含" 该时间段的旧缩略图？
             // 简单起见，先只用精确匹配。
        }

        if (cachedSrc) {
            newVisibleThumbnails.push({ time, src: cachedSrc, width: widthPercent });
        } else {
            missingTimes.push(time);
        }
    });

    setVisibleThumbnails(newVisibleThumbnails);

    if (missingTimes.length > 0) {
        const uniqueMissing = missingTimes.filter(t => !generationQueue.current.includes(t));
        if (uniqueMissing.length > 0) {
            generationQueue.current = [...generationQueue.current, ...uniqueMissing];
            processQueue();
        }
    }

  }, [visibleRange, duration, zoom, generationTrigger, processQueue]);

  // 辅助函数：判断是否需要限制背景大小
  const getBackgroundSize = (widthPercent: number) => {
      if (!timelineRef.current || !duration) return '100% 100%';
      const containerWidth = timelineRef.current.clientWidth;
      const itemWidthPx = (widthPercent / 100) * (containerWidth * zoom);
      // 如果实际宽度显著大于缩略图宽度，则使用固定宽度（靠左显示，右侧留空）
      if (itemWidthPx > THUMB_WIDTH * 1.2) {
          return `${THUMB_WIDTH}px 100%`;
      }
      return '100% 100%';
  };



  const handleWheel = (e: React.WheelEvent) => {
    if (e.altKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.5 : 0.5;
        const newZoom = Math.max(1, Math.min(MAX_ZOOM, zoom + delta));
        
        if (timelineRef.current) {
            const container = timelineRef.current;
            const rect = container.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const scrollLeft = container.scrollLeft;
            const contentWidth = rect.width * zoom;
            // 鼠标当前指向的时间点
            const mouseTime = ((scrollLeft + mouseX) / contentWidth) * duration;
            
            setZoom(newZoom);
            
            // 在下一帧调整 scrollLeft，以保持鼠标指向的时间点不变
            requestAnimationFrame(() => {
                if (timelineRef.current) {
                    const newContentWidth = rect.width * newZoom;
                    // 新的 scrollLeft = (mouseTime / duration) * newContentWidth - mouseX
                    const newScrollLeft = (mouseTime / duration) * newContentWidth - mouseX;
                    timelineRef.current.scrollLeft = newScrollLeft;
                    // 立即更新可视范围
                    updateVisibleRange();
                }
            });
        } else {
            setZoom(newZoom);
        }
    } else if (timelineRef.current) {
        // 支持滚轮水平滚动
        // 只有当 deltaY 显著时才处理，避免误触
        if (Math.abs(e.deltaY) > 0) {
            e.preventDefault();
            timelineRef.current.scrollLeft += e.deltaY;
        }
    }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
      setIsDragging(true);
      handleSeek(e);
      
      const onMouseMove = (moveEvent: MouseEvent) => {
          if (!timelineRef.current || !videoRef.current) return;
          const rect = timelineRef.current.getBoundingClientRect();
          const scrollLeft = timelineRef.current.scrollLeft;
          const x = moveEvent.clientX - rect.left + scrollLeft;
          const contentWidth = rect.width * zoom;
          
          let percent = x / contentWidth;
          percent = Math.max(0, Math.min(1, percent));
          
          const newTime = percent * duration;
          setCurrentTime(newTime);
          videoRef.current.currentTime = newTime;
      };
      
      const onMouseUp = () => {
          setIsDragging(false);
          document.removeEventListener('mousemove', onMouseMove);
          document.removeEventListener('mouseup', onMouseUp);
      };
      
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
      const video = videoRef.current;
      if (!video || !timelineRef.current) return;
      
      const rect = timelineRef.current.getBoundingClientRect();
      const scrollLeft = timelineRef.current.scrollLeft;
      const x = e.clientX - rect.left + scrollLeft;
      const contentWidth = rect.width * zoom;
      
      let percent = x / contentWidth;
      percent = Math.max(0, Math.min(1, percent));
      
      const newTime = percent * duration;
      setCurrentTime(newTime);
      video.currentTime = newTime;
  }

  const handleSubtitleMouseDown = (e: React.MouseEvent, sub: Subtitle, type: 'move' | 'resize-left' | 'resize-right') => {
      e.stopPropagation();
      e.preventDefault();

      // Shift + Click = Delete
      if (e.shiftKey) {
          onSubtitleDelete?.(sub);
          return;
      }
      
      const start = parseTime(sub.start);
      const end = parseTime(sub.end);
      
      dragRef.current = {
          isDragging: true,
          type,
          subtitleId: sub.id,
          startX: e.clientX,
          startY: e.clientY,
          originalStart: start,
          originalEnd: end,
          originalLayer: sub.layer || 0
      };
      
      onSubtitleSelect?.(sub, e);
  };

  useEffect(() => {
      const handleGlobalMouseMove = (e: MouseEvent) => {
          // Handle Scrollbar Dragging
          if (scrollbarDragRef.current?.isDragging && timelineRef.current && scrollbarTrackRef.current) {
              const { startX, startScrollLeft } = scrollbarDragRef.current;
              const deltaX = e.clientX - startX;
              
              const container = timelineRef.current;
              const trackRect = scrollbarTrackRef.current.getBoundingClientRect();
              const scrollWidth = container.scrollWidth;
              
              // Calculate scroll delta based on track width
              // The handle moves across the track. 
              // Movement of 1px on track corresponds to (scrollWidth / trackWidth) px of scroll
              const ratio = scrollWidth / trackRect.width;
              const deltaScroll = deltaX * ratio;
              
              container.scrollLeft = startScrollLeft + deltaScroll;
              return;
          }

          if (!dragRef.current?.isDragging || !timelineRef.current) return;
          
          const { type, startX, startY, originalStart, originalEnd, originalLayer, subtitleId } = dragRef.current;
          const rect = timelineRef.current.getBoundingClientRect();
          const contentWidth = rect.width * zoom;
          
          const deltaX = e.clientX - startX;
          const deltaTime = (deltaX / contentWidth) * duration;
          
          // Vertical drag (Track adjustment)
          const TRACK_HEIGHT = 40; // Match CSS height + margin
          const deltaY = e.clientY - startY;
          const layerDelta = Math.round(deltaY / TRACK_HEIGHT);
          const newLayer = Math.max(0, originalLayer + layerDelta);

          let newStart = originalStart;
          let newEnd = originalEnd;
          
          if (type === 'move') {
              newStart = Math.max(0, originalStart + deltaTime);
              newEnd = Math.max(0, originalEnd + deltaTime);
              // Clamp to duration? Maybe not strictly necessary but good practice
              if (newEnd > duration) {
                  const diff = newEnd - duration;
                  newEnd = duration;
                  newStart -= diff;
              }
          } else if (type === 'resize-left') {
              newStart = Math.min(originalStart + deltaTime, originalEnd - 0.1); // Min duration 0.1s
              newStart = Math.max(0, newStart);
          } else if (type === 'resize-right') {
              newEnd = Math.max(originalEnd + deltaTime, originalStart + 0.1);
              newEnd = Math.min(duration, newEnd);
          }
          
          // Find the subtitle object
          const sub = subtitles.find(s => s.id === subtitleId);
          if (sub && onSubtitleUpdate) {
              onSubtitleUpdate({
                  ...sub,
                  start: formatTime(newStart),
                  end: formatTime(newEnd),
                  layer: newLayer
              }, true); // transient update
          }
      };
      
      const handleGlobalMouseUp = () => {
          if (scrollbarDragRef.current?.isDragging) {
              scrollbarDragRef.current = null;
              if (scrollbarHandleRef.current) {
                  scrollbarHandleRef.current.classList.remove('active');
              }
          }

          if (dragRef.current?.isDragging) {
              // Final commit (not transient)
              const { subtitleId, originalStart, originalEnd, originalLayer } = dragRef.current;
              // We need to get the *current* values from the last move, but we don't have them stored easily here
              // except by re-calculating or reading from the updated subtitles prop if it updated fast enough.
              // However, since we updated with transient=true, the subtitles prop *should* have the latest value.
              // So we just need to trigger a non-transient update with the same value to "seal" it in history.
              
              const sub = subtitles.find(s => s.id === subtitleId);
              if (sub && onSubtitleUpdate) {
                  // Just re-emit the current state as non-transient
                  onSubtitleUpdate(sub, false);
              }

              dragRef.current = null;
          }
      };
      
      document.addEventListener('mousemove', handleGlobalMouseMove);
      document.addEventListener('mouseup', handleGlobalMouseUp);
      
      return () => {
          document.removeEventListener('mousemove', handleGlobalMouseMove);
          document.removeEventListener('mouseup', handleGlobalMouseUp);
      };
  }, [duration, zoom, subtitles, onSubtitleUpdate]);

  const handleScrollbarMouseDown = (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      if (!timelineRef.current) return;
      
      scrollbarDragRef.current = {
          isDragging: true,
          startX: e.clientX,
          startScrollLeft: timelineRef.current.scrollLeft
      };
      
      if (scrollbarHandleRef.current) {
          scrollbarHandleRef.current.classList.add('active');
      }
  };

  const handleScrollbarTrackMouseDown = (e: React.MouseEvent) => {
      if (e.target === scrollbarHandleRef.current) return; // Ignore if clicked on handle
      if (!timelineRef.current || !scrollbarTrackRef.current) return;
      
      const trackRect = scrollbarTrackRef.current.getBoundingClientRect();
      const clickX = e.clientX - trackRect.left;
      const percent = clickX / trackRect.width;
      
      const container = timelineRef.current;
      // Center the view on the click
      const targetScrollLeft = (percent * container.scrollWidth) - (container.clientWidth / 2);
      
      container.scrollTo({ left: targetScrollLeft, behavior: 'smooth' });
  };

  return (
    <div className="video-timeline-container">
      <div className="timeline-controls">
        <span className="time-display">
            <span ref={currentTimeRef}>{formatTime(currentTime)}</span> <span className="duration">/ {formatTime(duration)}</span>
        </span>

        <div className="control-group">
            <button onClick={() => stepFrame(-1)} title="上一帧">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
            </button>
            <button onClick={togglePlay} title={isPlaying ? "暂停" : "播放"} className="play-btn">
            {isPlaying ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
            ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            )}
            </button>
            <button onClick={() => stepFrame(1)} title="下一帧">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
            </button>
        </div>
        
        <div className="zoom-control">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
            <input 
                type="range" 
                min="1" 
                max={MAX_ZOOM} 
                step="0.1" 
                value={zoom} 
                onChange={(e) => setZoom(parseFloat(e.target.value))} 
            />
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
        </div>
      </div>

      <div 
        className="timeline-scroll-area" 
        ref={timelineRef}
        onWheel={handleWheel}
      >
        <div 
            className="timeline-content" 
            style={{ width: `${zoom * 100}%` }}
            onMouseDown={handleMouseDown}
        >
            <div className="video-track">
                <div className="track-header">
                    Video {formatTime(duration)}
                </div>
                <div className="timeline-thumbnails">
                    {visibleThumbnails.map((thumb) => (
                        <div 
                            key={thumb.time} 
                            className="timeline-thumbnail-item"
                            style={{ 
                                left: `${(thumb.time / duration) * 100}%`,
                                width: `${thumb.width}%`, 
                                backgroundImage: `url(${thumb.src})`,
                                backgroundSize: getBackgroundSize(thumb.width)
                            }}
                        />
                    ))}
                </div>
                <div className="track-waveform">
                    <canvas 
                        ref={waveformCanvasRef}
                        style={{
                            position: 'absolute',
                            left: `${(visibleRange.start / duration) * 100}%`,
                            width: `${((visibleRange.end - visibleRange.start) / duration) * 100}%`,
                            height: '100%'
                        }}
                    />
                </div>
            </div>

            <div className="subtitle-track-container">
                {duration > 0 && subtitles.map((sub) => {
                    const start = parseTime(sub.start);
                    const end = parseTime(sub.end);
                    const left = (start / duration) * 100;
                    const width = ((end - start) / duration) * 100;
                    const layer = sub.layer || 0;
                    
                    return (
                        <div 
                            key={sub.id}
                            className={`subtitle-block ${selectedSubtitleIds.includes(sub.id) ? 'selected' : ''}`}
                            style={{
                                left: `${left}%`,
                                width: `${width}%`,
                                top: `${layer * 40}px`
                            }}
                            onMouseDown={(e) => handleSubtitleMouseDown(e, sub, 'move')}
                            title={sub.text}
                        >
                            <div 
                                className="resize-handle left" 
                                onMouseDown={(e) => handleSubtitleMouseDown(e, sub, 'resize-left')}
                            />
                            <div className="subtitle-text">{sub.text}</div>
                            <div 
                                className="resize-handle right" 
                                onMouseDown={(e) => handleSubtitleMouseDown(e, sub, 'resize-right')}
                            />
                        </div>
                    );
                })}
            </div>
            
            <div 
                className="timeline-cursor"
                ref={cursorRef}
            >
                <div className="cursor-head"></div>
                <div className="cursor-line"></div>
            </div>
        </div>
      </div>
      
      <div className="timeline-slider-container">
          <div 
              className="timeline-slider-track" 
              ref={scrollbarTrackRef}
              onMouseDown={handleScrollbarTrackMouseDown}
          >
              <div 
                  className="timeline-slider-handle" 
                  ref={scrollbarHandleRef}
                  onMouseDown={handleScrollbarMouseDown}
              />
          </div>
      </div>
    </div>
  );
};





export default VideoTimeline;
