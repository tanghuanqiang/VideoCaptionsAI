import { useEffect, useRef } from "react";
import JASSUB from "jassub";
import { buildAss } from "@/lib/assBuilder";
import { useEditor } from "@/state/EditorContext";

interface AssRendererProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  /** true once video metadata is loaded and element is mounted. */
  ready: boolean;
}

/**
 * libass-powered subtitle preview. Renders the SAME ASS string that is sent to
 * the backend for hard-burn, so preview and export match.
 */
export function AssRenderer({ videoRef, ready }: AssRendererProps) {
  const { state } = useEditor();
  const instanceRef = useRef<JASSUB | null>(null);
  const { groups, styles, resolution } = state.doc;

  // Create / destroy the JASSUB instance with the video element.
  useEffect(() => {
    const video = videoRef.current;
    if (!ready || !video) return;

    let disposed = false;
    const instance = new JASSUB({
      video,
      // Let JASSUB resolve its own worker/wasm via `import.meta.url` so the
      // bundler (Vite) ships the correct abslink RPC worker. Pointing workerUrl
      // at the public emscripten glue file breaks `instance.ready` and the
      // subtitle canvas silently never renders.
      availableFonts: {
        "noto sans sc": "/fonts/NotoSansSC-Regular.woff2",
        "liberation sans": "/jassub/default.woff2",
      },
      defaultFont: "noto sans sc",
      subContent: buildAss(groups, styles, {
        playResX: resolution.width,
        playResY: resolution.height,
      }),
    } as ConstructorParameters<typeof JASSUB>[0]);

    instanceRef.current = instance;
    instance.ready
      .then(() => {
        if (disposed) instance.destroy();
      })
      .catch(() => {});

    return () => {
      disposed = true;
      instanceRef.current = null;
      instance.destroy().catch(() => {});
    };
    // Only re-create when the video element identity or readiness changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, videoRef]);

  // Push updated ASS whenever caption data, styles or resolution change.
  useEffect(() => {
    const instance = instanceRef.current;
    if (!instance) return;
    const ass = buildAss(groups, styles, {
      playResX: resolution.width,
      playResY: resolution.height,
    });
    instance.ready
      .then(() => instance.renderer.setTrack(ass))
      .catch(() => {});
  }, [groups, styles, resolution]);

  return null;
}
