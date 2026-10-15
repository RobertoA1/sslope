import "./build-chat.js";
import { cp, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const output = new URL("dist/", root);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(new URL("public/", root), output, { recursive: true });
// Conserva las rutas del importmap y los imports relativos de los addons.
for (const folder of ["build", "examples/jsm"]) {
  await cp(new URL(`node_modules/three/${folder}/`, root), new URL(`vendor/three/${folder}/`, output), { recursive: true });
}
console.log(`Tablero y recursos 3D listos en ${fileURLToPath(output)}`);
