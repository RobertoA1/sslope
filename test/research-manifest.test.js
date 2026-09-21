import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseFlatCsv } from "../src/core/temporal-baseline.js";
import { summarizeValidationSelection } from "../src/core/model-selection.js";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test("el manifiesto suplementario coincide con sus fuentes versionadas", async () => {
  const manifest = JSON.parse(await readFile(path.join(root, "data/validation/ta01-replication-manifest.json"), "utf8"));
  const femValidation = JSON.parse(await readFile(path.join(root, "data/validation/ta01-fem-mesh-sensitivity.json"), "utf8"));
  assert.equal(femValidation.analyticalBiotPressureBenchmark.passed, true);
  assert.ok(femValidation.analyticalBiotPressureBenchmark.maximumAbsoluteDisplacementErrorM < 1e-7);
  for (const required of [
    "data/rainfall/pasco-nasa-power-2020-2025.csv",
    "data/generated/ta01-fem-500.csv",
    "data/generated/ta01-fem-500-manifest.json",
    "data/generated/ta01-fem-500-split-manifest.json",
    "data/generated/ta01-fem-500-validation.csv",
    "data/generated/ta01-fem-500-chronological-split-manifest.json",
    "data/generated/ta01-fem-500-chronological-test.csv",
    "data/generated/ta01-fem-500-backtest-2024-split-manifest.json",
    "data/generated/ta01-fem-500-backtest-2024-test.csv",
    "data/models/ta01-backtest-2024-physics-guided-1h.json",
    "data/models/ta01-backtest-2024-physics-guided-6h.json",
    "data/models/ta01-chronological-physics-guided-1h.json",
    "data/models/ta01-chronological-physics-guided-6h.json",
    "scripts/split-fem-chronological.js",
    "data/models/ta01-lstm-1h.json",
    "data/models/ta01-physics-guided-6h.json",
    "src/core/temporal-baseline.js",
    "src/core/model-selection.js",
    "scripts/train-lstm.py",
    "scripts/generate-research-summary.js",
    "data/validation/ta01-fem-mesh-sensitivity.json",
    "data/generated/ta01-spatial-equilibrium-benchmark.json",
    "data/models/ta01-spatial-pinn.json",
    "data/validation/ta01-spatial-pinn-validation.json",
    "data/validation/external-ssrm-griffiths-lane.json",
    "data/validation/ta01-external-ssrm-input.json",
    "data/validation/ta01-external-ssrm.json",
    "data/validation/ta01-external-ssrm-mesh-sensitivity.json",
    "data/validation/ta01-transient-seep.json",
    "data/validation/ta01-transient-seep-mesh-sensitivity.json",
    "data/validation/ta01-transient-seep-field-sensitivity.json",
    "data/validation/ta01-transient-seep-field-6m.json",
    "data/validation/ta01-rainfall-external-ssrm.json"
  ]) assert.ok(manifest.sources[required], `Falta procedencia de ${required}`);
  for (const [relative, record] of Object.entries(manifest.sources)) {
    const content = await readFile(path.join(root, relative));
    assert.equal(createHash("sha256").update(content).digest("hex"), record.sha256, `SHA-256 desactualizado: ${relative}`);
  }
  assert.ok(manifest.outputs.includes("data/validation/ta01-chronological-model-comparison.csv"));
  assert.ok(manifest.outputs.includes("data/validation/ta01-chronological-bootstrap.json"));
  assert.ok(manifest.outputs.includes("data/validation/ta01-chronological-stratified.csv"));
  assert.ok(manifest.outputs.includes("data/validation/ta01-rolling-origin-model-comparison.csv"));
  assert.ok(manifest.outputs.includes("data/validation/ta01-rolling-origin-bootstrap.json"));
  assert.ok(manifest.outputs.includes("data/validation/ta01-rolling-model-selection.csv"));
});

test("el origen temporal 2024 excluye 2025 y sus métricas coinciden con los modelos", async () => {
  const split = JSON.parse(await readFile(path.join(root, "data/generated/ta01-fem-500-backtest-2024-split-manifest.json"), "utf8"));
  assert.deepEqual(split.cutoffs, { validationFrom: "2023-01-01", testFrom: "2024-01-01", testBefore: "2025-01-01" });
  assert.deepEqual(["train", "validation", "test"].map((name) => split.summaries[name].scenarioCount), [258, 82, 82]);
  assert.equal(split.excludedScenarioIds.length, 78);
  const membership = new Map();
  for (const [name, year] of [["train", null], ["validation", "2023"], ["test", "2024"]]) {
    const rows = parseFlatCsv(await readFile(path.join(root, `data/generated/ta01-fem-500-backtest-2024-${name}.csv`), "utf8")).rows;
    for (const row of rows) {
      assert.ok(year ? row.source_date.startsWith(year) : row.source_date < "2023-01-01");
      if (membership.has(row.source_date)) assert.equal(membership.get(row.source_date), name);
      membership.set(row.source_date, name);
    }
  }
  assert.ok([...membership.keys()].every((date) => date < "2025-01-01"));
  const table = parseFlatCsv(await readFile(path.join(root, "data/validation/ta01-rolling-origin-model-comparison.csv"), "utf8")).rows;
  const selections = parseFlatCsv(await readFile(path.join(root, "data/validation/ta01-rolling-model-selection.csv"), "utf8")).rows;
  const bootstrap = JSON.parse(await readFile(path.join(root, "data/validation/ta01-rolling-origin-bootstrap.json"), "utf8"));
  for (const horizon of [1, 6]) {
    const artifact = JSON.parse(await readFile(path.join(root, `data/models/ta01-backtest-2024-physics-guided-${horizon}h.json`), "utf8"));
    assert.equal(artifact.dataset.splitManifest, "data/generated/ta01-fem-500-backtest-2024-split-manifest.json");
    for (const [model, key] of Object.entries({ PERSISTENCE: "persistence", RIDGE: "ridgeComparable", LSTM: "lstm", HYBRID_PHYSICS_GUIDED: "pinn" })) {
      const row = table.find((item) => Number(item.test_year) === 2024 && Number(item.horizon_hours) === horizon && item.model === model);
      assert.ok(row, `Falta 2024/${horizon}h/${model}`);
      assert.equal(Number(row.mae_mm), artifact.metrics.test[key].maeMm);
      assert.equal(Number(row.sample_count), artifact.metrics.test[key].sampleCount);
    }
    const interval = bootstrap.comparisons.find((item) => item.testYear === 2024 && item.horizonHours === horizon);
    assert.equal(interval.dateBlockCount, split.sourceDateCounts.test);
    assert.equal(interval.sampleCount, artifact.metrics.test.pinn.sampleCount);
    const selection = summarizeValidationSelection(artifact, 2024, horizon);
    const selectionRow = selections.find((item) => Number(item.testYear) === 2024 && Number(item.horizonHours) === horizon);
    assert.ok(selectionRow);
    assert.equal(selectionRow.selectedOnValidation, selection.selectedOnValidation);
    assert.equal(selectionRow.bestOnTest, selection.bestOnTest);
    assert.equal(Number(selectionRow.selectionRegretMm), selection.selectionRegretMm);
  }
  assert.equal(selections.filter((row) => row.selectionMatchesTest === "false").length, 3);
});

test("la evaluación cronológica reserva 2024 para validación y 2025 para prueba", async () => {
  const split = JSON.parse(await readFile(path.join(root, "data/generated/ta01-fem-500-chronological-split-manifest.json"), "utf8"));
  assert.equal(split.method, "SOURCE_DATE_CHRONOLOGICAL_HOLDOUT");
  const seenDates = new Set();
  const seenScenarios = new Set();
  for (const [name, expectedYear] of [["train", null], ["validation", "2024"], ["test", "2025"]]) {
    const rows = parseFlatCsv(await readFile(path.join(root, `data/generated/ta01-fem-500-chronological-${name}.csv`), "utf8")).rows;
    const dates = new Set(rows.map((row) => row.source_date));
    const scenarios = new Set(rows.map((row) => row.scenario_id));
    assert.equal(dates.size, split.sourceDateCounts[name]);
    assert.equal(scenarios.size, split.summaries[name].scenarioCount);
    for (const date of dates) {
      assert.ok(!seenDates.has(date), `La fecha ${date} cruza particiones`);
      assert.ok(expectedYear ? date.startsWith(expectedYear) : date < "2024-01-01", `Fecha fuera de periodo: ${date}`);
      seenDates.add(date);
    }
    for (const id of scenarios) {
      assert.ok(!seenScenarios.has(id), `El escenario ${id} cruza particiones`);
      seenScenarios.add(id);
    }
  }
  assert.deepEqual(["train", "validation", "test"].map((name) => split.summaries[name].scenarioCount), [340, 82, 78]);
  const table = parseFlatCsv(await readFile(path.join(root, "data/validation/ta01-chronological-model-comparison.csv"), "utf8")).rows;
  const stratified = parseFlatCsv(await readFile(path.join(root, "data/validation/ta01-chronological-stratified.csv"), "utf8")).rows;
  const bootstrap = JSON.parse(await readFile(path.join(root, "data/validation/ta01-chronological-bootstrap.json"), "utf8"));
  assert.equal(bootstrap.method, "PAIRED_SOURCE_DATE_BLOCK_BOOTSTRAP");
  for (const horizon of [1, 6]) {
    const artifact = JSON.parse(await readFile(path.join(root, `data/models/ta01-chronological-physics-guided-${horizon}h.json`), "utf8"));
    assert.equal(artifact.dataset.splitManifest, "data/generated/ta01-fem-500-chronological-split-manifest.json");
    const comparison = bootstrap.comparisons.find((item) => item.horizonHours === horizon);
    assert.equal(comparison.dateBlockCount, split.sourceDateCounts.test);
    assert.equal(comparison.sampleCount, artifact.metrics.test.pinn.sampleCount);
    assert.ok(comparison.confidenceInterval95Mm[0] <= comparison.observedDifferenceMm);
    assert.ok(comparison.confidenceInterval95Mm[1] >= comparison.observedDifferenceMm);
    for (const [model, key] of Object.entries({ PERSISTENCE: "persistence", RIDGE: "ridgeComparable", LSTM: "lstm", HYBRID_PHYSICS_GUIDED: "pinn" })) {
      const row = table.find((item) => Number(item.horizon_hours) === horizon && item.model === model);
      assert.ok(row, `Falta ${model} a ${horizon} h`);
      assert.equal(Number(row.sample_count), artifact.metrics.test[key].sampleCount);
      assert.equal(Number(row.mae_mm), artifact.metrics.test[key].maeMm);
      assert.equal(Number(row.rmse_mm), artifact.metrics.test[key].rmseMm);
      const groups = stratified.filter((item) => Number(item.horizon_hours) === horizon && item.model === model);
      const rainfallBins = groups.filter((item) => item.segment.startsWith("RAIN_"));
      const targetBins = groups.filter((item) => item.segment.startsWith("TARGET_"));
      assert.equal(rainfallBins.reduce((sum, item) => sum + Number(item.sample_count), 0), Number(row.sample_count));
      assert.equal(targetBins.reduce((sum, item) => sum + Number(item.sample_count), 0), Number(row.sample_count));
    }
    const highRain = stratified.find((item) => Number(item.horizon_hours) === horizon && item.model === "HYBRID_PHYSICS_GUIDED" && item.segment === "RAIN_HIGH_GE_5");
    assert.equal(Number(highRain.scenario_count), 3);
    assert.equal(Number(highRain.source_date_count), 3);
  }
});

test("las fechas de lluvia del conjunto TA-01 no cruzan particiones", async () => {
  const split = JSON.parse(await readFile(path.join(root, "data/generated/ta01-fem-500-split-manifest.json"), "utf8"));
  assert.equal(split.method, "SOURCE_DATE_GROUP_SPLIT_WITH_EXTREME_EVENT_HOLDOUT");
  const seen = new Map();
  for (const name of ["train", "validation", "test"]) {
    const rows = parseFlatCsv(await readFile(path.join(root, `data/generated/ta01-fem-500-${name}.csv`), "utf8")).rows;
    const dates = new Set(rows.map((row) => row.source_date));
    assert.equal(dates.size, split.sourceDateCounts[name]);
    for (const date of dates) {
      assert.ok(!seen.has(date), `La fecha ${date} cruza ${seen.get(date)} y ${name}`);
      seen.set(date, name);
    }
  }
  assert.ok(seen.has(split.reservedExtremeEvents.test.sourceDate));
});
