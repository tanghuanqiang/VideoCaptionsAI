import { useEffect, useState } from "react";

const SHORTCUTS = [
  { keys: "Ctrl+Z", desc: "Undo" },
  { keys: "Ctrl+Y", desc: "Redo" },
  { keys: "Space", desc: "Play / Pause" },
  { keys: "\u2190 \u2192", desc: "Seek backward / forward 5s" },
  { keys: "Delete", desc: "Delete selected subtitles" },
  { keys: "Ctrl+A", desc: "Select all subtitles" },
  { keys: "?", desc: "Show / hide shortcuts" },
];

export default function KeyboardHints() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "?" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setVisible((v) => !v);
      }
      if (e.key === "Escape") setVisible(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  if (!visible) return null;

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9999, display: "flex",
        alignItems: "center", justifyContent: "center",
        background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)",
      }}
      onClick={() => setVisible(false)}
    >
      <div
        style={{
          background: "var(--ant-color-bg-container, #1a1a2e)", borderRadius: 16,
          padding: "24px 32px", minWidth: 320, maxWidth: 420,
          boxShadow: "0 8px 40px rgba(0,0,0,0.4)", border: "1px solid rgba(58,123,213,0.3)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ margin: "0 0 16px", color: "#3a7bd5", fontSize: 16 }}>
          Keyboard Shortcuts
        </h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {SHORTCUTS.map((s) => (
            <div
              key={s.keys}
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13 }}
            >
              <span style={{ color: "var(--ant-color-text, #ccc)" }}>{s.desc}</span>
              <kbd
                style={{
                  background: "rgba(58,123,213,0.15)", color: "#3a7bd5",
                  padding: "2px 8px", borderRadius: 4, border: "1px solid rgba(58,123,213,0.3)",
                  fontFamily: "monospace", fontSize: 12,
                }}
              >
                {s.keys}
              </kbd>
            </div>
          ))}
        </div>
        <p style={{ margin: "16px 0 0", fontSize: 11, color: "#666" }}>
          Press <kbd style={{ background: "rgba(255,255,255,0.1)", padding: "0 4px", borderRadius: 2 }}>?</kbd> to toggle
        </p>
      </div>
    </div>
  );
}
