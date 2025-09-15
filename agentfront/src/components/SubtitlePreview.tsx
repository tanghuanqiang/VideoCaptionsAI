import React, { useEffect, useState } from "react";
import type { AssStyle, Subtitle } from "../App";

interface SubtitlePreviewProps {
  rect: { left: number; top: number; w: number; h: number; };
  subtitles: Subtitle[];
  styles: AssStyle[];
  videoRef: React.RefObject<HTMLVideoElement | null>;
}





const SubtitlePreview: React.FC<SubtitlePreviewProps> = ({ rect, subtitles, styles, videoRef }) => {
  const [activeSubs, setActiveSubs] = useState<Subtitle[]>([]);

  useEffect(() => {
    if (!videoRef?.current || !rect) return;

    const videoElement = videoRef.current; // Store videoRef.current in a local variable

    const handleTimeUpdate = () => {
      const currentTime = videoElement.currentTime || 0;
      const active = subtitles.filter((sub) => {
        const start = timeToSeconds(sub.start);
        const end = timeToSeconds(sub.end);
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
    const [h, m, s] = time.split(":");
    return parseInt(h) * 3600 + parseInt(m) * 60 + parseFloat(s);
  }

  // 根据视频的实际解析度来计算缩放比例，而不是一个固定的值
  const video = videoRef.current;
  const assPlayResX = video?.videoWidth || 1920;
  const assPlayResY = video?.videoHeight || 1080;
  
  // 添加调试信息
  // console.log('--- Subtitle Preview Debug Info ---');
  // console.log('rect:', rect);
  // console.log('subtitles count:', subtitles.length);
  // console.log('activeSubs count:', activeSubs.length);
  // console.log('videoRef.current:', video);
  // console.log('videoWidth:', video?.videoWidth);
  // console.log('videoHeight:', video?.videoHeight);
  // console.log('ASS Play Res X/Y:', assPlayResX, assPlayResY);
  // console.log('scaleX:', rect.w / assPlayResX);
  // console.log('scaleY:', rect.h / assPlayResY);
  // console.log('currentTime:', video?.currentTime);
  // if (activeSubs.length > 0) {
  //   console.log('activeSubs:', activeSubs);
  // }
  // console.log('-----------------------------------');
  
  const scaleX = rect.w / assPlayResX;
  const scaleY = rect.h / assPlayResY;
  
  return (
    <div style={{
      position: "absolute",
      left: rect.left,
      top: rect.top,
      width: rect.w,
      height: rect.h,
      // border: "2px dashed rgba(255,0,0,0.5)", // 临时启用边框来调试
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
              const bb = bgr.slice(0, 2);
              const gg = bgr.slice(2, 4);
              const rr = bgr.slice(4, 6);
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
        const textStroke = styleObj.Outline ? `${styleObj.Outline}px ${outlineColor}` : undefined;

        const textShadow = styleObj.Shadow
          ? `0 0 ${styleObj.Shadow}px rgba(0,0,0,0.7)`
          : "2px 2px 4px rgba(0,0,0,0.7)";

        const backgroundColorRGB = styleObj.BackColour ? convertBGRToRGB(styleObj.BackColour) : '#000000';
        const background = styleObj.BackAlpha !== undefined
          ? `rgba(${parseInt(backgroundColorRGB.slice(1,3),16)},${parseInt(backgroundColorRGB.slice(3,5),16)},${parseInt(backgroundColorRGB.slice(5,7),16)},${(styleObj.BackAlpha ?? 255)/255})`
          : styleObj.BackColour || undefined;

        return (
          <div
            key={sub.id}
            style={{
              position: "absolute",
              bottom: "10%",
              left: 0,
              width: "100%",
              textAlign: "center",
              color,
              fontSize: Math.max(12, styleObj.FontSize * scaleY), // 确保最小字体大小
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
              textShadow: textShadow || "2px 2px 4px rgba(0,0,0,0.8)", // 确保有文字阴影
              background,
              paddingLeft: styleObj.MarginL ? `${styleObj.MarginL * scaleX}px` : undefined,
              paddingRight: styleObj.MarginR ? `${styleObj.MarginR * scaleX}px` : undefined,
              paddingBottom: styleObj.MarginV ? `${styleObj.MarginV * scaleY}px` : undefined,
              pointerEvents: "none",
              zIndex: 10,
              whiteSpace: "pre-wrap",
              // 临时添加背景色来调试字幕位置
              // backgroundColor: activeSubs.length > 0 ? 'rgba(0,0,0,0.3)' : undefined,
              padding: '8px 16px',
              borderRadius: '4px',
            }}
          >
            {sub.text}
          </div>
        );
      })}
    </div>
  );
};

export default SubtitlePreview;
