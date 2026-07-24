/**
 * Convert between CSS hex (#RRGGBB) and ASS (&HAABBGGRR) color formats.
 */

/** Parse an ASS color (&HAABBGGRR) to CSS rgb components */
export function parseAssColor(assColor: string): { r: number; g: number; b: number; a: number } | null {
  if (!assColor) return null;

  // Already CSS format: #RRGGBB or #RRGGBBAA
  if (assColor.startsWith("#")) {
    const h = assColor.replace("#", "");
    return {
      r: parseInt(h.slice(0, 2), 16) || 0,
      g: parseInt(h.slice(2, 4), 16) || 0,
      b: parseInt(h.slice(4, 6), 16) || 0,
      a: h.length >= 8 ? parseInt(h.slice(6, 8), 16) : 255,
    };
  }

  // ASS format: &HAABBGGRR
  if (assColor.startsWith("&H") || assColor.startsWith("&h")) {
    const h = assColor.slice(2);
    return {
      r: parseInt(h.slice(4, 6), 16) || 0,  // RR (last 2 hex chars)
      g: parseInt(h.slice(2, 4), 16) || 0,  // GG
      b: parseInt(h.slice(0, 2), 16) || 0,  // BB (first 2)
      a: h.length >= 8 ? (255 - (parseInt(h.slice(6, 8), 16) || 0)) : 255, // AA inverted
    };
  }

  return null;
}

/** Convert a CSS #RRGGBB color to ASS &H00BBGGRR format */
export function toAssColor(hex: string, alpha: number = 255): string {
  // If already ASS format, use as-is
  if (hex.startsWith("&H") || hex.startsWith("&h")) return hex;

  // CSS format: #RRGGBB
  const r = hex.slice(1, 3);
  const g = hex.slice(3, 5);
  const b = hex.slice(5, 7);
  const a = (255 - alpha).toString(16).padStart(2, '0').toUpperCase();
  return `&H${a}${b}${g}${r}`;
}

/** CSS rgba() string from any color format */
export function toCssRgba(assOrHex: string, fallbackAlpha: number = 1): string {
  const parsed = parseAssColor(assOrHex);
  if (!parsed) return "rgba(255,255,255,1)";
  const a = fallbackAlpha < 1 ? fallbackAlpha : parsed.a / 255;
  return `rgba(${parsed.r},${parsed.g},${parsed.b},${a})`;
}

export default toAssColor;
