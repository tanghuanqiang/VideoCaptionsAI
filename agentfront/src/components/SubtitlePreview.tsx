import React, { useEffect, useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import type { AssStyle, Subtitle } from "../types/subtitleTypes";

interface SubtitlePreviewProps {
  rect: { left: number; top: number; w: number; h: number };
  subtitles: Subtitle[];
  styles: AssStyle[];
  videoRef: React.RefObject<HTMLVideoElement | null>;
  playResX?: number;
  playResY?: number;
  onStyleUpdate?: (styleName: string, updates: Partial<AssStyle>) => void;
}

interface DragInfo {
  subId: string;
  styleName: string;
  mode: "move" | "resize";
  startMouseX: number;
  startMouseY: number;
  savedElLeft: number;
  savedElTop: number;
  savedElWidth: number;
  savedElHeight: number;
  startFontSize: number;
  text: string;
  lastGhostLeft: number;
  lastGhostTop: number;
  lastGhostWidth: number;
  lastGhostHeight: number;
}

const SubtitlePreview: React.FC<SubtitlePreviewProps> = ({
  rect, subtitles, styles, videoRef,
  playResX = 1920, playResY = 1080,
  onStyleUpdate,
}) => {
  const [activeSubs, setActiveSubs] = useState<Subtitle[]>([]);
  const [selectedSubId, setSelectedSubId] = useState<string | null>(null);
  const dragRef = useRef<DragInfo | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const [dragGhost, setDragGhost] = useState<{
    left: number; top: number; width: number; height: number; mode: "move" | "resize";
  } | null>(null);
  const [portalReady, setPortalReady] = useState(false);

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

  useEffect(() => {
    if (!videoRef?.current || !rect) return;
    const ve = videoRef.current;
    const onTime = () => {
      const t = ve.currentTime || 0;
      setActiveSubs(subtitles.filter(sub => {
        const s = typeof sub.start === "number" ? sub.start : timeToSeconds(sub.start);
        const e = typeof sub.end === "number" ? sub.end : timeToSeconds(sub.end);
        return t >= s && t <= e;
      }));
    };
    ve.addEventListener("timeupdate", onTime);
    return () => ve.removeEventListener("timeupdate", onTime);
  }, [videoRef, subtitles, rect, timeToSeconds]);

  const bgr2rgb = useCallback((b: string) => {
    if (b.startsWith("#") && b.length === 7) return "#" + b.slice(5,7) + b.slice(3,5) + b.slice(1,3);
    return b;
  }, []);
  const getOvR = useCallback(() => overlayRef.current?.getBoundingClientRect() ?? null, []);

  // ---- startDrag ----
  const startDrag = useCallback((e: React.MouseEvent, subId: string, styleName: string, mode: "move"|"resize") => {
    e.stopPropagation(); e.preventDefault();
    setSelectedSubId(subId);
    const ovr = getOvR(); if (!ovr) return;
    const el = document.querySelector('[data-sub-id="'+subId+'"]') as HTMLElement;
    if (!el) return;
    const er = el.getBoundingClientRect();
    const styleObj = styles.find(s => s.Name === styleName);
    const sub = subtitles.find(s => s.id === subId);
    const l = er.left - ovr.left, t = er.top - ovr.top, w = er.width, h = er.height;
    dragRef.current = {
      subId, styleName, mode,
      startMouseX: e.clientX, startMouseY: e.clientY,
      savedElLeft: l, savedElTop: t,
      savedElWidth: w, savedElHeight: h,
      startFontSize: styleObj?.FontSize || 48,
      text: sub?.text || "",
      lastGhostLeft: l, lastGhostTop: t,
      lastGhostWidth: w, lastGhostHeight: h,
    };
    setDragGhost({ left: l, top: t, width: w, height: h, mode });
  }, [styles, subtitles, getOvR]);

  // ---- global mouse handlers ----
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = dragRef.current; if (!d || !overlayRef.current) return;
      const dx = e.clientX - d.startMouseX, dy = e.clientY - d.startMouseY;
      if (d.mode === "move") {
        d.lastGhostLeft = d.savedElLeft + dx;
        d.lastGhostTop = d.savedElTop + dy;
        d.lastGhostWidth = d.savedElWidth;
        d.lastGhostHeight = d.savedElHeight;
        setDragGhost({
          left: d.lastGhostLeft, top: d.lastGhostTop,
          width: d.lastGhostWidth, height: d.lastGhostHeight,
          mode: "move",
        });
      } else {
        const nh = Math.max(12, d.savedElHeight + dy);
        d.lastGhostHeight = nh;
        setDragGhost({
          left: d.savedElLeft, top: d.savedElTop,
          width: d.savedElWidth, height: nh, mode: "resize",
        });
      }
    };

    const onUp = (_e: MouseEvent) => {
      const d = dragRef.current;
      if (!d || !overlayRef.current) { dragRef.current = null; setDragGhost(null); return; }

      if (d.mode === "move") {
        const ovr = overlayRef.current.getBoundingClientRect();
        const sx = rect.w / playResX, sy = rect.h / playResY;
        const vL = rect.left - ovr.left, vT = rect.top - ovr.top;
        const vW = rect.w, vH = rect.h;
        const gl = d.lastGhostLeft, gt = d.lastGhostTop;
        const gw = d.lastGhostWidth, gh = d.lastGhostHeight;

        const curSt = styles.find(s => s.Name === d.styleName);
        const al = curSt?.Alignment || 2;
        const oldML = curSt?.MarginL || 0;
        const oldMR = curSt?.MarginR || 0;
        let ml = oldML, mv = 0, mr = oldMR;

        // Ghost visual center (in overlay pixels)
        const ghostCX = gl + gw / 2;
        const ghostCY = gt + gh / 2;
        // Video rect center in overlay pixels
        const videoCX = vL + vW / 2;
        const videoCY = vT + vH / 2;

        if (al === 1 || al === 4 || al === 7) {
          // Left-aligned: element left edge = videoLeft + ml*sx
          ml = Math.round((gl - vL) / sx);
        } else if (al === 3 || al === 6 || al === 9) {
          // Right-aligned: element right edge = videoRight - mr*sx
          mr = Math.round((vL + vW - (gl + gw)) / sx);
        } else {
          // Center-aligned (2,5,8): ghostCX = videoCX + (ml - mr)/2 * sx
          // newML = mr + 2*(ghostCX - videoCX)/sx
          ml = Math.round(oldMR + 2 * (ghostCX - videoCX) / sx);
        }

        if (al <= 3) {
          // Bottom row: element bottom = videoBottom - mv*sy
          mv = Math.round((vT + vH - (gt + gh)) / sy);
        } else if (al >= 7) {
          // Top row: element top = videoTop + mv*sy
          mv = Math.round((gt - vT) / sy);
        } else {
          // Middle row (4,5,6): ghostCY = videoCY + mv*sy
          mv = Math.round((ghostCY - videoCY) / sy);
        }

        onStyleUpdate?.(d.styleName, { MarginL: ml, MarginV: mv, MarginR: mr });
      } else {
        const newFS = Math.max(8, Math.round(d.startFontSize * d.lastGhostHeight / d.savedElHeight));
        onStyleUpdate?.(d.styleName, { FontSize: newFS });
      }
      dragRef.current = null; setDragGhost(null);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [onStyleUpdate, playResX, playResY, rect, styles]);

  if (!rect || !portalReady) return null;

  const sx = rect.w / playResX, sy = rect.h / playResY;

  const getOffsets = () => {
    const ovr = getOvR(); if (!ovr) return { vL:0, vT:0, bPad:0, rPad:0 };
    const vL = rect.left - ovr.left, vT = rect.top - ovr.top;
    return { vL, vT, bPad: ovr.height-(vT+rect.h), rPad: ovr.width-(vL+rect.w) };
  };
  const off = getOffsets();

  // ---- computePos: clean positioning with consistent coordinate system ----
  const computePos = (st: AssStyle): React.CSSProperties => {
    const rgb = bgr2rgb(st.PrimaryColour);
    const col = st.PrimaryAlpha != null
      ? "rgba("+parseInt(rgb.slice(1,3),16)+","+parseInt(rgb.slice(3,5),16)+","+parseInt(rgb.slice(5,7),16)+","+(st.PrimaryAlpha??255)/255+")"
      : rgb;
    const ocRgb = st.OutlineColour ? bgr2rgb(st.OutlineColour) : "#000000";
    const oc = st.OutlineColour
      ? "rgba("+parseInt(ocRgb.slice(1,3),16)+","+parseInt(ocRgb.slice(3,5),16)+","+parseInt(ocRgb.slice(5,7),16)+","+(st.OutlineAlpha??255)/255+")"
      : "#000";
    const stroke = st.Outline ? st.Outline*sy+"px "+oc : undefined;
    const sh = st.Shadow ? st.Shadow*sx+"px "+st.Shadow*sy+"px "+st.Shadow*sy+"px rgba(0,0,0,0.7)" : "2px 2px 4px rgba(0,0,0,0.7)";
    const bgRgb = st.BackColour ? bgr2rgb(st.BackColour) : "#000000";
    const bg = (st.BackAlpha != null && st.BackAlpha > 0)
      ? "rgba("+parseInt(bgRgb.slice(1,3),16)+","+parseInt(bgRgb.slice(3,5),16)+","+parseInt(bgRgb.slice(5,7),16)+","+(st.BackAlpha??255)/255+")"
      : st.BackColour||undefined;

    const fs = Math.max(12, st.FontSize*sy);
    const al = st.Alignment || 2;
    const { vL, vT, bPad } = off;
    const mlPx = (st.MarginL||0)*sx, mrPx = (st.MarginR||0)*sx, mvPx = (st.MarginV||0)*sy;
    const baseXf = "rotate("+(st.Angle||0)+"deg) scaleX("+((st.ScaleX||100)/100)+") scaleY("+((st.ScaleY||100)/100)+")";

    const common: React.CSSProperties = {
      position: "absolute", display: "inline-block", color: col, fontSize: fs,
      fontFamily: st.FontName, fontWeight: st.Bold?"bold":"normal",
      fontStyle: st.Italic?"italic":"normal",
      textDecoration: [st.Underline?"underline":"",st.StrikeOut?"line-through":""].filter(Boolean).join(" ")||"none",
      letterSpacing: st.Spacing?st.Spacing*sx+"px":undefined,
      borderStyle: st.BorderStyle===1?"solid":"none",
      WebkitTextStroke: stroke, textShadow: sh, background: bg,
      pointerEvents: "auto", whiteSpace: "pre-wrap", userSelect: "none",
    };

    // Use position without translate transforms where possible
    // For centered alignments, use left/right + designated alignment point
    let posStyle: React.CSSProperties = {};
    
    switch (al) {
      case 1: posStyle = { left: vL+mlPx, bottom: mvPx+bPad }; break;
      case 2: default:
        posStyle = { left: vL+rect.w/2+(mlPx-mrPx)/2, bottom: mvPx+bPad };
        common.transform = baseXf+" translateX(-50%)";
        break;
      case 3: posStyle = { right: off.rPad+mrPx, bottom: mvPx+bPad }; break;
      case 4:
        posStyle = { left: vL+mlPx, top: vT+rect.h/2+mvPx };
        common.transform = baseXf+" translateY(-50%)";
        break;
      case 5:
        posStyle = { left: vL+rect.w/2+(mlPx-mrPx)/2, top: vT+rect.h/2+mvPx };
        common.transform = baseXf+" translate(-50%,-50%)";
        break;
      case 6:
        posStyle = { right: off.rPad+mrPx, top: vT+rect.h/2+mvPx };
        common.transform = baseXf+" translateY(-50%)";
        break;
      case 7: posStyle = { left: vL+mlPx, top: mvPx+vT }; break;
      case 8:
        posStyle = { left: vL+rect.w/2+(mlPx-mrPx)/2, top: mvPx+vT };
        common.transform = baseXf+" translateX(-50%)";
        break;
      case 9: posStyle = { right: off.rPad+mrPx, top: mvPx+vT }; break;
    }

    return { ...common, ...posStyle };
  };

  // ---- buildElStyle ----
  const buildElStyle = (sub: Subtitle, st: AssStyle): React.CSSProperties => {
    const isSelected = selectedSubId === sub.id;
    return {
      ...computePos(st),
      zIndex: isSelected ? 11 : 10,
      cursor: "grab",
      outline: isSelected ? "2px dashed rgba(64,150,255,0.7)" : "none",
      outlineOffset: "2px",
    };
  };

  // ---- ghost ----
  const ghostSub = dragRef.current ? subtitles.find(s => s.id === dragRef.current!.subId) : null;
  const ghostSt = dragRef.current ? styles.find(s => s.Name === dragRef.current!.styleName) : null;

  const ghostStyle = (): React.CSSProperties|null => {
    if (!dragGhost || !ghostSub || !ghostSt) return null;
    const st = ghostSt;
    const rgb = bgr2rgb(st.PrimaryColour);
    const col = st.PrimaryAlpha != null
      ? "rgba("+parseInt(rgb.slice(1,3),16)+","+parseInt(rgb.slice(3,5),16)+","+parseInt(rgb.slice(5,7),16)+","+(st.PrimaryAlpha??255)/255+")"
      : rgb;
    const fs = dragGhost.mode === "resize"
      ? Math.max(12, (st.FontSize*sy * dragGhost.height) / (dragRef.current?.savedElHeight||dragGhost.height))
      : Math.max(12, st.FontSize*sy);
    return {
      position: "absolute", display: "inline-block",
      left: dragGhost.left, top: dragGhost.top,
      color: col, fontSize: fs,
      fontFamily: st.FontName, fontWeight: st.Bold?"bold":"normal",
      fontStyle: st.Italic?"italic":"normal",
      whiteSpace: "pre-wrap",
      outline: "2px dashed rgba(64,150,255,0.7)", outlineOffset: "2px",
      cursor: dragGhost.mode==="move"?"grabbing":"nwse-resize",
      userSelect: "none", zIndex: 100, opacity: 0.85, pointerEvents: "none",
    };
  };

  // ---- render ----
  const overlay = (
    <div ref={overlayRef} style={{position:"absolute",inset:0,pointerEvents:"none",zIndex:10,overflow:"hidden"}}>
      {activeSubs.map(sub => {
        const st = styles.find(s => s.Name===sub.style); if (!st) return null;
        const isDragging = dragRef.current?.subId===sub.id && dragGhost!==null;
        if (isDragging) return null;
        return (
          <div key={sub.id} className="subtitle-preview-item" data-sub-id={sub.id}
            style={buildElStyle(sub, st)}
            onMouseDown={e => startDrag(e, sub.id, sub.style||"Default","move")}
          >
            {sub.text}
            {selectedSubId===sub.id && (
              <span style={{position:"absolute",right:-5,bottom:-5,width:14,height:14,
                background:"rgba(64,150,255,0.9)",border:"2px solid #fff",borderRadius:3,
                cursor:"nwse-resize",zIndex:12}}
                onMouseDown={e => startDrag(e, sub.id, sub.style||"Default","resize")} />
            )}
          </div>
        );
      })}
      {dragGhost && ghostSub && ghostSt && (
        <div className="subtitle-drag-ghost" style={ghostStyle()!}>{ghostSub.text}</div>
      )}
      {selectedSubId && !dragGhost && (
        <div style={{position:"absolute",inset:0,zIndex:5,pointerEvents:"auto"}}
          onClick={() => setSelectedSubId(null)} />
      )}
    </div>
  );
  const target = document.getElementById("subtitle-overlay-container");
  return target ? createPortal(overlay, target) : null;
};
export default SubtitlePreview;