import { buildFemLstmContext, inferLstmSequence } from "./lstm-inference.js";

export const PHYSICS_GUIDED_FEATURES = Object.freeze([
  "lstm_delta_standardized",
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
  "storage_coefficient",
  "lookback_displacement_change_mm",
  "lookback_pore_pressure_change_kpa",
  "lookback_safety_index_change"
]);

const softplus = (value) => Math.log1p(Math.exp(-Math.abs(value))) + Math.max(value, 0);

function finite(value, label) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) throw new Error(`Entrada física inválida: ${label}`);
  return numeric;
}

function validateArtifact(artifact) {
  if (!artifact?.model?.weights || !artifact?.architecture) throw new Error("El artefacto físico no contiene pesos o arquitectura");
  if (artifact.architecture.inputFeatures.join("|") !== PHYSICS_GUIDED_FEATURES.join("|")) throw new Error("Las variables del corrector físico no coinciden con el contrato de inferencia");
  const hiddenUnits = artifact.architecture.hiddenUnits;
  const { w1, b1, w2, b2, rainRaw, safetyRaw } = artifact.model.weights;
  if (w1?.length !== PHYSICS_GUIDED_FEATURES.length || w1.some((row) => row.length !== hiddenUnits)) throw new Error("Dimensión inválida en w1");
  if (b1?.length !== hiddenUnits || w2?.length !== hiddenUnits || w2.some((row) => row.length !== 1) || b2?.length !== 1 || rainRaw?.length !== 1 || safetyRaw?.length !== 1) throw new Error("Dimensión inválida en el corrector físico");
}

function correctorFeatureValues(featureSequence, standardizedDelta) {
  const first = featureSequence[0];
  const last = featureSequence.at(-1);
  return {
    lstm_delta_standardized: standardizedDelta,
    current_displacement_mm: last.current_displacement_mm,
    current_rainfall_mm_h: last.current_rainfall_mm_h,
    cumulative_rainfall_mm: last.cumulative_rainfall_mm,
    forecast_rainfall_mm: last.forecast_rainfall_mm,
    maximum_pore_pressure_kpa: last.maximum_pore_pressure_kpa,
    mohr_coulomb_safety_index: last.mohr_coulomb_safety_index,
    simulation_hour: last.simulation_hour,
    cohesion_kpa: last.cohesion_kpa,
    friction_angle_deg: last.friction_angle_deg,
    unit_weight_kn_m3: last.unit_weight_kn_m3,
    young_modulus_mpa: last.young_modulus_mpa,
    log10_permeability_m_s: last.log10_permeability_m_s,
    drainage_efficiency: last.drainage_efficiency,
    water_table_m: last.water_table_m,
    storage_coefficient: last.storage_coefficient,
    lookback_displacement_change_mm: last.current_displacement_mm - first.current_displacement_mm,
    lookback_pore_pressure_change_kpa: last.maximum_pore_pressure_kpa - first.maximum_pore_pressure_kpa,
    lookback_safety_index_change: last.mohr_coulomb_safety_index - first.mohr_coulomb_safety_index
  };
}

export function inferPhysicsGuidedSequence(artifact, lstmArtifact, featureSequence, currentDisplacementMm) {
  validateArtifact(artifact);
  if (artifact.architecture.baseModelId !== lstmArtifact.id) throw new Error("El corrector físico no corresponde al artefacto LSTM seleccionado");
  const lstm = inferLstmSequence(lstmArtifact, featureSequence, currentDisplacementMm);
  const features = correctorFeatureValues(featureSequence, lstm.standardizedDelta);
  const normalized = PHYSICS_GUIDED_FEATURES.map((name) => {
    const deviation = finite(artifact.model.inputStandardDeviation[name], `desviación ${name}`);
    if (deviation <= 0) throw new Error(`Desviación inválida para ${name}`);
    return (finite(features[name], name) - finite(artifact.model.inputMean[name], `media ${name}`)) / deviation;
  });
  const rainIndex = PHYSICS_GUIDED_FEATURES.indexOf("forecast_rainfall_mm");
  const safetyIndex = PHYSICS_GUIDED_FEATURES.indexOf("mohr_coulomb_safety_index");
  const networkInput = [...normalized];
  networkInput[rainIndex] = 0;
  networkInput[safetyIndex] = 0;
  const { w1, b1, w2, b2, rainRaw, safetyRaw } = artifact.model.weights;
  const hidden = b1.map((bias, hiddenIndex) => Math.tanh(networkInput.reduce((sum, value, inputIndex) => sum + value * w1[inputIndex][hiddenIndex], bias)));
  let correction = hidden.reduce((sum, value, index) => sum + value * w2[index][0], b2[0]);
  correction += softplus(rainRaw[0]) * normalized[rainIndex] - softplus(safetyRaw[0]) * normalized[safetyIndex];
  const standardizedDelta = lstm.standardizedDelta + correction;
  const predictedDeltaMm = finite(lstmArtifact.model.targetDeltaMean, "targetDeltaMean") + standardizedDelta * finite(lstmArtifact.model.targetDeltaStandardDeviation, "targetDeltaStandardDeviation");
  const current = finite(currentDisplacementMm, "desplazamiento actual");
  const unconstrainedPredictionMm = current + predictedDeltaMm;
  const predictionMm = Math.max(current, unconstrainedPredictionMm);
  const halfWidthMm = finite(artifact.uncertainty.halfWidthMm, "semiamplitud del intervalo");
  return {
    standardizedDelta,
    correctionStandardized: correction,
    unconstrainedPredictionMm,
    predictionMm,
    predictedIncrementMm: predictionMm - current,
    constraintApplied: unconstrainedPredictionMm < current,
    intervalMm: {
      lower: Math.max(current, predictionMm - halfWidthMm),
      upper: predictionMm + halfWidthMm,
      nominalCoverage: artifact.uncertainty.nominalCoverage
    },
    lstmPredictionMm: lstm.predictionMm
  };
}

export function forecastFemRunWithPhysicsGuidance(run, artifact, lstmArtifact, input = {}) {
  const context = buildFemLstmContext(run, lstmArtifact, input);
  if (context.horizonHours !== artifact.architecture.horizonHours) throw new Error(`El corrector físico fue entrenado para ${artifact.architecture.horizonHours} h`);
  const inference = inferPhysicsGuidedSequence(artifact, lstmArtifact, context.featureSequence, context.current.maximumRainfallInducedDisplacementMm);
  const femReference = finite(context.target.maximumRainfallInducedDisplacementMm, "referencia FEM");
  return {
    id: `PGNN-${run.id}-${context.horizonHours}H-O${context.originHour}`,
    generatedAt: new Date().toISOString(),
    runId: run.id,
    modelId: artifact.id,
    baseModelId: lstmArtifact.id,
    method: artifact.method,
    scientificStatus: "RED_GUIADA_POR_FISICA_AGREGADA_NO_PINN_PDE_NO_OPERACIONAL",
    horizonHours: context.horizonHours,
    lookbackHours: context.lookbackHours,
    originHour: context.originHour,
    targetHour: context.targetHour,
    forecastRainfallMm: Number(context.futureRainfallMm.toFixed(8)),
    currentDisplacementMm: Number(context.current.maximumRainfallInducedDisplacementMm.toFixed(12)),
    lstmPredictionMm: Number(inference.lstmPredictionMm.toFixed(12)),
    predictedDisplacementMm: Number(inference.predictionMm.toFixed(12)),
    predictedIncrementMm: Number(inference.predictedIncrementMm.toFixed(12)),
    unconstrainedPredictionMm: Number(inference.unconstrainedPredictionMm.toFixed(12)),
    constraintApplied: inference.constraintApplied,
    intervalMm: {
      lower: Number(inference.intervalMm.lower.toFixed(12)),
      upper: Number(inference.intervalMm.upper.toFixed(12)),
      nominalCoverage: inference.intervalMm.nominalCoverage
    },
    femReferenceDisplacementMm: Number(femReference.toFixed(12)),
    errorAgainstFemMm: Number((inference.predictionMm - femReference).toFixed(12)),
    absoluteErrorAgainstFemMm: Number(Math.abs(inference.predictionMm - femReference).toFixed(12)),
    physicsConstraints: artifact.architecture.monotonicByConstruction,
    latencyBenchmark: artifact.latency,
    provenance: {
      rainfallSource: run.rainfall?.source ?? null,
      rainfallDate: run.rainfall?.date ?? null,
      mechanicalResponseSource: run.method?.id ?? null,
      modelDataset: artifact.dataset?.sourceDatasetId ?? null
    },
    limitation: artifact.scope
  };
}
