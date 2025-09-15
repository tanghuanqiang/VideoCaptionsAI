import React, { useState, useEffect } from 'react';
import './DownloadProgress.css';

interface DownloadProgressProps {
  isVisible: boolean;
  progress: number;
  fileName: string;
  status: 'uploading' | 'processing' | 'downloading' | 'completed' | 'error';
  onCancel: () => void;
  onMinimize: () => void;
  isMinimized: boolean;
  errorMessage?: string;
}

const DownloadProgress: React.FC<DownloadProgressProps> = ({
  isVisible,
  progress,
  fileName,
  status,
  onCancel,
  onMinimize,
  isMinimized,
  errorMessage
}) => {
  const [timeElapsed, setTimeElapsed] = useState(0);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [smoothProgress, setSmoothProgress] = useState(0);
  const [lastProgress, setLastProgress] = useState(0);

  useEffect(() => {
    if (isVisible && !startTime) {
      setStartTime(Date.now());
      setTimeElapsed(0); // 确保计时器重置
      setSmoothProgress(0); // 重置平滑进度
      setLastProgress(0); // 重置上次进度
    }
    if (!isVisible) {
      setStartTime(null);
      setTimeElapsed(0);
      setSmoothProgress(0);
      setLastProgress(0);
    }
  }, [isVisible, startTime]);

  // 平滑进度过渡逻辑
  useEffect(() => {
    if (!isVisible) return;

    // 检测进度跳跃
    const progressJump = progress - lastProgress;
    
    // 如果进度跳跃超过20%，则进行平滑过渡
    if (progressJump > 20 && lastProgress > 0) {
      let currentSmooth = lastProgress;
      const targetProgress = progress;
      const smoothingInterval = setInterval(() => {
        // 计算步长，让过渡更自然
        const remaining = targetProgress - currentSmooth;
        const step = Math.max(1, remaining / 8); // 使用指数衰减
        
        currentSmooth = Math.min(currentSmooth + step, targetProgress);
        setSmoothProgress(Math.floor(currentSmooth));
        
        // 如果接近目标进度，直接设置为目标值
        if (currentSmooth >= targetProgress - 0.5) {
          setSmoothProgress(targetProgress);
          setLastProgress(targetProgress);
          clearInterval(smoothingInterval);
        }
      }, 100); // 每100ms更新一次
      
      return () => clearInterval(smoothingInterval);
    } else {
      // 正常进度更新
      setSmoothProgress(progress);
      setLastProgress(progress);
    }
  }, [progress, isVisible, lastProgress]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isVisible && startTime && status !== 'completed' && status !== 'error') {
      interval = setInterval(() => {
        setTimeElapsed(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isVisible, startTime, status]);

  if (!isVisible) return null;

  const getStatusText = () => {
    const displayProgress = smoothProgress; // 使用平滑进度
    switch (status) {
      case 'uploading': 
        return `正在上传文件... (${displayProgress}% - 第1/3步)`;
      case 'processing': {
        // 根据处理进度提供更详细的状态信息（30-99%）
        if (displayProgress < 45) {
          return `正在分析视频文件... (${displayProgress}% - 第2/3步)`;
        } else if (displayProgress < 60) {
          return `正在处理字幕轨道... (${displayProgress}% - 第2/3步)`;
        } else if (displayProgress < 75) {
          return `正在渲染字幕到视频... (${displayProgress}% - 第2/3步)`;
        } else if (displayProgress < 80) {
          return `正在优化视频编码... (${displayProgress}% - 第2/3步)`;
        } else if (displayProgress < 85) {
          return `正在进行最终渲染... (${displayProgress}% - 第2/3步)`;
        } else if (displayProgress < 95) {
          return `正在完成处理，准备下载... (${displayProgress}% - 第2/3步)`;
        } else {
          return `即将完成处理... (${displayProgress}% - 第2/3步)`;
        }
      }
      case 'downloading': 
        return `正在下载... (${displayProgress}% - 第3/3步)`;
      case 'completed': 
        return '下载完成！';
      case 'error': 
        return '下载失败';
      default: 
        return '准备中...';
    }
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'uploading': return '⬆️';
      case 'processing': return '⚙️';
      case 'downloading': return '⬇️';
      case 'completed': return '✅';
      case 'error': return '❌';
      default: return '⏳';
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="download-progress-overlay">
      <div className={`download-progress-dialog ${isMinimized ? 'minimized' : ''}`}>
        <div className="progress-header">
          <div className="progress-title">
            <span className="status-icon">{getStatusIcon()}</span>
            <span>视频导出</span>
          </div>
          <div className="progress-controls">
            <button 
              className="minimize-btn" 
              onClick={onMinimize}
              title={isMinimized ? "展开" : "最小化"}
            >
              {isMinimized ? '🔼' : '🔽'}
            </button>
            {status !== 'completed' && (
              <button 
                className="cancel-btn" 
                onClick={onCancel}
                title="取消"
              >
                ❌
              </button>
            )}
          </div>
        </div>

        {!isMinimized && (
          <div className="progress-content">
            <div className="file-info">
              <div className="file-name">{fileName}</div>
              <div className="status-text">{getStatusText()}</div>
            </div>

            <div className="progress-bar-container">
              <div className="progress-bar">
                <div 
                  className="progress-fill" 
                  style={{ 
                    width: `${smoothProgress}%`,
                    transition: 'width 0.3s ease-out' // 添加平滑过渡动画
                  }}
                ></div>
              </div>
              <div className="progress-text">{smoothProgress}%</div>
            </div>

            <div className="progress-details">
              <div className="time-info">
                <span>已用时间: {formatTime(timeElapsed)}</span>
                {progress > 0 && progress < 100 && (
                  <span>预计剩余: {formatTime(Math.floor((timeElapsed / progress) * (100 - progress)))}</span>
                )}
              </div>
            </div>

            {status === 'error' && errorMessage && (
              <div className="error-message">
                错误: {errorMessage}
              </div>
            )}

            {status === 'completed' && (
              <div className="completed-actions">
                <button 
                  className="close-btn"
                  onClick={() => onCancel()}
                >
                  关闭
                </button>
              </div>
            )}
          </div>
        )}

        {isMinimized && (
          <div className="minimized-content">
            <span className="mini-progress">{smoothProgress}% - {getStatusText()}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default DownloadProgress;
