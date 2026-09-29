import { readFile } from "node:fs/promises";
import { makeMineFrame, mineChatSnapshot } from "../public/mine-twin-frame.js";
const cache = new Map();
export async function loadMineTwin(id) {
  if (!["century", "pasco"].includes(id)) throw new Error("Mina no disponible");
  if (!cache.has(id)) {
    const data = JSON.parse(await readFile(new URL(`../data/generated/mine-twin-${id}.json`, import.meta.url), "utf8"));
    if (data.id !== id.toUpperCase() || data.operationalDecisionAllowed !== false || !data.frames?.length) throw new Error("Modelo de mina incompatible");
    cache.set(id, data);
  }
  return cache.get(id);
}
export async function serveMineTwin(res, url) {
  const id = url.pathname.slice("/api/mines/".length);
  if (!["century", "pasco"].includes(id)) {
    res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "Mina no disponible" })); return;
  }
  const data = await loadMineTwin(id);
  const headers = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-cache" };
  if (url.searchParams.get("download") === "1") headers["Content-Disposition"] = `attachment; filename="mine-twin-${id}.json"`;
  res.writeHead(200, headers); res.end(JSON.stringify(data));
}

export async function mineServerSnapshot(context) {
  if (!["CENTURY","PASCO"].includes(context?.activeMine)) return null;
  const asset = await loadMineTwin(context.activeMine.toLowerCase());
  const requestedDate = context.mineTwin?.displayedDate;
  const index = asset.frames.findIndex((frame) => frame.date === requestedDate);
  const requestedScale = context.mineTwin?.amplification;
  const amplification = Number.isFinite(requestedScale) && requestedScale >= 1 && requestedScale <= 100 ? requestedScale : 1;
  return { capturedAt: new Date().toISOString(), source: "Caso público verificado en servidor, independiente del laboratorio demostrativo",
    requestedDateAvailable: index >= 0, ...mineChatSnapshot(asset,makeMineFrame(asset,Math.max(index,0),amplification),context.mineTwin?.selectedPoint?.id) };
}
