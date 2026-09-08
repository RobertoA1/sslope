/**
 * Motor de inferencia del MVP M-1.
 *
 * No pretende reemplazar un solver FEM ni una PINN entrenada. Implementa el
 * contrato del modelo híbrido con tres partes intercambiables: estado físico,
 * predicción temporal recurrente y corrección informada por física. Esto hace
 * posible conectar posteriormente FEniCSx/OpenSeesPy y un modelo PyTorch sin
 * modificar la API o el panel.
 */

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const sigmoid = (value) => 1 / (1 + Math.exp(-value));

export const RISK_LEVELS = ["NORMAL", "VIGILANCIA", "ALERTA", "CRITICO"];
export const DEFAULT_RISK_POLICY = Object.freeze({
  status: "DEMO_NO_VALIDADA",
  riskWatch: 0.3,
  riskAlert: 0.55,
  riskCritical: 0.78,
  fsWatch: 1.3,
  fsAlert: 1.15,
  fsCritical: 1.0,
  uncertaintyWatch: 0.55
});

export const DEFAULT_SIMULATION_PARAMETERS = Object.freeze({
  cohesionKpa: 280,
  frictionAngleDeg: 31,
  unitWeightKNm3: 25,
  slopeAngleDeg: 42,
  characteristicDepthM: 30,
  waterPressureFactor: 1,
  rainfallFactor: 1,
  weatheringFactor: 0,
  seismicCoefficient: 0,
  surchargeKpa: 0,
  drainageEfficiency: 0,
  reinforcementKpa: 0,
  geometryType: "LINEAR",
  slopeHeightM: 90,
  slopeWidthM: 160,
  bedrockCondition: "NONE",
  bedrockDepthM: 30,
  rockDiscontinuityFactor: 0
});

export function validateReading(input) {
  const required = ["sensorId", "timestamp", "displacementMm", "porePressureKpa", "rainfallMmH"];
  for (const key of required) {
    if (input[key] === undefined || input[key] === null || input[key] === "") {
      throw new Error(`Campo requerido: ${key}`);
    }
  }
  const timestamp = new Date(input.timestamp);
  if (Number.isNaN(timestamp.getTime())) throw new Error("timestamp debe ser una fecha ISO válida");

  const parsed = {
    sensorId: String(input.sensorId).trim(),
    timestamp: timestamp.toISOString(),
    displacementMm: Number(input.displacementMm),
    porePressureKpa: Number(input.porePressureKpa),
    rainfallMmH: Number(input.rainfallMmH),
    qualityFlag: input.qualityFlag ?? "VALID",
    source: input.source ?? "api"
  };
  for (const key of ["displacementMm", "porePressureKpa", "rainfallMmH"]) {
    if (!Number.isFinite(parsed[key])) throw new Error(`${key} debe ser numérico`);
  }
  if (!parsed.sensorId) throw new Error("sensorId no puede estar vacío");
  if (parsed.displacementMm < 0 || parsed.porePressureKpa < 0 || parsed.rainfallMmH < 0) {
    throw new Error("Las mediciones no pueden ser negativas");
  }
  return parsed;
}

/** Modelo físico reducido: aproximación Mohr-Coulomb para un perfil 2D. */
export function computeFemState(readings, parameters = {}) {
  const p = {
    ...DEFAULT_SIMULATION_PARAMETERS,
    ...parameters
  };
  const last = readings.at(-1);
  if (!last) return null;
  const radians = (p.slopeAngleDeg * Math.PI) / 180;
  const heightScale = p.slopeHeightM / 90;
  const analysisDepthM = p.characteristicDepthM * heightScale;
  const baseOverburden = p.unitWeightKNm3 * analysisDepthM + p.surchargeKpa;
  const geometryDrivingFactor = p.geometryType === "CIRCULAR" ? 0.92 : p.geometryType === "SEMICIRCULAR" ? 0.96 : p.geometryType === "BENCHED" ? 0.97 : p.geometryType === "WASTE_DUMP" ? 1.04 : 1;
  const normalStress = baseOverburden * Math.cos(radians) ** 2;
  const drivingStress = baseOverburden * Math.sin(radians) * Math.cos(radians) * (1 + p.seismicCoefficient) * geometryDrivingFactor;
  const porePressure = last.porePressureKpa * p.waterPressureFactor * (1 - p.drainageEfficiency);
  const effectiveNormalStress = Math.max(1, normalStress - porePressure);
  const materialLoss = p.weatheringFactor + (p.bedrockCondition === "FRACTURED" ? p.rockDiscontinuityFactor * 0.35 : 0);
  const soilCohesion = p.cohesionKpa * Math.max(0.1, 1 - materialLoss) + p.reinforcementKpa;
  const soilFriction = p.frictionAngleDeg * Math.max(0.4, 1 - materialLoss * 0.35);
  const bedrockShare = p.bedrockCondition === "NONE" ? 0 : clamp((analysisDepthM - p.bedrockDepthM) / analysisDepthM, 0, 1);
  const rockCohesion = p.bedrockCondition === "HARD" ? 520 * (1 - p.rockDiscontinuityFactor * 0.35) : 135 * (1 - p.rockDiscontinuityFactor);
  const rockFriction = p.bedrockCondition === "HARD" ? 42 * (1 - p.rockDiscontinuityFactor * 0.2) : 24 * (1 - p.rockDiscontinuityFactor * 0.4);
  const effectiveCohesion = soilCohesion * (1 - bedrockShare) + rockCohesion * bedrockShare;
  const effectiveFrictionAngleDeg = soilFriction * (1 - bedrockShare) + rockFriction * bedrockShare;
  const shearResistance = effectiveCohesion + effectiveNormalStress * Math.tan((effectiveFrictionAngleDeg * Math.PI) / 180);
  const factorOfSafety = shearResistance / drivingStress;
  const rainEffect = clamp((last.rainfallMmH * p.rainfallFactor) / 50, 0, 1);
  const displacementRateMmH = estimateSlope(readings);

  return {
    factorOfSafety: Number(factorOfSafety.toFixed(3)),
    effectiveNormalStressKpa: Number(effectiveNormalStress.toFixed(2)),
    porePressureKpa: Number(porePressure.toFixed(2)),
    drivingStressKpa: Number(drivingStress.toFixed(2)),
    displacementRateMmH: Number(displacementRateMmH.toFixed(3)),
    physicsRisk: Number(clamp((1.35 - factorOfSafety) / 0.65 + rainEffect * 0.15, 0, 1).toFixed(3)),
    slopeAngleDeg: p.slopeAngleDeg,
    effectiveCohesionKpa: Number(effectiveCohesion.toFixed(2)),
    effectiveFrictionAngleDeg: Number(effectiveFrictionAngleDeg.toFixed(2)),
    analysisDepthM: Number(analysisDepthM.toFixed(2)),
    bedrockShare: Number(bedrockShare.toFixed(3)),
    geometryDrivingFactor
  };
}

function estimateSlope(readings) {
  if (readings.length < 2) return 0;
  const recent = readings.slice(-Math.min(8, readings.length));
  const first = recent[0];
  const last = recent.at(-1);
  const hours = Math.max(0.25, (new Date(last.timestamp) - new Date(first.timestamp)) / 3_600_000);
  return Math.max(0, (last.displacementMm - first.displacementMm) / hours);
}

/**
 * Sustituto liviano de LSTM para el MVP: una celda recurrente con compuertas
 * deterministas. En producción se sustituye por pesos entrenados/exportados.
 */
export function temporalForecast(readings, horizonHours, parameters = {}) {
  const p = { ...DEFAULT_SIMULATION_PARAMETERS, ...parameters };
  const sequence = readings.slice(-24);
  if (!sequence.length) return { incrementMm: 0, temporalRisk: 0, hiddenState: 0 };
  let cell = 0;
  let hidden = 0;
  let previous = sequence[0].displacementMm;
  for (const row of sequence) {
    const increment = Math.max(0, row.displacementMm - previous);
    previous = row.displacementMm;
    const x = increment * 0.16 + row.porePressureKpa * p.waterPressureFactor * (1 - p.drainageEfficiency) * 0.004 + row.rainfallMmH * p.rainfallFactor * 0.035 + p.seismicCoefficient * 0.6;
    const forgetGate = sigmoid(0.7 - x * 0.18);
    const inputGate = sigmoid(x - 0.35);
    const candidate = Math.tanh(x + hidden * 0.4);
    cell = forgetGate * cell + inputGate * candidate;
    hidden = Math.tanh(cell);
  }
  const baseRate = estimateSlope(sequence);
  const acceleration = clamp(hidden * 0.55 + baseRate * 0.12 + p.seismicCoefficient * 1.5 + p.weatheringFactor * 0.2, 0, 4);
  const incrementMm = Math.max(0, (baseRate + acceleration) * horizonHours);
  return {
    incrementMm: Number(incrementMm.toFixed(3)),
    temporalRisk: Number(clamp(sigmoid(hidden + baseRate * 0.28) - 0.35, 0, 1).toFixed(3)),
    hiddenState: Number(hidden.toFixed(4))
  };
}

/** Corrección PINN-inspired: penaliza incrementos incompatibles con el estado FEM. */
export function physicsInformedFusion(temporal, femState, horizonHours) {
  const safetyPressure = clamp((1.2 - femState.factorOfSafety) / 0.35, 0, 1);
  const permittedRate = femState.factorOfSafety >= 1.25 ? 0.45 : 0.45 + safetyPressure * 5.5;
  const unconstrainedRate = temporal.incrementMm / horizonHours;
  const correctedRate = unconstrainedRate * (0.72 + safetyPressure * 0.55);
  const residual = Math.abs(correctedRate - permittedRate) / Math.max(permittedRate, 0.1);
  const uncertainty = clamp(0.08 + femState.physicsRisk * 0.32 + temporal.temporalRisk * 0.22 + Math.min(residual, 1) * 0.18, 0.08, 0.85);
  const predictedIncrementMm = Math.max(0, correctedRate * horizonHours);
  const riskScore = clamp(0.52 * femState.physicsRisk + 0.35 * temporal.temporalRisk + 0.13 * Math.min(residual, 1), 0, 1);
  return {
    predictedIncrementMm: Number(predictedIncrementMm.toFixed(3)),
    riskScore: Number(riskScore.toFixed(3)),
    physicsResidual: Number(residual.toFixed(3)),
    uncertainty: Number(uncertainty.toFixed(3))
  };
}

export function classifyRisk(riskScore, factorOfSafety, uncertainty, policy = DEFAULT_RISK_POLICY) {
  if (factorOfSafety < policy.fsCritical || riskScore >= policy.riskCritical) return "CRITICO";
  if (factorOfSafety < policy.fsAlert || riskScore >= policy.riskAlert) return "ALERTA";
  if (factorOfSafety < policy.fsWatch || riskScore >= policy.riskWatch || uncertainty >= policy.uncertaintyWatch) return "VIGILANCIA";
  return "NORMAL";
}

export function createForecast(readings, horizonHours = 24, parameters = {}, riskPolicy = DEFAULT_RISK_POLICY) {
  if (!Number.isFinite(Number(horizonHours)) || Number(horizonHours) <= 0) throw new Error("horizonHours debe ser positivo");
  if (!readings.length) throw new Error("No existen lecturas para pronosticar");
  const femState = computeFemState(readings, parameters);
  const temporal = temporalForecast(readings, Number(horizonHours), parameters);
  const fusion = physicsInformedFusion(temporal, femState, Number(horizonHours));
  const last = readings.at(-1);
  const level = classifyRisk(fusion.riskScore, femState.factorOfSafety, fusion.uncertainty, riskPolicy);
  return {
    generatedAt: new Date().toISOString(),
    targetAt: new Date(new Date(last.timestamp).getTime() + Number(horizonHours) * 3_600_000).toISOString(),
    horizonHours: Number(horizonHours),
    sensorId: last.sensorId,
    currentDisplacementMm: last.displacementMm,
    predictedDisplacementMm: Number((last.displacementMm + fusion.predictedIncrementMm).toFixed(3)),
    predictedIncrementMm: fusion.predictedIncrementMm,
    intervalMm: {
      lower: Number(Math.max(0, last.displacementMm + fusion.predictedIncrementMm * (1 - fusion.uncertainty)).toFixed(3)),
      upper: Number((last.displacementMm + fusion.predictedIncrementMm * (1 + fusion.uncertainty)).toFixed(3))
    },
    risk: { level, score: fusion.riskScore, uncertainty: fusion.uncertainty, policyStatus: riskPolicy.status },
    femState,
    modelDiagnostics: {
      temporalRisk: temporal.temporalRisk,
      physicsResidual: fusion.physicsResidual,
      modelVersion: "m1-mvp-0.1"
    },
    simulationParameters: { ...DEFAULT_SIMULATION_PARAMETERS, ...parameters }
  };
}

export function syntheticReadings({ count = 72, critical = false, sensorId = "EXT-01" } = {}) {
  const start = Date.now() - count * 3_600_000;
  let displacement = 3;
  return Array.from({ length: count }, (_, index) => {
    const escalation = critical && index > count * 0.62 ? (index - count * 0.62) / 6 : 0;
    const rainfall = Math.max(0, 3 + Math.sin(index / 4) * 2 + escalation * 1.8);
    const porePressure = 105 + Math.sin(index / 7) * 10 + escalation * 17;
    displacement += Math.max(0.02, 0.09 + rainfall * 0.018 + escalation * 0.22);
    return {
      sensorId,
      timestamp: new Date(start + index * 3_600_000).toISOString(),
      displacementMm: Number(displacement.toFixed(3)),
      porePressureKpa: Number(porePressure.toFixed(3)),
      rainfallMmH: Number(rainfall.toFixed(3)),
      qualityFlag: "VALID",
      source: "synthetic"
    };
  });
}
