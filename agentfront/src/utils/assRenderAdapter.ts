import octopusScriptUrl from "libass-wasm/dist/js/subtitles-octopus.js?url";
import octopusWorkerUrl from "libass-wasm/dist/js/subtitles-octopus-worker.js?url";
import type { AssRenderAdapter } from "./assRenderTypes";

type OctopusInstance = {
  setCurrentTime: (time: number) => void;
  dispose: () => void;
};
type OctopusConstructor = new (options: Record<string, unknown>) => OctopusInstance;

declare global {
  interface Window {
    SubtitlesOctopus?: OctopusConstructor;
  }
}

let scriptPromise: Promise<OctopusConstructor> | null = null;

const loadConstructor = (): Promise<OctopusConstructor> => {
  if (window.SubtitlesOctopus) return Promise.resolve(window.SubtitlesOctopus);
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = octopusScriptUrl;
    script.onload = () => window.SubtitlesOctopus ? resolve(window.SubtitlesOctopus) : reject(new Error("SubtitlesOctopus did not expose a constructor"));
    script.onerror = () => reject(new Error("Unable to load libass-wasm renderer"));
    document.head.appendChild(script);
  });
  return scriptPromise;
};

export const createLibassAdapter = async (input: {
  assText: string;
  width: number;
  height: number;
  fonts?: string[];
  fallbackFont?: string;
}): Promise<AssRenderAdapter> => {
  const Constructor = await loadConstructor();
  const canvas = document.createElement("canvas");
  canvas.width = input.width;
  canvas.height = input.height;
  let resolveReady: () => void = () => undefined;
  let rejectReady: (reason?: unknown) => void = () => undefined;
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  const renderer = new Constructor({
    canvas,
    subContent: input.assText,
    workerUrl: octopusWorkerUrl,
    fonts: input.fonts || [],
    fallbackFont: input.fallbackFont,
    renderMode: "wasm-blend",
    onReady: resolveReady,
    onError: rejectReady,
  });
  await ready;

  return {
    async renderFrame({ timeMs }) {
      // SubtitlesOctopus initializes lastRenderTime to zero, so an exact t=0
      // request is discarded. One millisecond is visually identical and
      // guarantees the first frame is submitted to libass.
      renderer.setCurrentTime(Math.max(0.001, timeMs / 1000));
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      // The worker response can arrive after the animation frame that submits it.
      // Keep this bounded so editor playback remains responsive while the first
      // frame has time to reach the canvas.
      await new Promise<void>(resolve => window.setTimeout(resolve, 80));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("libass canvas context is unavailable");
      return context.getImageData(0, 0, canvas.width, canvas.height);
    },
    dispose() {
      renderer.dispose();
    },
  };
};
