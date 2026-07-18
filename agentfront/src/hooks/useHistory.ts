import { useState, useCallback } from "react";

const MAX_HISTORY = 50;

interface HistoryState<T> {
  past: T[];
  present: T;
  future: T[];
}

export function useHistory<T>(initialPresent: T) {
  const [state, setState] = useState<HistoryState<T>>({
    past: [],
    present: initialPresent,
    future: [],
  });

  const canUndo = state.past.length > 0;
  const canRedo = state.future.length > 0;

  const undo = useCallback(() => {
    setState((cur) => {
      const { past, present, future } = cur;
      if (past.length === 0) return cur;
      const previous = past[past.length - 1];
      const newPast = past.slice(0, past.length - 1);
      return { past: newPast, present: previous, future: [present, ...future] };
    });
  }, []);

  const redo = useCallback(() => {
    setState((cur) => {
      const { past, present, future } = cur;
      if (future.length === 0) return cur;
      const next = future[0];
      const newFuture = future.slice(1);
      return { past: [...past, present], present: next, future: newFuture };
    });
  }, []);

  const set = useCallback(
    (newPresent: T | ((curr: T) => T), options?: { transient?: boolean }) => {
      setState((cur) => {
        const { past, present } = cur;
        const resolved = newPresent instanceof Function ? newPresent(present) : newPresent;
        if (resolved === present) return cur;
        if (options?.transient) return { ...cur, present: resolved };
        // Limit stack depth
        const newPast = past.length >= MAX_HISTORY ? past.slice(past.length - MAX_HISTORY + 1) : past;
        return { past: [...newPast, present], present: resolved, future: [] };
      });
    },
    []
  );

  const reset = useCallback((newPresent: T) => {
    setState({ past: [], present: newPresent, future: [] });
  }, []);

  return { state: state.present, set, undo, redo, canUndo, canRedo, reset };
}
