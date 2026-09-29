import { build } from "esbuild";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
await build({ absWorkingDir: root, entryPoints: ["public/chat-panel.js"], outfile: "public/vendor/chat-panel.js", bundle: true, format: "esm", platform: "browser", target: "es2022", minify: true, legalComments: "eof" });
