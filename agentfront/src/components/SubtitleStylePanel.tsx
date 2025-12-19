import React, { useState } from "react";
import "./SubtitleStylePanel.css";
import type { AssStyle } from "../types/subtitleTypes";
import toAssColor from "../utils/toAssColor"; // 确保你的 toAssColor 工具函数存在并正确导入
import { defaultStyle } from "../constants";
interface Props {
    styles: AssStyle[];
    setStyles: React.Dispatch<React.SetStateAction<AssStyle[]>>;
    selectedStyle: string;
    setSelectedStyle: (name: string) => void;
}


const SubtitleStylePanel: React.FC<Props> = ({ styles, setStyles, selectedStyle, setSelectedStyle }) => {
    const [editStyle, setEditStyle] = useState<AssStyle | null>(null);

    // 当 selectedStyle 变化时，更新 editStyle 为选中样式；如果未选中样式则清空编辑面板
    React.useEffect(() => {
        if (!selectedStyle) {
            setEditStyle(null);
            return;
        }
        const currentSelected = styles.find(s => s.Name === selectedStyle);
        if (currentSelected) {
            setEditStyle(currentSelected);
        } else {
            setEditStyle(null);
        }
    }, [selectedStyle, styles]);


    const handleEdit = (field: keyof AssStyle, value: AssStyle[keyof AssStyle]) => {
        if (!editStyle) return;
        setEditStyle({ ...editStyle, [field]: value });
    };

    const handleSave = () => {
        if (!editStyle) return;
        setStyles(styles.map(s => s.id === editStyle.id ? editStyle : s));
        // setEditStyle(null); // 保存后不清空编辑状态，方便继续调整
        setSelectedStyle(editStyle.Name);
    };

    const handleAdd = () => {
        const newStyle: AssStyle = { ...defaultStyle, id: `${Date.now()}_${Math.random().toString(16).slice(2)}`, Name: `样式${styles.length + 1}` };
        setStyles([...styles, newStyle]);
        setEditStyle(newStyle);
        setSelectedStyle(newStyle.Name);
    };

    const handleDelete = (id: string) => {
        const newStyles = styles.filter(s => s.id !== id);
        setStyles(newStyles);
        if (newStyles.length === 0) {
            setSelectedStyle("");
            setEditStyle(null);
            return;
        }
        if (editStyle && editStyle.id === id) { // 如果删除的是当前正在编辑的样式
            setEditStyle(newStyles[0]); // 自动切换到第一个样式进行编辑
            setSelectedStyle(newStyles[0].Name);
        } else if (selectedStyle === styles.find(s => s.id === id)?.Name) {
            setSelectedStyle(newStyles[0].Name);
        }
    };

    return (
        <div className="subtitle-style-panel">
            <h3>字幕样式设置</h3>
            {styles.length === 0 ? (
                <div className="empty-style-list">
                    <p>暂无样式，请点击下方按钮新增样式。</p>
                    <button onClick={handleAdd}>新增样式</button>
                </div>
            ) : (
                <>
                    <div className="style-list">
                        {styles.map(s => (
                            <div
                                key={s.id}
                                className={`style-item${selectedStyle === s.Name ? " selected" : ""}`}
                                onClick={() => {
                                    // 点击已选中的样式则取消选择，隐藏编辑面板；否则选中并进入编辑
                                    if (selectedStyle === s.Name) {
                                        setSelectedStyle("");
                                        setEditStyle(null);
                                    } else {
                                        setSelectedStyle(s.Name);
                                        setEditStyle(s); // 点击样式列表项时，也开始编辑该样式
                                    }
                                }}
                            >
                                <span>{s.Name}</span>
                                <div className="button-group">
                                    <button onClick={e => { e.stopPropagation(); setSelectedStyle(s.Name); setEditStyle(s); }}>编辑</button>
                                    {styles.length > 1 && (
                                        <button onClick={e => { e.stopPropagation(); handleDelete(s.id); }} className="cancel">删除</button>
                                    )}
                                </div>
                            </div>
                        ))}
                        <button onClick={handleAdd}>新增样式</button>
                    </div>
                    
                    {selectedStyle && editStyle && (
                        
                        <div className="edit-panel">
                            <div className="edit-panel-header">
                                <h3>编辑样式: {editStyle.Name}</h3>
                                <div className="edit-panel-actions">
                                    <button className="cancel" onClick={() => setEditStyle(null)}>取消</button>
                                    <button onClick={handleSave}>保存</button>
                                </div>
                            </div>
                            
                            <div className="style-form">
                                {/* 基础设置 */}
                                <div className="form-section">
                                    <div className="form-row">
                                        <div className="form-control">
                                            <label>样式名</label>
                                            <input type="text" value={editStyle.Name} onChange={e => handleEdit("Name", e.target.value)} />
                                        </div>
                                        <div className="form-control">
                                            <label>字体</label>
                                            <input type="text" value={editStyle.FontName} onChange={e => handleEdit("FontName", e.target.value)} />
                                        </div>
                                    </div>
                                    <div className="form-row">
                                        <div className="form-control">
                                            <label>字号</label>
                                            <input type="number" value={editStyle.FontSize} onChange={e => handleEdit("FontSize", Number(e.target.value))} />
                                        </div>
                                        <div className="form-control">
                                            <label>对齐</label>
                                            <select value={editStyle.Alignment ?? 2} onChange={e => handleEdit("Alignment", Number(e.target.value))}>
                                                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(v => <option key={v} value={v}>{v}</option>)}
                                            </select>
                                        </div>
                                    </div>
                                </div>

                                {/* 颜色设置 */}
                                <div className="form-section colors-section">
                                    <div className="color-row">
                                        <label>主色</label>
                                        <div className="color-picker-wrapper">
                                            <input type="color" value={editStyle.PrimaryColour} onChange={e => handleEdit("PrimaryColour", e.target.value)} />
                                        </div>
                                        <div className="alpha-slider">
                                            <input 
                                                type="range" 
                                                min={0} 
                                                max={255} 
                                                value={editStyle.PrimaryAlpha ?? 255} 
                                                onChange={e => handleEdit("PrimaryAlpha", Number(e.target.value))} 
                                            />
                                            <span className="alpha-text">{Math.round(((editStyle.PrimaryAlpha ?? 255) / 255) * 100)}%</span>
                                        </div>
                                        <span className="color-code">{toAssColor(editStyle.PrimaryColour, editStyle.PrimaryAlpha)}</span>
                                    </div>

                                    <div className="color-row">
                                        <label>副色</label>
                                        <div className="color-picker-wrapper">
                                            <input type="color" value={editStyle.SecondaryColour || "#000000"} onChange={e => handleEdit("SecondaryColour", e.target.value)} />
                                        </div>
                                        <div className="alpha-slider">
                                            <input 
                                                type="range" 
                                                min={0} 
                                                max={255} 
                                                value={editStyle.SecondaryAlpha ?? 255} 
                                                onChange={e => handleEdit("SecondaryAlpha", Number(e.target.value))} 
                                            />
                                            <span className="alpha-text">{Math.round(((editStyle.SecondaryAlpha ?? 255) / 255) * 100)}%</span>
                                        </div>
                                        <span className="color-code">{toAssColor(editStyle.SecondaryColour || "#000000", editStyle.SecondaryAlpha)}</span>
                                    </div>

                                    <div className="color-row">
                                        <label>描边色</label>
                                        <div className="color-picker-wrapper">
                                            <input type="color" value={editStyle.OutlineColour || "#000000"} onChange={e => handleEdit("OutlineColour", e.target.value)} />
                                        </div>
                                        <div className="alpha-slider">
                                            <input 
                                                type="range" 
                                                min={0} 
                                                max={255} 
                                                value={editStyle.OutlineAlpha ?? 255} 
                                                onChange={e => handleEdit("OutlineAlpha", Number(e.target.value))} 
                                            />
                                            <span className="alpha-text">{Math.round(((editStyle.OutlineAlpha ?? 255) / 255) * 100)}%</span>
                                        </div>
                                        <span className="color-code">{toAssColor(editStyle.OutlineColour || "#000000", editStyle.OutlineAlpha)}</span>
                                    </div>

                                    <div className="color-row">
                                        <label>背景色</label>
                                        <div className="color-picker-wrapper">
                                            <input type="color" value={editStyle.BackColour || "#000000"} onChange={e => handleEdit("BackColour", e.target.value)} />
                                        </div>
                                        <div className="alpha-slider">
                                            <input 
                                                type="range" 
                                                min={0} 
                                                max={255} 
                                                value={editStyle.BackAlpha ?? 255} 
                                                onChange={e => handleEdit("BackAlpha", Number(e.target.value))} 
                                            />
                                            <span className="alpha-text">{Math.round(((editStyle.BackAlpha ?? 255) / 255) * 100)}%</span>
                                        </div>
                                        <span className="color-code">{toAssColor(editStyle.BackColour || "#000000", editStyle.BackAlpha)}</span>
                                    </div>
                                </div>

                                {/* 样式选项 */}
                                <div className="form-section checkboxes-section">
                                    <label className="checkbox-control">
                                        <input type="checkbox" checked={!!editStyle.Bold} onChange={e => handleEdit("Bold", e.target.checked)} />
                                        <span>加粗</span>
                                    </label>
                                    <label className="checkbox-control">
                                        <input type="checkbox" checked={!!editStyle.Italic} onChange={e => handleEdit("Italic", e.target.checked)} />
                                        <span>斜体</span>
                                    </label>
                                    <label className="checkbox-control">
                                        <input type="checkbox" checked={!!editStyle.Underline} onChange={e => handleEdit("Underline", e.target.checked)} />
                                        <span>下划线</span>
                                    </label>
                                    <label className="checkbox-control">
                                        <input type="checkbox" checked={!!editStyle.StrikeOut} onChange={e => handleEdit("StrikeOut", e.target.checked)} />
                                        <span>删除线</span>
                                    </label>
                                </div>

                                {/* 几何变换 */}
                                <div className="form-section geometry-section">
                                    <div className="form-row">
                                        <div className="form-control">
                                            <label>横向缩放 (%)</label>
                                            <input type="number" value={editStyle.ScaleX || 100} onChange={e => handleEdit("ScaleX", Number(e.target.value))} />
                                        </div>
                                        <div className="form-control">
                                            <label>纵向缩放 (%)</label>
                                            <input type="number" value={editStyle.ScaleY || 100} onChange={e => handleEdit("ScaleY", Number(e.target.value))} />
                                        </div>
                                    </div>
                                    <div className="form-row">
                                        <div className="form-control">
                                            <label>字间距</label>
                                            <input type="number" value={editStyle.Spacing || 0} onChange={e => handleEdit("Spacing", Number(e.target.value))} />
                                        </div>
                                        <div className="form-control">
                                            <label>旋转角度</label>
                                            <input type="number" value={editStyle.Angle || 0} onChange={e => handleEdit("Angle", Number(e.target.value))} />
                                        </div>
                                    </div>
                                    <div className="form-row">
                                        <div className="form-control">
                                            <label>描边宽度</label>
                                            <input type="number" value={editStyle.Outline || 0} onChange={e => handleEdit("Outline", Number(e.target.value))} />
                                        </div>
                                        <div className="form-control">
                                            <label>阴影深度</label>
                                            <input type="number" value={editStyle.Shadow || 0} onChange={e => handleEdit("Shadow", Number(e.target.value))} />
                                        </div>
                                    </div>
                                    <div className="form-row">
                                        <div className="form-control">
                                            <label>边框样式</label>
                                            <select value={editStyle.BorderStyle ?? 1} onChange={e => handleEdit("BorderStyle", Number(e.target.value))}>
                                                <option value={1}>外描边 + 阴影</option>
                                                <option value={3}>不透明背景盒</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </>
            )}
          
        </div>
    );
};

export default SubtitleStylePanel;