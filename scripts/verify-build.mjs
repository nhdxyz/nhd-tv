import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const preloadPath = path.join(projectRoot, "dist/main/shell-preload.js");
const rendererPath = path.join(projectRoot, "dist/renderer/index.html");

await access(rendererPath);

const preload = await readFile(preloadPath, "utf8");

if (/require\(["']\.\//.test(preload)) {
  throw new Error("Sandboxed shell preload must not require local runtime modules");
}

console.log("Verified renderer output and self-contained sandboxed preload.");
