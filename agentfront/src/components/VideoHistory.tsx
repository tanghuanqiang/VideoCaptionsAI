import React, { useEffect, useState } from 'react';
import './VideoHistory.css';
import type { VideoEditHistoryItem, VideoEditHistoryResponse } from '../types/historyTypes';

interface VideoHistoryProps {
  onLoadVideo?: (item: VideoEditHistoryItem) => void;
}

export const VideoHistory: React.FC<VideoHistoryProps> = ({ onLoadVideo }) => {
  const [history, setHistory] = useState<VideoEditHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState<string>('all');
  
  const pageSize = 10;

  const fetchHistory = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const statusParam = filter !== 'all' ? `&status=${filter}` : '';
      const response = await fetch(
        `/api/history?skip=${page * pageSize}&limit=${pageSize}${statusParam}`,
        {
          credentials: 'include',
        }
      );
      
      if (!response.ok) {
        throw new Error('Failed to fetch history');
      }
      
      const data: VideoEditHistoryResponse = await response.json();
      setHistory(data.items);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [page, filter]);

  const handleDelete = async (id: number) => {
    if (!confirm('确定要删除这条历史记录吗？')) {
      return;
    }
    
    try {
      const response = await fetch(`/api/history/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      
      if (!response.ok) {
        throw new Error('Failed to delete history');
      }
      
      // 刷新列表
      fetchHistory();
    } catch (err) {
      alert('删除失败: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'processing':
        return '处理中';
      case 'completed':
        return '已完成';
      case 'failed':
        return '失败';
      default:
        return status;
    }
  };

  const getStatusClass = (status: string) => {
    switch (status) {
      case 'processing':
        return 'status-processing';
      case 'completed':
        return 'status-completed';
      case 'failed':
        return 'status-failed';
      default:
        return '';
    }
  };

  if (loading && history.length === 0) {
    return <div className="video-history-loading">加载中...</div>;
  }

  return (
    <div className="video-history">
      <div className="video-history-header">
        <h2>编辑历史</h2>
        <div className="video-history-filters">
          <select 
            value={filter} 
            onChange={(e) => {
              setFilter(e.target.value);
              setPage(0);
            }}
            className="filter-select"
          >
            <option value="all">全部</option>
            <option value="processing">处理中</option>
            <option value="completed">已完成</option>
            <option value="failed">失败</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="video-history-error">
          错误: {error}
        </div>
      )}

      <div className="video-history-list">
        {history.length === 0 ? (
          <div className="video-history-empty">
            暂无编辑历史记录
          </div>
        ) : (
          history.map((item) => (
            <div key={item.id} className="video-history-item">
              <div className="history-item-thumbnail">
                {item.thumbnail_path ? (
                  <img src={item.thumbnail_path} alt={item.original_filename} />
                ) : (
                  <div className="thumbnail-placeholder">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <path d="M23 7l-7 5 7 5V7z" />
                      <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                    </svg>
                  </div>
                )}
              </div>
              
              <div className="history-item-info">
                <div className="history-item-title">{item.original_filename}</div>
                <div className="history-item-meta">
                  <span className={`history-item-status ${getStatusClass(item.status)}`}>
                    {getStatusText(item.status)}
                  </span>
                  <span className="history-item-date">{formatDate(item.created_at)}</span>
                </div>
                {item.metadata && Object.keys(item.metadata).length > 0 && (
                  <div className="history-item-metadata">
                    {item.metadata.duration && (
                      <span className="metadata-badge">
                        时长: {Math.round(item.metadata.duration)}s
                      </span>
                    )}
                    {item.metadata.subtitle_count && (
                      <span className="metadata-badge">
                        字幕: {item.metadata.subtitle_count}条
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div className="history-item-actions">
                {item.status === 'completed' && onLoadVideo && (
                  <button
                    className="btn-load"
                    onClick={() => onLoadVideo(item)}
                    title="加载此项目"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                    </svg>
                    加载
                  </button>
                )}
                {item.output_file && (
                  <a
                    href={item.output_file}
                    download
                    className="btn-download"
                    title="下载输出文件"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    下载
                  </a>
                )}
                {item.subtitle_file && (
                  <a
                    href={item.subtitle_file}
                    download
                    className="btn-download-sub"
                    title="下载字幕文件"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                      <line x1="16" y1="13" x2="8" y2="13" />
                      <line x1="16" y1="17" x2="8" y2="17" />
                    </svg>
                    字幕
                  </a>
                )}
                <button
                  className="btn-delete"
                  onClick={() => handleDelete(item.id)}
                  title="删除"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {total > pageSize && (
        <div className="video-history-pagination">
          <button
            onClick={() => setPage(Math.max(0, page - 1))}
            disabled={page === 0}
            className="pagination-btn"
          >
            上一页
          </button>
          <span className="pagination-info">
            第 {page + 1} 页 / 共 {Math.ceil(total / pageSize)} 页
          </span>
          <button
            onClick={() => setPage(page + 1)}
            disabled={(page + 1) * pageSize >= total}
            className="pagination-btn"
          >
            下一页
          </button>
        </div>
      )}
    </div>
  );
};
