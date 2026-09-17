const sigmoid = (value) => {
  const clipped = Math.min(30, Math.max(-30, value));
  return 1 / (1 + Math.exp(-clipped));
};

export const LSTM_FEATURES = Object.freeze([
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

function finite(value, label) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) throw new Error(`Entrada LSTM inválida: ${label}`);
  return numeric;
}

function validateArtifact(artifact) {
  if (!artifact?.model?.weights || !artifact?.architecture) throw new Error("El artefacto LSTM no contiene pesos o arquitectura");
  if (artifact.architecture.inputFeatures.join("|") !== LSTM_FEATURES.join("|")) throw new Error("Las variables del artefacto LSTM no coinciden con el contrato de inferencia");
  const hiddenUnits = finite(artifact.architecture.hiddenUnits, "hiddenUnits");
  const { wx, wh, b, wy, by } = artifact.model.weights;
  if (wx?.length !== LSTM_FEATURES.length || wx.some((row) => row.length !== hiddenUnits * 4)) throw new Error("Dimensión inválida en wx");
  if (wh?.length !== hiddenUnits || wh.some((row) => row.length !== hiddenUnits * 4)) throw new Error("Dimensión inválida en wh");
  if (b?.length !== hiddenUnits * 4 || wy?.length !== hiddenUnits || wy.some((row) => row.length !== 1) || by?.length !== 1) throw new Error("Dimensión inválida en los pesos de salida LSTM");
}

function multiplyRowByMatrix(row, matrix, outputSize) {
  const output = Array(outputSize).fill(0);
  for (let input = 0; input < row.length; input++) {
    const weights = matrix[input];
    for (let outputIndex = 0; outputIndex < outputSize; outputIndex++) output[outputIndex] += row[input] * weights[outputIndex];
  }
  return output;
}

export function inferLstmSequence(artifact, featureSequence, currentDisplacementMm) {
  validateArtifact(artifact);
  const lookbackHours = finite(artifact.architecture.lookbackHours, "lookbackHours");
  if (!Array.isArray(featureSequence) || featureSequence.length !== lookbackHours) throw new Error(`La LSTM requiere exactamente ${lookbackHours} horas de memoria`);
  const hiddenUnits = artifact.architecture.hiddenUnits;
  const model = artifact.model;
  const normalized = featureSequence.map((row, rowIndex) => LSTM_FEATURES.map((feature, featureIndex) => {
    const value = Array.isArray(row) ? row[featureIndex] : row[feature];
    const mean = finite(model.featureMean[feature], `media ${feature}`);
    const deviation = finite(model.featureStandardDeviation[feature], `desviación ${feature}`);
    if (deviation <= 0) throw new Error(`Desviación inválida para ${feature}`);
    return (finite(value, `${feature} en hora de memoria ${rowIndex + 1}`) - mean) / deviation;
  }));

  let hidden = Array(hiddenUnits).fill(0);
  let cell = Array(hiddenUnits).fill(0);
  const { wx, wh, b, wy, by } = model.weights;
  for (const row of normalized) {
    const inputProjection = multiplyRowByMatrix(row, wx, hiddenUnits * 4);
    const hiddenProjection = multiplyRowByMatrix(hidden, wh, hiddenUnits * 4);
    const gates = inputProjection.map((value, index) => value + hiddenProjection[index] + b[index]);
    const previousCell = cell;
    cell = Array(hiddenUnits);
    hidden = Array(hiddenUnits);
    for (let index = 0; index < hiddenUnits; index++) {
      const inputGate = sigmoid(gates[index]);
      const forgetGate = sigmoid(gates[hiddenUnits + index]);
      const candidate = Math.tanh(gates[hiddenUnits * 2 + index]);
      const outputGate = sigmoid(gates[hiddenUnits * 3 + index]);
      cell[index] = forgetGate * previousCell[index] + inputGate * candidate;
      hidden[index] = outputGate * Math.tanh(cell[index]);
    }
  }

  const standardizedDelta = hidden.reduce((sum, value, index) => sum + value * wy[index][0], by[0]);
  const predictedDeltaMm = finite(model.targetDeltaMean, "targetDeltaMean") + standardizedDelta * finite(model.targetDeltaStandardDeviation, "targetDeltaStandardDeviation");
  const current = finite(currentDisplacementMm, "desplazamiento actual");
  const unconstrainedPredictionMm = current + predictedDeltaMm;
  const predictionMm = Math.max(current, unconstrainedPredictionMm);
  return {
    standardizedDelta,
    predictionMm,
    unconstrainedPredictionMm,
    predictedIncrementMm: predictionMm - current,
    constraintApplied: unconstrainedPredictionMm < current
  };
}

export function femLstmFeatureRow(step, scenario, forecastRainfallMm) {
  return {
    current_displacement_mm: step.maximumRainfallInducedDisplacementMm,
    current_rainfall_mm_h: step.rainfallMmH,
    cumulative_rainfall_mm: step.cumulativeRainfallMm,
    forecast_rainfall_mm: forecastRainfallMm,
    maximum_pore_pressure_kpa: step.maximumPorePressureKpa,
    mohr_coulomb_safety_index: step.mohrCoulombSafetyIndex,
    simulation_hour: step.hour,
    cohesion_kpa: scenario.cohesionKpa,
    friction_angle_deg: scenario.frictionAngleDeg,
    unit_weight_kn_m3: scenario.unitWeightKNm3,
    young_modulus_mpa: scenario.youngModulusMpa,
    log10_permeability_m_s: Math.log10(scenario.permeabilityMS),
    drainage_efficiency: scenario.drainageEfficiency,
    water_table_m: scenario.waterTableM,
    storage_coefficient: scenario.storageCoefficient
  };
}

export function buildFemLstmContext(run, artifact, input = {}) {
  validateArtifact(artifact);
  if (!run?.timeSeries?.length || !run?.scenario) throw new Error("La corrida FEM no contiene una serie temporal compatible");
  const horizonHours = finite(input.horizonHours ?? artifact.architecture.horizonHours, "horizonHours");
  if (horizonHours !== artifact.architecture.horizonHours) throw new Error(`El artefacto fue entrenado para ${artifact.architecture.horizonHours} h`);
  const lookbackHours = artifact.architecture.lookbackHours;
  const firstHour = run.timeSeries[0].hour;
  const lastHour = run.timeSeries.at(-1).hour;
  const minimumOriginHour = firstHour + lookbackHours - 1;
  const maximumOriginHour = lastHour - horizonHours;
  const originHour = input.originHour === undefined ? maximumOriginHour : Number(input.originHour);
  if (!Number.isInteger(originHour) || originHour < minimumOriginHour || originHour > maximumOriginHour) throw new Error(`originHour debe ser un entero entre ${minimumOriginHour} y ${maximumOriginHour} para este horizonte`);
  const targetHour = originHour + horizonHours;
  const byHour = new Map(run.timeSeries.map((step) => [step.hour, step]));
  const current = byHour.get(originHour);
  const target = byHour.get(targetHour);
  if (!current || !target) throw new Error("La corrida FEM no cubre las horas solicitadas");
  const futureRainfallMm = run.timeSeries.filter((step) => step.hour > originHour && step.hour <= targetHour).reduce((sum, step) => sum + step.rainfallMmH, 0);
  const featureSequence = [];
  for (let hour = originHour - lookbackHours + 1; hour <= originHour; hour++) {
    const step = byHour.get(hour);
    if (!step) throw new Error(`Falta la hora ${hour} en la memoria LSTM`);
    featureSequence.push(femLstmFeatureRow(step, run.scenario, futureRainfallMm));
  }
  return { horizonHours, lookbackHours, originHour, targetHour, futureRainfallMm, featureSequence, current, target };
}

export function forecastFemRunWithLstm(run, artifact, input = {}) {
  const context = buildFemLstmContext(run, artifact, input);
  const { horizonHours, lookbackHours, originHour, targetHour, futureRainfallMm, featureSequence, current, target } = context;
  const inference = inferLstmSequence(artifact, featureSequence, current.maximumRainfallInducedDisplacementMm);
  const actualFemMm = finite(target.maximumRainfallInducedDisplacementMm, "desplazamiento FEM objetivo");
  return {
    id: `LSTM-${run.id}-${horizonHours}H-O${originHour}`,
    generatedAt: new Date().toISOString(),
    runId: run.id,
    modelId: artifact.id,
    method: artifact.method,
    scientificStatus: "PRONOSTICO_LSTM_SEMISINTETICO_NO_OPERACIONAL",
    horizonHours,
    lookbackHours,
    originHour,
    targetHour,
    forecastRainfallMm: Number(futureRainfallMm.toFixed(8)),
    currentDisplacementMm: Number(current.maximumRainfallInducedDisplacementMm.toFixed(12)),
    predictedDisplacementMm: Number(inference.predictionMm.toFixed(12)),
    predictedIncrementMm: Number(inference.predictedIncrementMm.toFixed(12)),
    unconstrainedPredictionMm: Number(inference.unconstrainedPredictionMm.toFixed(12)),
    constraintApplied: inference.constraintApplied,
    femReferenceDisplacementMm: Number(actualFemMm.toFixed(12)),
    errorAgainstFemMm: Number((inference.predictionMm - actualFemMm).toFixed(12)),
    absoluteErrorAgainstFemMm: Number(Math.abs(inference.predictionMm - actualFemMm).toFixed(12)),
    provenance: {
      rainfallSource: run.rainfall?.source ?? null,
      rainfallDate: run.rainfall?.date ?? null,
      mechanicalResponseSource: run.method?.id ?? null,
      modelDataset: artifact.dataset?.sourceDatasetId ?? null
    },
    limitation: "Validación embebida contra una respuesta FEM semisintética. No representa desempeño con desplazamientos observados en mina."
  };
}
