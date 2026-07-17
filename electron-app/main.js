const { app, BrowserWindow, shell, Tray, Menu, dialog } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

let mainWindow = null;
let pythonProcess = null;
let tray = null;

const SERVER_PORT = 58000;
const SERVER_URL = `http://127.0.0.1:${SERVER_PORT}`;

function getBackendPath() {
  // In production, backend is bundled in extraResources
  const resourcesPath = process.resourcesPath;
  const bundledBackend = path.join(resourcesPath, "backend");

  if (fs.existsSync(bundledBackend)) {
    const exePath = path.join(bundledBackend, "VideoCaptionsAI.exe");
    if (fs.existsSync(exePath)) {
      return { exe: exePath, cwd: bundledBackend };
    }
  }

  // Dev mode: look relative to project
  const devBackend = path.join(__dirname, "..", "VideoSubs", "dist", "VideoCaptionsAI");
  const devExe = path.join(devBackend, "VideoCaptionsAI.exe");
  if (fs.existsSync(devExe)) {
    return { exe: devExe, cwd: devBackend };
  }

  return null;
}

function startBackend() {
  const backend = getBackendPath();
  if (!backend) {
    dialog.showErrorBox("启动失败", "找不到后端程序，请重新安装。");
    app.quit();
    return;
  }

  console.log(`Starting backend: ${backend.exe}`);
  console.log(`Working dir: ${backend.cwd}`);

  pythonProcess = spawn(backend.exe, [], {
    cwd: backend.cwd,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  pythonProcess.stdout.on("data", (data) => {
    console.log(`[Backend] ${data.toString().trim()}`);
  });

  pythonProcess.stderr.on("data", (data) => {
    console.log(`[Backend] ${data.toString().trim()}`);
  });

  pythonProcess.on("error", (err) => {
    console.error("Backend error:", err);
  });

  pythonProcess.on("close", (code) => {
    console.log(`Backend exited with code ${code}`);
    pythonProcess = null;
  });
}

function waitForServer(retries = 60) {
  return new Promise((resolve) => {
    const http = require("http");
    let attempts = 0;

    function check() {
      attempts++;
      http.get(SERVER_URL, (res) => {
        if (res.statusCode === 200) {
          console.log("Server is ready!");
          resolve(true);
        } else {
          retry();
        }
      }).on("error", () => {
        retry();
      });
    }

    function retry() {
      if (attempts >= retries) {
        console.log("Server did not start in time");
        resolve(false);
        return;
      }
      setTimeout(check, 1000);
    }

    check();
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: "VideoCaptionsAI - 视频字幕识别生成器",
    icon: path.join(__dirname, "icon.ico"),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.loadURL(SERVER_URL);

  mainWindow.on("close", (e) => {
    // Minimize to tray instead of closing
    if (tray && !app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function createTray() {
  // Create a simple tray icon
  try {
    tray = new Tray(path.join(__dirname, "icon.ico"));
    const contextMenu = Menu.buildFromTemplate([
      {
        label: "显示窗口",
        click: () => {
          if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
          }
        },
      },
      {
        label: "在浏览器中打开",
        click: () => {
          shell.openExternal(SERVER_URL);
        },
      },
      { type: "separator" },
      {
        label: "退出",
        click: () => {
          app.isQuitting = true;
          app.quit();
        },
      },
    ]);
    tray.setToolTip("VideoCaptionsAI");
    tray.setContextMenu(contextMenu);
    tray.on("double-click", () => {
      if (mainWindow) {
        mainWindow.show();
        mainWindow.focus();
      }
    });
  } catch (e) {
    console.log("Tray not available:", e.message);
  }
}

app.whenReady().then(async () => {
  startBackend();
  await waitForServer(90); // Wait up to 90 seconds for Whisper model loading
  createWindow();
  createTray();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    // Don't quit - keep running in tray
  }
});

app.on("before-quit", () => {
  app.isQuitting = true;
  if (pythonProcess) {
    console.log("Shutting down backend...");
    pythonProcess.kill();
    pythonProcess = null;
  }
});

app.on("activate", () => {
  if (mainWindow === null) {
    createWindow();
  } else {
    mainWindow.show();
  }
});
