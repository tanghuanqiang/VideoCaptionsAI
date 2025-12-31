import React, { useEffect, useState } from "react";
import type { AssStyle, Subtitle } from "../types/subtitleTypes";

interface SubtitlePreviewProps {
  rect: { left: number; top: number; w: number; h: number; };
  subtitles: Subtitle[];
  styles: AssStyle[];
  videoRef: React.RefObject<HTMLVideoElement | null>;
  playResX?: number;
  playResY?: number;
}





const SubtitlePreview: React.FC<SubtitlePreviewProps> = ({ rect, subtitles, styles, videoRef, playResX = 1920, playResY = 1080 }) => {
  const [activeSubs, setActiveSubs] = useState<Subtitle[]>([]);

  useEffect(() => {
    if (!videoRef?.current || !rect) return;

    const videoElement = videoRef.current; // Store videoRef.current in a local variable

    const handleTimeUpdate = () => {
      const currentTime = videoElement.currentTime || 0;
      const active = subtitles.filter((sub) => {
        const start = typeof sub.start === 'number' ? sub.start : timeToSeconds(sub.start);
        const end = typeof sub.end === 'number' ? sub.end : timeToSeconds(sub.end);
        return currentTime >= start && currentTime <= end;
      });
      setActiveSubs(active);
    };

    videoElement.addEventListener("timeupdate", handleTimeUpdate);

    return () => {
      videoElement.removeEventListener("timeupdate", handleTimeUpdate);
    };
  }, [videoRef, subtitles, rect]);

  // 添加检查以防止 rect 为 undefined 导致错误
  if (!rect) {
    console.error("The 'rect' prop is undefined. Returning null.");
    return null;
  }


  
  function timeToSeconds(time: string): number {
    if (typeof time === 'number') return time;
    // support formats: H:MM:SS(.ms) or HH:MM:SS,ms or seconds as string
    if (/^\d+(?:\.\d+)?$/.test(time)) return parseFloat(time);
    const cleaned = time.replace(',', '.');
    const parts = cleaned.split(":");
    if (parts.length === 3) {
      const h = parseInt(parts[0] || '0', 10);
      const m = parseInt(parts[1] || '0', 10);
      const s = parseFloat(parts[2] || '0');
      return h * 3600 + m * 60 + s;
    }
    return parseFloat(cleaned) || 0;
  }

  // 根据ASS文件的PlayRes来计算缩放比例
  const assPlayResX = playResX;
  const assPlayResY = playResY;
  
  const scaleX = rect.w / assPlayResX;
  const scaleY = rect.h / assPlayResY;
  
  return (
    <div style={{
      position: "absolute",
      left: rect.left,
      top: rect.top,
      width: rect.w,
      height: rect.h,
      overflow: "hidden",
      pointerEvents: "none",
      zIndex: 9999,
    }}>
      {activeSubs.map((sub) => {
        const styleObj = styles.find(st => st.Name === sub.style);
        if (!styleObj) return null;

        // 修复：ASS格式颜色是BGR格式，需要转换为RGB
        const convertBGRToRGB = (bgrColor: string) => {
          if (bgrColor.startsWith('#')) {
            // #BBGGRR 转换为 #RRGGBB
            const bgr = bgrColor.slice(1);
            if (bgr.length === 6) {
              // const bb = bgr.slice(0, 2);
              // const gg = bgr.slice(2, 4);
              // const rr = bgr.slice(4, 6);
              const bb = bgr.slice(4, 6);
              const gg = bgr.slice(2, 4);
              const rr = bgr.slice(0, 2);
              return `#${rr}${gg}${bb}`;
            }
          }
          return bgrColor;
        };

        const primaryColorRGB = convertBGRToRGB(styleObj.PrimaryColour);
        const color = styleObj.PrimaryAlpha !== undefined
          ? `rgba(${parseInt(primaryColorRGB.slice(1,3),16)},${parseInt(primaryColorRGB.slice(3,5),16)},${parseInt(primaryColorRGB.slice(5,7),16)},${(styleObj.PrimaryAlpha ?? 255)/255})`
          : primaryColorRGB;

        const outlineColorRGB = styleObj.OutlineColour ? convertBGRToRGB(styleObj.OutlineColour) : '#000000';
        const outlineColor = styleObj.OutlineColour
          ? `rgba(${parseInt(outlineColorRGB.slice(1,3),16)},${parseInt(outlineColorRGB.slice(3,5),16)},${parseInt(outlineColorRGB.slice(5,7),16)},${(styleObj.OutlineAlpha ?? 255)/255})`
          : "#000";
        const textStroke = styleObj.Outline ? `${styleObj.Outline * scaleY}px ${outlineColor}` : undefined;

        const textShadow = styleObj.Shadow
          ? `${styleObj.Shadow * scaleX}px ${styleObj.Shadow * scaleY}px ${styleObj.Shadow * scaleY}px rgba(0,0,0,0.7)`
          : "2px 2px 4px rgba(0,0,0,0.7)";

        const backgroundColorRGB = styleObj.BackColour ? convertBGRToRGB(styleObj.BackColour) : '#000000';
        const background = styleObj.BackAlpha !== undefined
          ? `rgba(${parseInt(backgroundColorRGB.slice(1,3),16)},${parseInt(backgroundColorRGB.slice(3,5),16)},${parseInt(backgroundColorRGB.slice(5,7),16)},${(styleObj.BackAlpha ?? 255)/255})`
          : styleObj.BackColour || undefined;

        // 计算字幕的位置 - 严格按照ASS标准
        // ASS对齐方式：1-左下，2-底部居中，3-右下，4-左中，5-居中，6-右中，7-左上，8-顶部居中，9-右上
        const alignment = styleObj.Alignment || 2;
        
        // 标准ASS渲染逻辑：边距按照PlayRes坐标系缩放
        const marginL = (styleObj.MarginL || 0) * scaleX;
        const marginR = (styleObj.MarginR || 0) * scaleX;
        const marginV = (styleObj.MarginV || 0) * scaleY;
        
        let positionStyle: React.CSSProperties = {
          position: "absolute",
          color,
          fontSize: Math.max(12, styleObj.FontSize * scaleY),
          fontFamily: styleObj.FontName,
          fontWeight: styleObj.Bold ? "bold" : "normal",
          fontStyle: styleObj.Italic ? "italic" : "normal",
          textDecoration: [
            styleObj.Underline ? "underline" : "none",
            styleObj.StrikeOut ? "line-through" : "none"
          ].filter(v => v !== "none").join(" ") || "none",
          letterSpacing: styleObj.Spacing ? `${styleObj.Spacing * scaleX}px` : undefined,
          transform: `rotate(${styleObj.Angle || 0}deg) scaleX(${(styleObj.ScaleX || 100) / 100}) scaleY(${(styleObj.ScaleY || 100) / 100})`,
          borderStyle: styleObj.BorderStyle === 1 ? "solid" : "none",
          WebkitTextStroke: textStroke,
          textShadow: textShadow,
          background,
          pointerEvents: "none",
          zIndex: 10,
          whiteSpace: "pre-wrap",
        };

        // 根据对齐方式设置位置
        switch (alignment) {
          case 1: // 左下
            positionStyle = {
              ...positionStyle,
              left: marginL,
              bottom: marginV,
              textAlign: "left",
              maxWidth: `${rect.w - marginL}px`,
            };
            break;
          case 2: // 底部居中
            positionStyle = {
              ...positionStyle,
              left: marginL,
              right: marginR,
              bottom: marginV,
              textAlign: "center",
            };
            break;
          case 3: // 右下
            positionStyle = {
              ...positionStyle,
              right: marginR,
              bottom: marginV,
              textAlign: "right",
              maxWidth: `${rect.w - marginR}px`,
            };
            break;
          case 4: // 左中
            positionStyle = {
              ...positionStyle,
              left: marginL,
              top: "50%",
              transform: `${positionStyle.transform} translateY(-50%)`,
              textAlign: "left",
              maxWidth: `${rect.w - marginL}px`,
            };
            break;
          case 5: // 居中
            positionStyle = {
              ...positionStyle,
              left: marginL,
              right: marginR,
              top: "50%",
              transform: `${positionStyle.transform} translateY(-50%)`,
              textAlign: "center",
            };
            break;
          case 6: // 右中
            positionStyle = {
              ...positionStyle,
              right: marginR,
              top: "50%",
              transform: `${positionStyle.transform} translateY(-50%)`,
              textAlign: "right",
              maxWidth: `${rect.w - marginR}px`,
            };
            break;
          case 7: // 左上
            positionStyle = {
              ...positionStyle,
              left: marginL,
              top: marginV,
              textAlign: "left",
              maxWidth: `${rect.w - marginL}px`,
            };
            break;
          case 8: // 顶部居中
            positionStyle = {
              ...positionStyle,
              left: marginL,
              right: marginR,
              top: marginV,
              textAlign: "center",
            };
            break;
          case 9: // 右上
            positionStyle = {
              ...positionStyle,
              right: marginR,
              top: marginV,
              textAlign: "right",
              maxWidth: `${rect.w - marginR}px`,
            };
            break;
          default: // 默认底部居中
            positionStyle = {
              ...positionStyle,
              left: marginL,
              right: marginR,
              bottom: marginV,
              textAlign: "center",
            };
        }

        return (
          <div
            key={sub.id}
            style={positionStyle}
          >
            {sub.text}
          </div>
        );
      })}
    </div>
  );
};

export default SubtitlePreview;
