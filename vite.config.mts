import { defineConfig } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base: "./",
  root: path.join(projectRoot, "src/renderer"),
  build: {
    emptyOutDir: false,
    outDir: path.join(projectRoot, "dist/renderer")
  }
});
