import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { parseFlatCsv } from "./core/temporal-baseline.js";
import { inferCenturyModels } from "./core/century-inference.js";

const root = new URL("../", import.meta.url);
const hash = (b) => createHash("sha256").update(b).digest("hex");
let cached;

export async function loadCenturyStudy() {
  if (cached) return cached;
  const [reportBytes, modelBytes, dailyBytes, sequenceBytes] = await Promise.all([
    "data/validation/century-real-data-evaluation.json", "data/models/century-prism-daily-lstm.json",
    "data/generated/century-prisms-daily.csv", "data/generated/century-sequences.json"
  ].map((p) => readFile(new URL(p, root))));
  const report = JSON.parse(reportBytes), model = JSON.parse(modelBytes), sequences = JSON.parse(sequenceBytes);
  if (hash(modelBytes) !== report.modelSha256 || hash(dailyBytes) !== report.preparedDailySha256 || hash(sequenceBytes) !== report.sequenceSha256) throw new Error("Artefactos Century desactualizados; vuelve a preparar y entrenar");
  const daily = parseFlatCsv(dailyBytes.toString("utf8")).rows.map((r) => ({ sensorId: r.sensorId, date: r.date,
    timestampLocal: r.timestampLocal, displacementMm: Number(r.displacementMm), readings: Number(r.dailyReadingCount),
    rainLag2Date: r.rainLag2Date, rainLag2Mm: r.rainLag2Mm === "" ? null : Number(r.rainLag2Mm), rainQuality: r.rainQuality }));
  cached = { report, model, daily, sequences, dailyBytes };
  return cached;
}

export async function serveCenturyStudy(res, url) {
  const study = await loadCenturyStudy();
  if (url.searchParams.get("download") === "daily") {
    res.writeHead(200, { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="century-prisms-daily.csv"' });
    res.end(study.dailyBytes); return;
  }
  if (url.searchParams.get("download") === "report") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": 'attachment; filename="century-real-data-evaluation.json"' });
    res.end(JSON.stringify(study.report)); return;
  }
  const sensors = [...new Set(study.daily.map((r) => r.sensorId))].sort();
  const sensor = url.searchParams.get("sensor") || study.report.testBySensor[0].sensorId;
  if (!sensors.includes(sensor)) {
    res.writeHead(400, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "Prisma Century desconocido" })); return;
  }
  const { predictionPairs, ...summary } = study.report;
  const pairs = predictionPairs.filter((p) => p.sensorId === sensor);
  const dates = [...study.sequences.sets.validation, ...study.sequences.sets.test].filter((s) => s.sensorId === sensor);
  const requestedOrigin = url.searchParams.get("origin");
  const sample = requestedOrigin ? dates.find((s) => s.originDate === requestedOrigin) : dates.at(-1);
  if (requestedOrigin && !sample) {
    res.writeHead(400, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "No existe una ventana válida en esa fecha" })); return;
  }
  const retrospectiveForecast = sample ? { originDate: sample.originDate, targetDate: sample.targetDate,
    actualIntervalHours: sample.actualIntervalHours, currentMm: sample.currentMm, observedTargetMm: sample.targetMm,
    predictions: inferCenturyModels(study.model, sample), mode: "RETROSPECTIVE_REPLAY", operationalDecisionAllowed: false } : null;
  res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify({ ...summary, sensors, selectedSensor: sensor, series: study.daily.filter((r) => r.sensorId === sensor), pairs, retrospectiveForecast }));
}
