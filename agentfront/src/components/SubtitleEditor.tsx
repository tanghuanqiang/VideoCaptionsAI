import React from "react";
import type { AssStyle, Subtitle } from "../types/subtitleTypes";
import { findAvailableLayer, formatTime } from "../utils/subtitleUtils";
import "./SubtitleEditor.css";

interface Props {
    subtitles: Subtitle[];
    setSubtitles: any; // Relaxed type to allow custom set options
    styles: AssStyle[];
    selectedStyle: string;
    selectedIds: string[];
    setSelectedIds: React.Dispatch<React.SetStateAction<string[]>>;
    videoRef?: React.RefObject<HTMLVideoElement | null>;
}

const SubtitleEditor: React.FC<Props> = ({ subtitles, setSubtitles, styles, selectedStyle, selectedIds, setSelectedIds, videoRef }) => {

    // 编辑字幕内容
    const handleEdit = (id: string | number, field: keyof Subtitle, value: string | boolean) => {
        setSubtitles((prev: Subtitle[]) => prev.map(sub => sub.id === id ? { ...sub, [field]: value } : sub));
    };

    // 增加字幕按钮功能
    const handleAddSubtitle = () => {
        const currentTime = videoRef?.current?.currentTime || 0;
        const startSeconds = currentTime;
        const endSeconds = currentTime + 5;
        
        setSubtitles((prev: Subtitle[]) => {
            const layer = findAvailableLayer(prev, startSeconds, endSeconds);
            const newSubtitle: Subtitle = {
                id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
                start: formatTime(startSeconds),
                end: formatTime(endSeconds),
                text: "新字幕",
                style: selectedStyle || "Default",
                group: "",
                layer: layer
            };
            return [...prev, newSubtitle];
        });
    };

    // 删除选中字幕
    const handleDeleteSelected = () => {
        setSubtitles(prev => prev.filter(sub => !selectedIds.includes(sub.id)));
        setSelectedIds([]);
    };

    // 切换全选/取消全选
    const handleToggleSelectAll = () => {
        if (selectedIds.length === subtitles.length && subtitles.length > 0) {
            setSelectedIds([]); // 已全选，点击则取消全选
        } else {
            setSelectedIds(subtitles.map(sub => sub.id)); // 未全选，点击则全选
        }
    };

    // 单个字幕选择
    const handleSelectSubtitle = (id: string) => {
        setSelectedIds(prev => prev.includes(id) ? prev.filter(sid => sid !== id) : [...prev, id]);
    };

    return (
        <div className="subtitle-editor-container">
            <div className="subtitle-actions">
                <h3>字幕编辑</h3>
                <div style={{ flex: 1 }}></div> {/* spacer */}
                <div className="subtitle-editor-buttons">
                    <button onClick={handleToggleSelectAll}>
                        {selectedIds.length === subtitles.length && subtitles.length > 0 ? "取消全选" : "全选字幕"}
                    </button>
                    <button onClick={handleDeleteSelected} disabled={selectedIds.length === 0}>
                        删除选中字幕
                    </button>
                </div>
            </div>
            
            <div className="subtitle-list">
                {subtitles.length > 0 ? (
                    subtitles.map(sub => (
                        <div
                            key={sub.id}
                            className={`subtitle-item${selectedIds.includes(sub.id) ? " selected" : ""}`}
                            onClick={() => {
                                // Optional: Click row to select (exclusive or toggle?)
                                // For now keep checkbox logic separate or sync?
                                // Let's make clicking the row select it exclusively if not clicking checkbox/input
                                // But inputs take up most space.
                            }}
                        >
                            <input
                                type="checkbox"
                                checked={selectedIds.includes(sub.id)}
                                onChange={() => handleSelectSubtitle(sub.id)}
                                onClick={(e) => e.stopPropagation()}
                            />
                            <input
                                value={sub.start}
                                onChange={e => handleEdit(sub.id, "start", e.target.value)}
                                className="subtitle-time nodrag"
                                onClick={(e) => e.stopPropagation()}
                                onMouseDown={(e) => e.stopPropagation()}
                            />
                            <span> - </span>
                            <input
                                value={sub.end}
                                onChange={e => handleEdit(sub.id, "end", e.target.value)}
                                className="subtitle-time nodrag"
                                onClick={(e) => e.stopPropagation()}
                                onMouseDown={(e) => e.stopPropagation()}
                            />
                            <input
                                value={sub.text || ''}
                                onChange={e => handleEdit(sub.id, "text", e.target.value)}
                                className="subtitle-text nodrag"
                                onClick={(e) => e.stopPropagation()}
                                onKeyDown={(e) => e.stopPropagation()}
                                onMouseDown={(e) => e.stopPropagation()}
                                onPointerDown={(e) => e.stopPropagation()}
                            />
                            <select
                                value={sub.style}
                                onChange={e => handleEdit(sub.id, "style", e.target.value)}
                                className="subtitle-style nodrag"
                                onClick={(e) => e.stopPropagation()}
                                onMouseDown={(e) => e.stopPropagation()}
                            >
                                {styles.map(s => (
                                    <option key={s.Name} value={s.Name}>{s.Name}</option>
                                ))}
                            </select>
                        </div>
                    ))
                ) : (
                    <div style={{ textAlign: 'center', color: '#888', marginTop: '20%' }}>
                        <p>暂无字幕内容。请点击下方按钮添加。</p>
                    </div>
                )}
            </div>
            
            <div className="subtitle-actions-bottom">
                <button onClick={handleAddSubtitle}>增加字幕</button>
            </div>
        </div>
    );
};

export default SubtitleEditor;