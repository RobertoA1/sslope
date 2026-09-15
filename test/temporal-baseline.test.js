import test from "node:test";
import assert from "node:assert/strict";
import { buildTemporalSamples, flatCsv, parseFlatCsv, splitFemDataset, trainTemporalBaseline } from "../src/core/temporal-baseline.js";

function scenarioRows(scenarioIndex, hours = 8) {
  const id = `S${String(scenarioIndex).padStart(3, "0")}`;
  const rainfall = scenarioIndex * 0.4;
  return Array.from({ length: hours }, (_, index) => {
    const hour = index + 1;
    const target = scenarioIndex * 0.002 + rainfall * hour * 0.003;
    return {
      scenario_id: id,
      simulation_hour: String(hour),
      rainfall_mm_h: String(rainfall),
      cumulative_rainfall_mm: String(rainfall * hour),
      observed_daily_rainfall_mm: String(rainfall * 24),
      cohesion_kpa: String(80 + scenarioIndex),
      friction_angle_deg: "32",
      unit_weight_kn_m3: "22",
      young_modulus_mpa: String(900 + scenarioIndex * 10),
      permeability_m_s: "1e-7",
      drainage_efficiency: "0.35",
      water_table_m: "28",
      storage_coefficient: "0.22",
      rainfall_induced_max_displacement_mm: String(target),
      maximum_pore_pressure_kpa: String(100 + rainfall * hour),
      mohr_coulomb_safety_index: String(1.5 - scenarioIndex * 0.005)
    };
  });
}

function manifest(count) {
  return Array.from({ length: count }, (_, index) => ({
    scenarioId: `S${String(index + 1).padStart(3, "0")}`,
    observedDailyRainfallMm: (index + 1) * 9.6,
    summary: { riskLevel: ["NORMAL", "VIGILANCIA", "ALERTA", "CRITICO"][index % 4] }
  }));
}

test("el parser CSV conserva columnas, filas y valores citados", () => {
  const columns = ["scenario_id", "note", "value"];
  const rows = [{ scenario_id: "S1", note: "lluvia, intensa", value: "2.5" }];
  assert.deepEqual(parseFlatCsv(flatCsv(columns, rows)), { columns, rows });
});

test("la división agrupa escenarios y reserva eventos extremos", () => {
  const scenarios = manifest(20);
  const rows = scenarios.flatMap((_, index) => scenarioRows(index + 1, 3));
  const split = splitFemDataset(rows, scenarios, { seed: 7 });
  assert.deepEqual(Object.fromEntries(Object.entries(split.scenarioIds).map(([name, ids]) => [name, ids.length])), { train: 14, validation: 3, test: 3 });
  assert.equal(split.reservedExtremeEvents.test.scenarioId, "S020");
  assert.equal(split.reservedExtremeEvents.validation.scenarioId, "S019");
  const memberships = new Map();
  Object.entries(split.rows).forEach(([name, splitRows]) => splitRows.forEach((row) => {
    if (memberships.has(row.scenario_id)) assert.equal(memberships.get(row.scenario_id), name);
    memberships.set(row.scenario_id, name);
  }));
  assert.equal(memberships.size, 20);
});

test("la línea ridge supera persistencia en una serie lineal independiente", () => {
  const splitRows = {
    train: Array.from({ length: 24 }, (_, index) => scenarioRows(index + 1)).flat(),
    validation: Array.from({ length: 4 }, (_, index) => scenarioRows(index + 25)).flat(),
    test: Array.from({ length: 4 }, (_, index) => scenarioRows(index + 29)).flat()
  };
  assert.equal(buildTemporalSamples(splitRows.test, 1).length, 28);
  const result = trainTemporalBaseline(splitRows, { horizonHours: 1 });
  assert.equal(result.metrics.test.ridge.sampleCount, 28);
  assert.ok(result.metrics.test.ridge.maeMm < result.metrics.test.persistence.maeMm);
  assert.equal(result.testPredictions.length, 28);
});
