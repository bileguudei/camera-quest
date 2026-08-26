import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageRoot = resolve(root, "node_modules/@mediapipe/tasks-vision/wasm");
const publicRoot = resolve(root, "public/mediapipe/wasm");
const runtimeFiles = [
  "vision_wasm_internal.js",
  "vision_wasm_internal.wasm",
  "vision_wasm_module_internal.js",
  "vision_wasm_module_internal.wasm",
  "vision_wasm_nosimd_internal.js",
  "vision_wasm_nosimd_internal.wasm",
];

await mkdir(publicRoot, { recursive: true });
await Promise.all(
  runtimeFiles.map((file) => copyFile(resolve(packageRoot, file), resolve(publicRoot, file))),
);
