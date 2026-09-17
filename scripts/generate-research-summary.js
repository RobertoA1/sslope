import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outputDir = path.join(projectDir, "data", "validation");
const source = (relative) => path.join(projectDir, relative);

const csv = (rows) => {
  if (!rows.length) return "";
  const columns = Object.keys(rows[0]);
  const cell = (value) => {
    const text = value == null ? "" : String(value);
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  return `${columns.join(",")}\n${rows.map((row) => columns.map((column) => cell(row[column])).join(",")).join("\n")}\n`;
};

const parseCsv = (text) => {
  const [header, ...lines] = text.trim().split(/\r?\n/);
  const columns = header.split(",");
  return lines.map((line) => Object.fromEntries(line.split(",").map((value, index) => [columns[index], value])));
};

const metricRow = (horizonHours, model, values) => ({
  horizon_hours: horizonHours,
  model,
  sample_count: values.sampleCount,
  mae_mm: values.maeMm,
  rmse_mm: values.rmseMm,
  bias_mm: values.biasMm,
  smape_percent: values.smapePercent,
  r2: values.r2
});

const classificationMetrics = (actual, predicted, threshold) => {
  let tp = 0, fp = 0, fn = 0, tn = 0;
  actual.forEach((value, index) => {
    const observed = value >= threshold;
    const forecast = predicted[index] >= threshold;
    if (observed && forecast) tp += 1;
    else if (!observed && forecast) fp += 1;
    else if (observed) fn += 1;
    else tn += 1;
  });
  const precision = tp / Math.max(1, tp + fp);
  const recall = tp / Math.max(1, tp + fn);
  return {
    true_positive: tp,
    false_positive: fp,
    false_negative: fn,
    true_negative: tn,
    precision: Number(precision.toFixed(6)),
    recall: Number(recall.toFixed(6)),
    f1: Number((2 * precision * recall / Math.max(Number.EPSILON, precision + recall)).toFixed(6)),
    false_alarm_rate: Number((fp / Math.max(1, fp + tn)).toFixed(6))
  };
};

const meanAnticipation = (rows, predictionColumn, threshold) => {
  const scenarios = Map.groupBy(rows, (row) => row.scenario_id);
  const values = [];
  for (const scenarioRows of scenarios.values()) {
    const observed = scenarioRows.find((row) => Number(row.actual_displacement_mm) >= threshold);
    const predicted = scenarioRows.find((row) => Number(row[predictionColumn]) >= threshold);
    if (observed && predicted) values.push(Number(observed.target_hour) - Number(predicted.target_hour));
  }
  return values.length ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(3)) : null;
};

const sha256 = async (relative) => createHash("sha256").update(await readFile(source(relative))).digest("hex");

await mkdir(outputDir, { recursive: true });
const trainRows = parseCsv(await readFile(source("data/generated/ta01-fem-500-train.csv"), "utf8"));
const trainingDisplacements = trainRows.map((row) => Number(row.rainfall_induced_max_displacement_mm)).sort((a, b) => a - b);
const thresholdIndex = Math.min(trainingDisplacements.length - 1, Math.ceil(trainingDisplacements.length * 0.95) - 1);
const displacementThresholdMm = trainingDisplacements[thresholdIndex];
const comparison = [];
const ablation = [];
const detection = [];
const sourceFiles = ["data/generated/ta01-fem-500-train.csv", "data/generated/ta01-fem-500-test.csv"];

for (const horizonHours of [1, 6]) {
  const modelRelative = `data/models/ta01-physics-guided-${horizonHours}h.json`;
  const predictionRelative = `data/generated/ta01-physics-guided-${horizonHours}h-test-predictions.csv`;
  sourceFiles.push(modelRelative, predictionRelative);
  const artifact = JSON.parse(await readFile(source(modelRelative), "utf8"));
  const test = artifact.metrics.test;
  comparison.push(
    metricRow(horizonHours, "PERSISTENCE", test.persistence),
    metricRow(horizonHours, "RIDGE", test.ridgeComparable),
    metricRow(horizonHours, "LSTM", test.lstm),
    metricRow(horizonHours, "HYBRID_PHYSICS_GUIDED", test.pinn)
  );
  ablation.push(...artifact.ablation.variants.map((variant) => ({
    horizon_hours: horizonHours,
    variant_id: variant.id,
    label: variant.label,
    components: variant.components,
    sample_count: variant.sampleCount,
    mae_mm: variant.maeMm,
    rmse_mm: variant.rmseMm,
    bias_mm: variant.biasMm,
    smape_percent: variant.smapePercent,
    r2: variant.r2
  })));
  const predictionRows = parseCsv(await readFile(source(predictionRelative), "utf8"));
  const actual = predictionRows.map((row) => Number(row.actual_displacement_mm));
  for (const [model, column] of Object.entries({
    PERSISTENCE: "persistence_prediction_mm",
    RIDGE: "ridge_prediction_mm",
    LSTM: "lstm_prediction_mm",
    HYBRID_PHYSICS_GUIDED: "physics_guided_prediction_mm"
  })) {
    const predicted = predictionRows.map((row) => Number(row[column]));
    detection.push({
      horizon_hours: horizonHours,
      model,
      threshold_mm: displacementThresholdMm,
      threshold_definition: "percentil_95_desplazamiento_entrenamiento",
      sample_count: actual.length,
      ...classificationMetrics(actual, predicted, displacementThresholdMm),
      mean_anticipation_hours: meanAnticipation(predictionRows, column, displacementThresholdMm)
    });
  }
}

const robustnessArtifact = JSON.parse(await readFile(source("data/validation/ta01-model-robustness.json"), "utf8"));
const robustness = robustnessArtifact.results.flatMap((result) => [
  ...result.conditions.flatMap((condition) => ["lstm", "hybrid"].map((model) => ({
    horizon_hours: result.horizonHours,
    segment: "PERTURBATION",
    condition: condition.id,
    model: model.toUpperCase(),
    sample_count: condition[model].sampleCount,
    mae_mm: condition[model].maeMm,
    rmse_mm: condition[model].rmseMm,
    mae_increase_percent: condition[model].maeIncreasePercent
  }))),
  ...result.seasonalBreakdown.flatMap((season) => ["lstm", "hybrid"].map((model) => ({
    horizon_hours: result.horizonHours,
    segment: "SEASON",
    condition: season.season,
    model: model.toUpperCase(),
    sample_count: season[model].sampleCount,
    mae_mm: season[model].maeMm,
    rmse_mm: season[model].rmseMm,
    mae_increase_percent: ""
  })))
]);

const meshArtifact = JSON.parse(await readFile(source("data/validation/ta01-fem-mesh-sensitivity.json"), "utf8"));
const mesh = meshArtifact.runs.map((run) => ({
  mesh_x: run.meshX,
  mesh_y: run.meshY,
  node_count: run.nodeCount,
  element_count: run.elementCount,
  maximum_rainfall_displacement_mm: run.maximumRainfallInducedDisplacementMm,
  maximum_pore_pressure_kpa: run.maximumPorePressureKpa,
  mohr_coulomb_safety_index: run.mohrCoulombSafetyIndex,
  solver_residual: run.maximumSolverResidual,
  elapsed_ms: run.elapsedMs,
  displacement_difference_against_48x32_percent: Number((run.relativeDifferenceAgainstFinest.displacement * 100).toFixed(3))
}));
const spatialArtifact = JSON.parse(await readFile(source("data/validation/spatial-pinn-manufactured-elasticity.json"), "utf8"));
const spatial = [{
  model_id: spatialArtifact.id,
  method: spatialArtifact.method,
  evaluation_point_count: spatialArtifact.verification.evaluationPointCount,
  maximum_displacement_error: spatialArtifact.verification.maximumDisplacementError,
  relative_l2_displacement_error: spatialArtifact.verification.relativeL2DisplacementError,
  maximum_boundary_error: spatialArtifact.verification.maximumBoundaryError,
  rms_equilibrium_residual: spatialArtifact.verification.rootMeanSquareEquilibriumResidual,
  relative_rms_equilibrium_residual: spatialArtifact.verification.relativeRmsEquilibriumResidual,
  passed: spatialArtifact.verification.passed
}];

await Promise.all([
  writeFile(path.join(outputDir, "ta01-model-comparison.csv"), csv(comparison)),
  writeFile(path.join(outputDir, "ta01-ablation-summary.csv"), csv(ablation)),
  writeFile(path.join(outputDir, "ta01-robustness-summary.csv"), csv(robustness)),
  writeFile(path.join(outputDir, "ta01-fem-mesh-summary.csv"), csv(mesh)),
  writeFile(path.join(outputDir, "ta01-risk-detection-summary.csv"), csv(detection)),
  writeFile(path.join(outputDir, "spatial-pinn-validation-summary.csv"), csv(spatial))
]);

sourceFiles.push(
  "data/validation/ta01-model-robustness.json",
  "data/validation/ta01-fem-mesh-sensitivity.json",
  "data/validation/spatial-pinn-manufactured-elasticity.json",
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
  "data/validation/ta01-rainfall-external-ssrm.json",
  "data/validation/ta01-transient-seep-wet-scenario-6m.json",
  "data/validation/ta01-transient-seep-wet-scenario-field-sensitivity.json",
  "data/validation/ta01-transient-seep-wet-scenario-fine-time-mesh-sensitivity.json",
  "data/validation/ta01-transient-seep-wet-scenario-time-sensitivity.json",
  "data/validation/ta01-wet-scenario-ssrm-pressure-mesh-sensitivity.json",
  "data/validation/ta01-rainfall-wet-scenario-external-ssrm.json",
  "data/validation/ta01-rainfall-wet-scenario-external-ssrm-mesh10.json",
  "data/validation/ta01-rainfall-wet-scenario-external-ssrm-mesh6.json",
  "data/validation/ta01-rainfall-wet-scenario-ssrm-mesh-sensitivity.json"
);
const manifest = {
  id: "TA01-RESEARCH-SUPPLEMENT-V1",
  generatedAt: new Date().toISOString(),
  scientificStatus: "MATERIAL_SUPLEMENTARIO_SEMISINTETICO_NO_VALIDACION_DE_CAMPO",
  datasetId: "TA01-DATASET-S500-SEED20260915",
  split: "350 escenarios entrenamiento / 75 validación / 75 prueba, sin mezclar horas de un escenario",
  riskDetection: {
    target: "rainfall_induced_max_displacement_mm",
    thresholdMm: displacementThresholdMm,
    thresholdDefinition: "Percentil 95 calculado exclusivamente en la partición de entrenamiento",
    positiveClass: "desplazamiento acumulado inducido por lluvia igual o superior al umbral",
    limitation: "No representa una alarma minera calibrada ni una falla real; mide discriminación interna de episodios altos del FEM semisintético."
  },
  outputs: [
    "data/validation/ta01-model-comparison.csv",
    "data/validation/ta01-ablation-summary.csv",
    "data/validation/ta01-robustness-summary.csv",
    "data/validation/ta01-fem-mesh-summary.csv",
    "data/validation/ta01-risk-detection-summary.csv",
    "data/validation/spatial-pinn-validation-summary.csv"
  ],
  sources: Object.fromEntries(await Promise.all(sourceFiles.map(async (relative) => [relative, { sha256: await sha256(relative) }])))
};
await writeFile(path.join(outputDir, "ta01-replication-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ outputs: manifest.outputs, manifest: "data/validation/ta01-replication-manifest.json", displacementThresholdMm }, null, 2));
