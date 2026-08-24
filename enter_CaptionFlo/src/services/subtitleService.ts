import type { ASRResponse } from "@/types/subtitleTypes";
import type { RecognitionQuality } from "@/constants";
import { API_CONFIG } from "./apiConfig";
import { mockAsrResponse } from "./mockData";

export type ProgressCallback = (progress: number, label?: string) => void;
export type VideoReference =
  | File
  | string
  | { fileUuid?: string | null; filePath?: string | null }
  | null;

export interface UploadedVideoInfo {
  uuid: string;
  filename: string;
  size: number;
  path: string;
  url: string;
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const apiBase = API_CONFIG.BASE_URL.replace(/\/+$/, "");
const backendOrigin = apiBase.replace(/\/api$/, "");
const apiPath = (path: string) => `${apiBase}/${path.replace(/^\/+/, "")}`;

function resolveBackendAssetUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (/^[a-z]+:\/\//i.test(url) || url.startsWith("blob:")) return url;
  return `${backendOrigin}${url.startsWith("/") ? "" : "/"}${url}`;
}

async function readJsonError(res: Response): Promise<string> {
  try {
    const data = await res.json();
    if (typeof data === "string") return data;
    if (data && typeof data === "object") {
      const detail = (data as { detail?: unknown }).detail;
      if (typeof detail === "string") return detail;
      return JSON.stringify(data);
    }
  } catch {
    // fall back below
  }
  return `${res.status} ${res.statusText}`.trim();
}

function parseFilenameFromContentDisposition(header: string | null): string | null {
  if (!header) return null;
  const match = header.match(/filename\*?=(?:UTF-8''|")?([^";]+)"?/i);
  if (match?.[1]) {
    try {
      return decodeURIComponent(match[1].replace(/"/g, "").trim());
    } catch {
      return match[1].replace(/"/g, "").trim();
    }
  }
  return null;
}

function normalizeLoadedProject(payload: unknown): unknown | null {
  if (!payload || typeof payload !== "object") return null;
  const value = payload as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(value, "project")) {
    return value.project ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(value, "status") && value.status === "empty") {
    return null;
  }
  return payload;
}

function buildVideoRefFormData(videoRef: VideoReference): FormData {
  const form = new FormData();
  if (videoRef instanceof File) {
    form.append("file", videoRef);
    return form;
  }
  if (typeof videoRef === "string" && videoRef) {
    if (videoRef.startsWith("/outputs/")) {
      form.append("file_path", videoRef);
    } else if (videoRef.includes("/")) {
      form.append("file_path", videoRef);
    } else {
      form.append("file_uuid", videoRef);
    }
    return form;
  }
  if (videoRef && typeof videoRef === "object") {
    if (videoRef.fileUuid) form.append("file_uuid", videoRef.fileUuid);
    if (videoRef.filePath) form.append("file_path", videoRef.filePath);
  }
  return form;
}

async function waitForBurnTask(
  taskId: string,
  onProgress?: ProgressCallback,
): Promise<{ downloadUrl: string; filename: string }> {
  const started = Date.now();
  const timeoutMs = 60 * 60 * 1000;
  for (;;) {
    if (Date.now() - started > timeoutMs) {
      throw new Error("Burn task timed out");
    }
    const res = await fetch(apiPath(`${API_CONFIG.endpoints.taskStatus}${taskId}`));
    if (!res.ok) {
      throw new Error(`Task status failed: ${await readJsonError(res)}`);
    }
    const task = (await res.json()) as {
      status?: string;
      progress?: number;
      label?: string;
      error?: string;
      download_url?: string;
    };
    const progress = typeof task.progress === "number" ? task.progress : 0;
    onProgress?.(Math.max(0, Math.min(99, Math.round(progress))), task.label ?? "");
    if (task.status === "completed") {
      const downloadUrl = task.download_url
        ? task.download_url.startsWith("http")
          ? task.download_url
          : resolveBackendAssetUrl(task.download_url) ?? apiPath(task.download_url)
        : apiPath(`${API_CONFIG.endpoints.taskDownload}${taskId}`);
      const downloadRes = await fetch(downloadUrl);
      if (!downloadRes.ok) {
        throw new Error(`Task download failed: ${await readJsonError(downloadRes)}`);
      }
      const blob = await downloadRes.blob();
      const filename =
        parseFilenameFromContentDisposition(downloadRes.headers.get("Content-Disposition")) ||
        "output.mp4";
      onProgress?.(100, "完成");
      return {
        downloadUrl: URL.createObjectURL(blob),
        filename,
      };
    }
    if (task.status === "failed" || task.status === "cancelled") {
      throw new Error(task.error || `Task ${task.status === "failed" ? "failed" : "cancelled"}`);
    }
    await delay(1200);
  }
}

export const subtitleService = {
  async uploadVideo(file: File): Promise<UploadedVideoInfo> {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(apiPath(API_CONFIG.endpoints.uploadFile), {
      method: "POST",
      body: form,
    });
    if (!res.ok) throw new Error(`Upload failed: ${await readJsonError(res)}`);
    const uploaded = (await res.json()) as UploadedVideoInfo;
    return {
      ...uploaded,
      url: resolveBackendAssetUrl(uploaded.url) ?? uploaded.url,
    };
  },

  /** Run speech recognition. Returns backend-shaped ASRResponse. */
  async runAsr(
    quality: RecognitionQuality,
    videoRef: VideoReference,
    onProgress?: ProgressCallback,
  ): Promise<ASRResponse> {
    if (API_CONFIG.USE_MOCK) {
      await delay(200);
      onProgress?.(100, "完成");
      return mockAsrResponse;
    }

    const form = buildVideoRefFormData(videoRef);
    form.append("quality", quality);
    const res = await fetch(apiPath(API_CONFIG.endpoints.asr), {
      method: "POST",
      body: form,
    });
    if (!res.ok) throw new Error(`ASR failed: ${await readJsonError(res)}`);
    return (await res.json()) as ASRResponse;
  },

  /** Export subtitle file (ass/srt). Returns a blob download URL. */
  async exportSubtitle(
    format: "ass" | "srt",
    payload: unknown,
    onProgress?: ProgressCallback,
  ): Promise<{ url: string; filename: string }> {
    if (API_CONFIG.USE_MOCK) {
      await delay(300);
      onProgress?.(100, `导出 ${format.toUpperCase()}`);
      return { url: "#mock", filename: `subtitles.${format}` };
    }
    const res = await fetch(apiPath(API_CONFIG.endpoints.exportSubtitle), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ format, ...(payload as object) }),
    });
    if (!res.ok) throw new Error(`Subtitle export failed: ${await readJsonError(res)}`);
    const blob = await res.blob();
    const filename =
      parseFilenameFromContentDisposition(res.headers.get("Content-Disposition")) ||
      `subtitles.${format}`;
    onProgress?.(100, "完成");
    return { url: URL.createObjectURL(blob), filename };
  },

  /** Export (hard-burn) video. */
  async exportVideo(
    payload: Record<string, unknown>,
    onProgress?: ProgressCallback,
  ): Promise<{ url: string; filename: string }> {
    if (API_CONFIG.USE_MOCK) {
      await delay(500);
      onProgress?.(100, "完成");
      return { url: "#mock", filename: "output.mp4" };
    }
    const res = await fetch(apiPath(API_CONFIG.endpoints.exportVideo), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`Video export failed: ${await readJsonError(res)}`);
    const data = (await res.json()) as {
      task_id?: string;
      status?: string;
      message?: string;
      url?: string;
      filename?: string;
    };
    if (data.url) {
      onProgress?.(100, "完成");
      return {
        url: resolveBackendAssetUrl(data.url) ?? data.url,
        filename: data.filename ?? "output.mp4",
      };
    }
    if (!data.task_id) {
      throw new Error("Burn response missing task_id");
    }
    return await waitForBurnTask(data.task_id, onProgress);
  },

  /** Save current project. */
  async saveProject(payload: unknown): Promise<void> {
    if (API_CONFIG.USE_MOCK) {
      await delay(200);
      try {
        localStorage.setItem("vc_ai_project", JSON.stringify(payload));
      } catch {
        /* ignore quota */
      }
      return;
    }
    const res = await fetch(apiPath(API_CONFIG.endpoints.saveProject), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`Save failed: ${await readJsonError(res)}`);
  },

  /** Load a saved project. */
  async loadProject(): Promise<unknown | null> {
    if (API_CONFIG.USE_MOCK) {
      await delay(100);
      try {
        const raw = localStorage.getItem("vc_ai_project");
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    }
    const res = await fetch(apiPath(API_CONFIG.endpoints.loadProject));
    if (!res.ok) throw new Error(`Load failed: ${await readJsonError(res)}`);
    const loaded = normalizeLoadedProject(await res.json());
    if (!loaded || typeof loaded !== "object") return loaded;
    const value = loaded as Record<string, unknown>;
    return {
      ...value,
      videoUrl: resolveBackendAssetUrl(value.videoUrl as string | null | undefined),
    };
  },

  /** Copilot streaming (SSE). onToken receives text chunks. */
  async copilotStream(
    prompt: string,
    onToken: (chunk: string) => void,
  ): Promise<void> {
    if (API_CONFIG.USE_MOCK) {
      const reply = "你好，我可以帮你优化字幕样式、批量处理和导出逻辑。";
      for (const ch of reply) {
        await delay(18);
        onToken(ch);
      }
      return;
    }

    const source = new EventSource(apiPath(API_CONFIG.endpoints.copilotStream));
    const idleTimeoutMs = 1000;
    const maxWaitMs = 15000;
    let seenMessage = false;
    let lastMessageAt = Date.now();
    let finished = false;

    const close = () => {
      if (!finished) {
        finished = true;
        source.close();
      }
    };

    const postPromise = fetch(apiPath(API_CONFIG.endpoints.copilotSend), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: prompt, include_context: false }),
    });

    await postPromise.then(async (res) => {
      if (!res.ok) {
        close();
        throw new Error(`Copilot send failed: ${await readJsonError(res)}`);
      }
    });

    await new Promise<void>((resolve, reject) => {
      const started = Date.now();
      const timer = window.setInterval(() => {
        if (finished) {
          window.clearInterval(timer);
          return;
        }
        if (seenMessage && Date.now() - lastMessageAt >= idleTimeoutMs) {
          window.clearInterval(timer);
          close();
          resolve();
          return;
        }
        if (Date.now() - started >= maxWaitMs) {
          window.clearInterval(timer);
          close();
          reject(new Error("Copilot streaming timed out"));
        }
      }, 250);

      source.onmessage = (event) => {
        seenMessage = true;
        lastMessageAt = Date.now();
        onToken(event.data);
      };

      source.onerror = () => {
        if (source.readyState === EventSource.CLOSED) {
          window.clearInterval(timer);
          close();
          resolve();
        }
      };
    });
  },
};
