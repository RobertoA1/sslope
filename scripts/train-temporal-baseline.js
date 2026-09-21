import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { flatCsv, parseFlatCsv, TEST_PREDICTION_COLUMNS, trainTemporalBaseline } from "../src/core/temporal-baseline.js";

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argument = (name, fallback) => process.argv.slice(2).find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const inputPrefix = path.resolve(projectDir, argument("input-prefix", "data/generated/ta01-fem-500"));
const horizonHours = Number(argument("horizon", "1"));
const outputPath = path.resolve(projectDir, argument("output", `data/generated/ta01-baseline-${horizonHours}h.json`));
const splitManifestPath = `${inputPrefix}-split-manifest.json`;

const splitRows = {};
for (const name of ["train", "validation", "test"]) splitRows[name] = parseFlatCsv(await readFile(`${inputPrefix}-${name}.csv`, "utf8")).rows;
const splitManifest = JSON.parse(await readFile(splitManifestPath, "utf8"));
const startedAt = performance.now();
const baseline = trainTemporalBaseline(splitRows, { horizonHours });
const result = {
  id: `TA01-RIDGE-${horizonHours}H-${splitManifest.id}`,
  generatedAt: new Date().toISOString(),
  dataset: {
    sourceDatasetId: splitManifest.sourceDatasetId,
    splitManifest: path.relative(projectDir, splitManifestPath),
    splitMethod: splitManifest.method,
    leakageControl: splitManifest.leakageControl
  },
  ...baseline,
  elapsedSeconds: Number(((performance.now() - startedAt) / 1000).toFixed(3))
};
const predictionsPath = outputPath.replace(/\.json$/i, "-test-predictions.csv");
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, JSON.stringify({ ...result, testPredictions: undefined }, null, 2) + "\n", "utf8");
await writeFile(predictionsPath, flatCsv(TEST_PREDICTION_COLUMNS, baseline.testPredictions), "utf8");
console.log(JSON.stringify({
  result: path.relative(projectDir, outputPath),
  predictions: path.relative(projectDir, predictionsPath),
  horizonHours,
  selectedLambda: result.selectedLambda,
  validation: result.metrics.validation,
  test: result.metrics.test,
  elapsedSeconds: result.elapsedSeconds
}, null, 2));
