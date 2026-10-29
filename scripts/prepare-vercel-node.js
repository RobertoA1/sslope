import { readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export async function prepareVercelNodeDependencies(projectRoot = fileURLToPath(new URL("../", import.meta.url))) {
  // LangGraph SDK publica estas dependencias convertidas a ESM dentro de
  // dist/node_modules, pero sin sus package.json. Cada node_modules inicia
  // otro ámbito: el type=module del SDK no llega a estos archivos .js.
  const bundled = path.join(projectRoot, "node_modules/@langchain/langgraph-sdk/dist/node_modules/.pnpm");
  let stores;
  try { stores = await readdir(bundled, { withFileTypes: true }); }
  catch (error) { if (error.code === "ENOENT") return 0; throw error; }
  let added = 0;
  for (const store of stores.filter((entry) => entry.isDirectory())) {
    const modules = path.join(bundled, store.name, "node_modules");
    for (const dependency of await readdir(modules, { withFileTypes: true })) {
      if (!dependency.isDirectory() || dependency.name.startsWith("@")) continue;
      try {
        await writeFile(path.join(modules, dependency.name, "package.json"), '{"type":"module","private":true}\n', { flag: "wx" });
        added++;
      } catch (error) { if (error.code !== "EEXIST") throw error; }
    }
  }
  return added;
}
