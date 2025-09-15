function toAssColor(hex: string, alpha: number = 255) {
  // ASS格式为&HAA BB GG RR，AA为透明度（00不透明，FF全透明）
  // hex: #RRGGBB
  const r = hex.slice(1, 3);
  const g = hex.slice(3, 5);
  const b = hex.slice(5, 7);
  const a = (255 - alpha).toString(16).padStart(2, '0').toUpperCase();
  return `&H${a}${b}${g}${r}`;
}

export default toAssColor;