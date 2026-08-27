import type { EditorDoc } from "@/state/EditorContext";

const RECOVERY_KEY = "captionflo:recovery:v1";
const RECOVERY_VERSION = 1;

interface RecoverySnapshot {
  version: number;
  savedAt: number;
  doc: EditorDoc;
}

function canUseStorage(): boolean {
  return typeof window !== "undefined" && !!window.localStorage;
}

export function saveRecoverySnapshot(doc: EditorDoc): void {
  if (!canUseStorage() || doc.groups.length === 0) return;
  const snapshot: RecoverySnapshot = {
    version: RECOVERY_VERSION,
    savedAt: Date.now(),
    doc: {
      ...doc,
      videoUrl: null,
      videoFileId: null,
      videoPath: null,
      selection: { groupIds: [], unitIds: [] },
    },
  };
  try {
    window.localStorage.setItem(RECOVERY_KEY, JSON.stringify(snapshot));
  } catch {
    // Storage can be disabled or full; recovery is best-effort.
  }
}

export function readRecoverySnapshot(): RecoverySnapshot | null {
  if (!canUseStorage()) return null;
  try {
    const raw = window.localStorage.getItem(RECOVERY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RecoverySnapshot>;
    if (!parsed || parsed.version !== RECOVERY_VERSION || typeof parsed.savedAt !== "number" || !parsed.doc || !Array.isArray(parsed.doc.groups)) return null;
    return parsed as RecoverySnapshot;
  } catch {
    return null;
  }
}

export function clearRecoverySnapshot(): void {
  if (!canUseStorage()) return;
  try {
    window.localStorage.removeItem(RECOVERY_KEY);
  } catch {
    // Best-effort cleanup.
  }
}
