import React, { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { toCssRgba, parseAssColor } from "../utils/toAssColor";
import type { AssStyle, Subtitle } from "../types/subtitleTypes";
import {
  assToCSS,
  cssDragToASS,
  cssResizeToASS,
  type VideoContentRect,
} from "../utils/CoordinateMapper";

/* types */
interface Props {
  subtitles: Subtitle[];
  styles: AssStyle[];
  videoRef: React.RefObject<HTMLVideoElement | null>;
  playResX?: number;
  playResY?: number;
  onStyleUpdate?: (styleName: string, updates: Partial<AssStyle>) => void;
  contentRect?: VideoContentRect;
  enabled?: boolean;
}

interface DragState {
  subId: string;
  styleName: string;
  mode: "move" | "resize";
  startMouseX: number;
  startMouseY: number;
  startFontSize: number;
  startAlignment: number;
  startMarginV: number;
  startMarginL: number;
  startMarginR: number;
}

const SubtitlePreview: React.FC<Props> = ({
  subtitles, styles, videoRef,
  playResX = 1920, playResY = 1080,
  onStyleUpdate, contentRect, enabled = true,
}) => {
  const [activeSubs, setActiveSubs] = useState<Subtitle[]>([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [selectedSubId, setSelectedSubId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ dx: number; dy: number; scale: number }>({ dx: 0, dy: 0, scale: 1 });

  const dragRef = useRef<DragState | null>(null);
  const offsetRef = useRef<{ dx: number; dy: number; scale: number }>({ dx: 0, dy: 0, scale: 1 });
  const endDragFn = useRef<(() => void) | null>(null);
  const [portalReady, setPortalReady] = useState(false);

  const cr = useMemo(() => contentRect || { left: 0, top: 0, width: 640, height: 360 }, [contentRect]);

  /* portal */
  useEffect(() => {
    let id: ReturnType<typeof setTimeout>;
    const check = () => {
      if (document.getElementById("subtitle-overlay-container")) setPortalReady(true);
      else id = setTimeout(check, 50);
    };
    check();
    return () => clearTimeout(id);
  }, []);

  useEffect(() => () => { endDragFn.current?.(); }, []);

  /* time parsing */
  const t2s = useCallback((t: string | number): number => {
    if (typeof t === "number") return t;
    if (/^\d+(?:\.\d+)?$/.test(t)) return parseFloat(t);
    const parts = t.replace(",", ".").split(":");
    if (parts.length === 3) return +parts[0]*3600 + +parts[1]*60 + parseFloat(parts[2]);
    return parseFloat(parts[0]) || 0;
  }, []);

  /* timeupdate */
  useEffect(() => {
    const ve = videoRef?.current;
    if (!ve) return;
    let ticking = false;
    let raf = 0;
    const onTime = () => {
      if (ticking) return;
      ticking = true;
      raf = requestAnimationFrame(() => {
        const t = ve.currentTime || 0;
        setCurrentTime(t);
        setActiveSubs(subtitles.filter(s => t >= t2s(s.start) && t <= t2s(s.end)));
        ticking = false;
      });
    };
    ve.addEventListener("timeupdate", onTime);
    return () => { ve.removeEventListener("timeupdate", onTime); cancelAnimationFrame(raf); };
  }, [videoRef, subtitles, t2s]);

  /* build CSS from ASS */
  const buildStyle = useCallback((st: AssStyle, overrides: Subtitle["overrides"] = {}): React.CSSProperties => {
    const effective = {
      ...st,
      FontName: overrides?.fontFamily ?? st.FontName,
      FontSize: overrides?.fontSize ?? st.FontSize,
      PrimaryColour: overrides?.primaryColor ?? st.PrimaryColour,
      OutlineColour: overrides?.outlineColor ?? st.OutlineColour,
      Outline: overrides?.outlineWidth ?? st.Outline,
      Shadow: overrides?.shadowWidth ?? st.Shadow,
      ScaleX: overrides?.scaleX ?? st.ScaleX,
      ScaleY: overrides?.scaleY ?? st.ScaleY,
      Angle: overrides?.rotation ?? st.Angle,
      Spacing: overrides?.letterSpacing ?? st.Spacing,
    };
    const alignment = effective.Alignment ?? 2;
    const pos = assToCSS(
      alignment,
      effective.MarginL ?? 10,
      effective.MarginR ?? 10,
      effective.MarginV ?? 10,
      effective.FontSize ?? 48,
      cr, playResX, playResY
    );

    // Fix #1: Alpha/transparency from PrimaryAlpha
    const primaryAlpha = overrides?.opacity ?? (effective.PrimaryAlpha ?? 255) / 255;
    const rgbaColor = toCssRgba(effective.PrimaryColour || "#FFFFFF", primaryAlpha < 1 ? primaryAlpha : 0.999);

    // text alignment within element
    const haMod = alignment % 3;
    const textAlign = haMod === 0 ? "right" : haMod === 2 ? "center" : "left";

    // Position transform from CoordinateMapper
    const translateXform = pos.translateX ? `translate(${pos.translateX})` : "";

    // Geometry transforms
    const scaleXform = (effective.ScaleX !== undefined && effective.ScaleX !== 100) || (effective.ScaleY !== undefined && effective.ScaleY !== 100)
      ? `scale(${(effective.ScaleX??100)/100}, ${(effective.ScaleY??100)/100})` : "";
    const angleXform = effective.Angle ? `rotate(${effective.Angle}deg)` : "";

    // Fix #2: Synthetic italic for CJK fonts
    const combinedXform = [translateXform, scaleXform, angleXform, effective.Italic ? "skewX(-12deg)" : ""].filter(Boolean).join(" ");

    // Outline colour with alpha from OutlineAlpha (0 = fully opaque in ASS convention)
    const outlineColour = (() => {
      const c = parseAssColor(effective.OutlineColour || "#000000");
      if (!c) return "rgba(0,0,0,1)";
      const rawAlpha = effective.OutlineAlpha ?? 255;
      // OutlineAlpha=0 means fully opaque in ASS (same as 255), so default 0 to 255
      const outlineAlpha = (rawAlpha === 0 ? 255 : rawAlpha) / 255;
      return `rgba(${c.r},${c.g},${c.b},${outlineAlpha})`;
    })();

    // Shadow colour from BackColour with BackAlpha
    const backColour = (() => {
      const c = parseAssColor(effective.BackColour || "#000000");
      if (!c) return "rgba(0,0,0,1)";
      const rawAlpha = effective.BackAlpha ?? 255;
      // BackAlpha=0 means fully opaque in ASS (same as 255)
      const backAlpha = (rawAlpha === 0 ? 255 : rawAlpha) / 255;
      return `rgba(${c.r},${c.g},${c.b},${backAlpha})`;
    })();

    const us = cr.height / playResY;

    return {
      position: "absolute" as const,
      left: overrides?.x !== undefined ? `${(overrides.x / playResX) * 100}%` : pos.left,
      top: overrides?.y !== undefined ? `${(overrides.y / playResY) * 100}%` : pos.top,
      transform: combinedXform || undefined,
      transformOrigin: "center center",
      color: rgbaColor,
      fontSize: pos.fontSize,
      fontFamily: effective.FontName || "Arial",
      fontWeight: effective.Bold ? "bold" : "normal",
      fontStyle: effective.Italic ? "italic" : "normal",
      // Fix #4: Letter spacing from ASS Spacing
      letterSpacing: `${((effective.Spacing || 0) * us).toFixed(1)}px`,
      textDecoration: [effective.Underline?"underline":"",effective.StrikeOut?"line-through":""].filter(Boolean).join(" ") || undefined,
      textAlign: textAlign as React.CSSProperties["textAlign"],
      whiteSpace: "pre-wrap" as const,
      pointerEvents: "auto" as const,
      // Fix #3: Clean outline with -webkit-text-stroke, no ghosting
      WebkitTextStroke: (() => {
        const o = effective.Outline ?? 2; if (o <= 0) return undefined;
        return `${(o * us).toFixed(1)}px ${outlineColour}`;
      })(),
      paintOrder: (effective.Outline ?? 2) > 0 ? "stroke fill" : undefined,
      // Shadow: drop-shadow filter using BackColour (ASS shadow colour)
      filter: (() => {
        const s = effective.Shadow ?? 0; if (s <= 0) return undefined;
        const t = Math.max(2, s * us);
        return `drop-shadow(${t.toFixed(1)}px ${t.toFixed(1)}px 1px ${backColour})`;
      })(),
      lineHeight: "1.2",
    };
  }, [cr, playResX, playResY]);

  /* drag start */
  const startDrag = useCallback((e: React.MouseEvent, subId: string, styleName: string, mode: "move" | "resize") => {
    e.preventDefault();
    e.stopPropagation();

    const styleObj = styles.find(s => s.Name === styleName);
    if (!styleObj) return;

    const ds: DragState = {
      subId, styleName, mode,
      startMouseX: e.clientX, startMouseY: e.clientY,
      startFontSize: styleObj.FontSize || 48,
      startAlignment: styleObj.Alignment ?? 2,
      startMarginV: styleObj.MarginV ?? 10,
      startMarginL: styleObj.MarginL ?? 10,
      startMarginR: styleObj.MarginR ?? 10,
    };

    dragRef.current = ds;
    offsetRef.current = { dx: 0, dy: 0, scale: 1 };
    setSelectedSubId(subId);
    setDragOffset({ dx: 0, dy: 0, scale: 1 });

    const onMove = (ev: MouseEvent) => {
      const d = dragRef.current;
      if (!d || d.subId !== subId) return;
      const mx = ev.clientX, my = ev.clientY;
      if (d.mode === "resize") {
        const basePx = d.startFontSize * (cr.height / playResY);
        const s = Math.max(12, basePx + (my - d.startMouseY)) / basePx;
        offsetRef.current = { dx: 0, dy: 0, scale: s };
        setDragOffset({ dx: 0, dy: 0, scale: s });
      } else {
        offsetRef.current = { dx: mx - d.startMouseX, dy: my - d.startMouseY, scale: 1 };
        setDragOffset({ dx: mx - d.startMouseX, dy: my - d.startMouseY, scale: 1 });
      }
    };

    const onUp = () => {
      const d = dragRef.current;
      if (!d || d.subId !== subId) { end(); return; }
      if (!onStyleUpdate) { end(); return; }
      if (!styles.some(s => s.Name === d.styleName)) { end(); return; }

      const off = offsetRef.current;

      if (d.mode === "move") {
        const up = cssDragToASS(
          off.dx, off.dy,
          d.startAlignment, d.startMarginL, d.startMarginR,
          d.startMarginV, d.startFontSize,
          cr, playResY
        );
        onStyleUpdate(d.styleName, {
          MarginV: up.marginV,
          MarginL: up.marginL,
          MarginR: up.marginR,
        });
      } else {
        const nf = cssResizeToASS(off.scale, d.startFontSize, cr, playResY);
        onStyleUpdate(d.styleName, { FontSize: Math.round(nf) });
      }

      end();
    };

    const end = () => {
      dragRef.current = null;
      offsetRef.current = { dx: 0, dy: 0, scale: 1 };
      setDragOffset({ dx: 0, dy: 0, scale: 1 });
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      endDragFn.current = null;
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    endDragFn.current = end;
  }, [styles, cr, playResY, onStyleUpdate]);

  /* render */
  const dragId = dragRef.current?.subId || null;

  const overlay = (
    <div style={{ position:"absolute", inset:0, pointerEvents:"none", zIndex:10, overflow:"hidden" }}>
      {activeSubs.map(sub => {
        const st = styles.find(s => s.Name === sub.style);
        if (!st) return null;

        const base = buildStyle(st, sub.overrides);
        const isSel = selectedSubId === sub.id;
        const isDrg = dragId === sub.id;
        const unitStyle = (unit: NonNullable<Subtitle["units"]>[number]): React.CSSProperties => {
          const rendered = buildStyle(st, { ...(sub.overrides || {}), ...(unit.overrides || {}) });
          return {
            color: rendered.color,
            fontSize: rendered.fontSize,
            fontFamily: rendered.fontFamily,
            fontWeight: rendered.fontWeight,
            fontStyle: rendered.fontStyle,
            letterSpacing: rendered.letterSpacing,
            WebkitTextStroke: rendered.WebkitTextStroke,
            paintOrder: rendered.paintOrder,
            display: "inline-block",
          };
        };

        let extraTf = "";
        if (isDrg) {
          extraTf = dragRef.current?.mode === "resize"
            ? `scale(${dragOffset.scale})`
            : `translate(${dragOffset.dx}px,${dragOffset.dy}px)`;
        }

        const baseTf = base.transform || "";
        const tf = [extraTf, baseTf].filter(Boolean).join(" ");

        const effect = sub.effect?.type || "whole";
        const visibleUnits = (sub.units || []).filter(unit => effect !== "reveal" || currentTime >= unit.startMs / 1000);
        const renderedUnits = visibleUnits.map(unit => <span key={unit.id} style={{
          ...unitStyle(unit),
          ...(effect === "highlight" && currentTime >= unit.startMs / 1000 && currentTime <= unit.endMs / 1000
            ? { color: unit.overrides.primaryColor ? toCssRgba(unit.overrides.primaryColor, unit.overrides.opacity ?? 1) : "#4DD8FF" }
            : {}),
          ...(effect === "emphasis" && currentTime >= unit.startMs / 1000 && currentTime <= unit.endMs / 1000
            ? { transform: "scale(1.1)" }
            : {}),
        }}>{unit.text}</span>);

        return (
          <div key={sub.id} data-sub-id={sub.id}
            style={{
              ...base, transform: tf || undefined, transformOrigin: "center center",
              zIndex: isDrg ? 100 : isSel ? 11 : 10,
              cursor: isDrg ? "grabbing" : "grab",
              outline: isSel ? "2px dashed rgba(64,150,255,0.7)" : "none",
              outlineOffset: "2px",
              opacity: isDrg ? 0.85 : 1,
            }}
            onMouseDown={e => startDrag(e, sub.id, sub.style || "Default", "move")}
          >
            {sub.units?.length ? renderedUnits : sub.text}
            {isSel && (
              <span
                style={{
                  position:"absolute", right:-5, bottom:-5, width:14, height:14,
                  background:"rgba(64,150,255,0.9)", border:"2px solid #fff",
                  borderRadius:3, cursor:"nwse-resize", zIndex:12,
                }}
                onMouseDown={e => { e.stopPropagation(); startDrag(e, sub.id, sub.style || "Default", "resize"); }}
              />
            )}
          </div>
        );
      })}
      {selectedSubId && !dragId && (
        <div style={{ position:"absolute", inset:0, zIndex:5, pointerEvents:"auto" }}
          onClick={() => setSelectedSubId(null)} />
      )}
    </div>
  );

  const target = document.getElementById("subtitle-overlay-container");
  return enabled && portalReady && target ? createPortal(overlay, target) : null;
};

export default SubtitlePreview;
