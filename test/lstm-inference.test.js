import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseNasaPowerDailyCsv } from "../src/core/rainfall-history.js";
import { forecastFemRunWithLstm, inferLstmSequence, LSTM_FEATURES } from "../src/core/lstm-inference.js";
import { forecastFemRunWithPhysicsGuidance, inferPhysicsGuidedSequence } from "../src/core/physics-guided-inference.js";
import { runTa01FemCase } from "../src/core/study-case-ta01.js";

const artifact = JSON.parse(await readFile(new URL("../data/models/ta01-lstm-1h.json", import.meta.url), "utf8"));
const physicsArtifact = JSON.parse(await readFile(new URL("../data/models/ta01-physics-guided-1h.json", import.meta.url), "utf8"));

const parseCsv = (text) => {
  const [header, ...lines] = text.trim().split("\n");
  const columns = header.split(",");
  return lines.map((line) => Object.fromEntries(line.split(",").map((value, index) => [columns[index], value])));
};

const sequenceFeatures = (scenario, originIndex, forecastRainfallMm) => scenario.slice(originIndex - 5, originIndex + 1).map((row) => ({
  current_displacement_mm: Number(row.rainfall_induced_max_displacement_mm),
  current_rainfall_mm_h: Number(row.rainfall_mm_h),
  cumulative_rainfall_mm: Number(row.cumulative_rainfall_mm),
  forecast_rainfall_mm: forecastRainfallMm,
  maximum_pore_pressure_kpa: Number(row.maximum_pore_pressure_kpa),
  mohr_coulomb_safety_index: Number(row.mohr_coulomb_safety_index),
  simulation_hour: Number(row.simulation_hour),
  cohesion_kpa: Number(row.cohesion_kpa),
  friction_angle_deg: Number(row.friction_angle_deg),
  unit_weight_kn_m3: Number(row.unit_weight_kn_m3),
  young_modulus_mpa: Number(row.young_modulus_mpa),
  log10_permeability_m_s: Math.log10(Number(row.permeability_m_s)),
  drainage_efficiency: Number(row.drainage_efficiency),
  water_table_m: Number(row.water_table_m),
  storage_coefficient: Number(row.storage_coefficient)
}));

test("la inferencia JavaScript respeta las dimensiones y la restricción física", () => {
  const sequence = Array.from({ length: artifact.architecture.lookbackHours }, () => Object.fromEntries(LSTM_FEATURES.map((feature) => [feature, artifact.model.featureMean[feature]])));
  const result = inferLstmSequence(artifact, sequence, 0.25);
  assert.ok(Number.isFinite(result.predictionMm));
  assert.ok(result.predictionMm >= 0.25);
});

test("la LSTM se ejecuta sobre una corrida FEM TA-01 y conserva trazabilidad", () => {
  const rainfall = parseNasaPowerDailyCsv(`-BEGIN HEADER-\nLocation: latitude -10.68 longitude -76.26\nelevation from MERRA-2: Average for region = 3994.12 meters\n-END HEADER-\nYEAR,DOY,PRECTOTCORR\n2024,1,0\n2024,2,48`);
  const run = runTa01FemCase(rainfall, { date: "2024-01-02", concentrationHours: 12, parameters: { meshX: 8, meshY: 6 } });
  const forecast = forecastFemRunWithLstm(run, artifact, { originHour: 18 });
  assert.equal(forecast.horizonHours, 1);
  assert.equal(forecast.originHour, 18);
  assert.equal(forecast.targetHour, 19);
  assert.equal(forecast.runId, run.id);
  assert.ok(forecast.predictedDisplacementMm >= forecast.currentDisplacementMm);
  assert.ok(Number.isFinite(forecast.absoluteErrorAgainstFemMm));
  assert.match(forecast.scientificStatus, /NO_OPERACIONAL/);
});

test("la cadena FEM–LSTM–corrector físico produce un pronóstico trazable", () => {
  const rainfall = parseNasaPowerDailyCsv(`-BEGIN HEADER-\nLocation: latitude -10.68 longitude -76.26\nelevation from MERRA-2: Average for region = 3994.12 meters\n-END HEADER-\nYEAR,DOY,PRECTOTCORR\n2024,1,0\n2024,2,48`);
  const run = runTa01FemCase(rainfall, { date: "2024-01-02", concentrationHours: 12, parameters: { meshX: 8, meshY: 6 } });
  const forecast = forecastFemRunWithPhysicsGuidance(run, physicsArtifact, artifact, { originHour: 18 });
  assert.equal(forecast.runId, run.id);
  assert.equal(forecast.modelId, physicsArtifact.id);
  assert.equal(forecast.baseModelId, artifact.id);
  assert.equal(forecast.targetHour, 19);
  assert.ok(forecast.predictedDisplacementMm >= forecast.currentDisplacementMm);
  assert.ok(forecast.intervalMm.lower <= forecast.predictedDisplacementMm);
  assert.ok(Number.isFinite(forecast.absoluteErrorAgainstFemMm));
  assert.equal(forecast.provenance.mechanicalResponseSource, run.method.id);
});

test("la inferencia JavaScript reproduce una predicción exportada por Python", async () => {
  const datasetRows = parseCsv(await readFile(new URL("../data/generated/ta01-fem-500-test.csv", import.meta.url), "utf8"));
  const predictionRows = parseCsv(await readFile(new URL("../data/generated/ta01-lstm-1h-test-predictions.csv", import.meta.url), "utf8"));
  const expected = predictionRows[0];
  const scenario = datasetRows.filter((row) => row.scenario_id === expected.scenario_id).sort((a, b) => Number(a.simulation_hour) - Number(b.simulation_hour));
  const originIndex = scenario.findIndex((row) => Number(row.simulation_hour) === Number(expected.origin_hour));
  const forecastRainfallMm = Number(scenario[originIndex + 1].rainfall_mm_h);
  const features = sequenceFeatures(scenario, originIndex, forecastRainfallMm);
  const result = inferLstmSequence(artifact, features, Number(scenario[originIndex].rainfall_induced_max_displacement_mm));
  assert.ok(Math.abs(result.predictionMm - Number(expected.lstm_prediction_mm)) < 2e-8);
});

test("el corrector físico JavaScript reproduce la predicción exportada por Python", async () => {
  const datasetRows = parseCsv(await readFile(new URL("../data/generated/ta01-fem-500-test.csv", import.meta.url), "utf8"));
  const predictionRows = parseCsv(await readFile(new URL("../data/generated/ta01-physics-guided-1h-test-predictions.csv", import.meta.url), "utf8"));
  const expected = predictionRows[0];
  const scenario = datasetRows.filter((row) => row.scenario_id === expected.scenario_id).sort((a, b) => Number(a.simulation_hour) - Number(b.simulation_hour));
  const originIndex = scenario.findIndex((row) => Number(row.simulation_hour) === Number(expected.origin_hour));
  const forecastRainfallMm = Number(scenario[originIndex + 1].rainfall_mm_h);
  const features = sequenceFeatures(scenario, originIndex, forecastRainfallMm);
  const result = inferPhysicsGuidedSequence(physicsArtifact, artifact, features, Number(scenario[originIndex].rainfall_induced_max_displacement_mm));
  assert.ok(Math.abs(result.predictionMm - Number(expected.physics_guided_prediction_mm)) < 2e-8);
  assert.ok(result.intervalMm.lower <= result.predictionMm && result.intervalMm.upper >= result.predictionMm);
});
