import test from "node:test";
import assert from "node:assert/strict";
import { buildTemporalSamples, flatCsv, parseFlatCsv, splitFemChronological, splitFemDataset, trainTemporalBaseline } from "../src/core/temporal-baseline.js";

function scenarioRows(scenarioIndex, hours = 8, sourceDate = new Date(Date.UTC(2024, 0, scenarioIndex)).toISOString().slice(0, 10)) {
  const id = `S${String(scenarioIndex).padStart(3, "0")}`;
  const rainfall = scenarioIndex * 0.4;
  return Array.from({ length: hours }, (_, index) => {
    const hour = index + 1;
    const target = scenarioIndex * 0.002 + rainfall * hour * 0.003;
    return {
      scenario_id: id,
      source_date: sourceDate,
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
    sourceDate: new Date(Date.UTC(2024, 0, index + 1)).toISOString().slice(0, 10),
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
  const rows = scenarios.flatMap((scenario, index) => scenarioRows(index + 1, 3, scenario.sourceDate));
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

test("una fecha de lluvia repetida no cruza entrenamiento, validación y prueba", () => {
  const scenarios = manifest(20);
  scenarios[3].sourceDate = scenarios[18].sourceDate;
  scenarios[6].sourceDate = scenarios[19].sourceDate;
  const rows = scenarios.flatMap((scenario, index) => scenarioRows(index + 1, 3, scenario.sourceDate));
  const split = splitFemDataset(rows, scenarios, { seed: 7 });
  const byId = new Map(scenarios.map((scenario) => [scenario.scenarioId, scenario]));
  const dateMembership = new Map();
  for (const [name, ids] of Object.entries(split.scenarioIds)) {
    for (const id of ids) {
      const date = byId.get(id).sourceDate;
      if (dateMembership.has(date)) assert.equal(dateMembership.get(date), name);
      dateMembership.set(date, name);
    }
  }
  assert.deepEqual(Object.fromEntries(Object.entries(split.scenarioIds).map(([name, ids]) => [name, ids.length])), { train: 14, validation: 3, test: 3 });
  assert.equal(split.reservedExtremeEvents.test.scenarioId, "S020");
  assert.equal(split.reservedExtremeEvents.validation.scenarioId, "S019");
});

test("rechaza fechas del CSV que no coinciden con el manifiesto", () => {
  const scenarios = manifest(3);
  const rows = scenarios.flatMap((scenario, index) => scenarioRows(index + 1, 3, scenario.sourceDate));
  rows[0].source_date = "2023-01-01";
  assert.throws(() => splitFemDataset(rows, scenarios), /fecha del CSV no coincide/);
});

test("la evaluación cronológica entrena antes de validar y probar", () => {
  const scenarios = manifest(20);
  scenarios.forEach((scenario, index) => {
    scenario.sourceDate = `${index < 5 ? 2022 : index < 10 ? 2023 : index < 15 ? 2024 : 2025}-01-${String(index + 1).padStart(2, "0")}`;
  });
  const rows = scenarios.flatMap((scenario, index) => scenarioRows(index + 1, 3, scenario.sourceDate));
  const split = splitFemChronological(rows, scenarios);
  assert.equal(split.method, "SOURCE_DATE_CHRONOLOGICAL_HOLDOUT");
  assert.deepEqual(Object.fromEntries(Object.entries(split.scenarioIds).map(([name, ids]) => [name, ids.length])), { train: 10, validation: 5, test: 5 });
  assert.ok(split.rows.train.every((row) => row.source_date < "2024-01-01"));
  assert.ok(split.rows.validation.every((row) => row.source_date >= "2024-01-01" && row.source_date < "2025-01-01"));
  assert.ok(split.rows.test.every((row) => row.source_date >= "2025-01-01"));
  const earlierFold = splitFemChronological(rows, scenarios, {
    validationFrom: "2023-01-01",
    testFrom: "2024-01-01",
    testBefore: "2025-01-01"
  });
  assert.deepEqual(earlierFold.cutoffs, { validationFrom: "2023-01-01", testFrom: "2024-01-01", testBefore: "2025-01-01" });
  assert.equal(earlierFold.excludedScenarioIds.length, 5);
  assert.ok(earlierFold.rows.test.every((row) => row.source_date >= "2024-01-01" && row.source_date < "2025-01-01"));
  assert.ok(!earlierFold.rows.train.some((row) => row.source_date >= "2023-01-01"));
  assert.throws(() => splitFemChronological(rows, scenarios, { validationFrom: "2024-01-01", testFrom: "2025-01-01", testBefore: "2025-01-01" }), /fechas ISO crecientes/);
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
