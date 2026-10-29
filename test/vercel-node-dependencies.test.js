import test from "node:test";
import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { prepareVercelNodeDependencies } from "../scripts/prepare-vercel-node.js";

test("las dependencias incluidas por LangGraph arrancan sin detección automática de ESM", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "sslope-esm-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const relative = "node_modules/@langchain/langgraph-sdk/dist/node_modules/.pnpm";
  await cp(fileURLToPath(new URL(`../${relative}`, import.meta.url)), path.join(root, relative), { recursive: true });
  const stores = await readdir(path.join(root, relative));
  // El build local puede haber reparado node_modules antes de ejecutar tests.
  for (const name of ["p-retry", "is-network-error"]) {
    await rm(path.join(root, relative, stores.find((store) => store.startsWith(`${name}@`)), `node_modules/${name}/package.json`), { force: true });
  }
  const retry = path.join(root, relative, stores.find((name) => name.startsWith("p-retry@")), "node_modules/p-retry/index.js");
  const load = () => spawnSync(process.execPath, ["--no-experimental-detect-module", "--input-type=module", "-e",
    `const {default: retry} = await import(${JSON.stringify(pathToFileURL(retry).href)}); if (await retry(() => 42) !== 42) process.exit(1);`], { encoding: "utf8" });
  // Reproduce el límite de paquetes node_modules del runtime de producción.
  assert.notEqual(load().status, 0);
  const emitter = path.join(root, relative, stores.find((name) => name.startsWith("eventemitter3@")), "node_modules/eventemitter3/package.json");
  const existing = '{"type":"module","name":"preserved"}\n';
  await writeFile(emitter, existing);
  await prepareVercelNodeDependencies(root);
  const result = load();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(await readFile(emitter, "utf8"), existing);
  assert.equal(await prepareVercelNodeDependencies(root), 0);
});
