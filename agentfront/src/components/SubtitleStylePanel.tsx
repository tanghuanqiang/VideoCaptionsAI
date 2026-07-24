import React, { useState, useCallback, useEffect, useRef } from "react";
import "./SubtitleStylePanel.css";
import type { AssStyle } from "../types/subtitleTypes";
import toAssColor from "../utils/toAssColor";
import { defaultStyle } from "../constants";
import { type VideoContentRect } from "../utils/CoordinateMapper";

interface Props {
  styles: AssStyle[];
  setStyles: React.Dispatch<React.SetStateAction<AssStyle[]>>;
  selectedStyle: string;
  setSelectedStyle: (name: string) => void;
  contentRect?: VideoContentRect;
  playResX?: number;
  playResY?: number;
}

/* ── track which fields are currently focused (so they don't refresh) ── */
function useFocusedFields() {
  const [focused, setFocused] = useState<Set<string>>(new Set());
  const onFocus = useCallback((name: string) => {
    setFocused(prev => { const n = new Set(prev); n.add(name); return n; });
  }, []);
  const onBlur = useCallback((name: string) => {
    setFocused(prev => { const n = new Set(prev); n.delete(name); return n; });
  }, []);
  return { focused, onFocus, onBlur };
}

/* ── small helpers ── */
const fmtNum = (v: any, fallback: number = 0) => {
  const n = Number(v);
  return isNaN(n) ? fallback : n;
};

const SubtitleStylePanel: React.FC<Props> = ({
  styles, setStyles, selectedStyle, setSelectedStyle,
  contentRect, playResX = 1920, playResY = 1080,
}) => {
  const currentStyle = styles.find(s => s.Name === selectedStyle) ?? null;
  const { focused, onFocus, onBlur } = useFocusedFields();

  // ---- commit a change immediately ----
  const commit = useCallback((field: keyof AssStyle, value: any) => {
    setStyles(prev => prev.map(s => s.Name === selectedStyle ? { ...s, [field]: value } : s));
  }, [selectedStyle, setStyles]);

  // ---- alignment change: reset margins to defaults for intuitive positioning ----
  const handleAlignmentChange = useCallback((newAlign: number) => {
    const s = currentStyle;
    if (!s) return;
    const oldAlign = s.Alignment ?? 2;
    if (oldAlign === newAlign) return;

    // Reset margins to defaults when changing alignment.
    // The user expects the subtitle to jump to the new alignment position,
    // not stay in the old position (which is what preservePosition did).
    setStyles(prev => prev.map(st =>
      st.Name === selectedStyle ? {
        ...st,
        Alignment: newAlign,
        MarginV: 10,
        MarginL: 10,
        MarginR: 10,
      } : st
    ));
  }, [currentStyle, selectedStyle, setStyles]);

  // ---- input value: from style unless field is focused ----
  const getVal = useCallback((field: keyof AssStyle): string | number => {
    if (!currentStyle) return "";
    return (currentStyle as any)[field] ?? "";
  }, [currentStyle]);

  // ---- add / delete ----
  const handleAdd = () => {
    const ns: AssStyle = {
      ...defaultStyle,
      id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
      Name: `style-${styles.length + 1}`,
    };
    setStyles([...styles, ns]);
    setSelectedStyle(ns.Name);
  };

  const handleDelete = (id: string) => {
    const rest = styles.filter(s => s.id !== id);
    setStyles(rest);
    if (rest.length === 0) { setSelectedStyle(""); return; }
    if (selectedStyle === styles.find(s => s.id === id)?.Name) {
      setSelectedStyle(rest[0].Name);
    }
  };

  // ---- alignment buttons ----
  const alignGrid = [
    [7, 8, 9],
    [4, 5, 6],
    [1, 2, 3],
  ];
  const alignLabels: Record<number, string> = {
    7: "↖", 8: "↑", 9: "↗",
    4: "←", 5: "◎", 6: "→",
    1: "↙", 2: "↓", 3: "↘",
  };

  // ---- render ----
  if (styles.length === 0) {
    return (
      <div className="subtitle-style-panel">
        <h3>字幕样式设置</h3>
        <div className="empty-style-list">
          <p>暂无样式，点击下方按钮新增样式。</p>
          <button onClick={handleAdd}>新增样式</button>
        </div>
      </div>
    );
  }

  const s = currentStyle;
  if (!s) {
    return (
      <div className="subtitle-style-panel">
        <h3>字幕样式设置</h3>
        <div className="style-list">
          {styles.map(st => (
            <div key={st.id}
              className={`style-item${selectedStyle === st.Name ? " selected" : ""}`}
              onClick={() => setSelectedStyle(st.Name)}
            >
              <span>{st.Name}</span>
              <div className="button-group">
                {styles.length > 1 && (
                  <button className="cancel" onClick={e => { e.stopPropagation(); handleDelete(st.id); }}>删除</button>
                )}
              </div>
            </div>
          ))}
          <button onClick={handleAdd}>新增样式</button>
        </div>
        <p style={{ padding: 16, color: "var(--ant-color-text-secondary)" }}>选择一个样式进行编辑</p>
      </div>
    );
  }

  return (
    <div className="subtitle-style-panel">
      <h3>字幕样式设置</h3>

      <div className="style-list">
        {styles.map(st => (
          <div key={st.id}
            className={`style-item${selectedStyle === st.Name ? " selected" : ""}`}
            onClick={() => setSelectedStyle(st.Name)}
          >
            <span>{st.Name}</span>
            <div className="button-group">
              {styles.length > 1 && (
                <button className="cancel" onClick={e => { e.stopPropagation(); handleDelete(st.id); }}>删除</button>
              )}
            </div>
          </div>
        ))}
        <button onClick={handleAdd}>新增样式</button>
      </div>

      {/* ── Edit form ── */}
      <div className="edit-panel">
        <div className="edit-panel-content">
          {/* 基础文字 */}
          <div className="form-section">
            <h4>基础文字</h4>
            <div className="form-row">
              <div className="form-control">
                <label>字体</label>
                <select
                  value={String(getVal("FontName") || "Arial")}
                  onChange={e => commit("FontName", e.target.value)}
                >
                  <option value="Arial">Arial</option>
                  <option value="Microsoft YaHei">微软雅黑</option>
                  <option value="SimHei">黑体</option>
                  <option value="SimSun">宋体</option>
                  <option value="KaiTi">楷体</option>
                </select>
              </div>
              <div className="form-control">
                <label>字号</label>
                <input type="number"
                  value={getVal("FontSize")}
                  onFocus={() => onFocus("FontSize")}
                  onBlur={() => onBlur("FontSize")}
                  onChange={e => commit("FontSize", fmtNum(e.target.value, 48))}
                />
              </div>
            </div>
            <div className="form-row">
              <div className="form-control">
                <label>主颜色</label>
                <input type="color"
                  value={(() => {
                    const c = (s.PrimaryColour || "#FFFFFF");
                    if (c.startsWith("&H")) {
                      const hex = c.slice(2);
                      return "#" + hex.slice(4,6) + hex.slice(2,4) + hex.slice(0,2);
                    }
                    return c;
                  })()}
                  onChange={e => {
                    const h = e.target.value.replace("#", "");
                    commit("PrimaryColour", `&H00${h.slice(4,6)}${h.slice(2,4)}${h.slice(0,2)}`);
                  }}
                />
              </div>
              <div className="form-control">
                <label>透明度</label>
                <input type="range" min="0" max="255"
                  value={s.PrimaryAlpha != null ? (255 - (s.PrimaryAlpha ?? 0)) : 255}
                  onChange={e => commit("PrimaryAlpha", 255 - Number(e.target.value))}
                />
              </div>
            </div>
            <div className="checkboxes">
              <label className="checkbox-control">
                <input type="checkbox" checked={!!s.Bold} onChange={e => commit("Bold", e.target.checked)} />
                <span>粗体</span>
              </label>
              <label className="checkbox-control">
                <input type="checkbox" checked={!!s.Italic} onChange={e => commit("Italic", e.target.checked)} />
                <span>斜体</span>
              </label>
              <label className="checkbox-control">
                <input type="checkbox" checked={!!s.Underline} onChange={e => commit("Underline", e.target.checked)} />
                <span>下划线</span>
              </label>
              <label className="checkbox-control">
                <input type="checkbox" checked={!!s.StrikeOut} onChange={e => commit("StrikeOut", e.target.checked)} />
                <span>删除线</span>
              </label>
            </div>
          </div>

          {/* 位置与对齐 */}
          <div className="form-section">
            <h4>位置与对齐</h4>
            <div className="alignment-grid">
              {alignGrid.map((row, ri) => (
                <div key={ri} className="alignment-row">
                  {row.map(a => (
                    <button key={a}
                      className={`align-btn${(s.Alignment ?? 2) === a ? " active" : ""}`}
                      onClick={() => handleAlignmentChange(a)}
                      title={`位置 ${a}`}
                    >{alignLabels[a]}</button>
                  ))}
                </div>
              ))}
            </div>
            <div className="form-row">
              <div className="form-control">
                <label>左边距</label>
                <input type="number"
                  value={getVal("MarginL")}
                  onFocus={() => onFocus("MarginL")}
                  onBlur={() => onBlur("MarginL")}
                  onChange={e => commit("MarginL", fmtNum(e.target.value, 10))}
                />
              </div>
              <div className="form-control">
                <label>右边距</label>
                <input type="number"
                  value={getVal("MarginR")}
                  onFocus={() => onFocus("MarginR")}
                  onBlur={() => onBlur("MarginR")}
                  onChange={e => commit("MarginR", fmtNum(e.target.value, 10))}
                />
              </div>
              <div className="form-control">
                <label>垂直边距</label>
                <input type="number"
                  value={getVal("MarginV")}
                  onFocus={() => onFocus("MarginV")}
                  onBlur={() => onBlur("MarginV")}
                  onChange={e => commit("MarginV", fmtNum(e.target.value, 10))}
                />
              </div>
            </div>
          </div>

          {/* 几何变换 */}
          <div className="form-section geometry-section">
            <h4>几何变换</h4>
            <div className="form-row">
              <div className="form-control">
                <label>横向缩放 (%)</label>
                <input type="number"
                  value={getVal("ScaleX")}
                  onFocus={() => onFocus("ScaleX")}
                  onBlur={() => onBlur("ScaleX")}
                  onChange={e => commit("ScaleX", fmtNum(e.target.value, 100))}
                />
              </div>
              <div className="form-control">
                <label>纵向缩放 (%)</label>
                <input type="number"
                  value={getVal("ScaleY")}
                  onFocus={() => onFocus("ScaleY")}
                  onBlur={() => onBlur("ScaleY")}
                  onChange={e => commit("ScaleY", fmtNum(e.target.value, 100))}
                />
              </div>
            </div>
            <div className="form-row">
              <div className="form-control">
                <label>字间距</label>
                <input type="number"
                  value={getVal("Spacing")}
                  onFocus={() => onFocus("Spacing")}
                  onBlur={() => onBlur("Spacing")}
                  onChange={e => commit("Spacing", fmtNum(e.target.value, 0))}
                />
              </div>
              <div className="form-control">
                <label>旋转角度</label>
                <input type="number"
                  value={getVal("Angle")}
                  onFocus={() => onFocus("Angle")}
                  onBlur={() => onBlur("Angle")}
                  onChange={e => commit("Angle", fmtNum(e.target.value, 0))}
                />
              </div>
            </div>
            <div className="form-row">
              <div className="form-control">
                <label>描边宽度</label>
                <input type="number"
                  value={getVal("Outline")}
                  onFocus={() => onFocus("Outline")}
                  onBlur={() => onBlur("Outline")}
                  onChange={e => commit("Outline", fmtNum(e.target.value, 0))}
                />
              </div>
              <div className="form-control">
                <label>阴影深度</label>
                <input type="number"
                  value={getVal("Shadow")}
                  onFocus={() => onFocus("Shadow")}
                  onBlur={() => onBlur("Shadow")}
                  onChange={e => commit("Shadow", fmtNum(e.target.value, 0))}
                />
              </div>
            </div>
            <div className="form-row">
              <div className="form-control">
                <label>边框样式</label>
                <select
                  value={s.BorderStyle ?? 1}
                  onChange={e => commit("BorderStyle", Number(e.target.value))}
                >
                  <option value={1}>外描边 + 阴影</option>
                  <option value={3}>不透明背景</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SubtitleStylePanel;