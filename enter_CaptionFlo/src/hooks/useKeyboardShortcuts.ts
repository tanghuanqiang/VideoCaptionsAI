import { useEffect } from "react";
import { useEditor } from "@/state/EditorContext";

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || el.isContentEditable;
}

/** Global shortcuts. Disabled while a text field is focused (preserves copy/paste/typing). */
export function useKeyboardShortcuts({
  onTogglePlay,
  onSeek,
}: {
  onTogglePlay: () => void;
  onSeek: (deltaMs: number) => void;
}) {
  const { state, dispatch } = useEditor();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;

      const meta = e.metaKey || e.ctrlKey;

      if (meta && e.key.toLowerCase() === "z") {
        e.preventDefault();
        dispatch({ type: e.shiftKey ? "REDO" : "UNDO" });
        return;
      }

      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        const groups = [...state.doc.groups].sort((a, b) => a.startMs - b.startMs);
        const currentId = state.doc.selection.groupIds[0];
        const currentIndex = Math.max(0, groups.findIndex((group) => group.id === currentId));
        const direction = e.key === "ArrowUp" ? -1 : 1;
        const candidates = e.shiftKey
          ? groups.map((group, index) => ({ group, index })).filter(({ group }) => group.reviewStatus !== "reviewed")
          : groups.map((group, index) => ({ group, index }));
        const orderedCandidates = direction > 0 ? candidates : [...candidates].reverse();
        const nextCandidate = orderedCandidates.find(({ index }) => direction > 0 ? index > currentIndex : index < currentIndex);
        const fallback = direction > 0 ? candidates[0] : candidates[candidates.length - 1];
        const nextIndex = nextCandidate?.index ?? fallback?.index ?? currentIndex;
        const next = groups[nextIndex];
        if (next) {
          dispatch({ type: "SELECT", selection: { groupIds: [next.id], unitIds: [] } });
          dispatch({ type: "SET_CURRENT_MS", ms: next.startMs });
        }
        return;
      }

      switch (e.key) {
        case " ":
          e.preventDefault();
          onTogglePlay();
          break;
        case "ArrowLeft":
          e.preventDefault();
          onSeek(-5000);
          break;
        case "ArrowRight":
          e.preventDefault();
          onSeek(5000);
          break;
        case "c":
        case "C":
          dispatch({ type: "SET_MODE", mode: "cut" });
          break;
        case "e":
        case "E":
          dispatch({ type: "SET_MODE", mode: "edit" });
          break;
        case "m":
        case "M":
          if (state.doc.selection.groupIds.length >= 2)
            dispatch({ type: "MERGE_SELECTED" });
          break;
        case "d":
        case "D":
          if (state.doc.selection.groupIds.length > 0)
            dispatch({ type: "DUPLICATE_SELECTED" });
          break;
        case "Backspace":
        case "Delete":
          if (state.doc.selection.groupIds.length > 0)
            dispatch({ type: "DELETE_SELECTED" });
          break;
        case "Escape":
          dispatch({ type: "SET_MODE", mode: "edit" });
          dispatch({ type: "SELECT", selection: { groupIds: [], unitIds: [] } });
          break;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [dispatch, onTogglePlay, onSeek, state.doc.groups, state.doc.selection.groupIds]);
}
