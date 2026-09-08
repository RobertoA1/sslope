import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createForecast } from "./core/forecast-engine.js";
import { TwinStore } from "./store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "..", "public");
const store = new TwinStore();
const port = Number(process.env.PORT || 3000);

const sendJson = (res, status, data) => {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*" });
  res.end(JSON.stringify(data));
};

const getBody = (req) => new Promise((resolve, reject) => {
  let raw = "";
  req.on("data", (chunk) => { raw += chunk; if (raw.length > 1_000_000) reject(new Error("Cuerpo demasiado grande")); });
  req.on("end", () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error("JSON inválido")); } });
  req.on("error", reject);
});

async function staticFile(res, requestPath) {
  const requested = requestPath === "/" ? "/index.html" : requestPath;
  const resolved = path.resolve(publicDir, `.${requested}`);
  if (!resolved.startsWith(publicDir)) return sendJson(res, 403, { error: "Ruta no permitida" });
  try {
    const content = await readFile(resolved);
    const type = resolved.endsWith(".css") ? "text/css" : resolved.endsWith(".js") ? "text/javascript" : "text/html";
    res.writeHead(200, { "Content-Type": `${type}; charset=utf-8` });
    res.end(content);
  } catch {
    sendJson(res, 404, { error: "Recurso no encontrado" });
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (req.method === "OPTIONS") {
      res.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type" });
      return res.end();
    }
    if (req.method === "GET" && url.pathname === "/api/health") return sendJson(res, 200, { status: "ok", service: "M-1 Digital Twin", version: "0.1.0" });
    if (req.method === "GET" && url.pathname === "/api/telemetry") return sendJson(res, 200, { readings: store.getReadings(url.searchParams.get("limit")) });
    if (req.method === "GET" && url.pathname === "/api/alerts") return sendJson(res, 200, { alerts: store.alerts });
    if (req.method === "GET" && url.pathname === "/api/simulation") return sendJson(res, 200, { parameters: store.simulationParameters });
    if (req.method === "GET" && url.pathname === "/api/forecast") {
      const forecast = createForecast(store.getReadings(120), Number(url.searchParams.get("horizon") || 24), store.simulationParameters);
      store.recordAlert(forecast);
      return sendJson(res, 200, forecast);
    }
    if (req.method === "POST" && url.pathname === "/api/telemetry") return sendJson(res, 201, { reading: store.addReading(await getBody(req)) });
    if (req.method === "POST" && url.pathname === "/api/scenario") {
      const { name } = await getBody(req);
      return sendJson(res, 200, { readings: store.loadScenario(name), scenario: name });
    }
    if (req.method === "POST" && url.pathname === "/api/simulation") return sendJson(res, 200, { parameters: store.updateSimulationParameters(await getBody(req)) });
    if (req.method === "GET" && !url.pathname.startsWith("/api/")) return staticFile(res, url.pathname);
    sendJson(res, 404, { error: "Ruta no encontrada" });
  } catch (error) {
    sendJson(res, 400, { error: error.message });
  }
});

server.listen(port, () => console.log(`M-1 Digital Twin: http://localhost:${port}`));
