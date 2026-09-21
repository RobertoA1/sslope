import http from "node:http";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createForecast } from "./core/forecast-engine.js";
import { summarizeValidationSelection } from "./core/model-selection.js";
import { predictTa01SpatialRainfall } from "./core/ta01-spatial-inference.js";
import { parseNasaPowerDailyCsv } from "./core/rainfall-history.js";
import { OperationalRepository } from "./persistence.js";
import { TwinStore } from "./store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "..", "public");
const threeDir = path.join(__dirname, "..", "node_modules", "three");
const rainfallDataPath = path.join(__dirname, "..", "data", "rainfall", "pasco-nasa-power-2020-2025.csv");
const generatedDataDir = path.join(__dirname, "..", "data", "generated");
const modelDataDir = path.join(__dirname, "..", "data", "models");
const validationDataDir = path.join(__dirname, "..", "data", "validation");
const rainfallDataset = parseNasaPowerDailyCsv(await readFile(rainfallDataPath, "utf8"));
const lstmModels = {};
const physicsGuidedModels = {};
let spatialPinnValidation = null;
let spatialPinnArtifact = null;
let ta01SpatialPinnValidation = null;
let ta01SpatialPinnArtifact = null;
let ta01SpatialBenchmark = null;
let externalSsrValidation = null;
let ta01ExternalSsr = null;
let ta01ExternalSsrMesh = null;
let ta01TransientSeep = null;
let ta01TransientSeepMesh = null;
let ta01TransientSeepField = null;
let ta01RainfallExternalSsr = null;
let ta01WetScenario = null;
for (const horizon of [1, 6]) {
  try {
    lstmModels[horizon] = JSON.parse(await readFile(path.join(modelDataDir, `ta01-lstm-${horizon}h.json`), "utf8"));
  } catch (error) {
    console.warn(`LSTM ${horizon} h no disponible: ${error.message}`);
  }
  try {
    physicsGuidedModels[horizon] = JSON.parse(await readFile(path.join(modelDataDir, `ta01-physics-guided-${horizon}h.json`), "utf8"));
  } catch (error) {
    console.warn(`Corrector físico ${horizon} h no disponible: ${error.message}`);
  }
}
try {
  spatialPinnValidation = JSON.parse(await readFile(path.join(validationDataDir, "spatial-pinn-manufactured-elasticity.json"), "utf8"));
  spatialPinnArtifact = JSON.parse(await readFile(path.join(modelDataDir, "spatial-pinn-manufactured-elasticity.json"), "utf8"));
} catch (error) {
  console.warn(`Benchmark PINN espacial no disponible: ${error.message}`);
}
try {
  ta01SpatialPinnValidation = JSON.parse(await readFile(path.join(validationDataDir, "ta01-spatial-pinn-validation.json"), "utf8"));
  ta01SpatialPinnArtifact = JSON.parse(await readFile(path.join(modelDataDir, "ta01-spatial-pinn.json"), "utf8"));
  const benchmarkBytes = await readFile(path.join(generatedDataDir, "ta01-spatial-equilibrium-benchmark.json"));
  if (createHash("sha256").update(benchmarkBytes).digest("hex") !== ta01SpatialPinnArtifact.benchmark.sha256) {
    throw new Error("El SHA-256 del benchmark no coincide con el modelo entrenado");
  }
  ta01SpatialBenchmark = JSON.parse(benchmarkBytes.toString("utf8"));
} catch (error) {
  console.warn(`Modelo espacial TA-01 no disponible: ${error.message}`);
  ta01SpatialPinnArtifact = null;
  ta01SpatialBenchmark = null;
}
try {
  externalSsrValidation = JSON.parse(await readFile(path.join(validationDataDir, "external-ssrm-griffiths-lane.json"), "utf8"));
} catch (error) {
  console.warn(`Benchmark SSRM externo no disponible: ${error.message}`);
}
try {
  const inputBytes = await readFile(path.join(validationDataDir, "ta01-external-ssrm-input.json"));
  const report = JSON.parse(await readFile(path.join(validationDataDir, "ta01-external-ssrm.json"), "utf8"));
  if (createHash("sha256").update(inputBytes).digest("hex") !== report.source.inputSha256) throw new Error("SHA-256 del insumo TA-01 SSRM no coincide");
  ta01ExternalSsr = report;
  const meshReport = JSON.parse(await readFile(path.join(validationDataDir, "ta01-external-ssrm-mesh-sensitivity.json"), "utf8"));
  if (meshReport.inputSha256 !== report.source.inputSha256) throw new Error("La sensibilidad SSRM no coincide con el insumo TA-01");
  ta01ExternalSsrMesh = meshReport;
} catch (error) {
  console.warn(`SSRM externo TA-01 no disponible: ${error.message}`);
  ta01ExternalSsr = null;
  ta01ExternalSsrMesh = null;
}
try {
  const inputBytes = await readFile(path.join(validationDataDir, "ta01-external-ssrm-input.json"));
  const report = JSON.parse(await readFile(path.join(validationDataDir, "ta01-transient-seep.json"), "utf8"));
  if (createHash("sha256").update(inputBytes).digest("hex") !== report.source.geometryInputSha256) throw new Error("SHA-256 geométrico del ensayo hidráulico no coincide");
  const balance = report.result.massBalance;
  const massScale = Math.max(Math.abs(balance.storedChangeM2), Math.abs(balance.cumulativeInflowM2));
  const directClosure = massScale < 1e-8 ? 0 : Math.abs(balance.storedChangeM2 - balance.cumulativeInflowM2) / massScale;
  if (!report.result.converged || Math.max(balance.finalClosureFraction, directClosure) > 0.05) throw new Error("El balance de masa del ensayo hidráulico no supera la puerta");
  const meshReport = JSON.parse(await readFile(path.join(validationDataDir, "ta01-transient-seep-mesh-sensitivity.json"), "utf8"));
  if (meshReport.geometryInputSha256 !== report.source.geometryInputSha256) throw new Error("La sensibilidad hidráulica no coincide con la geometría");
  const matchingRun = meshReport.runs.find((run) => run.meshSizeM === report.mesh.targetSizeM);
  const headChange48hM = report.result.frames.find((frame) => frame.hour === 48).observationHeadM - report.result.frames[0].observationHeadM;
  if (!matchingRun || Math.abs(matchingRun.headChange48hM - headChange48hM) > 1e-9) throw new Error("La sensibilidad hidráulica no coincide con el reporte canónico");
  const fieldReport = JSON.parse(await readFile(path.join(validationDataDir, "ta01-transient-seep-field-sensitivity.json"), "utf8"));
  if (fieldReport.geometryInputSha256 !== report.source.geometryInputSha256) throw new Error("El contraste de campos no coincide con la geometría");
  ta01TransientSeep = report;
  ta01TransientSeepMesh = meshReport;
  ta01TransientSeepField = fieldReport;
} catch (error) {
  console.warn(`Filtración transitoria TA-01 no disponible: ${error.message}`);
  ta01TransientSeep = null;
  ta01TransientSeepMesh = null;
  ta01TransientSeepField = null;
}
try {
  const geometryBytes = await readFile(path.join(validationDataDir, "ta01-external-ssrm-input.json"));
  const reportBytes = await readFile(path.join(validationDataDir, "ta01-rainfall-external-ssrm.json"));
  const seepSourceBytes = await readFile(path.join(validationDataDir, "ta01-transient-seep-field-6m.json"));
  const report = JSON.parse(reportBytes.toString("utf8"));
  const seepSource = JSON.parse(seepSourceBytes.toString("utf8"));
  const manifest = JSON.parse(await readFile(path.join(validationDataDir, "ta01-replication-manifest.json"), "utf8"));
  for (const [relative, content] of [["data/validation/ta01-rainfall-external-ssrm.json", reportBytes], ["data/validation/ta01-transient-seep-field-6m.json", seepSourceBytes]]) {
    if (manifest.sources?.[relative]?.sha256 !== createHash("sha256").update(content).digest("hex")) throw new Error(`SHA-256 del acoplamiento desactualizado: ${relative}`);
  }
  if (report.source.geometryInputSha256 !== createHash("sha256").update(geometryBytes).digest("hex") ||
      seepSource.source.geometryInputSha256 !== report.source.geometryInputSha256 ||
      seepSource.mesh.targetSizeM !== 6 || !seepSource.field) throw new Error("Fuentes del acoplamiento SSRM incompatibles");
  if (report.comparison.resolvedBeyondTolerance && report.comparison.finalIntervalsOverlap) throw new Error("Interpretación SSRM contradictoria");
  ta01RainfallExternalSsr = report;
} catch (error) {
  console.warn(`SSRM externo TA-01 con filtración no disponible: ${error.message}`);
}
try {
  const files = ["ta01-transient-seep-wet-scenario-6m.json", "ta01-transient-seep-wet-scenario-field-sensitivity.json", "ta01-transient-seep-wet-scenario-fine-time-mesh-sensitivity.json", "ta01-transient-seep-wet-scenario-time-sensitivity.json", "ta01-wet-scenario-ssrm-pressure-mesh-sensitivity.json", "ta01-rainfall-wet-scenario-external-ssrm.json", "ta01-rainfall-wet-scenario-external-ssrm-mesh10.json", "ta01-rainfall-wet-scenario-external-ssrm-mesh6.json", "ta01-rainfall-wet-scenario-ssrm-mesh-sensitivity.json"];
  const bytes = await Promise.all(files.map((name) => readFile(path.join(validationDataDir, name))));
  const manifest = JSON.parse(await readFile(path.join(validationDataDir, "ta01-replication-manifest.json"), "utf8"));
  files.forEach((name, index) => {
    const relative = `data/validation/${name}`;
    if (manifest.sources?.[relative]?.sha256 !== createHash("sha256").update(bytes[index]).digest("hex")) throw new Error(`SHA-256 del escenario húmedo desactualizado: ${name}`);
  });
  const [seep, meshStudy, meshStudyFineTime, timeStudy, projectedPressure, stability, stability10, stability6, stabilityMeshStudy] = bytes.map((content) => JSON.parse(content.toString("utf8")));
  const geometryBytes = await readFile(path.join(validationDataDir, "ta01-external-ssrm-input.json"));
  const geometryHash = createHash("sha256").update(geometryBytes).digest("hex");
  if (seep.source.geometryInputSha256 !== geometryHash || meshStudy.geometryInputSha256 !== geometryHash || meshStudyFineTime.geometryInputSha256 !== geometryHash || timeStudy.geometryInputSha256 !== geometryHash || projectedPressure.geometryInputSha256 !== geometryHash || stability.source.geometryInputSha256 !== geometryHash) throw new Error("Geometría inconsistente en escenario húmedo");
  if (meshStudy.runs.find((run) => run.meshSizeM === 6)?.sourceFieldSha256 !== stability.source.seepFieldSha256) throw new Error("El SSRM no corresponde al campo hidráulico comparado");
  if (timeStudy.runs.find((run) => run.maximumTimeStepHours === seep.solver.maximumTimeStepHours)?.sourceFieldSha256 !== stability.source.seepFieldSha256 || JSON.stringify(timeStudy.hydraulicScenario) !== JSON.stringify(seep.assumptions)) throw new Error("La sensibilidad temporal no corresponde al escenario hidráulico");
  if (meshStudyFineTime.maximumTimeStepHours !== 0.1 || meshStudyFineTime.runs.find((run) => run.meshSizeM === 6)?.sourceFieldSha256 !== timeStudy.runs.find((run) => run.maximumTimeStepHours === 0.1)?.sourceFieldSha256) throw new Error("La sensibilidad espacial refinada no corresponde al estudio temporal");
  if (projectedPressure.maximumTimeStepHours !== 0.1 || projectedPressure.mechanicalMesh.nodeCount !== stability.projection.nodeCount || projectedPressure.runs.some((run) => meshStudyFineTime.runs.find((item) => item.meshSizeM === run.hydraulicMeshSizeM)?.sourceFieldSha256 !== run.sourceFieldSha256)) throw new Error("La presión proyectada no corresponde a las mallas hidráulicas comparadas");
  if ([stability10, stability6, stabilityMeshStudy].some((report) => report.source.geometryInputSha256 !== geometryHash || report.source.seepFieldSha256 !== stability.source.seepFieldSha256)) throw new Error("La sensibilidad SSRM usa otra geometría o campo hidráulico");
  if ([stability10, stability, stability6].some((report) => {
    const row = stabilityMeshStudy.runs.find((item) => item.mechanicalMeshSizeM === report.projection.targetMeshSizeM);
    return !row || row.hour24FactorOfSafety !== report.results.hour24.factorOfSafety || row.baselineFactorOfSafety !== report.results.baseline.factorOfSafety;
  })) throw new Error("La sensibilidad SSRM no coincide con sus tres corridas");
  const balance = seep.result.massBalance;
  const scale = Math.max(Math.abs(balance.cumulativeInflowM2), Math.abs(balance.storedChangeM2), 1e-8);
  if (!seep.result.converged || Math.max(balance.finalClosureFraction, Math.abs(balance.cumulativeInflowM2 - balance.storedChangeM2) / scale) > 0.05) throw new Error("Balance de masa insuficiente en escenario húmedo");
  const { field, ...hydrology } = seep;
  ta01WetScenario = { hydrology, meshStudy, meshStudyFineTime, timeStudy, projectedPressure, stability, stabilityMeshStudy };
} catch (error) {
  console.warn(`Escenario húmedo TA-01 no disponible: ${error.message}`);
}
const repository = new OperationalRepository(path.join(__dirname, "..", "data", "local", "sslope.sqlite"));
const store = new TwinStore({ rainfallDataset, lstmModels, physicsGuidedModels, spatialPinnArtifact, ta01SpatialPinnArtifact, repository });
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "127.0.0.1";

const sendJson = (res, status, data) => {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
};

const getBody = (req) => new Promise((resolve, reject) => {
  let raw = "";
  let bytes = 0;
  let exceeded = false;
  req.on("data", (chunk) => {
    bytes += chunk.length;
    if (bytes > 8_000_000) {
      exceeded = true;
      raw = "";
      return;
    }
    raw += chunk;
  });
  req.on("end", () => {
    if (exceeded) return reject(new Error("Cuerpo demasiado grande; máximo 8 MB"));
    try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error("JSON inválido")); }
  });
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
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) return sendJson(res, 403, { error: "Host no permitido" });
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      return res.end();
    }
    if (req.method === "POST" && req.headers.origin) {
      let originHost;
      try { originHost = new URL(req.headers.origin).host; }
      catch { return sendJson(res, 403, { error: "Origen no permitido" }); }
      if (originHost !== req.headers.host) return sendJson(res, 403, { error: "Origen no permitido" });
    }
    if (req.method === "GET" && url.pathname === "/api/health") return sendJson(res, 200, { status: "ok", service: "M-1 Digital Twin", version: "0.1.0" });
    if (req.method === "GET" && url.pathname === "/api/telemetry") return sendJson(res, 200, { readings: store.getReadings(url.searchParams.get("limit"), url.searchParams.get("sensorId")) });
    if (req.method === "GET" && url.pathname === "/api/sensors") return sendJson(res, 200, { sensors: store.getSensors() });
    if (req.method === "GET" && url.pathname === "/api/alerts") return sendJson(res, 200, { alerts: store.alerts });
    if (req.method === "GET" && url.pathname === "/api/twin") return sendJson(res, 200, store.getTwinStatus(url.searchParams.get("sensorId")));
    if (req.method === "GET" && url.pathname === "/api/simulation") return sendJson(res, 200, { parameters: store.simulationParameters });
    if (req.method === "GET" && url.pathname === "/api/research") return sendJson(res, 200, store.getResearchStatus());
    if (req.method === "GET" && url.pathname === "/api/research/chronological") {
      const horizon = Number(url.searchParams.get("horizon") || 1);
      const testYear = Number(url.searchParams.get("testYear") || 2025);
      if (![1, 6].includes(horizon)) throw new Error("La evaluación cronológica admite horizontes de 1 o 6 horas");
      if (![2024, 2025].includes(testYear)) throw new Error("La evaluación cronológica disponible prueba 2024 o 2025");
      const prefix = testYear === 2024 ? "ta01-fem-500-backtest-2024" : "ta01-fem-500-chronological";
      const modelPrefix = testYear === 2024 ? "ta01-backtest-2024" : "ta01-chronological";
      const splitRelative = `data/generated/${prefix}-split-manifest.json`;
      const [split, artifact, bootstrap] = await Promise.all([
        readFile(path.join(generatedDataDir, `${prefix}-split-manifest.json`), "utf8").then(JSON.parse),
        readFile(path.join(modelDataDir, `${modelPrefix}-physics-guided-${horizon}h.json`), "utf8").then(JSON.parse),
        readFile(path.join(validationDataDir, "ta01-rolling-origin-bootstrap.json"), "utf8").then(JSON.parse)
      ]);
      if (artifact.dataset.splitManifest !== splitRelative) throw new Error("El modelo cronológico no corresponde a la partición mostrada");
      return sendJson(res, 200, {
        testYear,
        method: split.method,
        scientificStatus: split.scientificStatus,
        cutoffs: split.cutoffs,
        scenarioCounts: Object.fromEntries(["train", "validation", "test"].map((name) => [name, split.summaries[name].scenarioCount])),
        horizonHours: horizon,
        metrics: artifact.metrics.test,
        validationSelection: summarizeValidationSelection(artifact, testYear, horizon),
        pairedBootstrap: bootstrap.comparisons.find((item) => item.horizonHours === horizon && item.testYear === testYear)
      });
    }
    if (req.method === "GET" && url.pathname === "/api/persistence/status") return sendJson(res, 200, repository.status());
    if (req.method === "GET" && url.pathname === "/api/research/baseline") {
      const horizon = Number(url.searchParams.get("horizon") || 1);
      if (![1, 6].includes(horizon)) throw new Error("La línea base disponible admite horizontes de 1 o 6 horas");
      const result = JSON.parse(await readFile(path.join(generatedDataDir, `ta01-baseline-${horizon}h.json`), "utf8"));
      return sendJson(res, 200, result);
    }
    if (req.method === "GET" && url.pathname === "/api/research/lstm") {
      const horizon = Number(url.searchParams.get("horizon") || 1);
      if (![1, 6].includes(horizon)) throw new Error("La LSTM disponible admite horizontes de 1 o 6 horas");
      const result = lstmModels[horizon];
      if (!result) throw new Error(`No se cargó la LSTM de ${horizon} h`);
      const { model, history, ...summary } = result;
      return sendJson(res, 200, { ...summary, modelAvailable: Boolean(model?.weights), recentTrainingHistory: history.slice(-10) });
    }
    if (req.method === "GET" && url.pathname === "/api/research/physics-guided") {
      const horizon = Number(url.searchParams.get("horizon") || 1);
      if (![1, 6].includes(horizon)) throw new Error("El corrector físico disponible admite horizontes de 1 o 6 horas");
      const result = physicsGuidedModels[horizon];
      if (!result) throw new Error(`No se cargó el corrector físico de ${horizon} h`);
      const { model, history, ...summary } = result;
      return sendJson(res, 200, { ...summary, modelAvailable: Boolean(model?.weights), recentTrainingHistory: history.slice(-10) });
    }
    if (req.method === "GET" && url.pathname === "/api/research/robustness") {
      const result = JSON.parse(await readFile(path.join(validationDataDir, "ta01-model-robustness.json"), "utf8"));
      return sendJson(res, 200, result);
    }
    if (req.method === "GET" && url.pathname === "/api/research/fem-validation") {
      const result = JSON.parse(await readFile(path.join(validationDataDir, "ta01-fem-mesh-sensitivity.json"), "utf8"));
      return sendJson(res, 200, result);
    }
    if (req.method === "GET" && url.pathname === "/api/research/spatial-pinn-validation") {
      if (!spatialPinnValidation) throw new Error("No se cargó el benchmark PINN espacial");
      return sendJson(res, 200, spatialPinnValidation);
    }
    if (req.method === "GET" && url.pathname === "/api/research/ta01-spatial-pinn-validation") {
      if (!ta01SpatialPinnValidation) throw new Error("No se cargó la verificación espacial TA-01");
      return sendJson(res, 200, ta01SpatialPinnValidation);
    }
    if (req.method === "GET" && url.pathname === "/api/research/ta01-spatial-prediction") {
      if (!ta01SpatialPinnArtifact || !ta01SpatialBenchmark) throw new Error("No se cargó el modelo espacial TA-01");
      const rainfallMm = url.searchParams.get("rainfallMm") ?? ta01SpatialBenchmark.cumulativeRainfallMm;
      return sendJson(res, 200, predictTa01SpatialRainfall(ta01SpatialPinnArtifact, ta01SpatialBenchmark, rainfallMm));
    }
    if (req.method === "GET" && url.pathname === "/api/research/external-ssrm-validation") {
      if (!externalSsrValidation) throw new Error("No se cargó la validación SSRM externa");
      return sendJson(res, 200, externalSsrValidation);
    }
    if (req.method === "GET" && url.pathname === "/api/research/ta01-external-ssrm") {
      if (!ta01ExternalSsr) throw new Error("No se cargó el SSRM externo TA-01");
      return sendJson(res, 200, ta01ExternalSsr);
    }
    if (req.method === "GET" && url.pathname === "/api/research/ta01-external-ssrm-mesh") {
      if (!ta01ExternalSsrMesh) throw new Error("No se cargó la sensibilidad de malla SSRM externa TA-01");
      return sendJson(res, 200, ta01ExternalSsrMesh);
    }
    if (req.method === "GET" && url.pathname === "/api/research/ta01-transient-seep") {
      if (!ta01TransientSeep) throw new Error("No se cargó el ensayo hidráulico transitorio TA-01");
      return sendJson(res, 200, ta01TransientSeep);
    }
    if (req.method === "GET" && url.pathname === "/api/research/ta01-transient-seep-mesh") {
      if (!ta01TransientSeepMesh) throw new Error("No se cargó la sensibilidad hidráulica de malla TA-01");
      return sendJson(res, 200, ta01TransientSeepMesh);
    }
    if (req.method === "GET" && url.pathname === "/api/research/ta01-transient-seep-field") {
      if (!ta01TransientSeepField) throw new Error("No se cargó el contraste espacial de filtración TA-01");
      return sendJson(res, 200, ta01TransientSeepField);
    }
    if (req.method === "GET" && url.pathname === "/api/research/ta01-rainfall-external-ssrm") {
      if (!ta01RainfallExternalSsr) throw new Error("No se cargó el SSRM externo TA-01 con filtración");
      return sendJson(res, 200, ta01RainfallExternalSsr);
    }
    if (req.method === "GET" && url.pathname === "/api/research/ta01-wet-scenario") {
      if (!ta01WetScenario) throw new Error("No se cargó el escenario húmedo hipotético TA-01");
      return sendJson(res, 200, ta01WetScenario);
    }
    if (req.method === "GET" && url.pathname === "/api/fem/status") return sendJson(res, 200, store.getFemStatus());
    if (req.method === "GET" && url.pathname === "/api/rainfall-history") return sendJson(res, 200, store.getRainfallHistory());
    if (req.method === "GET" && url.pathname === "/api/forecast") {
      const sensorId = url.searchParams.get("sensorId");
      const readings = store.getReadings(120, sensorId);
      if (!readings.length) throw new Error(`No existen lecturas para el sensor ${sensorId}`);
      const forecast = createForecast(readings, Number(url.searchParams.get("horizon") || 24), store.simulationParameters, store.riskPolicy);
      store.recordAlert(forecast);
      return sendJson(res, 200, forecast);
    }
    if (req.method === "POST" && url.pathname === "/api/telemetry") return sendJson(res, 201, { reading: store.addReading(await getBody(req)) });
    if (req.method === "POST" && url.pathname === "/api/telemetry/bulk") {
      const { readings } = await getBody(req);
      const result = store.addReadings(readings);
      return sendJson(res, 201, {
        acceptedCount: result.acceptedCount,
        firstTimestamp: result.firstTimestamp,
        lastTimestamp: result.lastTimestamp,
        sensorIds: result.sensorIds
      });
    }
    if (req.method === "POST" && url.pathname === "/api/scenario") {
      const { name } = await getBody(req);
      return sendJson(res, 200, { readings: store.loadScenario(name), scenario: name });
    }
    if (req.method === "POST" && url.pathname === "/api/weather-event") return sendJson(res, 201, store.simulateRainfall(await getBody(req)));
    if (req.method === "POST" && url.pathname === "/api/weather-event/historical") return sendJson(res, 201, store.simulateHistoricalRainfall(await getBody(req)));
    if (req.method === "POST" && url.pathname === "/api/research/ablation") return sendJson(res, 201, store.runResearchAblation(await getBody(req)));
    if (req.method === "POST" && url.pathname === "/api/fem/run") return sendJson(res, 201, store.runFemCase(await getBody(req)));
    if (req.method === "POST" && url.pathname === "/api/fem/import") return sendJson(res, 201, store.importFemCase(await getBody(req)));
    if (req.method === "POST" && url.pathname === "/api/fem/lstm-forecast") return sendJson(res, 201, store.forecastFemWithLstm(await getBody(req)));
    if (req.method === "POST" && url.pathname === "/api/fem/physics-guided-forecast") return sendJson(res, 201, store.forecastFemWithPhysicsGuidance(await getBody(req)));
    if (req.method === "POST" && url.pathname === "/api/simulation") return sendJson(res, 200, { parameters: store.updateSimulationParameters(await getBody(req)) });
    if (req.method === "POST" && url.pathname === "/api/risk-policy") return sendJson(res, 200, { policy: store.updateRiskPolicy(await getBody(req)) });
    if (req.method === "POST" && url.pathname === "/api/geometry") return sendJson(res, 201, { geometry: store.registerGeometry(await getBody(req)) });
    if (req.method === "GET" && !url.pathname.startsWith("/api/")) return staticFile(res, url.pathname);
    sendJson(res, 404, { error: "Ruta no encontrada" });
  } catch (error) {
    sendJson(res, 400, { error: error.message });
  }
});

server.listen(port, host, () => console.log(`M-1 Digital Twin: http://${host}:${port}`));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => { repository.close(); process.exit(0); });
