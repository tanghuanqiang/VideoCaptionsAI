import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";
import type { AssStyle } from "@/types/subtitleTypes";
import type {
  CaptionEffect,
  CaptionGroup,
  CaptionOverrides,
  CaptionSelection,
} from "@/types/captionModel";
import {
  mergeCaptionGroups,
  splitCaptionGroupAtGrapheme,
} from "@/types/captionModel";
import { defaultStyle, stylePresets } from "@/constants";
import { normalizeCaptionGroups, normalizeStyles } from "@/lib/projectNormalization";
import {
  DEFAULT_CAPTION_QUALITY_PROFILE,
  type CaptionQualityProfile,
} from "@/lib/captionQuality";

export type VideoStatus = "empty" | "loaded";
export type AsrStatus = "idle" | "running" | "success" | "error";
export type ExportStatus = "idle" | "running" | "success" | "error";
export type EditorMode = "edit" | "cut";
export type ExportKind = "subtitle" | "video" | null;

export interface EditorDoc {
  projectName: string;
  videoUrl: string | null;
  videoName: string | null;
  videoFileId: string | null;
  videoPath: string | null;
  durationMs: number;
  qualityProfile: CaptionQualityProfile;
  /** Real intrinsic video resolution; ASS PlayRes is aligned to this. */
  resolution: { width: number; height: number };
  groups: CaptionGroup[];
  styles: AssStyle[];
  selection: CaptionSelection;
}

export interface EditorState {
  doc: EditorDoc;
  past: EditorDoc[];
  future: EditorDoc[];
  currentMs: number;
  isPlaying: boolean;
  mode: EditorMode;
  video: VideoStatus;
  asr: { status: AsrStatus; progress: number; label: string; error: string | null };
  exportState: {
    status: ExportStatus;
    kind: ExportKind;
    progress: number;
    label: string;
    error: string | null;
    resultName: string | null;
  };
}

const initialDoc: EditorDoc = {
  projectName: "未命名项目",
  videoUrl: null,
  videoName: null,
  videoFileId: null,
  videoPath: null,
  durationMs: 0,
  qualityProfile: DEFAULT_CAPTION_QUALITY_PROFILE,
  resolution: { width: 1280, height: 720 },
  groups: [],
  styles: [defaultStyle, ...stylePresets.map((p) => p.style)],
  selection: { groupIds: [], unitIds: [] },
};

const initialState: EditorState = {
  doc: initialDoc,
  past: [],
  future: [],
  currentMs: 0,
  isPlaying: false,
  mode: "edit",
  video: "empty",
  asr: { status: "idle", progress: 0, label: "", error: null },
  exportState: {
    status: "idle",
    kind: null,
    progress: 0,
    label: "",
    error: null,
    resultName: null,
  },
};

type Action =
  | { type: "SET_PROJECT_NAME"; name: string }
  | { type: "LOAD_VIDEO"; url: string; name: string; durationMs?: number; fileId?: string | null; filePath?: string | null }
  | { type: "SET_VIDEO_SOURCE"; videoUrl?: string | null; videoFileId?: string | null; videoPath?: string | null }
  | { type: "LOAD_PROJECT"; doc: EditorDoc }
  | { type: "SET_DURATION"; durationMs: number }
  | { type: "SET_QUALITY_PROFILE"; profile: CaptionQualityProfile }
  | { type: "SET_RESOLUTION"; width: number; height: number }
  | { type: "SET_CURRENT_MS"; ms: number }
  | { type: "SET_PLAYING"; playing: boolean }
  | { type: "SET_MODE"; mode: EditorMode }
  | { type: "SET_GROUPS"; groups: CaptionGroup[]; commit?: boolean }
  | { type: "SET_STYLES"; styles: AssStyle[]; commit?: boolean }
  | { type: "ADD_STYLE"; style: AssStyle }
  | { type: "SELECT"; selection: CaptionSelection }
  | { type: "UPDATE_GROUP"; id: string; patch: Partial<CaptionGroup>; commit?: boolean }
  | { type: "UPDATE_GROUP_METADATA"; ids: string[]; patch: Partial<Pick<CaptionGroup, "speaker" | "secondaryText" | "reviewStatus">> }
  | { type: "UPDATE_GROUP_OVERRIDES"; ids: string[]; patch: CaptionOverrides }
  | { type: "SHIFT_SELECTED_TIME"; deltaMs: number }
  | { type: "NORMALIZE_SELECTED_TIMING"; gapMs: number }
  | { type: "RESET_GROUP_OVERRIDES"; ids: string[] }
  | { type: "APPLY_STYLE"; ids: string[]; styleId: string }
  | { type: "UPDATE_UNIT"; groupId: string; unitId: string; patch: Partial<CaptionOverrides> }
  | { type: "SET_UNIT_EFFECT"; groupId: string; unitId: string; effect?: CaptionEffect }
  | { type: "SPLIT_GROUP"; groupId: string; graphemeIndex: number }
  | { type: "MERGE_SELECTED" }
  | { type: "DELETE_SELECTED" }
  | { type: "DUPLICATE_SELECTED"; offsetMs?: number }
  | { type: "ASR_START" }
  | { type: "ASR_PROGRESS"; progress: number; label: string }
  | { type: "ASR_SUCCESS"; groups: CaptionGroup[]; styles?: AssStyle[] }
  | { type: "ASR_ERROR"; error: string }
  | { type: "ASR_RESET" }
  | { type: "EXPORT_START"; kind: Exclude<ExportKind, null> }
  | { type: "EXPORT_PROGRESS"; progress: number; label: string }
  | { type: "EXPORT_SUCCESS"; resultName: string }
  | { type: "EXPORT_ERROR"; error: string }
  | { type: "EXPORT_RESET" }
  | { type: "UNDO" }
  | { type: "REDO" };

const HISTORY_LIMIT = 50;

function normalizeSelection(doc: EditorDoc, selection: CaptionSelection): CaptionSelection {
  const groupIds = [...new Set(selection.groupIds)].filter((id) => doc.groups.some((group) => group.id === id));
  if (groupIds.length !== 1) return { groupIds, unitIds: [] };
  const group = doc.groups.find((item) => item.id === groupIds[0]);
  const unitIds = (selection.unitIds ?? []).filter((unitId) => group?.units.some((unit) => unit.id === unitId));
  return { groupIds, unitIds };
}

function normalizeDocSelection(doc: EditorDoc): EditorDoc {
  return { ...doc, selection: normalizeSelection(doc, doc.selection) };
}

/** Wrap a doc mutation with history push. */
function commitDoc(state: EditorState, next: EditorDoc): EditorState {
  const normalized = normalizeDocSelection(next);
  return {
    ...state,
    doc: normalized,
    past: [...state.past, state.doc].slice(-HISTORY_LIMIT),
    future: [],
  };
}

function sortGroups(groups: CaptionGroup[]): CaptionGroup[] {
  return [...groups].sort((a, b) => a.startMs - b.startMs);
}

function uniqueId(base: string, used: Set<string>): string {
  let candidate = `${base}-copy`;
  let suffix = 2;
  while (used.has(candidate)) candidate = `${base}-copy-${suffix++}`;
  used.add(candidate);
  return candidate;
}

function shiftedRange(startMs: number, endMs: number, offsetMs: number, durationMs: number) {
  const duration = Math.max(1, endMs - startMs);
  const maxStart = durationMs > 0 ? Math.max(0, durationMs - duration) : Number.POSITIVE_INFINITY;
  const nextStart = Math.min(Math.max(0, startMs + offsetMs), maxStart);
  return { startMs: nextStart, endMs: nextStart + duration };
}

function reducer(state: EditorState, action: Action): EditorState {
  const { doc } = state;
  switch (action.type) {
    case "SET_PROJECT_NAME":
      return { ...state, doc: { ...doc, projectName: action.name } };

    case "LOAD_VIDEO":
      return {
        ...state,
        video: "loaded",
        doc: {
          ...doc,
          videoUrl: action.url,
          videoName: action.name,
          videoFileId: action.fileId ?? doc.videoFileId,
          videoPath: action.filePath ?? doc.videoPath,
          durationMs: action.durationMs ?? doc.durationMs,
        },
      };

    case "SET_VIDEO_SOURCE":
      return {
        ...state,
        doc: {
          ...doc,
          videoUrl: action.videoUrl ?? doc.videoUrl,
          videoFileId: action.videoFileId ?? doc.videoFileId,
          videoPath: action.videoPath ?? doc.videoPath,
        },
      };

    case "LOAD_PROJECT":
      {
      const loadedDoc = normalizeDocSelection({
        ...action.doc,
        projectName: action.doc.projectName?.trim() || "未命名项目",
        durationMs: Number.isFinite(action.doc.durationMs) ? Math.max(0, action.doc.durationMs) : 0,
        selection: action.doc.selection ?? { groupIds: [], unitIds: [] },
        styles: normalizeStyles(action.doc.styles, doc.styles),
        videoFileId: action.doc.videoFileId ?? null,
        videoPath: action.doc.videoPath ?? null,
        videoUrl: action.doc.videoUrl ?? null,
        groups: normalizeCaptionGroups(action.doc.groups, Number.isFinite(action.doc.durationMs) ? Math.max(0, action.doc.durationMs) : 0, doc.styles[0]?.id ?? "Default"),
      });
      return {
        ...state,
        video: loadedDoc.videoUrl || loadedDoc.videoFileId || loadedDoc.videoPath ? "loaded" : "empty",
        doc: loadedDoc,
        past: [],
        future: [],
        currentMs: 0,
        isPlaying: false,
        mode: "edit",
        asr: { status: "idle", progress: 0, label: "", error: null },
        exportState: {
          status: "idle",
          kind: null,
          progress: 0,
          label: "",
          error: null,
          resultName: null,
        },
      };
      }

    case "SET_DURATION":
      return { ...state, doc: { ...doc, durationMs: action.durationMs } };

    case "SET_QUALITY_PROFILE":
      return commitDoc(state, { ...doc, qualityProfile: action.profile });

    case "SET_RESOLUTION":
      return {
        ...state,
        doc: {
          ...doc,
          resolution: { width: action.width, height: action.height },
        },
      };

    case "SET_CURRENT_MS":
      return { ...state, currentMs: action.ms };

    case "SET_PLAYING":
      return { ...state, isPlaying: action.playing };

    case "SET_MODE":
      return { ...state, mode: action.mode };

    case "SET_GROUPS": {
      const next = normalizeDocSelection({ ...doc, groups: sortGroups(action.groups) });
      return action.commit ? commitDoc(state, next) : { ...state, doc: next };
    }

    case "SET_STYLES": {
      const next = { ...doc, styles: action.styles };
      return action.commit ? commitDoc(state, next) : { ...state, doc: next };
    }

    case "ADD_STYLE":
      return commitDoc(state, { ...doc, styles: [...doc.styles, action.style] });

    case "SELECT":
      return { ...state, doc: { ...doc, selection: normalizeSelection(doc, action.selection) } };

    case "UPDATE_GROUP": {
      const groups = doc.groups.map((g) =>
        g.id === action.id ? { ...g, ...action.patch } : g,
      );
      const next = normalizeDocSelection({ ...doc, groups: sortGroups(groups) });
      return action.commit ? commitDoc(state, next) : { ...state, doc: next };
    }

    case "UPDATE_GROUP_METADATA": {
      const groups = doc.groups.map((g) =>
        action.ids.includes(g.id) ? { ...g, ...action.patch } : g,
      );
      return commitDoc(state, { ...doc, groups: sortGroups(groups) });
    }

    case "UPDATE_GROUP_OVERRIDES": {
      const groups = doc.groups.map((g) =>
        action.ids.includes(g.id)
          ? { ...g, overrides: { ...g.overrides, ...action.patch } }
          : g,
      );
      return commitDoc(state, { ...doc, groups });
    }

    case "SHIFT_SELECTED_TIME": {
      const ids = new Set(doc.selection.groupIds);
      if (ids.size === 0 || !Number.isFinite(action.deltaMs)) return state;
      const delta = Math.round(action.deltaMs);
      const groups = doc.groups.map((g) => {
        if (!ids.has(g.id)) return g;
        const duration = Math.max(1, g.endMs - g.startMs);
        const startMs = Math.min(Math.max(0, g.startMs + delta), Math.max(0, doc.durationMs - duration));
        return { ...g, startMs, endMs: startMs + duration };
      });
      return commitDoc(state, { ...doc, groups: sortGroups(groups) });
    }

    case "NORMALIZE_SELECTED_TIMING": {
      const selected = doc.groups.filter((g) => doc.selection.groupIds.includes(g.id)).sort((a, b) => a.startMs - b.startMs);
      if (selected.length < 2) return state;
      const gap = Math.max(0, Math.round(action.gapMs));
      let cursor = selected[0].startMs;
      const updates = new Map<string, CaptionGroup>();
      for (const group of selected) {
        const duration = Math.max(1, group.endMs - group.startMs);
        const startMs = Math.min(cursor, Math.max(0, doc.durationMs - duration));
        const next = { ...group, startMs, endMs: startMs + duration };
        updates.set(group.id, next);
        cursor = next.endMs + gap;
      }
      const groups = doc.groups.map((g) => updates.get(g.id) ?? g);
      return commitDoc(state, { ...doc, groups: sortGroups(groups) });
    }

    case "RESET_GROUP_OVERRIDES": {
      const groups = doc.groups.map((g) =>
        action.ids.includes(g.id) ? { ...g, overrides: {} } : g,
      );
      return commitDoc(state, { ...doc, groups });
    }

    case "APPLY_STYLE": {
      const groups = doc.groups.map((g) =>
        action.ids.includes(g.id) ? { ...g, baseStyleId: action.styleId } : g,
      );
      return commitDoc(state, { ...doc, groups });
    }

    case "UPDATE_UNIT": {
      const groups = doc.groups.map((g) => {
        if (g.id !== action.groupId) return g;
        return {
          ...g,
          units: g.units.map((u) =>
            u.id === action.unitId
              ? { ...u, overrides: { ...u.overrides, ...action.patch } }
              : u,
          ),
        };
      });
      return commitDoc(state, { ...doc, groups });
    }

    case "SET_UNIT_EFFECT": {
      const groups = doc.groups.map((g) => {
        if (g.id !== action.groupId) return g;
        return {
          ...g,
          units: g.units.map((u) =>
            u.id === action.unitId ? { ...u, effect: action.effect } : u,
          ),
        } as CaptionGroup;
      });
      return commitDoc(state, { ...doc, groups });
    }

    case "SPLIT_GROUP": {
      const target = doc.groups.find((g) => g.id === action.groupId);
      if (!target) return state;
      const result = splitCaptionGroupAtGrapheme(target, action.graphemeIndex);
      if (!result) return state;
      const groups = sortGroups([
        ...doc.groups.filter((g) => g.id !== action.groupId),
        ...result,
      ]);
      return commitDoc(state, {
        ...doc,
        groups,
        selection: { groupIds: [result[0].id], unitIds: [] },
      });
    }

    case "MERGE_SELECTED": {
      const ids = doc.selection.groupIds;
      if (ids.length < 2) return state;
      const selected = doc.groups.filter((g) => ids.includes(g.id));
      const merged = mergeCaptionGroups(selected);
      if (!merged) return state;
      const groups = sortGroups([
        ...doc.groups.filter((g) => !ids.includes(g.id)),
        merged,
      ]);
      return commitDoc(state, {
        ...doc,
        groups,
        selection: { groupIds: [merged.id], unitIds: [] },
      });
    }

    case "DELETE_SELECTED": {
      const ids = doc.selection.groupIds;
      if (ids.length === 0) return state;
      const groups = doc.groups.filter((g) => !ids.includes(g.id));
      return commitDoc(state, {
        ...doc,
        groups,
        selection: { groupIds: [], unitIds: [] },
      });
    }

    case "DUPLICATE_SELECTED": {
      const selected = doc.groups.filter((g) => doc.selection.groupIds.includes(g.id));
      if (selected.length === 0) return state;
      const offset = Math.max(1, Math.round(action.offsetMs ?? 250));
      const usedIds = new Set(doc.groups.map((group) => group.id));
      const copies = selected.map((group) => {
        const id = uniqueId(group.id, usedIds);
        const range = shiftedRange(group.startMs, group.endMs, offset, doc.durationMs);
        const actualOffset = range.startMs - group.startMs;
        const units = group.units.map((unit, unitIndex) => ({
          ...unit,
          id: `${id}-unit-${unitIndex + 1}`,
          startMs: Math.max(range.startMs, Math.min(range.endMs - 1, unit.startMs + actualOffset)),
          endMs: Math.min(range.endMs, Math.max(range.startMs + 1, unit.endMs + actualOffset)),
        }));
        const words = group.words?.flatMap((word) => {
          const start = Math.max(range.startMs, word.start * 1000 + actualOffset);
          const end = Math.min(range.endMs, word.end * 1000 + actualOffset);
          return end > start ? [{ ...word, start: start / 1000, end: end / 1000 }] : [];
        });
        return { ...group, id, ...range, units, words };
      });
      return commitDoc(state, {
        ...doc,
        groups: sortGroups([...doc.groups, ...copies]),
        selection: { groupIds: copies.map((group) => group.id), unitIds: [] },
      });
    }

    case "ASR_START":
      return {
        ...state,
        asr: { status: "running", progress: 0, label: "准备中", error: null },
      };
    case "ASR_PROGRESS":
      return {
        ...state,
        asr: { ...state.asr, progress: action.progress, label: action.label },
      };
    case "ASR_SUCCESS": {
      const next: EditorDoc = {
        ...doc,
        groups: sortGroups(action.groups),
        styles: action.styles ?? doc.styles,
        selection: { groupIds: [], unitIds: [] },
      };
      return {
        ...commitDoc(state, next),
        asr: { status: "success", progress: 100, label: "识别完成", error: null },
      };
    }
    case "ASR_ERROR":
      return {
        ...state,
        asr: { status: "error", progress: 0, label: "", error: action.error },
      };
    case "ASR_RESET":
      return {
        ...state,
        asr: { status: "idle", progress: 0, label: "", error: null },
      };

    case "EXPORT_START":
      return {
        ...state,
        exportState: {
          status: "running",
          kind: action.kind,
          progress: 0,
          label: "开始",
          error: null,
          resultName: null,
        },
      };
    case "EXPORT_PROGRESS":
      return {
        ...state,
        exportState: {
          ...state.exportState,
          progress: action.progress,
          label: action.label,
        },
      };
    case "EXPORT_SUCCESS":
      return {
        ...state,
        exportState: {
          ...state.exportState,
          status: "success",
          progress: 100,
          resultName: action.resultName,
        },
      };
    case "EXPORT_ERROR":
      return {
        ...state,
        exportState: { ...state.exportState, status: "error", error: action.error },
      };
    case "EXPORT_RESET":
      return {
        ...state,
        exportState: {
          status: "idle",
          kind: null,
          progress: 0,
          label: "",
          error: null,
          resultName: null,
        },
      };

    case "UNDO": {
      if (state.past.length === 0) return state;
      const previous = state.past[state.past.length - 1];
      return {
        ...state,
        doc: previous,
        past: state.past.slice(0, -1),
        future: [state.doc, ...state.future].slice(0, HISTORY_LIMIT),
      };
    }
    case "REDO": {
      if (state.future.length === 0) return state;
      const nextDoc = state.future[0];
      return {
        ...state,
        doc: nextDoc,
        past: [...state.past, state.doc].slice(-HISTORY_LIMIT),
        future: state.future.slice(1),
      };
    }

    default:
      return state;
  }
}

interface EditorContextValue {
  state: EditorState;
  dispatch: React.Dispatch<Action>;
  canUndo: boolean;
  canRedo: boolean;
  selectedGroups: CaptionGroup[];
  selectedUnit: { group: CaptionGroup; unitId: string } | null;
  styleById: (id: string) => AssStyle;
  currentGroup: CaptionGroup | null;
}

const EditorContext = createContext<EditorContextValue | null>(null);

export function EditorProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const styleById = useCallback(
    (id: string) =>
      state.doc.styles.find((s) => s.id === id) ?? defaultStyle,
    [state.doc.styles],
  );

  const selectedGroups = useMemo(
    () =>
      state.doc.groups.filter((g) =>
        state.doc.selection.groupIds.includes(g.id),
      ),
    [state.doc.groups, state.doc.selection.groupIds],
  );

  const selectedUnit = useMemo(() => {
    const unitId = state.doc.selection.unitIds?.[0];
    if (!unitId || selectedGroups.length !== 1) return null;
    const group = selectedGroups[0];
    if (!group.units.some((u) => u.id === unitId)) return null;
    return { group, unitId };
  }, [selectedGroups, state.doc.selection.unitIds]);

  const currentGroup = useMemo(() => {
    const currentMs = state.currentMs;
    return (
      state.doc.groups.find(
        (g) => currentMs >= g.startMs && currentMs < g.endMs,
      ) ?? null
    );
  }, [state.doc.groups, state.currentMs]);

  const value: EditorContextValue = {
    state,
    dispatch,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    selectedGroups,
    selectedUnit,
    styleById,
    currentGroup,
  };

  return (
    <EditorContext.Provider value={value}>{children}</EditorContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useEditor() {
  const ctx = useContext(EditorContext);
  if (!ctx) throw new Error("useEditor must be used within EditorProvider");
  return ctx;
}
