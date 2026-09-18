const { app, BrowserWindow, dialog, utilityProcess } = require("electron");
const { spawn, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");

const STARTUP_TIMEOUT_MS = 90_000;
const children = new Set();
let mainWindow;
let logFile;
let appOrigin;
let stopping = false;
let startupComplete = false;

class StartupError extends Error {
  constructor(code, detail) {
    super(detail ?? code);
    this.code = code;
  }
}

function writeLog(message) {
  if (!logFile) return;
  try {
    fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${message}\n`);
  } catch {
    // Khong de loi ghi log lam app dung khoi dong.
  }
}

function resourceRoot() {
  return app.isPackaged
    ? process.resourcesPath
    : path.join(__dirname, "build-resources");
}

function requireFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new StartupError("RESOURCE_MISSING", filePath);
  }
}

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => {
        if (error || !port) reject(error ?? new Error("PORT_UNAVAILABLE"));
        else resolve(port);
      });
    });
  });
}

function startProcess(name, command, args, options) {
  writeLog(`${name}: start`);
  const child = spawn(command, args, {
    ...options,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.startupError = null;
  child.serviceExited = false;
  child.on("error", (error) => {
    child.startupError = error;
    writeLog(`${name}: spawn error ${error.message}`);
  });
  child.stdout.on("data", (chunk) => writeLog(`${name}: ${chunk.toString().trimEnd()}`));
  child.stderr.on("data", (chunk) => writeLog(`${name}: ${chunk.toString().trimEnd()}`));
  child.on("exit", (code, signal) => {
    child.serviceExited = true;
    children.delete(child);
    writeLog(`${name}: exit code=${code} signal=${signal}`);
    if (startupComplete && !stopping) {
      dialog.showErrorBox(
        "RapPhim đã dừng",
        name === "backend"
          ? "Dịch vụ phim đã dừng ngoài dự kiến. Hãy mở lại ứng dụng."
          : "Giao diện ứng dụng đã dừng ngoài dự kiến. Hãy mở lại ứng dụng.",
      );
      app.quit();
    }
  });
  children.add(child);
  return child;
}

function startUtility(name, modulePath, options) {
  writeLog(`${name}: utility start`);
  const child = utilityProcess.fork(modulePath, [], {
    ...options,
    serviceName: "RapPhim Web Server",
    stdio: "pipe",
  });

  child.startupError = null;
  child.serviceExited = false;
  child.serviceKind = "utility";
  child.on("spawn", () => writeLog(`${name}: utility spawned pid=${child.pid}`));
  child.on("error", (error) => {
    child.startupError = error;
    writeLog(`${name}: utility error ${JSON.stringify(error)}`);
  });
  child.stdout?.on("data", (chunk) => writeLog(`${name}: ${chunk.toString().trimEnd()}`));
  child.stderr?.on("data", (chunk) => writeLog(`${name}: ${chunk.toString().trimEnd()}`));
  child.on("exit", (code) => {
    child.serviceExited = true;
    children.delete(child);
    writeLog(`${name}: utility exit code=${code}`);
    if (startupComplete && !stopping) {
      dialog.showErrorBox(
        "RapPhim đã dừng",
        "Giao diện ứng dụng đã dừng ngoài dự kiến. Hãy mở lại ứng dụng.",
      );
      app.quit();
    }
  });
  children.add(child);
  return child;
}

async function waitForService(name, url, child) {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (child.startupError || child.serviceExited) {
      throw new StartupError(`${name}_START_FAILED`);
    }
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
      if (response.ok) return;
    } catch {
      // Dich vu dang khoi dong, thu lai cho toi khi het han.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new StartupError(`${name}_START_TIMEOUT`);
}

function startupMessage(code) {
  switch (code) {
    case "RESOURCE_MISSING":
      return "Bộ cài thiếu thành phần cần thiết. Hãy tải lại bản phát hành đầy đủ.";
    case "BACKEND_START_FAILED":
      return "Dịch vụ phim không khởi động được. Hãy đóng ứng dụng rồi mở lại.";
    case "BACKEND_START_TIMEOUT":
      return "Dịch vụ phim khởi động quá lâu. Hãy kiểm tra phần mềm bảo mật rồi thử lại.";
    case "WEB_START_FAILED":
      return "Giao diện ứng dụng không khởi động được. Hãy đóng ứng dụng rồi mở lại.";
    case "WEB_START_TIMEOUT":
      return "Giao diện ứng dụng khởi động quá lâu. Hãy đóng ứng dụng rồi thử lại.";
    default:
      return "Ứng dụng không thể khởi động. Xem desktop.log trong thư mục dữ liệu ứng dụng.";
  }
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    backgroundColor: "#09090b",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!/^https?:\/\//i.test(url)) return { action: "deny" };
    return {
      action: "allow",
      overrideBrowserWindowOptions: {
        width: 1280,
        height: 800,
        autoHideMenuBar: true,
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
        },
      },
    };
  });

  return mainWindow;
}

async function showLoadingPage(window) {
  const html = `<!doctype html><html lang="vi"><meta charset="utf-8"><style>
    body{margin:0;background:#09090b;color:#fafafa;font:16px system-ui;display:grid;place-items:center;height:100vh}
    main{text-align:center}.dot{display:inline-block;width:9px;height:9px;margin:5px;border-radius:50%;background:#e50914;animation:p 1s infinite alternate}
    .dot:nth-child(2){animation-delay:.2s}.dot:nth-child(3){animation-delay:.4s}@keyframes p{to{opacity:.25;transform:translateY(-7px)}}
  </style><main><h2>RapPhim WareHouse</h2><p>Đang khởi động ứng dụng…</p><div><i class="dot"></i><i class="dot"></i><i class="dot"></i></div></main></html>`;
  await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
}

async function startApplication() {
  const userData = app.getPath("userData");
  const dataDir = path.join(userData, "data");
  const thumbsDir = path.join(dataDir, "thumbs");
  fs.mkdirSync(thumbsDir, { recursive: true });
  logFile = path.join(userData, "desktop.log");

  const root = resourceRoot();
  const javaName = process.platform === "win32" ? "java.exe" : "java";
  const javaPath = path.join(root, "jre", "bin", javaName);
  const backendJar = path.join(root, "backend", "app.jar");
  const webDir = path.join(root, "web");
  const webServer = path.join(webDir, "server.js");
  const webRunner = path.join(__dirname, "web-runner.cjs");
  const ffmpegDir = path.join(root, "ffmpeg");
  requireFile(javaPath);
  requireFile(backendJar);
  requireFile(webServer);
  requireFile(webRunner);
  writeLog(`runtime: exec=${process.execPath}`);
  writeLog(`runtime: resources=${root}`);
  writeLog(`runtime: portable=${process.env.PORTABLE_EXECUTABLE_FILE ? "yes" : "no"}`);

  const window = createMainWindow();
  await showLoadingPage(window);

  const backendPort = await reservePort();
  const webPort = await reservePort();
  const backendUrl = `http://127.0.0.1:${backendPort}`;
  appOrigin = `http://127.0.0.1:${webPort}`;

  const backend = startProcess(
    "backend",
    javaPath,
    [
      "-Xms128m",
      "-Xmx512m",
      "-jar",
      backendJar,
      "--spring.main.banner-mode=off",
      "--server.address=127.0.0.1",
      `--server.port=${backendPort}`,
    ],
    {
      cwd: userData,
      env: {
        ...process.env,
        PATH: `${ffmpegDir}${path.delimiter}${process.env.PATH ?? ""}`,
        RAPPHIM_CORS_ORIGINS: appOrigin,
        RAPPHIM_SOURCES_FILE: path.join(dataDir, "custom-sources.json"),
        RAPPHIM_ZCLOUD_THUMB_DIR: thumbsDir,
      },
    },
  );
  await waitForService("BACKEND", `${backendUrl}/actuator/health`, backend);

  const web = startUtility(
    "web",
    webRunner,
    {
      cwd: webDir,
      env: {
        ...process.env,
        NODE_ENV: "production",
        NODE_PATH: path.join(webDir, "node_modules"),
        HOSTNAME: "127.0.0.1",
        PORT: String(webPort),
        API_INTERNAL_URL: backendUrl,
        RAPPHIM_WEB_DIR: webDir,
        RAPPHIM_WEB_LOG: logFile,
      },
    },
  );
  await waitForService("WEB", appOrigin, web);
  await window.loadURL(appOrigin);
  startupComplete = true;
  if (process.env.RAPPHIM_READY_FILE) {
    fs.writeFileSync(process.env.RAPPHIM_READY_FILE, `${appOrigin}\n`);
  }
}

function stopServices() {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.serviceExited) continue;
    if (child.serviceKind === "utility") {
      child.kill();
    } else if (process.platform === "win32" && child.pid) {
      spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
        windowsHide: true,
        stdio: "ignore",
      });
    } else if (child.pid) {
      child.kill("SIGTERM");
    }
  }
  children.clear();
}

if (process.env.RAPPHIM_USER_DATA_DIR) {
  const userDataOverride = path.resolve(process.env.RAPPHIM_USER_DATA_DIR);
  fs.mkdirSync(userDataOverride, { recursive: true });
  app.setPath("userData", userDataOverride);
}

const hasLock = app.requestSingleInstanceLock();
if (!hasLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    try {
      await startApplication();
    } catch (error) {
      const code = error instanceof StartupError ? error.code : "UNKNOWN";
      writeLog(`startup: ${code} ${error?.stack ?? error}`);
      if (process.env.RAPPHIM_READY_FILE) {
        try {
          fs.writeFileSync(`${process.env.RAPPHIM_READY_FILE}.error`, `${code}\n`);
        } catch {
          writeLog("startup: khong ghi duoc tep bao loi smoke test");
        }
      }
      dialog.showErrorBox("Không thể khởi động RapPhim", startupMessage(code));
      app.quit();
    }
  });
}

app.on("window-all-closed", () => app.quit());
app.on("before-quit", stopServices);
