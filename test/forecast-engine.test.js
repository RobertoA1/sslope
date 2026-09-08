import test from "node:test";
import assert from "node:assert/strict";
import { createForecast, syntheticReadings, validateReading } from "../src/core/forecast-engine.js";
import { TwinStore } from "../src/store.js";

test("crea un pronóstico híbrido completo", () => {
  const forecast = createForecast(syntheticReadings({ count: 48 }), 24);
  assert.equal(forecast.horizonHours, 24);
  assert.ok(forecast.predictedDisplacementMm >= forecast.currentDisplacementMm);
  assert.ok(forecast.femState.factorOfSafety > 0);
  assert.ok(["NORMAL", "VIGILANCIA", "ALERTA", "CRITICO"].includes(forecast.risk.level));
});

test("rechaza telemetría inválida", () => {
  assert.throws(() => validateReading({ sensorId: "A" }), /Campo requerido/);
  assert.throws(() => validateReading({ sensorId: "A", timestamp: "2026-01-01", displacementMm: -1, porePressureKpa: 2, rainfallMmH: 0 }), /no pueden ser negativas/);
});

test("escenario crítico incrementa el riesgo", () => {
  const normal = createForecast(syntheticReadings({ count: 72, critical: false }), 24);
  const critical = createForecast(syntheticReadings({ count: 72, critical: true }), 24);
  assert.ok(critical.risk.score > normal.risk.score);
});

test("el agua debilita y el drenaje recupera estabilidad", () => {
  const readings = syntheticReadings({ count: 72, critical: true });
  const baseline = createForecast(readings, 24);
  const saturated = createForecast(readings, 24, { waterPressureFactor: 1.5 });
  const drained = createForecast(readings, 24, { waterPressureFactor: 1.5, drainageEfficiency: 0.6 });
  assert.ok(saturated.femState.factorOfSafety < baseline.femState.factorOfSafety);
  assert.ok(drained.femState.factorOfSafety > saturated.femState.factorOfSafety);
});

test("la roca dura subyacente y sus discontinuidades afectan la estabilidad", () => {
  const readings = syntheticReadings({ count: 72, critical: true });
  const soilOnly = createForecast(readings, 24);
  const hardRock = createForecast(readings, 24, { bedrockCondition: "HARD", bedrockDepthM: 5 });
  const fracturedRock = createForecast(readings, 24, { bedrockCondition: "FRACTURED", bedrockDepthM: 5, rockDiscontinuityFactor: 0.7 });
  assert.ok(hardRock.femState.factorOfSafety > soilOnly.femState.factorOfSafety);
  assert.ok(fracturedRock.femState.factorOfSafety < hardRock.femState.factorOfSafety);
});

test("el perfil geométrico modifica la demanda reducida de estabilidad", () => {
  const readings = syntheticReadings({ count: 72 });
  const linear = createForecast(readings, 24, { geometryType: "LINEAR" });
  const circular = createForecast(readings, 24, { geometryType: "CIRCULAR" });
  assert.ok(circular.femState.factorOfSafety > linear.femState.factorOfSafety);
  assert.equal(circular.femState.geometryDrivingFactor, 0.92);
});

test("acepta una geometría categórica sin convertirla a número", () => {
  const store = new TwinStore();
  const parameters = store.updateSimulationParameters({ geometryType: "SEMICIRCULAR" });
  assert.equal(parameters.geometryType, "SEMICIRCULAR");
});

test("la política de riesgo se puede configurar sin cambiar el estado físico", () => {
  const readings = syntheticReadings({ count: 72 });
  const defaultRisk = createForecast(readings, 24);
  const stricterRisk = createForecast(readings, 24, {}, { riskWatch: 0.1, riskAlert: 0.2, riskCritical: 0.3, fsWatch: 1.5, fsAlert: 1.2, fsCritical: 1, uncertaintyWatch: 0.2, status: "CONFIGURADA_PENDIENTE_VALIDACION" });
  assert.equal(defaultRisk.femState.factorOfSafety, stricterRisk.femState.factorOfSafety);
  assert.equal(stricterRisk.risk.policyStatus, "CONFIGURADA_PENDIENTE_VALIDACION");
});
