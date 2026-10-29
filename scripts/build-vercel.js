import "./build-chat.js";
import { rm } from "node:fs/promises";
import { prepareVercelNodeDependencies } from "./prepare-vercel-node.js";

const root = new URL("../", import.meta.url);
// El constructor Node de Services busca servidores también en dist aunque
// exista una entrada explícita. Una copia de public/app.js allí se ejecutaría
// en Node (window no existe). El handler entrega public/ y Three.js directamente.
// Elimina también la salida del build anterior si Vercel restaura su caché.
await rm(new URL("dist/", root), { recursive: true, force: true });
const prepared = await prepareVercelNodeDependencies();
console.log(`Metadatos ESM preparados para ${prepared} dependencias internas de LangGraph.`);
console.log("Chat listo; api/index.js sirve el tablero y los recursos 3D.");
