const fs = require("node:fs");
const path = require("node:path");
const { Module } = require("node:module");

const webDir = process.env.RAPPHIM_WEB_DIR;
const webLog = process.env.RAPPHIM_WEB_LOG;

function writeWebLog(message) {
  if (!webLog) return;
  try {
    fs.appendFileSync(webLog, `[${new Date().toISOString()}] web-runner: ${message}\n`);
  } catch {
    // Khong de loi ghi log che mat loi khoi dong web.
  }
}

function fail(error) {
  writeWebLog(error?.stack ?? error);
  process.exit(1);
}

if (!webDir) {
  fail(new Error("RAPPHIM_WEB_DIR_REQUIRED"));
}

try {
  const serverPath = path.join(webDir, "server.js");
  const nextPath = path.join(webDir, "node_modules");
  process.env.NODE_PATH = nextPath;
  Module._initPaths();

  const serverModule = new Module(serverPath, module);
  serverModule.filename = serverPath;
  serverModule.paths = Module._nodeModulePaths(webDir);
  writeWebLog(`start server=${serverPath} modules=${nextPath}`);
  serverModule._compile(fs.readFileSync(serverPath, "utf8"), serverPath);
} catch (error) {
  fail(error);
}
