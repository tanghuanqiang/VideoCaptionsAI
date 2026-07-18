import React, { useEffect, useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import type { AssStyle, Subtitle } from "../types/subtitleTypes";
import {
  assToCSS,
  cssDragToASS,
  cssResizeToASS,
  getVideoContentRect,
  type VideoContentRect,
} from "../utils/CoordinateMapper";

interface SubtitlePreviewProps {
  subtitles: Subtitle[];
  styles: AssStyle[];
  videoRef: React.RefObject<HTMLVideoElement | null>;
  playResX?: number;
  playResY?: number;
  onStyleUpdate?: (styleName: string, updates: Partial<AssStyle>) => void;
  contentRect?: VideoContentRect;
}

interface DragInfo {
  subId: string;
  styleName: string;
  mode: "move" | "resize";
  startMouseX: number;
  startMouseY: number;
  startFontSize: number;
  startMarginV: number;
  startMarginL: number;
  startMarginR: number;
  startAlignment: number;
  ghostLeft: number;
  ghostTop: number;
  ghostWidth: number;
  ghostHeight: number;
}

const SubtitlePreview: React.FC<SubtitlePreviewProps> = ({
  subtitles, styles, videoRef,
  playResX = 1920, playResY = 1080,
  onStyleUpdate, contentRect,
}) => {
  const [activeSubs, setActiveSubs] = useState<Subtitle[]>([]);
  const [selectedSubId, setSelectedSubId] = useState<string | null>(null);
  const dragRef = useRef<DragInfo | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number>(0);
  const [dragGhost, setDragGhost] = useState<{
    left: number; top: number; width: number; height: number; mode: "move" | "resize";
  } | null>(null);
  const [portalReady, setPortalReady] = useState(false);

  // Default content rect if none provided
  const cr = contentRect || { left: 0, top: 0, width: 640, height: 360 };

  useEffect(() => {
    const check = () => {
      if (document.getElementById("subtitle-overlay-container")) {
        setPortalReady(true);
      } else { setTimeout(check, 50); }
    };
    check();
  }, []);

  const timeToSeconds = useCallback((time: string | number): number => {
    if (typeof time === "number") return time;
    if (/^\d+(?:\.\d+)?$/.test(time)) return parseFloat(time);
    const c = time.replace(",", ".");
    const p = c.split(":");
    if (p.length === 3) return parseInt(p[0]||"0")*3600 + parseInt(p[1]||"0")*60 + parseFloat(p[2]||"0");
    return parseFloat(c) || 0;
  }, []);

  // Throttled timeupdate using requestAnimationFrame
  useEffect(() => {
    if (!videoRef?.current) return;
    const ve = videoRef.current;

    let ticking = false;
    const onTime = () => {
      if (ticking) return;
      ticking = true;
      rafRef.current = requestAnimationFrame(() => {
        const t = ve.currentTime || 0;
        setActiveSubs(subtitles.filter(sub => {
          const s = timeToSeconds(sub.start);
          const e = timeToSeconds(sub.end);
          return t >= s && t <= e;
        }));
        ticking = false;
      });
    };

    ve.addEventListener("timeupdate", onTime);
    return () => {
      ve.removeEventListener("timeupdate", onTime);
      cancelAnimationFrame(rafRef.current);
    };
  }, [videoRef, subtitles, timeToSeconds]);

  // ---- Build CSS position from ASS style using CoordinateMapper ----
  const computePos = useCallback((st: AssStyle): React.CSSProperties => {
    const pos = assToCSS(
      {
        alignment: st.Alignment ?? 2,
        marginL: st.MarginL ?? 10,
        marginR: st.MarginR ?? 10,
        marginV: st.MarginV ?? 10,
        fontSize: st.FontSize ?? 48,
      },
      cr, playResX, playResY
    );

    const rgb = st.PrimaryColour?.startsWith("#") && st.PrimaryColour.length === 7
      ? "#" + st.PrimaryColour.slice(5,7) + st.PrimaryColour.slice(3,5) + st.PrimaryColour.slice(1,3)
      : (st.PrimaryColour || "#FFFFFF");

    const alpha = st.PrimaryAlpha != null ? (st.PrimaryAlpha ?? 255) / 255 : 1;

    const alignMap: Record<number, string> = {
      1: "flex-end", 2: "flex-end", 3: "flex-end",
      4: "center", 5: "center", 6: "center",
      7: "flex-start", 8: "flex-start", 9: "flex-start",
    };

    const justifyMap: Record<number, string> = {
      1: "flex-start", 2: "center", 3: "flex-end",
      4: "flex-start", 5: "center", 6: "flex-end",
      7: "flex-start", 8: "center", 9: "flex-end",
    };

    const al = st.Alignment ?? 2;
    const translateX = al === 2 || al === 5 || al === 8 ? "-50%" : "0";
    const translateY = al === 4 || al === 5 || al === 6 ? "-50%" : "0";

    return {
      position: "absolute" as const,
      left: pos.left,
      top: pos.top,
      color: `rgba(${parseInt(rgb.slice(1,3),16)},${parseInt(rgb.slice(3,5),16)},${parseInt(rgb.slice(5,7),16)},${alpha})`,
      fontSize: pos.fontSizePx,
      fontFamily: st.FontName || "Arial",
      fontWeight: st.Bold ? "bold" : "normal",
      fontStyle: st.Italic ? "italic" : "normal",
      textDecoration: [
        st.Underline ? "underline" : "",
        st.StrikeOut ? "line-through" : "",
      ].filter(Boolean).join(" ") || "none",
      letterSpacing: st.Spacing ? st.Spacing * (cr.width / playResX) + "px" : undefined,
      transform: translateX || translateY ? `translate(${translateX},${translateY})` : undefined,
      display: "inline-block",
      whiteSpace: "pre-wrap",
      userSelect: "none" as const,
      pointerEvents: "auto" as const,
      textShadow: st.Shadow && st.Shadow > 0
        ? `0 ${st.Shadow * (cr.height / playResY)}px ${st.Shadow * (cr.height / playResY)}px rgba(0,0,0,0.7)`
        : undefined,
      WebkitTextStroke: st.Outline && st.Outline > 0
        ? `${st.Outline * (cr.width / playResX)}px ${st.OutlineColour || "#000000"}`
        : undefined,
    };
  }, [cr, playResX, playResY]);

  // ---- startDrag using CoordinateMapper ----
  const startDrag = useCallback((e: React.MouseEvent, subId: string, styleName: string, mode: "move"|"resize") => {
    e.stopPropagation(); e.preventDefault();
    setSelectedSubId(subId);

    const styleObj = styles.find(s => s.Name === styleName);
    if (!styleObj) return;

    const pos = assToCSS(
      {
        alignment: styleObj.Alignment ?? 2,
        marginL: styleObj.MarginL ?? 10,
        marginR: styleObj.MarginR ?? 10,
        marginV: styleObj.MarginV ?? 10,
        fontSize: styleObj.FontSize ?? 48,
      },
      cr, playResX, playResY
    );

    const sub = subtitles.find(s => s.id === subId);
    // Estimate text width from font size and text length
    const estWidth = (sub?.text?.length || 1) * pos.fontSizePx * 0.6;

    dragRef.current = {
      subId, styleName, mode,
      startMouseX: e.clientX, startMouseY: e.clientY,
      startFontSize: styleObj.FontSize || 48,
      startMarginV: styleObj.MarginV || 10,
      startMarginL: styleObj.MarginL || 10,
      startMarginR: styleObj.MarginR || 10,
      startAlignment: styleObj.Alignment ?? 2,
      ghostLeft: pos.left,
      ghostTop: pos.top,
      ghostWidth: estWidth,
      ghostHeight: pos.fontSizePx * 1.2,
    };

    setDragGhost({
      left: pos.left, top: pos.top,
      width: estWidth, height: pos.fontSizePx * 1.2,
      mode,
    });
  }, [styles, subtitles, cr, playResX, playResY]);

  // ---- global mouse handlers ----
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = dragRef.current; if (!d) return;
      const dx = e.clientX - d.startMouseX, dy = e.clientY - d.startMouseY;

      if (d.mode === "move") {
        d.ghostLeft += dx;
        d.ghostTop += dy;
        d.startMouseX = e.clientX;
        d.startMouseY = e.clientY;
        setDragGhost({
          left: d.ghostLeft, top: d.ghostTop,
          width: d.ghostWidth, height: d.ghostHeight,
          mode: "move",
        });
      } else {
        const nh = Math.max(12, d.ghostHeight + dy);
        d.ghostHeight = nh;
        d.startMouseY = e.clientY;
        setDragGhost({
          left: d.ghostLeft, top: d.ghostTop,
          width: d.ghostWidth, height: nh, mode: "resize",
        });
      }
    };

    const onUp = () => {
      const d = dragRef.current; if (!d || !onStyleUpdate) return;
      const styleObj = styles.find(s => s.Name === d.styleName);
      if (!styleObj) { dragRef.current = null; setDragGhost(null); return; }

      if (d.mode === "move") {
        const totalDx = d.ghostLeft - (dragRef.current ? 0 : 0);
        const pos = assToCSS(
          { alignment: d.startAlignment, marginL: d.startMarginL, marginR: d.startMarginR, marginV: d.startMarginV, fontSize: d.startFontSize },
          cr, playResX, playResY
        );
        const totalDy = d.ghostTop - pos.top;
        const totalXDx = d.ghostLeft - pos.left;

        const updates = cssDragToASS(
          totalXDx, totalDy,
          { alignment: d.startAlignment, marginL: d.startMarginL, marginR: d.startMarginR, marginV: d.startMarginV, fontSize: d.startFontSize },
          cr, playResX, playResY
        );
        onStyleUpdate(d.styleName, {
          Alignment: updates.alignment,
          MarginV: updates.marginV,
          MarginL: updates.marginL,
          MarginR: updates.marginR,
        });
      } else {
        const heightRatio = d.ghostHeight / (d.startFontSize * (cr.height / playResY));
        const newFs = cssResizeToASS(
          d.ghostHeight - d.startFontSize * (cr.height / playResY),
          d.startFontSize, cr, playResY
        );
        onStyleUpdate(d.styleName, { FontSize: Math.round(newFs) });
      }

      dragRef.current = null;
      setDragGhost(null);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [styles, cr, playResX, playResY, onStyleUpdate]);

  // ---- Ghost style ----
  const ghostSub = dragRef.current ? subtitles.find(s => s.id === dragRef.current!.subId) : null;
  const ghostStyle = (): React.CSSProperties | null => {
    if (!dragGhost || !ghostSub) return null;
    const st = styles.find(s => s.Name === dragRef.current?.styleName);
    if (!st) return null;
    const rgb = st.PrimaryColour?.startsWith("#") && st.PrimaryColour.length === 7
      ? "#" + st.PrimaryColour.slice(5,7) + st.PrimaryColour.slice(3,5) + st.PrimaryColour.slice(1,3)
      : (st.PrimaryColour || "#FFF");
    const fs = dragGhost.mode === "resize"
      ? Math.max(12, (st.FontSize || 48) * (cr.height / playResY) * dragGhost.height / 40)
      : (st.FontSize || 48) * (cr.height / playResY);
    return {
      position: "absolute", left: dragGhost.left, top: dragGhost.top,
      color: rgb, fontSize: fs,
      fontFamily: st.FontName, fontWeight: st.Bold ? "bold" : "normal",
      fontStyle: st.Italic ? "italic" : "normal",
      whiteSpace: "pre-wrap",
      outline: "2px dashed rgba(64,150,255,0.7)", outlineOffset: "2px",
      cursor: dragGhost.mode === "move" ? "grabbing" : "nwse-resize",
      userSelect: "none", zIndex: 100, opacity: 0.85, pointerEvents: "none",
    };
  };

  const overlay = (
    <div ref={overlayRef} style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 10, overflow: "hidden" }}>
      {activeSubs.map(sub => {
        const st = styles.find(s => s.Name === sub.style);
        if (!st) return null;
        const isDragging = dragRef.current?.subId === sub.id && dragGhost !== null;
        if (isDragging) return null;

        const baseStyle = computePos(st);
        const isSelected = selectedSubId === sub.id;

        return (
          <div key={sub.id} data-sub-id={sub.id}
            style={{
              ...baseStyle,
              zIndex: isSelected ? 11 : 10,
              cursor: "grab",
              outline: isSelected ? "2px dashed rgba(64,150,255,0.7)" : "none",
              outlineOffset: "2px",
            }}
            onMouseDown={e => startDrag(e, sub.id, sub.style || "Default", "move")}
          >
            {sub.text}
            {isSelected && (
              <span style={{
                position: "absolute", right: -5, bottom: -5, width: 14, height: 14,
                background: "rgba(64,150,255,0.9)", border: "2px solid #fff",
                borderRadius: 3, cursor: "nwse-resize", zIndex: 12,
              }}
                onMouseDown={e => startDrag(e, sub.id, sub.style || "Default", "resize")}
              />
            )}
          </div>
        );
      })}
      {dragGhost && ghostSub && (
        <div style={ghostStyle()!}>{ghostSub.text}</div>
      )}
      {selectedSubId && !dragGhost && (
        <div style={{ position: "absolute", inset: 0, zIndex: 5, pointerEvents: "auto" }}
          onClick={() => setSelectedSubId(null)} />
      )}
    </div>
  );

  const target = document.getElementById("subtitle-overlay-container");
  return portalReady && target ? createPortal(overlay, target) : null;
};

export default SubtitlePreview;
