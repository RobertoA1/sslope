import test from "node:test";
import assert from "node:assert/strict";
import { runFem2D } from "../src/core/fem-2d.js";
import { parseNasaPowerDailyCsv } from "../src/core/rainfall-history.js";
import { generateTa01Dataset, runTa01FemCase, ta01DatasetToCsv } from "../src/core/study-case-ta01.js";

const rainfallCsv = `-BEGIN HEADER-
Location: latitude -10.68 longitude -76.26
elevation from MERRA-2: Average for region = 3994.12 meters
The value for missing source data: -999
-END HEADER-
YEAR,DOY,PRECTOTCORR
2024,1,0
2024,2,24
2024,3,48
2024,4,12`;

test("el FEM 2D converge y separa gravedad de respuesta inducida por lluvia", () => {
  const parameters = { meshX: 8, meshY: 6 };
  const dry = runFem2D(parameters, Array(24).fill(0));
  const wet = runFem2D(parameters, Array(24).fill(2));
  assert.ok(wet.mesh.nodeCount > 20);
  assert.ok(wet.mesh.elementCount > 20);
  assert.equal(wet.summary.converged, true);
  assert.equal(dry.summary.maximumRainfallInducedDisplacementMm, 0);
  assert.ok(wet.summary.maximumRainfallInducedDisplacementMm > 0);
  assert.ok(wet.summary.maximumPorePressureKpa > dry.summary.maximumPorePressureKpa);
  assert.ok(wet.summary.maximumSolverResidual < 1e-7);
  assert.equal(wet.timeSeries.length, 24);
  assert.equal(wet.timeSeries.at(-1).nodes.length, wet.mesh.nodeCount);
  assert.ok(wet.timeSeries.at(-1).nodes.some((node) => node.rainfallInducedDisplacementMm > 0));
});

test("el caso TA-01 conserva el total diario y documenta el perfil estimado", () => {
  const rainfall = parseNasaPowerDailyCsv(rainfallCsv);
  const result = runTa01FemCase(rainfall, { date: "2024-01-03", concentrationHours: 12, parameters: { meshX: 8, meshY: 6 } });
  assert.equal(result.rainfall.observedDailyTotalMm, 48);
  assert.equal(result.rainfall.hourlyProfileMmH.reduce((sum, value) => sum + value, 0), 48);
  assert.equal(result.rainfall.temporalProfile, "RECTANGULAR_12H_ESTIMATED");
  assert.equal(result.method.scientificStatus, "FEM_2D_REAL_LINEAL_NO_CALIBRADO");
});

test("genera un CSV semisintético reproducible con una fila por hora", () => {
  const rainfall = parseNasaPowerDailyCsv(rainfallCsv);
  const first = generateTa01Dataset(rainfall, { scenarioCount: 2, seed: 42, meshX: 8, meshY: 6 });
  const second = generateTa01Dataset(rainfall, { scenarioCount: 2, seed: 42, meshX: 8, meshY: 6 });
  assert.equal(first.rows.length, 48);
  assert.equal(first.manifest.targetRecommendation, "rainfall_induced_max_displacement_mm");
  assert.deepEqual(first.rows, second.rows);
  const csv = ta01DatasetToCsv(first);
  assert.match(csv.split("\n")[0], /scenario_id,source_date,simulation_hour/);
  assert.match(csv, /FEM2D_CST_PLANE_STRAIN_V1/);
});
