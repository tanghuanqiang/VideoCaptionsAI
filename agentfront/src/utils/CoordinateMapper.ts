/**
 * CoordinateMapper - Unified coordinate system for subtitle preview and export.
 * Converts between ASS PlayRes coordinates and CSS pixel positions,
 * accounting for letterboxing from objectFit: contain.
 */

export interface VideoContentRect {
  left: number;   // CSS px from container left edge
  top: number;    // CSS px from container top edge
  width: number;  // CSS px of actual video content
  height: number; // CSS px of actual video content
}

export interface ASSPosition {
  alignment: number;  // 1-9 numpad alignment
  marginL: number;    // ASS pixels from left
  marginR: number;    // ASS pixels from right
  marginV: number;    // ASS pixels from top/bottom
  fontSize: number;   // ASS font size
}

/**
 * Calculate the actual video content rect within a container,
 * accounting for objectFit: contain letterboxing.
 */
export function getVideoContentRect(
  containerWidth: number,
  containerHeight: number,
  videoWidth: number,
  videoHeight: number
): VideoContentRect {
  if (!videoWidth || !videoHeight || !containerWidth || !containerHeight) {
    return { left: 0, top: 0, width: containerWidth, height: containerHeight };
  }

  const videoAspect = videoWidth / videoHeight;
  const containerAspect = containerWidth / containerHeight;

  let contentW: number, contentH: number;

  if (videoAspect > containerAspect) {
    // Video is wider - letterbox top/bottom
    contentW = containerWidth;
    contentH = containerWidth / videoAspect;
  } else {
    // Video is taller - letterbox left/right
    contentH = containerHeight;
    contentW = containerHeight * videoAspect;
  }

  return {
    left: (containerWidth - contentW) / 2,
    top: (containerHeight - contentH) / 2,
    width: contentW,
    height: contentH,
  };
}

/**
 * Convert ASS coordinates to CSS pixel position within the video content area.
 *
 * @param assPos - ASS style positioning parameters
 * @param contentRect - The video content area rect (from getVideoContentRect)
 * @param playResX - ASS PlayResX (video width in ASS coords)
 * @param playResY - ASS PlayResY (video height in ASS coords)
 * @returns CSS left/top position and ASS-equivalent margins
 */
export function assToCSS(
  assPos: ASSPosition,
  contentRect: VideoContentRect,
  playResX: number,
  playResY: number
): { left: number; top: number; marginLPx: number; marginRPx: number; marginVPx: number; fontSizePx: number } {
  const scaleX = contentRect.width / playResX;
  const scaleY = contentRect.height / playResY;
  const scale = Math.min(scaleX, scaleY);

  const mlPx = (assPos.marginL || 10) * scale;
  const mrPx = (assPos.marginR || 10) * scale;
  const mvPx = (assPos.marginV || 10) * scale;
  const fontSizePx = (assPos.fontSize || 48) * scale;

  // ASS alignment: 1=bottom-left, 2=bottom-center, 3=bottom-right
  // 4=middle-left, 5=middle-center, 6=middle-right
  // 7=top-left, 8=top-center, 9=top-right
  let left: number, top: number;

  switch (assPos.alignment) {
    case 1: left = mlPx;                          top = contentRect.height - mvPx; break;
    case 2: left = contentRect.width / 2;          top = contentRect.height - mvPx; break;
    case 3: left = contentRect.width - mrPx;       top = contentRect.height - mvPx; break;
    case 4: left = mlPx;                          top = contentRect.height / 2;      break;
    case 5: left = contentRect.width / 2;          top = contentRect.height / 2;      break;
    case 6: left = contentRect.width - mrPx;       top = contentRect.height / 2;      break;
    case 7: left = mlPx;                          top = mvPx;                        break;
    case 8: left = contentRect.width / 2;          top = mvPx;                        break;
    case 9: left = contentRect.width - mrPx;       top = mvPx;                        break;
    default: left = contentRect.width / 2;         top = contentRect.height - mvPx;
  }

  return {
    left: contentRect.left + left,
    top: contentRect.top + top,
    marginLPx: mlPx,
    marginRPx: mrPx,
    marginVPx: mvPx,
    fontSizePx,
  };
}

/**
 * Convert a CSS drag delta back to ASS style changes.
 *
 * @param cssDeltaX - horizontal drag delta in CSS px
 * @param cssDeltaY - vertical drag delta in CSS px
 * @param currentStyle - current ASS style values
 * @param contentRect - video content rect
 * @param playResX - ASS PlayResX
 * @param playResY - ASS PlayResY
 * @returns Partial ASSPosition with new values
 */
export function cssDragToASS(
  cssDeltaX: number,
  cssDeltaY: number,
  currentStyle: ASSPosition,
  contentRect: VideoContentRect,
  playResX: number,
  playResY: number
): { alignment: number; marginV: number; marginL: number; marginR: number } {
  const scaleX = contentRect.width / playResX;
  const scaleY = contentRect.height / playResY;

  const deltaV = Math.round(-cssDeltaY / scaleY);
  const deltaL = Math.round(cssDeltaX / scaleX);
  const deltaR = Math.round(-cssDeltaX / scaleX);

  const newMarginV = Math.max(0, (currentStyle.marginV || 10) + deltaV);
  const newMarginL = Math.max(0, (currentStyle.marginL || 10) + deltaL);
  const newMarginR = Math.max(0, (currentStyle.marginR || 10) + deltaR);

  // Determine alignment based on where the subtitle ended up
  const centerX = contentRect.width / 2;
  const centerY = contentRect.height / 2;

  // Recalculate position from margins
  const fromLeft = newMarginL;
  const fromRight = newMarginR;
  const fromBottom = contentRect.height - newMarginV;
  const fromTop = newMarginV;

  let alignment = currentStyle.alignment || 2;

  // Use the dominant margin to determine alignment
  if (fromLeft < 30 && fromLeft < fromRight) alignment = 1; // left
  else if (fromRight < 30 && fromRight < fromLeft) alignment = 3; // right

  // Vertical: bottom vs top
  if (fromBottom > contentRect.height * 0.6) alignment = alignment; // stays bottom
  else if (fromTop < contentRect.height * 0.3) alignment += 6; // top

  return { alignment, marginV: newMarginV, marginL: newMarginL, marginR: newMarginR };
}

/**
 * Convert font size drag delta to ASS font size.
 */
export function cssResizeToASS(
  cssHeightDelta: number,
  currentFontSize: number,
  contentRect: VideoContentRect,
  playResY: number
): number {
  const scale = contentRect.height / playResY;
  const delta = Math.round(cssHeightDelta / scale);
  return Math.max(12, currentFontSize + delta);
}
