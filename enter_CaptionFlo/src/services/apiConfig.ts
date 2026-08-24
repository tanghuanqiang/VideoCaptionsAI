/**
 * API configuration.
 *
 * The generated frontend talks to the local FastAPI backend directly.
 * All paths are rooted at /api so the code stays aligned with the server.
 */
export const API_CONFIG = {
  BASE_URL: "http://localhost:8000/api",
  USE_MOCK: false,
  endpoints: {
    uploadFile: "/upload_file",
    asr: "/asr/",
    exportSubtitle: "/export/subtitle",
    exportVideo: "/burn/",
    taskStatus: "/burn/task/",
    taskDownload: "/burn/download/",
    saveProject: "/project/save",
    loadProject: "/project/load",
    copilotSend: "/copilot/send",
    copilotStream: "/copilot/sse",
  },
} as const;
