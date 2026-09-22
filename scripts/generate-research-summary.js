import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { summarizeValidationSelection } from "../src/core/model-selection.js";

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

const bootstrapChronologicalMaeDifference = (predictionRows, dateByScenario, seed = 20260917, draws = 5000) => {
  const groups = new Map();
  for (const row of predictionRows) {
    const date = dateByScenario.get(row.scenario_id);
    if (!date) throw new Error(`No se encontró fecha de prueba para ${row.scenario_id}`);
    const actual = Number(row.actual_displacement_mm);
    const lstm = Number(row.lstm_prediction_mm);
    const hybrid = Number(row.physics_guided_prediction_mm);
    if (![actual, lstm, hybrid].every(Number.isFinite)) throw new Error("Predicciones cronológicas no numéricas");
    const group = groups.get(date) || { count: 0, lstmAbsoluteError: 0, hybridAbsoluteError: 0 };
    group.count += 1;
    group.lstmAbsoluteError += Math.abs(actual - lstm);
    group.hybridAbsoluteError += Math.abs(actual - hybrid);
    groups.set(date, group);
  }
  const blocks = [...groups.values()];
  let state = seed >>> 0;
  const random = () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const differences = [];
  for (let draw = 0; draw < draws; draw++) {
    let count = 0, errorDifference = 0;
    for (let index = 0; index < blocks.length; index++) {
      const block = blocks[Math.floor(random() * blocks.length)];
      count += block.count;
      errorDifference += block.lstmAbsoluteError - block.hybridAbsoluteError;
    }
    differences.push(errorDifference / count);
  }
  differences.sort((a, b) => a - b);
  const totalCount = blocks.reduce((sum, group) => sum + group.count, 0);
  const totalDifference = blocks.reduce((sum, group) => sum + group.lstmAbsoluteError - group.hybridAbsoluteError, 0) / totalCount;
  return {
    unit: "mm",
    estimand: "MAE_LSTM_MINUS_MAE_HYBRID",
    positiveMeans: "HYBRID_LOWER_MAE",
    dateBlockCount: blocks.length,
    sampleCount: totalCount,
    bootstrapDraws: draws,
    seed,
    observedDifferenceMm: totalDifference,
    confidenceInterval95Mm: [differences[Math.floor(0.025 * draws)], differences[Math.floor(0.975 * draws)]],
    probabilityPositiveInBootstrap: differences.filter((value) => value > 0).length / draws
  };
};

const temporalSegments = [
  ["RAIN_DRY_0", (row) => row.rainfallMm === 0],
  ["RAIN_LOW_GT_0_LT_1", (row) => row.rainfallMm > 0 && row.rainfallMm < 1],
  ["RAIN_MODERATE_GE_1_LT_5", (row) => row.rainfallMm >= 1 && row.rainfallMm < 5],
  ["RAIN_HIGH_GE_5", (row) => row.rainfallMm >= 5],
  ["TARGET_ZERO", (row) => row.actual === 0],
  ["TARGET_POSITIVE", (row) => row.actual > 0]
];

const chronologicalSegmentRows = (horizonHours, predictionRows, scenarioMetadata) => {
  const predictions = predictionRows.map((row) => {
    const metadata = scenarioMetadata.get(row.scenario_id);
    if (!metadata) throw new Error(`Faltan metadatos cronológicos de ${row.scenario_id}`);
    return {
      scenarioId: row.scenario_id,
      sourceDate: metadata.sourceDate,
      rainfallMm: metadata.rainfallMm,
      actual: Number(row.actual_displacement_mm),
      PERSISTENCE: Number(row.persistence_prediction_mm),
      RIDGE: Number(row.ridge_prediction_mm),
      LSTM: Number(row.lstm_prediction_mm),
      HYBRID_PHYSICS_GUIDED: Number(row.physics_guided_prediction_mm)
    };
  });
  return temporalSegments.flatMap(([segment, predicate]) => {
    const selected = predictions.filter(predicate);
    if (!selected.length) return [];
    const scenarioCount = new Set(selected.map((row) => row.scenarioId)).size;
    const sourceDateCount = new Set(selected.map((row) => row.sourceDate)).size;
    return ["PERSISTENCE", "RIDGE", "LSTM", "HYBRID_PHYSICS_GUIDED"].map((model) => {
      const errors = selected.map((row) => row[model] - row.actual);
      return {
        horizon_hours: horizonHours,
        segment,
        model,
        scenario_count: scenarioCount,
        source_date_count: sourceDateCount,
        sample_count: selected.length,
        mae_mm: errors.reduce((sum, error) => sum + Math.abs(error), 0) / errors.length,
        rmse_mm: Math.sqrt(errors.reduce((sum, error) => sum + error * error, 0) / errors.length),
        bias_mm: errors.reduce((sum, error) => sum + error, 0) / errors.length
      };
    });
  });
};

const intervalCoverageRows = (testYear, horizonHours, predictionRows, scenarioMetadata, nominalCoverage) => {
  const values = predictionRows.map((row) => {
    const metadata = scenarioMetadata.get(row.scenario_id);
    if (!metadata) throw new Error(`Faltan metadatos de prueba para ${row.scenario_id}`);
    const actual = Number(row.actual_displacement_mm);
    const lower = Number(row.interval_lower_mm);
    const upper = Number(row.interval_upper_mm);
    if (![actual, lower, upper].every(Number.isFinite) || lower > upper) throw new Error("Intervalo cronológico inválido");
    return { scenarioId: row.scenario_id, sourceDate: metadata.sourceDate, rainfallMm: metadata.rainfallMm, actual, lower, upper };
  });
  return [["ALL", () => true], ...temporalSegments].flatMap(([segment, predicate]) => {
    const selected = values.filter(predicate);
    if (!selected.length) return [];
    const covered = selected.filter((row) => row.actual >= row.lower && row.actual <= row.upper).length;
    const empiricalCoverage = covered / selected.length;
    return [{
      test_year: testYear,
      horizon_hours: horizonHours,
      segment,
      scenario_count: new Set(selected.map((row) => row.scenarioId)).size,
      source_date_count: new Set(selected.map((row) => row.sourceDate)).size,
      sample_count: selected.length,
      nominal_coverage: nominalCoverage,
      empirical_coverage: empiricalCoverage,
      coverage_gap: empiricalCoverage - nominalCoverage,
      mean_interval_width_mm: selected.reduce((sum, row) => sum + row.upper - row.lower, 0) / selected.length
    }];
  });
};

await mkdir(outputDir, { recursive: true });
const trainRows = parseCsv(await readFile(source("data/generated/ta01-fem-500-train.csv"), "utf8"));
const trainingDisplacements = trainRows.map((row) => Number(row.rainfall_induced_max_displacement_mm)).sort((a, b) => a - b);
const thresholdIndex = Math.min(trainingDisplacements.length - 1, Math.ceil(trainingDisplacements.length * 0.95) - 1);
const displacementThresholdMm = trainingDisplacements[thresholdIndex];
const comparison = [];
const chronologicalComparison = [];
const rollingComparison = [];
const rollingSelection = [];
const ablation = [];
const detection = [];
const splitManifest = JSON.parse(await readFile(source("data/generated/ta01-fem-500-split-manifest.json"), "utf8"));
const chronologicalSplitManifest = JSON.parse(await readFile(source("data/generated/ta01-fem-500-chronological-split-manifest.json"), "utf8"));
const earlierFoldSplitManifest = JSON.parse(await readFile(source("data/generated/ta01-fem-500-backtest-2024-split-manifest.json"), "utf8"));
const chronologicalTestRows = parseCsv(await readFile(source("data/generated/ta01-fem-500-chronological-test.csv"), "utf8"));
const chronologicalDateByScenario = new Map(chronologicalTestRows.map((row) => [row.scenario_id, row.source_date]));
const chronologicalScenarioMetadata = new Map(chronologicalTestRows.map((row) => [row.scenario_id, { sourceDate: row.source_date, rainfallMm: Number(row.observed_daily_rainfall_mm) }]));
const chronologicalBootstrap = [];
const rollingBootstrap = [];
const chronologicalSegments = [];
const rollingIntervalCoverage = [];
const sourceFiles = [
  "data/rainfall/pasco-nasa-power-2020-2025.csv",
  "data/generated/ta01-fem-500.csv",
  "data/generated/ta01-fem-500-manifest.json",
  "data/generated/ta01-fem-500-split-manifest.json",
  "data/generated/ta01-fem-500-train.csv",
  "data/generated/ta01-fem-500-validation.csv",
  "data/generated/ta01-fem-500-test.csv",
  "data/generated/ta01-fem-500-chronological-split-manifest.json",
  "data/generated/ta01-fem-500-chronological-train.csv",
  "data/generated/ta01-fem-500-chronological-validation.csv",
  "data/generated/ta01-fem-500-chronological-test.csv",
  "data/generated/ta01-fem-500-backtest-2024-split-manifest.json",
  "data/generated/ta01-fem-500-backtest-2024-train.csv",
  "data/generated/ta01-fem-500-backtest-2024-validation.csv",
  "data/generated/ta01-fem-500-backtest-2024-test.csv",
  "src/core/fem-2d.js",
  "src/core/study-case-ta01.js",
  "src/core/temporal-baseline.js",
  "src/core/model-selection.js",
  "scripts/generate-fem-dataset.js",
  "scripts/split-fem-dataset.js",
  "scripts/split-fem-chronological.js",
  "scripts/train-temporal-baseline.js",
  "scripts/train-lstm.py",
  "scripts/train-physics-guided.py",
  "scripts/generate-research-summary.js"
];

for (const horizonHours of [1, 6]) {
  const modelRelative = `data/models/ta01-physics-guided-${horizonHours}h.json`;
  const predictionRelative = `data/generated/ta01-physics-guided-${horizonHours}h-test-predictions.csv`;
  const chronologicalModelRelative = `data/models/ta01-chronological-physics-guided-${horizonHours}h.json`;
  sourceFiles.push(
    `data/generated/ta01-baseline-${horizonHours}h.json`,
    `data/generated/ta01-baseline-${horizonHours}h-test-predictions.csv`,
    `data/models/ta01-lstm-${horizonHours}h.json`,
    `data/generated/ta01-lstm-${horizonHours}h-test-predictions.csv`,
    modelRelative,
    predictionRelative,
    `data/generated/ta01-chronological-baseline-${horizonHours}h.json`,
    `data/generated/ta01-chronological-baseline-${horizonHours}h-test-predictions.csv`,
    `data/models/ta01-chronological-lstm-${horizonHours}h.json`,
    `data/generated/ta01-chronological-lstm-${horizonHours}h-test-predictions.csv`,
    chronologicalModelRelative,
    `data/generated/ta01-chronological-physics-guided-${horizonHours}h-test-predictions.csv`
  );
  const artifact = JSON.parse(await readFile(source(modelRelative), "utf8"));
  const test = artifact.metrics.test;
  comparison.push(
    metricRow(horizonHours, "PERSISTENCE", test.persistence),
    metricRow(horizonHours, "RIDGE", test.ridgeComparable),
    metricRow(horizonHours, "LSTM", test.lstm),
    metricRow(horizonHours, "HYBRID_PHYSICS_GUIDED", test.pinn)
  );
  const chronologicalArtifact = JSON.parse(await readFile(source(chronologicalModelRelative), "utf8"));
  rollingSelection.push(summarizeValidationSelection(chronologicalArtifact, 2025, horizonHours));
  const chronologicalTest = chronologicalArtifact.metrics.test;
  chronologicalComparison.push(
    metricRow(horizonHours, "PERSISTENCE", chronologicalTest.persistence),
    metricRow(horizonHours, "RIDGE", chronologicalTest.ridgeComparable),
    metricRow(horizonHours, "LSTM", chronologicalTest.lstm),
    metricRow(horizonHours, "HYBRID_PHYSICS_GUIDED", chronologicalTest.pinn)
  );
  rollingComparison.push(...[
    metricRow(horizonHours, "PERSISTENCE", chronologicalTest.persistence),
    metricRow(horizonHours, "RIDGE", chronologicalTest.ridgeComparable),
    metricRow(horizonHours, "LSTM", chronologicalTest.lstm),
    metricRow(horizonHours, "HYBRID_PHYSICS_GUIDED", chronologicalTest.pinn)
  ].map((row) => ({ test_year: 2025, ...row })));
  const chronologicalPredictions = parseCsv(await readFile(source(`data/generated/ta01-chronological-physics-guided-${horizonHours}h-test-predictions.csv`), "utf8"));
  const futureBootstrap = { horizonHours, ...bootstrapChronologicalMaeDifference(chronologicalPredictions, chronologicalDateByScenario, 20260917 + horizonHours) };
  chronologicalBootstrap.push(futureBootstrap);
  rollingBootstrap.push({ testYear: 2025, ...futureBootstrap });
  chronologicalSegments.push(...chronologicalSegmentRows(horizonHours, chronologicalPredictions, chronologicalScenarioMetadata));
  rollingIntervalCoverage.push(...intervalCoverageRows(2025, horizonHours, chronologicalPredictions, chronologicalScenarioMetadata, chronologicalTest.uncertainty.nominalCoverage));
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

const earlierFoldTestRows = parseCsv(await readFile(source("data/generated/ta01-fem-500-backtest-2024-test.csv"), "utf8"));
const earlierFoldDateByScenario = new Map(earlierFoldTestRows.map((row) => [row.scenario_id, row.source_date]));
const earlierFoldScenarioMetadata = new Map(earlierFoldTestRows.map((row) => [row.scenario_id, { sourceDate: row.source_date, rainfallMm: Number(row.observed_daily_rainfall_mm) }]));
for (const horizonHours of [1, 6]) {
  const modelRelative = `data/models/ta01-backtest-2024-physics-guided-${horizonHours}h.json`;
  const predictionRelative = `data/generated/ta01-backtest-2024-physics-guided-${horizonHours}h-test-predictions.csv`;
  sourceFiles.push(
    `data/generated/ta01-backtest-2024-baseline-${horizonHours}h.json`,
    `data/generated/ta01-backtest-2024-baseline-${horizonHours}h-test-predictions.csv`,
    `data/models/ta01-backtest-2024-lstm-${horizonHours}h.json`,
    `data/generated/ta01-backtest-2024-lstm-${horizonHours}h-test-predictions.csv`,
    modelRelative,
    predictionRelative
  );
  const artifact = JSON.parse(await readFile(source(modelRelative), "utf8"));
  rollingSelection.push(summarizeValidationSelection(artifact, 2024, horizonHours));
  const test = artifact.metrics.test;
  rollingComparison.push(...[
    metricRow(horizonHours, "PERSISTENCE", test.persistence),
    metricRow(horizonHours, "RIDGE", test.ridgeComparable),
    metricRow(horizonHours, "LSTM", test.lstm),
    metricRow(horizonHours, "HYBRID_PHYSICS_GUIDED", test.pinn)
  ].map((row) => ({ test_year: 2024, ...row })));
  const predictions = parseCsv(await readFile(source(predictionRelative), "utf8"));
  rollingBootstrap.push({ testYear: 2024, horizonHours, ...bootstrapChronologicalMaeDifference(predictions, earlierFoldDateByScenario, 20260924 + horizonHours) });
  rollingIntervalCoverage.push(...intervalCoverageRows(2024, horizonHours, predictions, earlierFoldScenarioMetadata, test.uncertainty.nominalCoverage));
}
rollingComparison.sort((a, b) => a.test_year - b.test_year || a.horizon_hours - b.horizon_hours);
rollingBootstrap.sort((a, b) => a.testYear - b.testYear || a.horizonHours - b.horizonHours);
rollingSelection.sort((a, b) => a.testYear - b.testYear || a.horizonHours - b.horizonHours);
rollingIntervalCoverage.sort((a, b) => a.test_year - b.test_year || a.horizon_hours - b.horizon_hours);

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
  writeFile(path.join(outputDir, "ta01-chronological-model-comparison.csv"), csv(chronologicalComparison)),
  writeFile(path.join(outputDir, "ta01-chronological-bootstrap.json"), `${JSON.stringify({ method: "PAIRED_SOURCE_DATE_BLOCK_BOOTSTRAP", status: "SEMISYNTHETIC_SINGLE_GEOMETRY", comparisons: chronologicalBootstrap }, null, 2)}\n`),
  writeFile(path.join(outputDir, "ta01-chronological-stratified.csv"), csv(chronologicalSegments)),
  writeFile(path.join(outputDir, "ta01-rolling-origin-model-comparison.csv"), csv(rollingComparison)),
  writeFile(path.join(outputDir, "ta01-rolling-origin-bootstrap.json"), `${JSON.stringify({ method: "PAIRED_SOURCE_DATE_BLOCK_BOOTSTRAP", status: "SEMISYNTHETIC_SINGLE_GEOMETRY", comparisons: rollingBootstrap }, null, 2)}\n`),
  writeFile(path.join(outputDir, "ta01-rolling-model-selection.csv"), csv(rollingSelection)),
  writeFile(path.join(outputDir, "ta01-rolling-interval-coverage.csv"), csv(rollingIntervalCoverage)),
  writeFile(path.join(outputDir, "ta01-rolling-interval-coverage.json"), `${JSON.stringify({ method: "VALIDATION_CONFORMAL_INTERVAL_TEST_DIAGNOSTIC", scientificStatus: "SEMISYNTHETIC_SINGLE_GEOMETRY", note: "Cobertura condicional descriptiva; los grupos de lluvia alta tienen solo dos o tres fechas.", rows: rollingIntervalCoverage }, null, 2)}\n`),
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
  split: `${splitManifest.summaries.train.scenarioCount} escenarios entrenamiento / ${splitManifest.summaries.validation.scenarioCount} validación / ${splitManifest.summaries.test.scenarioCount} prueba, sin mezclar fechas de lluvia; no es un holdout cronológico`,
  splitMethod: splitManifest.method,
  sourceDateCounts: splitManifest.sourceDateCounts,
  chronologicalHoldout: {
    method: chronologicalSplitManifest.method,
    cutoffs: chronologicalSplitManifest.cutoffs,
    scenarioCounts: Object.fromEntries(["train", "validation", "test"].map((name) => [name, chronologicalSplitManifest.summaries[name].scenarioCount])),
    sourceDateCounts: chronologicalSplitManifest.sourceDateCounts,
    limitation: "Prueba futura en 2025 para el mismo FEM y geometría TA-01; no son desplazamientos observados ni validación de mina."
  },
  rollingOrigin: [
    { testYear: 2024, cutoffs: earlierFoldSplitManifest.cutoffs, scenarioCounts: Object.fromEntries(["train", "validation", "test"].map((name) => [name, earlierFoldSplitManifest.summaries[name].scenarioCount])), excludedFutureScenarios: earlierFoldSplitManifest.excludedScenarioIds?.length || 0 },
    { testYear: 2025, cutoffs: chronologicalSplitManifest.cutoffs, scenarioCounts: Object.fromEntries(["train", "validation", "test"].map((name) => [name, chronologicalSplitManifest.summaries[name].scenarioCount])), excludedFutureScenarios: chronologicalSplitManifest.excludedScenarioIds?.length || 0 }
  ],
  riskDetection: {
    target: "rainfall_induced_max_displacement_mm",
    thresholdMm: displacementThresholdMm,
    thresholdDefinition: "Percentil 95 calculado exclusivamente en la partición de entrenamiento",
    positiveClass: "desplazamiento acumulado inducido por lluvia igual o superior al umbral",
    limitation: "No representa una alarma minera calibrada ni una falla real; mide discriminación interna de episodios altos del FEM semisintético."
  },
  outputs: [
    "data/validation/ta01-model-comparison.csv",
    "data/validation/ta01-chronological-model-comparison.csv",
    "data/validation/ta01-chronological-bootstrap.json",
    "data/validation/ta01-chronological-stratified.csv",
    "data/validation/ta01-rolling-origin-model-comparison.csv",
    "data/validation/ta01-rolling-origin-bootstrap.json",
    "data/validation/ta01-rolling-model-selection.csv",
    "data/validation/ta01-rolling-interval-coverage.csv",
    "data/validation/ta01-rolling-interval-coverage.json",
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
