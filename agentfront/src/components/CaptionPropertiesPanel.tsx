import React, { useMemo, useState } from "react";
import type { CaptionOverrides, Subtitle } from "../types/subtitleTypes";
import "./CaptionPropertiesPanel.css";

interface Props {
  subtitles: Subtitle[];
  selectedIds: string[];
  selectedUnitId?: string | null;
  setSubtitles: (value: Subtitle[] | ((current: Subtitle[]) => Subtitle[]), options?: { transient?: boolean }) => void;
}

type Field = {
  key: keyof CaptionOverrides;
  label: string;
  type: "text" | "number" | "color";
  step?: string;
  min?: string;
  max?: string;
};

const typographyFields: Field[] = [
  { key: "fontFamily", label: "\u5b57\u4f53", type: "text" },
  { key: "fontSize", label: "\u5b57\u53f7", type: "number", min: "1", step: "1" },
  { key: "primaryColor", label: "\u6587\u5b57\u989c\u8272", type: "color" },
  { key: "opacity", label: "\u900f\u660e\u5ea6", type: "number", min: "0", max: "1", step: "0.05" },
  { key: "letterSpacing", label: "\u5b57\u95f4\u8ddd", type: "number", step: "0.5" },
];

const appearanceFields: Field[] = [
  { key: "outlineColor", label: "\u63cf\u8fb9\u989c\u8272", type: "color" },
  { key: "outlineWidth", label: "\u63cf\u8fb9\u5bbd\u5ea6", type: "number", min: "0", step: "0.5" },
  { key: "shadowColor", label: "\u9634\u5f71\u989c\u8272", type: "color" },
  { key: "shadowWidth", label: "\u9634\u5f71\u5bbd\u5ea6", type: "number", min: "0", step: "0.5" },
];

const transformFields: Field[] = [
  { key: "x", label: "X", type: "number", step: "1" },
  { key: "y", label: "Y", type: "number", step: "1" },
  { key: "scaleX", label: "X \u7f29\u653e", type: "number", min: "1", step: "1" },
  { key: "scaleY", label: "Y \u7f29\u653e", type: "number", min: "1", step: "1" },
  { key: "rotation", label: "\u65cb\u8f6c", type: "number", step: "1" },
];

const allFields = [...typographyFields, ...appearanceFields, ...transformFields];

const CaptionPropertiesPanel: React.FC<Props> = ({ subtitles, selectedIds, selectedUnitId, setSubtitles }) => {
  const selected = useMemo(
    () => subtitles.filter(subtitle => selectedIds.includes(subtitle.id)),
    [subtitles, selectedIds],
  );
  const selectedUnit = useMemo(() => {
    if (!selectedUnitId || selected.length !== 1) return null;
    return selected[0].units?.find(unit => unit.id === selectedUnitId) || null;
  }, [selected, selectedUnitId]);
  const [copied, setCopied] = useState<CaptionOverrides | null>(null);
  const values = selectedUnit ? [selectedUnit.overrides] : selected.map(subtitle => subtitle.overrides || {});

  const mixedValue = (key: keyof CaptionOverrides): string | number | undefined => {
    if (!values.length) return undefined;
    const first = values[0][key];
    return values.every(value => value[key] === first) ? first : undefined;
  };

  const update = (key: keyof CaptionOverrides, rawValue: string) => {
    const field = allFields.find(item => item.key === key);
    let nextValue: string | number | undefined = rawValue === "" ? undefined : rawValue;
    if (field?.type === "number" && rawValue !== "") {
      const numericValue = Number(rawValue);
      nextValue = Number.isFinite(numericValue) ? numericValue : undefined;
    }
    setSubtitles(previous => previous.map(subtitle => {
      if (!selectedIds.includes(subtitle.id)) return subtitle;
      if (selectedUnitId && selectedUnit) {
        return {
          ...subtitle,
          units: (subtitle.units || []).map(unit => unit.id === selectedUnitId
            ? { ...unit, overrides: { ...unit.overrides, [key]: nextValue } }
            : unit),
        };
      }
      return { ...subtitle, overrides: { ...(subtitle.overrides || {}), [key]: nextValue } };
    }));
  };

  const reset = () => setSubtitles(previous => previous.map(subtitle => {
    if (!selectedIds.includes(subtitle.id)) return subtitle;
    if (selectedUnitId && selectedUnit) {
      return {
        ...subtitle,
        units: (subtitle.units || []).map(unit => unit.id === selectedUnitId ? { ...unit, overrides: {} } : unit),
      };
    }
    return { ...subtitle, overrides: {} };
  }));

  const paste = () => {
    if (!copied) return;
    setSubtitles(previous => previous.map(subtitle => {
      if (!selectedIds.includes(subtitle.id)) return subtitle;
      if (selectedUnitId && selectedUnit) {
        return {
          ...subtitle,
          units: (subtitle.units || []).map(unit => unit.id === selectedUnitId
            ? { ...unit, overrides: { ...copied } }
            : unit),
        };
      }
      return { ...subtitle, overrides: { ...copied } };
    }));
  };

  const renderField = (field: Field) => {
    const value = mixedValue(field.key);
    const inherited = value === undefined;
    return <label className="caption-property-row" key={field.key}>
      <span>{field.label}</span>
      <div className="caption-property-control">
        {field.type === "color" ? <>
          <input
            type="color"
            value={typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : "#ffffff"}
            onChange={event => update(field.key, event.target.value)}
            aria-label={field.label}
          />
          <code>{typeof value === "string" ? value : "--"}</code>
        </> : <input
          type={field.type}
          value={value ?? ""}
          placeholder={inherited ? "\u7ee7\u627f" : undefined}
          step={field.step}
          min={field.min}
          max={field.max}
          onChange={event => update(field.key, event.target.value)}
        />}
      </div>
    </label>;
  };

  if (!selected.length) {
    return <div className="caption-properties-empty">{"\u9009\u62e9\u4e00\u6761\u5b57\u5e55\u4ee5\u7f16\u8f91\u5c40\u90e8\u5c5e\u6027\u3002"}</div>;
  }

  const heading = selectedUnit
    ? `\u5355\u5143: ${selectedUnit.text}`
    : selected.length > 1
      ? `\u6279\u91cf\u7f16\u8f91 ${selected.length} \u6761\u5b57\u5e55`
      : "\u5b57\u5e55\u5c40\u90e8\u5c5e\u6027";
  const previewText = selected.length === 1 ? selected[0].text : selected.map(item => item.text).join(" / ");
  const baseStyle = selected.length === 1 ? selected[0].style : null;

  return <div className="caption-properties-panel">
    <div className="caption-properties-heading">
      <strong>{heading}</strong>
      <span className="caption-properties-preview" title={previewText}>{previewText}</span>
      {baseStyle && <span className="caption-properties-base">{"\u57fa\u7840\u6837\u5f0f"}: {baseStyle}</span>}
    </div>
    <div className="caption-properties-actions">
      <button type="button" onClick={() => values[0] && setCopied({ ...values[0] })}>{"\u590d\u5236\u5c5e\u6027"}</button>
      <button type="button" onClick={paste} disabled={!copied}>{"\u7c98\u8d34"}</button>
      <button type="button" className="secondary" onClick={reset}>{"\u91cd\u7f6e"}</button>
    </div>
    <details className="caption-property-section" open>
      <summary>{"\u6587\u5b57"}</summary>
      <div className="caption-property-grid">{typographyFields.map(renderField)}</div>
    </details>
    <details className="caption-property-section" open>
      <summary>{"\u63cf\u8fb9\u4e0e\u9634\u5f71"}</summary>
      <div className="caption-property-grid">{appearanceFields.map(renderField)}</div>
    </details>
    <details className="caption-property-section">
      <summary>{"\u4f4d\u7f6e\u4e0e\u53d8\u6362"}</summary>
      <div className="caption-property-grid">{transformFields.map(renderField)}</div>
    </details>
  </div>;
};

export default CaptionPropertiesPanel;
