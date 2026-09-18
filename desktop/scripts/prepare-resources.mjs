import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(scriptDir, "..");
const repoDir = path.resolve(desktopDir, "..");
const resourcesDir = path.join(desktopDir, "build-resources");

function requirePath(target, label) {
  if (!existsSync(target)) {
    throw new Error(`Thieu ${label}: ${target}`);
  }
}

const backendTarget = path.join(repoDir, "backend", "target");
const frontendBuild = path.join(repoDir, "frontend", ".next");
const standaloneDir = path.join(frontendBuild, "standalone");
requirePath(backendTarget, "thu muc build backend");
requirePath(path.join(standaloneDir, "server.js"), "Next.js standalone server");

const jars = readdirSync(backendTarget).filter(
  (name) => name.endsWith(".jar") && !name.endsWith(".jar.original"),
);
if (jars.length !== 1) {
  throw new Error(`Can dung 1 backend JAR, tim thay ${jars.length}`);
}

rmSync(resourcesDir, { recursive: true, force: true });
mkdirSync(path.join(resourcesDir, "backend"), { recursive: true });
cpSync(path.join(backendTarget, jars[0]), path.join(resourcesDir, "backend", "app.jar"));
cpSync(standaloneDir, path.join(resourcesDir, "web"), { recursive: true });
cpSync(
  path.join(desktopDir, "web-runner.cjs"),
  path.join(resourcesDir, "web", "web-runner.cjs"),
);
cpSync(path.join(frontendBuild, "static"), path.join(resourcesDir, "web", ".next", "static"), {
  recursive: true,
});

const publicDir = path.join(repoDir, "frontend", "public");
if (existsSync(publicDir)) {
  cpSync(publicDir, path.join(resourcesDir, "web", "public"), { recursive: true });
}

console.log(`Da chuan bi tai nguyen desktop tai ${resourcesDir}`);
