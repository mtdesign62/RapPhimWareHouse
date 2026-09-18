import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const desktopDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = path.join(desktopDir, "build-resources");
const required = [
  "backend/app.jar",
  "web/server.js",
  "web/web-runner.cjs",
  "web/modules/next/package.json",
  "web/modules/next/dist/server/next.js",
  "web/.next/BUILD_ID",
  "jre/bin/java.exe",
  "ffmpeg/ffmpeg.exe",
];

let failed = false;
for (const relative of required) {
  const target = path.join(root, relative);
  if (!existsSync(target) || statSync(target).size === 0) {
    console.error(`Thieu tai nguyen: ${relative}`);
    failed = true;
  } else {
    console.log(`OK ${relative}`);
  }
}

if (failed) process.exit(1);
