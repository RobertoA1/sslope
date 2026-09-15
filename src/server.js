import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createForecast } from "./core/forecast-engine.js";
import { parseNasaPowerDailyCsv } from "./core/rainfall-history.js";
import { TwinStore } from "./store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "..", "public");
const threeDir = path.join(__dirname, "..", "node_modules", "three");
const rainfallDataPath = path.join(__dirname, "..", "data", "rainfall", "pasco-nasa-power-2020-2025.csv");
const generatedDataDir = path.join(__dirname, "..", "data", "generated");
const rainfallDataset = parseNasaPowerDailyCsv(await readFile(rainfallDataPath, "utf8"));
const store = new TwinStore({ rainfallDataset });
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
  const isThreeAsset = requestPath.startsWith("/vendor/three/");
  const root = isThreeAsset ? threeDir : publicDir;
  const requested = requestPath === "/" ? "/index.html" : isThreeAsset ? requestPath.slice("/vendor/three".length) : requestPath;
  const resolved = path.resolve(root, `.${requested}`);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) return sendJson(res, 403, { error: "Ruta no permitida" });
  try {
    const content = await readFile(resolved);
    const type = resolved.endsWith(".css") ? "text/css" : resolved.endsWith(".js") ? "text/javascript" : resolved.endsWith(".json") ? "application/json" : resolved.endsWith(".csv") ? "text/csv" : resolved.endsWith(".dxf") ? "application/dxf" : "text/html";
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
    if (req.method === "GET" && url.pathname === "/api/twin") return sendJson(res, 200, store.getTwinStatus());
    if (req.method === "GET" && url.pathname === "/api/simulation") return sendJson(res, 200, { parameters: store.simulationParameters });
    if (req.method === "GET" && url.pathname === "/api/research") return sendJson(res, 200, store.getResearchStatus());
    if (req.method === "GET" && url.pathname === "/api/research/baseline") {
      const horizon = Number(url.searchParams.get("horizon") || 1);
      if (![1, 6].includes(horizon)) throw new Error("La línea base disponible admite horizontes de 1 o 6 horas");
      const result = JSON.parse(await readFile(path.join(generatedDataDir, `ta01-baseline-${horizon}h.json`), "utf8"));
      return sendJson(res, 200, result);
    }
    if (req.method === "GET" && url.pathname === "/api/research/lstm") {
      const horizon = Number(url.searchParams.get("horizon") || 1);
      if (![1, 6].includes(horizon)) throw new Error("La LSTM disponible admite horizontes de 1 o 6 horas");
      const result = JSON.parse(await readFile(path.join(generatedDataDir, "..", "models", `ta01-lstm-${horizon}h.json`), "utf8"));
      const { model, history, ...summary } = result;
      return sendJson(res, 200, { ...summary, modelAvailable: Boolean(model?.weights), recentTrainingHistory: history.slice(-10) });
    }
    if (req.method === "GET" && url.pathname === "/api/fem/status") return sendJson(res, 200, store.getFemStatus());
    if (req.method === "GET" && url.pathname === "/api/rainfall-history") return sendJson(res, 200, store.getRainfallHistory());
    if (req.method === "GET" && url.pathname === "/api/forecast") {
      const forecast = createForecast(store.getReadings(120), Number(url.searchParams.get("horizon") || 24), store.simulationParameters, store.riskPolicy);
      store.recordAlert(forecast);
      return sendJson(res, 200, forecast);
    }
    if (req.method === "POST" && url.pathname === "/api/telemetry") return sendJson(res, 201, { reading: store.addReading(await getBody(req)) });
    if (req.method === "POST" && url.pathname === "/api/scenario") {
      const { name } = await getBody(req);
      return sendJson(res, 200, { readings: store.loadScenario(name), scenario: name });
    }
    if (req.method === "POST" && url.pathname === "/api/weather-event") return sendJson(res, 201, store.simulateRainfall(await getBody(req)));
    if (req.method === "POST" && url.pathname === "/api/weather-event/historical") return sendJson(res, 201, store.simulateHistoricalRainfall(await getBody(req)));
    if (req.method === "POST" && url.pathname === "/api/research/ablation") return sendJson(res, 201, store.runResearchAblation(await getBody(req)));
    if (req.method === "POST" && url.pathname === "/api/fem/run") return sendJson(res, 201, store.runFemCase(await getBody(req)));
    if (req.method === "POST" && url.pathname === "/api/simulation") return sendJson(res, 200, { parameters: store.updateSimulationParameters(await getBody(req)) });
    if (req.method === "POST" && url.pathname === "/api/risk-policy") return sendJson(res, 200, { policy: store.updateRiskPolicy(await getBody(req)) });
    if (req.method === "POST" && url.pathname === "/api/geometry") return sendJson(res, 201, { geometry: store.registerGeometry(await getBody(req)) });
    if (req.method === "GET" && !url.pathname.startsWith("/api/")) return staticFile(res, url.pathname);
    sendJson(res, 404, { error: "Ruta no encontrada" });
  } catch (error) {
    sendJson(res, 400, { error: error.message });
  }
});

server.listen(port, () => console.log(`M-1 Digital Twin: http://localhost:${port}`));
