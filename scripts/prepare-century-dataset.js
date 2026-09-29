import { readFile, writeFile, mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { CENTURY_SOURCE, parseCenturyPrisms, parseCenturyRain, prepareCenturyDaily, buildCenturySequences } from "../src/core/century-dataset.js";
import { flatCsv, parseFlatCsv } from "../src/core/temporal-baseline.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const archive = path.join(root, "data/external/century-mine/Data.zip");
const bytes = await readFile(archive);
const hash = (data, algorithm = "sha256") => createHash(algorithm).update(data).digest("hex");
if (hash(bytes, "md5") !== CENTURY_SOURCE.archiveMd5 || hash(bytes) !== CENTURY_SOURCE.archiveSha256) throw new Error("El archivo Century no coincide con el original verificado");
const sourceFiles = [];
const member = (name) => {
  const data = execFileSync("unzip", ["-p", archive, name], { maxBuffer: 20000000 });
  sourceFiles.push({ name, bytes: data.length, sha256: hash(data) });
  return data.toString("utf8");
};
const prisms = parseCenturyPrisms(member(CENTURY_SOURCE.deformationFile));
const rain = [2013, 2014].flatMap((year) => parseCenturyRain(member(`weather-data/IDCJAC0009_029167_${year}_Data.csv`)));
const southwest = member("radar-deformation-data/South_West_Corner_06082014.csv");
const southwestRows = parseFlatCsv(southwest.slice(southwest.indexOf("Prism,Date"))).rows;
const velocityText = member("velocity-change-measurements/mean-velocity-changes.txt");
const events = parseFlatCsv(member("seismic-event-data/events-and-blasts.csv")).rows;
const prepared = prepareCenturyDaily(prisms, rain);
const sequences = buildCenturySequences(prepared.rows);
const warnings = [
  "Caso Century independiente: no valida Cerro de Pasco ni TA-01.",
  "Se usan prismas 3D, no radar LOS. No son un campo de deformación FEM.",
  "No hay presión de poros ni propiedades suficientes para calibrar el híbrido FEM–LSTM.",
  "Fechas/horas de prismas conservadas sin zona horaria confirmada; no se etiquetan UTC.",
  "Última lectura por día y sensor; días ausentes no se interpolan. Objetivo: lectura del día siguiente, no 24 h exactas.",
  "Lluvia BOM con desfase conservador de dos fechas y períodos de un día. No se usa lluvia futura observada.",
  "La bandera de calidad BOM se conserva; no se presume que todas las lecturas están verificadas.",
  "Los sensores comparten sitio y fechas: las ventanas no son experimentos independientes.",
  "El archivo principal termina antes del inicio de falla del 23/02/2014. No evalúa detección de falla ni alertas.",
  "El archivo South_West y la sismología se inventarían, pero no se mezclan con este primer entrenamiento."
];
const manifest = { source: CENTURY_SOURCE, scientificStatus: "OBSERVACIONES_REALES_EVALUACION_RETROSPECTIVA_NO_OPERACIONAL", warnings,
  audit: prepared.audit, sourceFiles,
  otherFiles: { southwestPrismReadings: southwestRows.length, southwestSensorCount: new Set(southwestRows.map((r) => r.Prism)).size,
    seismicEventCount: events.length, velocityChangeCount: velocityText.trim().split(/\r?\n/).length - 1, rainfallDayCount: rain.length },
  protocol: { dailyReduction: "Última lectura real de cada sensor/fecha", target: "Magnitud 3D publicada (mm), referencia declarada desde 20 de noviembre",
    rainfallLagDays: 2, lookbackDays: sequences.lookbackDays, features: sequences.features, cutoffs: sequences.cutoffs,
    sequenceCounts: Object.fromEntries(Object.entries(sequences.sets).map(([k, v]) => [k, v.length])), exclusions: sequences.exclusions,
    horizon: "Siguiente fecha con observación; solo días consecutivos; intervalo horario variable", operationalDecisionAllowed: false,
    ta01WeightsApplied: false, missingPorePressureImputed: false } };
const out = path.join(root, "data/generated");
await mkdir(out, { recursive: true });
const dailyCsv = flatCsv(Object.keys(prepared.rows[0]), prepared.rows);
await writeFile(path.join(out, "century-prisms-daily.csv"), dailyCsv);
await writeFile(path.join(out, "century-sequences.json"), JSON.stringify(sequences));
manifest.preparedDailySha256 = hash(dailyCsv);
manifest.sequenceSha256 = hash(JSON.stringify(sequences));
await writeFile(path.join(out, "century-dataset-manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(JSON.stringify({ audit: manifest.audit, otherFiles: manifest.otherFiles, protocol: manifest.protocol }, null, 2));
