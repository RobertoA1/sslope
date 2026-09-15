const clamp = (value, minimum, maximum) => Math.min(Math.max(value, minimum), maximum);

export const TEMPORAL_FEATURES = Object.freeze([
  "current_displacement_mm",
  "current_rainfall_mm_h",
  "cumulative_rainfall_mm",
  "forecast_rainfall_mm",
  "maximum_pore_pressure_kpa",
  "mohr_coulomb_safety_index",
  "simulation_hour",
  "cohesion_kpa",
  "friction_angle_deg",
  "unit_weight_kn_m3",
  "young_modulus_mpa",
  "log10_permeability_m_s",
  "drainage_efficiency",
  "water_table_m",
  "storage_coefficient"
]);

function parseCsvLine(line) {
  const cells = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index++) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (character === "," && !quoted) {
      cells.push(value);
      value = "";
    } else value += character;
  }
  cells.push(value);
  return cells;
}

export function parseFlatCsv(text) {
  const lines = String(text).trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) throw new Error("El CSV debe contener cabecera y al menos una observación");
  const columns = parseCsvLine(lines[0]);
  const rows = lines.slice(1).map((line, rowIndex) => {
    const cells = parseCsvLine(line);
    if (cells.length !== columns.length) throw new Error(`Fila CSV ${rowIndex + 2}: se esperaban ${columns.length} columnas y se encontraron ${cells.length}`);
    return Object.fromEntries(columns.map((column, index) => [column, cells[index]]));
  });
  return { columns, rows };
}

function csvCell(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function flatCsv(columns, rows) {
  return [columns.join(","), ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(","))].join("\n") + "\n";
}

function seededRandom(seed) {
  let state = Number(seed) >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4_294_967_296;
  };
}

function shuffled(values, random) {
  const output = [...values];
  for (let index = output.length - 1; index > 0; index--) {
    const target = Math.floor(random() * (index + 1));
    [output[index], output[target]] = [output[target], output[index]];
  }
  return output;
}

function splitSummary(name, scenarioIds, rows, scenarioById, wettestScenarioId) {
  const idSet = new Set(scenarioIds);
  const selectedRows = rows.filter((row) => idSet.has(row.scenario_id));
  const rain = scenarioIds.map((id) => Number(scenarioById.get(id).observedDailyRainfallMm));
  const riskCounts = {};
  scenarioIds.forEach((id) => {
    const risk = scenarioById.get(id).summary?.riskLevel || "UNAVAILABLE";
    riskCounts[risk] = (riskCounts[risk] || 0) + 1;
  });
  return {
    name,
    scenarioCount: scenarioIds.length,
    rowCount: selectedRows.length,
    rainfallMm: {
      minimum: Number(Math.min(...rain).toFixed(4)),
      mean: Number((rain.reduce((sum, value) => sum + value, 0) / rain.length).toFixed(4)),
      maximum: Number(Math.max(...rain).toFixed(4))
    },
    riskCounts,
    includesWettestScenario: scenarioIds.includes(wettestScenarioId)
  };
}

export function splitFemDataset(rows, scenarioManifest, input = {}) {
  const seed = Number(input.seed ?? 20260916);
  const ratios = { train: 0.7, validation: 0.15, test: 0.15 };
  if (!Array.isArray(rows) || !rows.length) throw new Error("No hay filas FEM para dividir");
  if (!Array.isArray(scenarioManifest) || scenarioManifest.length < 3) throw new Error("Se requieren al menos tres escenarios en el manifiesto");
  const scenarioById = new Map(scenarioManifest.map((scenario) => [scenario.scenarioId, scenario]));
  const rowIds = new Set(rows.map((row) => row.scenario_id));
  if (rowIds.size !== scenarioById.size || [...rowIds].some((id) => !scenarioById.has(id))) throw new Error("Los escenarios del CSV y del manifiesto no coinciden");
  const count = scenarioManifest.length;
  const targetCounts = {
    train: Math.floor(count * ratios.train),
    validation: Math.floor(count * ratios.validation),
    test: count - Math.floor(count * ratios.train) - Math.floor(count * ratios.validation)
  };
  const rankedRain = [...scenarioManifest].sort((a, b) => b.observedDailyRainfallMm - a.observedDailyRainfallMm || a.scenarioId.localeCompare(b.scenarioId));
  const assigned = { train: [], validation: [rankedRain[1].scenarioId], test: [rankedRain[0].scenarioId] };
  const riskLevels = [...new Set(scenarioManifest.map((scenario) => scenario.summary?.riskLevel || "UNAVAILABLE"))];
  const riskTotals = Object.fromEntries(riskLevels.map((risk) => [risk, scenarioManifest.filter((scenario) => (scenario.summary?.riskLevel || "UNAVAILABLE") === risk).length]));
  const riskCounts = Object.fromEntries(Object.keys(assigned).map((split) => [split, Object.fromEntries(riskLevels.map((risk) => [risk, 0]))]));
  for (const split of ["validation", "test"]) {
    const risk = scenarioById.get(assigned[split][0]).summary?.riskLevel || "UNAVAILABLE";
    riskCounts[split][risk] += 1;
  }
  const reserved = new Set([...assigned.validation, ...assigned.test]);
  const random = seededRandom(seed);
  const remaining = shuffled(scenarioManifest.filter((scenario) => !reserved.has(scenario.scenarioId)), random);
  for (const scenario of remaining) {
    const risk = scenario.summary?.riskLevel || "UNAVAILABLE";
    const options = Object.keys(assigned).filter((split) => assigned[split].length < targetCounts[split]);
    const selected = options.sort((left, right) => {
      const score = (split) => {
        const riskNeed = riskTotals[risk] * ratios[split] - riskCounts[split][risk];
        const capacityNeed = (targetCounts[split] - assigned[split].length) / Math.max(1, targetCounts[split]);
        return riskNeed * 4 + capacityNeed;
      };
      return score(right) - score(left) || left.localeCompare(right);
    })[0];
    assigned[selected].push(scenario.scenarioId);
    riskCounts[selected][risk] += 1;
  }
  Object.values(assigned).forEach((ids) => ids.sort());
  const membership = new Map(Object.entries(assigned).flatMap(([split, ids]) => ids.map((id) => [id, split])));
  const splitRows = Object.fromEntries(Object.keys(assigned).map((split) => [split, rows.filter((row) => membership.get(row.scenario_id) === split)]));
  const allAssigned = Object.values(assigned).flat();
  if (new Set(allAssigned).size !== count || allAssigned.length !== count) throw new Error("La división produjo escenarios duplicados o faltantes");
  return {
    seed,
    ratios,
    targetCounts,
    scenarioIds: assigned,
    rows: splitRows,
    reservedExtremeEvents: {
      test: { scenarioId: rankedRain[0].scenarioId, rainfallMm: rankedRain[0].observedDailyRainfallMm },
      validation: { scenarioId: rankedRain[1].scenarioId, rainfallMm: rankedRain[1].observedDailyRainfallMm }
    },
    summaries: Object.fromEntries(Object.keys(assigned).map((split) => [split, splitSummary(split, assigned[split], rows, scenarioById, rankedRain[0].scenarioId)]))
  };
}

function numeric(row, key) {
  const value = Number(row[key]);
  if (!Number.isFinite(value)) throw new Error(`Valor no numérico en ${key} para ${row.scenario_id}, hora ${row.simulation_hour}`);
  return value;
}

function sampleFeatures(current, futureRows) {
  return [
    numeric(current, "rainfall_induced_max_displacement_mm"),
    numeric(current, "rainfall_mm_h"),
    numeric(current, "cumulative_rainfall_mm"),
    futureRows.reduce((sum, row) => sum + numeric(row, "rainfall_mm_h"), 0),
    numeric(current, "maximum_pore_pressure_kpa"),
    numeric(current, "mohr_coulomb_safety_index"),
    numeric(current, "simulation_hour"),
    numeric(current, "cohesion_kpa"),
    numeric(current, "friction_angle_deg"),
    numeric(current, "unit_weight_kn_m3"),
    numeric(current, "young_modulus_mpa"),
    Math.log10(numeric(current, "permeability_m_s")),
    numeric(current, "drainage_efficiency"),
    numeric(current, "water_table_m"),
    numeric(current, "storage_coefficient")
  ];
}

export function buildTemporalSamples(rows, horizonHours = 1) {
  const horizon = Number(horizonHours);
  if (!Number.isInteger(horizon) || horizon < 1 || horizon > 23) throw new Error("El horizonte debe ser un entero entre 1 y 23 horas");
  const groups = new Map();
  rows.forEach((row) => {
    if (!groups.has(row.scenario_id)) groups.set(row.scenario_id, []);
    groups.get(row.scenario_id).push(row);
  });
  const samples = [];
  for (const [scenarioId, scenarioRows] of groups) {
    scenarioRows.sort((a, b) => Number(a.simulation_hour) - Number(b.simulation_hour));
    for (let origin = 0; origin + horizon < scenarioRows.length; origin++) {
      const current = scenarioRows[origin];
      const future = scenarioRows[origin + horizon];
      const futureRows = scenarioRows.slice(origin + 1, origin + horizon + 1);
      const currentTarget = numeric(current, "rainfall_induced_max_displacement_mm");
      const actualTarget = numeric(future, "rainfall_induced_max_displacement_mm");
      samples.push({
        scenarioId,
        originHour: numeric(current, "simulation_hour"),
        targetHour: numeric(future, "simulation_hour"),
        features: sampleFeatures(current, futureRows),
        currentTarget,
        actualTarget,
        targetDelta: actualTarget - currentTarget
      });
    }
  }
  return samples;
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function fitScaler(matrix) {
  const means = matrix[0].map((_, column) => mean(matrix.map((row) => row[column])));
  const standardDeviations = means.map((columnMean, column) => {
    const variance = mean(matrix.map((row) => (row[column] - columnMean) ** 2));
    return Math.sqrt(variance) || 1;
  });
  return { means, standardDeviations };
}

function scaleRow(row, scaler) {
  return row.map((value, index) => (value - scaler.means[index]) / scaler.standardDeviations[index]);
}

function solveLinearSystem(matrix, vector) {
  const size = vector.length;
  const augmented = matrix.map((row, index) => [...row, vector[index]]);
  for (let column = 0; column < size; column++) {
    let pivot = column;
    for (let row = column + 1; row < size; row++) if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
    if (Math.abs(augmented[pivot][column]) < 1e-12) throw new Error("La matriz ridge es singular");
    [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];
    const divisor = augmented[column][column];
    for (let index = column; index <= size; index++) augmented[column][index] /= divisor;
    for (let row = 0; row < size; row++) {
      if (row === column) continue;
      const factor = augmented[row][column];
      for (let index = column; index <= size; index++) augmented[row][index] -= factor * augmented[column][index];
    }
  }
  return augmented.map((row) => row[size]);
}

function fitRidge(samples, lambda) {
  const featureScaler = fitScaler(samples.map((sample) => sample.features));
  const targetValues = samples.map((sample) => sample.targetDelta);
  const targetMean = mean(targetValues);
  const targetStandardDeviation = Math.sqrt(mean(targetValues.map((value) => (value - targetMean) ** 2))) || 1;
  const design = samples.map((sample) => [1, ...scaleRow(sample.features, featureScaler)]);
  const target = targetValues.map((value) => (value - targetMean) / targetStandardDeviation);
  const size = design[0].length;
  const normal = Array.from({ length: size }, () => Array(size).fill(0));
  const right = Array(size).fill(0);
  for (let sampleIndex = 0; sampleIndex < design.length; sampleIndex++) {
    for (let row = 0; row < size; row++) {
      right[row] += design[sampleIndex][row] * target[sampleIndex];
      for (let column = 0; column < size; column++) normal[row][column] += design[sampleIndex][row] * design[sampleIndex][column];
    }
  }
  for (let index = 1; index < size; index++) normal[index][index] += lambda;
  return { lambda, coefficients: solveLinearSystem(normal, right), featureScaler, targetMean, targetStandardDeviation };
}

function predictDelta(model, features) {
  const scaled = [1, ...scaleRow(features, model.featureScaler)];
  const standardized = model.coefficients.reduce((sum, coefficient, index) => sum + coefficient * scaled[index], 0);
  return model.targetMean + standardized * model.targetStandardDeviation;
}

export function regressionMetrics(actual, predicted) {
  if (!actual.length || actual.length !== predicted.length) throw new Error("Las series real y predicha deben tener la misma longitud no vacía");
  const errors = predicted.map((value, index) => value - actual[index]);
  const actualMean = mean(actual);
  const total = actual.reduce((sum, value) => sum + (value - actualMean) ** 2, 0);
  const residual = errors.reduce((sum, value) => sum + value ** 2, 0);
  return {
    sampleCount: actual.length,
    maeMm: Number(mean(errors.map(Math.abs)).toFixed(8)),
    rmseMm: Number(Math.sqrt(mean(errors.map((value) => value ** 2))).toFixed(8)),
    biasMm: Number(mean(errors).toFixed(8)),
    r2: total > 1e-16 ? Number((1 - residual / total).toFixed(6)) : null
  };
}

function evaluateModel(model, samples) {
  const actual = samples.map((sample) => sample.actualTarget);
  const persistence = samples.map((sample) => sample.currentTarget);
  const ridgeUnconstrained = samples.map((sample) => sample.currentTarget + predictDelta(model, sample.features));
  const ridge = ridgeUnconstrained.map((value, index) => Math.max(samples[index].currentTarget, value));
  return {
    persistence: regressionMetrics(actual, persistence),
    ridgeUnconstrained: regressionMetrics(actual, ridgeUnconstrained),
    ridge: regressionMetrics(actual, ridge),
    physicalViolations: {
      negativePredictionCountBeforeConstraint: ridgeUnconstrained.filter((value) => value < 0).length,
      decreasingPredictionCountBeforeConstraint: ridgeUnconstrained.filter((value, index) => value < samples[index].currentTarget).length,
      correctedPredictionCount: ridgeUnconstrained.filter((value, index) => value < samples[index].currentTarget).length,
      violationsAfterConstraint: ridge.filter((value, index) => value < 0 || value < samples[index].currentTarget).length
    },
    predictions: samples.map((sample, index) => ({
      scenario_id: sample.scenarioId,
      origin_hour: sample.originHour,
      target_hour: sample.targetHour,
      actual_displacement_mm: Number(actual[index].toFixed(8)),
      persistence_prediction_mm: Number(persistence[index].toFixed(8)),
      ridge_unconstrained_prediction_mm: Number(ridgeUnconstrained[index].toFixed(8)),
      ridge_prediction_mm: Number(ridge[index].toFixed(8)),
      ridge_error_mm: Number((ridge[index] - actual[index]).toFixed(8))
    }))
  };
}

export function trainTemporalBaseline(splitRows, input = {}) {
  const horizonHours = Number(input.horizonHours ?? 1);
  const lambdas = input.lambdas || [0.0001, 0.001, 0.01, 0.1, 1, 10, 100];
  const samples = {
    train: buildTemporalSamples(splitRows.train, horizonHours),
    validation: buildTemporalSamples(splitRows.validation, horizonHours),
    test: buildTemporalSamples(splitRows.test, horizonHours)
  };
  let selected = null;
  const tuning = [];
  for (const lambda of lambdas) {
    const model = fitRidge(samples.train, Number(lambda));
    const validation = evaluateModel(model, samples.validation);
    tuning.push({ lambda: Number(lambda), validation: validation.ridge });
    if (!selected || validation.ridge.maeMm < selected.validationMaeMm) selected = { model, validationMaeMm: validation.ridge.maeMm };
  }
  const evaluation = Object.fromEntries(Object.entries(samples).map(([split, splitSamples]) => [split, evaluateModel(selected.model, splitSamples)]));
  const coefficients = Object.fromEntries(["intercept", ...TEMPORAL_FEATURES].map((feature, index) => [feature, Number(selected.model.coefficients[index].toFixed(10))]));
  return {
    method: "RIDGE_AUTOREGRESSIVE_MONOTONIC_BASELINE_V1",
    scientificStatus: "LINEA_BASE_SEMISINTETICA_NO_OPERACIONAL",
    horizonHours,
    target: "rainfall_induced_max_displacement_mm",
    predictedQuantity: "incremento entre la hora de origen y la hora objetivo",
    outputConstraint: "La predicción final no puede ser menor que el desplazamiento inducido acumulado en la hora de origen.",
    futureWeatherAssumption: "La lluvia acumulada durante el horizonte se considera conocida, como un pronóstico meteorológico exógeno.",
    features: TEMPORAL_FEATURES,
    selectedLambda: selected.model.lambda,
    tuning,
    model: {
      coefficientsStandardized: coefficients,
      featureMeans: Object.fromEntries(TEMPORAL_FEATURES.map((feature, index) => [feature, selected.model.featureScaler.means[index]])),
      featureStandardDeviations: Object.fromEntries(TEMPORAL_FEATURES.map((feature, index) => [feature, selected.model.featureScaler.standardDeviations[index]])),
      targetDeltaMean: selected.model.targetMean,
      targetDeltaStandardDeviation: selected.model.targetStandardDeviation
    },
    metrics: Object.fromEntries(Object.entries(evaluation).map(([split, result]) => [split, {
      persistence: result.persistence,
      ridgeUnconstrained: result.ridgeUnconstrained,
      ridge: result.ridge,
      physicalViolations: result.physicalViolations
    }])),
    testPredictions: evaluation.test.predictions
  };
}

export const TEST_PREDICTION_COLUMNS = Object.freeze([
  "scenario_id", "origin_hour", "target_hour", "actual_displacement_mm", "persistence_prediction_mm", "ridge_unconstrained_prediction_mm", "ridge_prediction_mm", "ridge_error_mm"
]);
