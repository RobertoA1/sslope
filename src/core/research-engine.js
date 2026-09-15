import { computeFemState, createForecast, temporalForecast } from "./forecast-engine.js";

export const RESEARCH_PROTOCOL = Object.freeze({
  id: "M1-FEM-LSTM-PINN",
  title: "Gemelo digital informado por la física para estabilidad de taludes en minas a cielo abierto",
  objective: "Evaluar pronóstico temporal, consistencia física, sensibilidad hidrológica y latencia del gemelo digital.",
  scientificStatus: "PROTOCOLO_INTEGRADO_MVP_NO_VALIDADO",
  targetVariables: ["desplazamientoMm", "factorDeSeguridad", "presionDePorosKpa", "nivelDeRiesgo"],
  requiredValidation: ["FEM calibrado", "LSTM entrenada", "PINN entrenada", "datos reales", "evaluación temporal", "ablación"]
});

export const ABLATION_VARIANTS = Object.freeze([
  { id: "PERSISTENCE", label: "Persistencia", components: "Datos actuales" },
  { id: "TEMPORAL_PROXY", label: "Temporal", components: "Sustituto recurrente" },
  { id: "REDUCED_PHYSICS", label: "Físico reducido", components: "Mohr–Coulomb reducido" },
  { id: "HYBRID_NO_HYDROLOGY", label: "Híbrido sin hidrología", components: "Físico + temporal + corrección" },
  { id: "HYBRID_MVP", label: "Híbrido completo", components: "Físico + temporal + hidrología + corrección" }
]);

function estimateObservedRate(readings) {
  if (readings.length < 2) return 0;
  const recent = readings.slice(-Math.min(8, readings.length));
  const first = recent[0];
  const last = recent.at(-1);
  const hours = Math.max(0.25, (new Date(last.timestamp) - new Date(first.timestamp)) / 3_600_000);
  return Math.max(0, (last.displacementMm - first.displacementMm) / hours);
}

function predictVariant(variant, readings, horizonHours, parameters, riskPolicy) {
  const last = readings.at(-1);
  if (variant === "PERSISTENCE") return last.displacementMm;
  if (variant === "TEMPORAL_PROXY") return last.displacementMm + temporalForecast(readings, horizonHours, parameters).incrementMm;
  if (variant === "REDUCED_PHYSICS") {
    const fem = computeFemState(readings, parameters);
    const rate = estimateObservedRate(readings) * (0.65 + fem.physicsRisk * 0.7);
    return last.displacementMm + rate * horizonHours;
  }
  const variantParameters = variant === "HYBRID_NO_HYDROLOGY"
    ? { ...parameters, rainfallFactor: 0, waterPressureFactor: 0 }
    : parameters;
  return createForecast(readings, horizonHours, variantParameters, riskPolicy).predictedDisplacementMm;
}

function metrics(actual, predicted) {
  const errors = actual.map((value, index) => predicted[index] - value);
  const mae = errors.reduce((sum, value) => sum + Math.abs(value), 0) / errors.length;
  const rmse = Math.sqrt(errors.reduce((sum, value) => sum + value ** 2, 0) / errors.length);
  const bias = errors.reduce((sum, value) => sum + value, 0) / errors.length;
  const mean = actual.reduce((sum, value) => sum + value, 0) / actual.length;
  const total = actual.reduce((sum, value) => sum + (value - mean) ** 2, 0);
  const residual = errors.reduce((sum, value) => sum + value ** 2, 0);
  return {
    maeMm: Number(mae.toFixed(4)),
    rmseMm: Number(rmse.toFixed(4)),
    biasMm: Number(bias.toFixed(4)),
    r2: total > 1e-12 ? Number((1 - residual / total).toFixed(4)) : null
  };
}

export function runAblationStudy(readings, input = {}, parameters = {}, riskPolicy = {}) {
  const horizonHours = Number(input.horizonHours || 1);
  if (![1, 6, 24].includes(horizonHours)) throw new Error("La ablación admite horizontes de 1, 6 o 24 horas");
  if (!Array.isArray(readings) || readings.length < 32 + horizonHours) throw new Error("Se requieren al menos 32 lecturas más el horizonte para la ablación");
  const actual = [];
  const predictions = Object.fromEntries(ABLATION_VARIANTS.map((variant) => [variant.id, []]));
  for (let origin = 24; origin + horizonHours < readings.length; origin++) {
    const history = readings.slice(0, origin + 1);
    actual.push(readings[origin + horizonHours].displacementMm);
    ABLATION_VARIANTS.forEach((variant) => {
      predictions[variant.id].push(predictVariant(variant.id, history, horizonHours, parameters, riskPolicy));
    });
  }
  const results = ABLATION_VARIANTS.map((variant) => ({
    ...variant,
    ...metrics(actual, predictions[variant.id])
  }));
  const simulatedOnly = readings.every((row) => ["synthetic", "rain-simulation", "historical-rain-replay"].includes(row.source));
  const includesSourceDerivedRainfall = readings.some((row) => row.source === "historical-rain-replay");
  return {
    id: `EXP-${Date.now()}`,
    generatedAt: new Date().toISOString(),
    protocolId: RESEARCH_PROTOCOL.id,
    horizonHours,
    sampleCount: actual.length,
    datasetStatus: readings.every((row) => row.source === "synthetic") ? "SINTETICO" : simulatedOnly && includesSourceDerivedRainfall ? "SEMI_SINTETICO_REANALISIS_LLUVIA" : simulatedOnly ? "SIMULADO" : "MIXTO_O_INGRESADO",
    scientificStatus: "ABLACION_DEMOSTRATIVA_NO_PUBLICABLE",
    results,
    bestByMae: results.reduce((best, current) => current.maeMm < best.maeMm ? current : best).id,
    note: "Compara los componentes actuales del MVP. No sustituye evaluación con FEM, LSTM y PINN entrenados sobre datos reales."
  };
}
