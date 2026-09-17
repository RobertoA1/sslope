import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildTa01IncrementalEquilibrium } from "../src/core/fem-2d.js";
import { parseNasaPowerDailyCsv, rainfallRecordForDate } from "../src/core/rainfall-history.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const date = "2021-01-14";
const dataset = parseNasaPowerDailyCsv(await readFile(path.join(root, "data", "rainfall", "pasco-nasa-power-2020-2025.csv"), "utf8"));
const rain = rainfallRecordForDate(dataset, date);
const benchmark = buildTa01IncrementalEquilibrium({ meshX: 30, meshY: 20 }, rain.rainfallMmDay);
benchmark.provenance = {
  rainfallSource: dataset.metadata.id,
  rainfallSourceDate: date,
  dailyRainfallMm: rain.rainfallMmDay,
  geometryAndMaterials: "TA01_ASSUMED_NOT_FIELD_MEASURED",
  mechanicalResponse: "FEM2D_CST_PLANE_STRAIN_V1"
};
const output = path.join(root, "data", "generated", "ta01-spatial-equilibrium-benchmark.json");
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, JSON.stringify(benchmark) + "\n");
console.log(JSON.stringify({ output: path.relative(root, output), nodeCount: benchmark.mesh.nodes.length, freeDofs: benchmark.system.freeDofs.length, pcgRelativeResidual: benchmark.system.pcgRelativeResidual }));
