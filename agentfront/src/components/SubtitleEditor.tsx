import React, { useCallback, useRef } from "react";
import type { AssStyle, Subtitle } from "../types/subtitleTypes";
import { findAvailableLayer, formatTime, parseTime } from "../utils/subtitleUtils";
import { captionGroupToSubtitle, mergeCaptionGroups, splitSubtitleAtGraphemeIndex, subtitleToCaptionGroup } from "../types/captionModel";
import "./SubtitleEditor.css";

interface Props {
  subtitles: Subtitle[];
  setSubtitles: React.Dispatch<React.SetStateAction<Subtitle[]>> | ((value: (current: Subtitle[]) => Subtitle[]) => void);
  styles: AssStyle[];
  selectedStyle: string;
  selectedIds: string[];
  setSelectedIds: React.Dispatch<React.SetStateAction<string[]>>;
  selectedUnitId?: string | null;
  setSelectedUnitId?: React.Dispatch<React.SetStateAction<string | null>>;
  videoRef?: React.RefObject<HTMLVideoElement | null>;
  onSeekToTime?: (time: number) => void;
}

type GraphemeSegment = { segment: string; index?: number };

const getGraphemes = (text: string): string[] => {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const Segmenter = (Intl as typeof Intl & {
      Segmenter: new (locales?: string | string[], options?: { granularity?: string }) => { segment(value: string): Iterable<GraphemeSegment> };
    }).Segmenter;
    return Array.from(new Segmenter("zh", { granularity: "grapheme" }).segment(text), item => item.segment);
  }
  return Array.from(text);
};

const graphemeIndexAtCursor = (text: string, cursor: number): number => {
  const safeCursor = Math.max(0, Math.min(cursor, text.length));
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const Segmenter = (Intl as typeof Intl & {
      Segmenter: new (locales?: string | string[], options?: { granularity?: string }) => { segment(value: string): Iterable<GraphemeSegment> };
    }).Segmenter;
    let graphemeIndex = 0;
    for (const item of new Segmenter("zh", { granularity: "grapheme" }).segment(text)) {
      const start = item.index ?? 0;
      if (safeCursor <= start) return graphemeIndex;
      if (safeCursor < start + item.segment.length) return graphemeIndex;
      graphemeIndex += 1;
    }
    return graphemeIndex;
  }
  return getGraphemes(text.slice(0, safeCursor)).length;
};

const SubtitleEditor: React.FC<Props> = ({
  subtitles, setSubtitles, styles, selectedStyle, selectedIds, setSelectedIds,
  setSelectedUnitId, videoRef, onSeekToTime,
}) => {
  const inputRefs = useRef(new Map<string, HTMLInputElement>());
  const cursorPositions = useRef(new Map<string, number>());

  const registerInput = useCallback((id: string, input: HTMLInputElement | null) => {
    if (input) inputRefs.current.set(id, input);
    else inputRefs.current.delete(id);
  }, []);

  const rememberCursor = useCallback((id: string, input: HTMLInputElement) => {
    cursorPositions.current.set(id, input.selectionStart ?? 0);
  }, []);

  const handleSplit = useCallback((id: string) => {
    const subtitle = subtitles.find(item => item.id === id);
    const input = inputRefs.current.get(id);
    if (!subtitle || !input) return;

    const cursor = cursorPositions.current.get(id) ?? input.selectionStart ?? 0;
    const splitIndex = graphemeIndexAtCursor(subtitle.text, cursor);
    const result = splitSubtitleAtGraphemeIndex(subtitle, splitIndex, subtitle.style || selectedStyle);
    if (!result) return;

    setSubtitles(previous => {
      const index = previous.findIndex(item => item.id === id);
      if (index < 0) return previous;
      const next = [...previous];
      next.splice(index, 1, result[0], result[1]);
      return next;
    });
    cursorPositions.current.delete(id);
    setSelectedIds([result[0].id, result[1].id]);
    setSelectedUnitId?.(null);
  }, [selectedStyle, setSelectedIds, setSelectedUnitId, setSubtitles, subtitles]);

  const setEffect = (type: "whole" | "reveal" | "highlight" | "emphasis") => {
    if (!selectedIds.length) return;
    setSubtitles(previous => previous.map(subtitle => selectedIds.includes(subtitle.id) ? { ...subtitle, effect: { type } } : subtitle));
  };

  const mergeSelected = () => {
    if (selectedIds.length < 2) return;
    setSubtitles(previous => {
      const selected = previous.filter(item => selectedIds.includes(item.id)).map(item => subtitleToCaptionGroup(item));
      const merged = mergeCaptionGroups(selected);
      if (!merged) return previous;
      const firstIndex = previous.findIndex(item => selectedIds.includes(item.id));
      const rest = previous.filter(item => !selectedIds.includes(item.id));
      rest.splice(Math.max(0, firstIndex), 0, captionGroupToSubtitle(merged));
      return rest;
    });
    setSelectedIds([]);
    setSelectedUnitId?.(null);
  };

  const handleEdit = (id: string, field: keyof Subtitle, value: string) => {
    setSubtitles(previous => previous.map(item => item.id === id ? { ...item, [field]: value } : item));
  };

  const handleAddSubtitle = () => {
    const start = videoRef?.current?.currentTime || 0;
    const end = start + 5;
    setSubtitles(previous => [...previous, {
      id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
      start: formatTime(start), end: formatTime(end), text: "\u65b0\u5b57\u5e55",
      style: selectedStyle || "Default", group: "", layer: findAvailableLayer(previous, start, end),
    }]);
  };

  const deleteSelected = () => {
    setSubtitles(previous => previous.filter(item => !selectedIds.includes(item.id)));
    setSelectedIds([]);
    setSelectedUnitId?.(null);
  };

  return <div className="subtitle-editor-container">
    <div className="subtitle-actions">
      <h3>{"\u5b57\u5e55\u7f16\u8f91\u5668"}</h3>
      <div className="subtitle-editor-buttons">
        <button type="button" onClick={() => setSelectedIds(selectedIds.length === subtitles.length ? [] : subtitles.map(item => item.id))}>{"\u5168\u9009"}</button>
        <button type="button" onClick={mergeSelected} disabled={selectedIds.length < 2}>{"\u5408\u5e76"}</button>
        <button type="button" onClick={deleteSelected} disabled={!selectedIds.length}>{"\u5220\u9664"}</button>
      </div>
    </div>
    <div className="subtitle-actions subtitle-effects-row">
      <span className="subtitle-toolbar-label">{"\u6548\u679c"}</span>
      {(["whole", "reveal", "highlight", "emphasis"] as const).map(effect => <button type="button" key={effect} onClick={() => setEffect(effect)} disabled={!selectedIds.length}>{effect}</button>)}
    </div>
    <div className="subtitle-list">
      {subtitles.length ? subtitles.map(subtitle => <div key={subtitle.id} className={`subtitle-item${selectedIds.includes(subtitle.id) ? " selected" : ""}`} onClick={() => onSeekToTime?.(parseTime(subtitle.start))}>
        <input type="checkbox" checked={selectedIds.includes(subtitle.id)} onChange={() => setSelectedIds(current => current.includes(subtitle.id) ? current.filter(id => id !== subtitle.id) : [...current, subtitle.id])} onClick={event => event.stopPropagation()} />
        <input value={subtitle.start} onChange={event => handleEdit(subtitle.id, "start", event.target.value)} className="subtitle-time nodrag" onClick={event => event.stopPropagation()} />
        <span>-</span>
        <input value={subtitle.end} onChange={event => handleEdit(subtitle.id, "end", event.target.value)} className="subtitle-time nodrag" onClick={event => event.stopPropagation()} />
        <div className="subtitle-text-editor">
          <input
            ref={input => registerInput(subtitle.id, input)}
            value={subtitle.text}
            onChange={event => { handleEdit(subtitle.id, "text", event.target.value); rememberCursor(subtitle.id, event.currentTarget); }}
            onSelect={event => rememberCursor(subtitle.id, event.currentTarget)}
            onKeyUp={event => rememberCursor(subtitle.id, event.currentTarget)}
            className="subtitle-text nodrag"
            onClick={event => { event.stopPropagation(); rememberCursor(subtitle.id, event.currentTarget); }}
          />
          <button type="button" className="subtitle-split-button" aria-label={"\u5728\u5149\u6807\u5904\u62c6\u5206\u5b57\u5e55"} title={"\u5728\u5149\u6807\u5904\u62c6\u5206\u5b57\u5e55"} onMouseDown={event => event.preventDefault()} onClick={event => { event.stopPropagation(); handleSplit(subtitle.id); }}>{"\u2702"}</button>
        </div>
        <select value={subtitle.style} onChange={event => handleEdit(subtitle.id, "style", event.target.value)} className="subtitle-style nodrag" onClick={event => event.stopPropagation()}>
          {styles.map(style => <option key={style.Name} value={style.Name}>{style.Name}</option>)}
        </select>
      </div>) : <div className="subtitle-empty">{"\u6682\u65e0\u5b57\u5e55"}</div>}
    </div>
    <div className="subtitle-actions-bottom"><button type="button" onClick={handleAddSubtitle}>{"\u6dfb\u52a0\u5b57\u5e55"}</button></div>
  </div>;
};

export default SubtitleEditor;
