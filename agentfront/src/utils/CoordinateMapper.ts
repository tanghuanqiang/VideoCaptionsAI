/**
 * CoordinateMapper - Pure functions for ASS ↔ CSS coordinate conversion.
 *
 * ASS numpad alignment:
 *   7=top-left     8=top-center     9=top-right
 *   4=middle-left   5=middle-center  6=middle-right
 *   1=bottom-left   2=bottom-center  3=bottom-right
 *
 * ASS position rules:
 *   Left-aligned (1,4,7):  anchor = left edge,  X = marginL (marginR ignored)
 *   Right-aligned (3,6,9): anchor = right edge, X = playResX - marginR (marginL ignored)
 *   Center-aligned (2,5,8): anchor = center,     X = playResX/2 + marginL - marginR (both shift)
 *
 *   Bottom-aligned (1,2,3): anchor = bottom,  Y = playResY - marginV
 *   Top-aligned (7,8,9):    anchor = top,     Y = marginV
 *   Middle-aligned (4,5,6): anchor = middle,  Y = playResY/2 + marginV
 */

export interface VideoContentRect { left: number; top: number; width: number; height: number; }

function hAlign(a: number): "left" | "center" | "right" {
  const m = a % 3; return m === 1 ? "left" : m === 0 ? "right" : "center";
}
function vAlign(a: number): "top" | "middle" | "bottom" {
  if (a <= 3) return "bottom"; if (a >= 7) return "top"; return "middle";
}

export function getVideoContentRect(cw: number, ch: number, vw: number, vh: number): VideoContentRect {
  if (!vw || !vh || !cw || !ch) return { left: 0, top: 0, width: cw, height: ch };
  const va = vw / vh, ca = cw / ch;
  let w: number, h: number;
  if (va > ca) { w = cw; h = cw / va; } else { h = ch; w = ch * va; }
  return { left: (cw - w) / 2, top: (ch - h) / 2, width: w, height: h };
}

/** CSS position for subtitle element within the overlay container. */
export function assToCSS(
  alignment: number, marginL: number, marginR: number, marginV: number, fontSize: number,
  cr: VideoContentRect, prX: number, prY: number
) {
  const s = cr.height / prY;
  const ml = marginL * s, mr = marginR * s, mv = marginV * s, fs = fontSize * s;
  const ha = hAlign(alignment), va = vAlign(alignment);

  let left: number | undefined;
  let top: number | undefined;
  let tx: string | undefined;

  // --- Horizontal ---
  if (ha === "left") {
    left = cr.left + ml;
  } else if (ha === "right") {
    left = cr.left + cr.width - mr;
    tx = "-100%";
  } else {
    // center: ASS spec → centerX = playResX/2 + marginL - marginR
    left = cr.left + cr.width / 2 + ml - mr;
    tx = "-50%";
  }

  // --- Vertical ---
  if (va === "bottom") { top = cr.top + cr.height - mv; tx = tx ? tx + ",-100%" : "0,-100%"; } else if (va === "top") {
    top = cr.top + mv;
  } else {
    // middle: position at center + marginV offset
    top = cr.top + cr.height / 2 + mv;
    tx = tx ? tx + ",-50%" : "0,-50%";
  }

  return { left, top, fontSize: fs, translateX: tx };
}

/** Drag delta (CSS px) → ASS margin changes. Keeps alignment fixed. */
export function cssDragToASS(
  dx: number, dy: number,
  alignment: number, marginL: number, marginR: number, marginV: number, fontSize: number,
  cr: VideoContentRect, prY: number
): { marginV: number; marginL: number; marginR: number } {
  const s = cr.height / prY;
  const ha = hAlign(alignment), va = vAlign(alignment);

  let ml = marginL, mr = marginR, mv = marginV;
  const rawDelta = Math.round(dx / s);

  // Horizontal: based on alignment, dx shifts appropriate margins
  if (ha === "left") {
    ml = Math.max(0, ml + rawDelta);
  } else if (ha === "right") {
    mr = Math.max(0, mr - rawDelta);
  } else {
    // center: dx shifts both margins (ASS: centerX = playResX/2 + marginL - marginR)
    ml = Math.max(0, ml + rawDelta);
    mr = Math.max(0, mr - rawDelta);
  }

  // Vertical
  const rawDeltaY = Math.round(dy / s);
  if (va === "bottom") mv = Math.max(0, mv - rawDeltaY);
  else if (va === "top") mv = Math.max(0, mv + rawDeltaY);
  else mv = Math.max(0, mv + rawDeltaY);

  return {
    marginV: Math.min(999, mv), marginL: Math.min(999, ml), marginR: Math.min(999, mr),
  };
}

/** Resize delta → new font size */
export function cssResizeToASS(dScale: number, curFontSize: number, cr: VideoContentRect, prY: number): number {
  return Math.max(12, Math.min(500, Math.round(curFontSize * dScale)));
}

/** Alignment change: preserve absolute pixel position */
export function preservePosition(
  oldA: number, newA: number, ml: number, mr: number, mv: number, fs: number,
  cr: VideoContentRect, prX: number, prY: number
): { marginL: number; marginR: number; marginV: number } {
  const s = cr.height / prY;

  // Compute absolute pixel position of the text in content coordinates
  const oha = hAlign(oldA), ova = vAlign(oldA);
  let absX: number, absY: number;
  if (oha === "left") absX = ml * s;
  else if (oha === "right") absX = cr.width - mr * s;
  else absX = cr.width / 2 + ml * s - mr * s; // center: ASS centerX formula

  if (ova === "bottom") absY = cr.height - mv * s;
  else if (ova === "top") absY = mv * s;
  else absY = cr.height / 2 + mv * s;

  // Compute margins for new alignment that preserve absolute position
  const nha = hAlign(newA), nva = vAlign(newA);
  let nml = ml, nmr = mr, nmv = mv;

  if (nha === "left") nml = Math.max(0, Math.round(absX / s));
  else if (nha === "right") nmr = Math.max(0, Math.round((cr.width - absX) / s));
  else {
    // center: need to find ml,mr such that cr.width/2 + ml*s - mr*s ≈ absX
    // Strategy: keep the net shift (ml*s - mr*s) = absX - cr.width/2, distribute evenly
    const netShift = absX - cr.width / 2;
    const netMargin = Math.round(netShift / s);
    if (netMargin >= 0) {
      nml = Math.max(0, netMargin);
      nmr = 0;
    } else {
      nml = 0;
      nmr = Math.max(0, -netMargin);
    }
  }

  if (nva === "bottom") nmv = Math.max(0, Math.round((cr.height - absY) / s));
  else if (nva === "top") nmv = Math.max(0, Math.round(absY / s));
  else nmv = Math.max(0, Math.round((absY - cr.height / 2) / s));

  return { marginL: Math.min(999, nml), marginR: Math.min(999, nmr), marginV: Math.min(999, nmv) };
}
