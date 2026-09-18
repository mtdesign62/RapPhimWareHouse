const path = require("node:path");
const { Module } = require("node:module");

const webDir = process.env.RAPPHIM_WEB_DIR;
if (!webDir) {
  console.error("RAPPHIM_WEB_DIR_REQUIRED");
  process.exit(1);
}

process.env.NODE_PATH = path.join(webDir, "node_modules");
Module._initPaths();
require(path.join(webDir, "server.js"));
