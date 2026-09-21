import test from "node:test";
import assert from "node:assert/strict";
import { buildTa01IncrementalEquilibrium, runFem2D, verifyCstPatchTest, verifyGlobalAffineBiotPressureBenchmark, verifyGlobalAffineElasticityBenchmark } from "../src/core/fem-2d.js";
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
  const tolerance = 1e-8;
  for (const node of wet.timeSeries.at(-1).nodes) {
    if (Math.abs(node.yM) <= tolerance) {
      assert.equal(node.uxMm, 0);
      assert.equal(node.uyMm, 0);
    } else if (Math.abs(node.xM) <= tolerance) {
      assert.equal(node.uxMm, 0);
    }
  }
});

test("la respuesta inducida crece al acumular lluvia en un mismo escenario", () => {
  const result = runFem2D({ meshX: 8, meshY: 6 }, Array(12).fill(2));
  for (let index = 1; index < result.timeSeries.length; index++) {
    assert.ok(result.timeSeries[index].maximumRainfallInducedDisplacementMm >= result.timeSeries[index - 1].maximumRainfallInducedDisplacementMm);
    assert.ok(result.timeSeries[index].maximumPorePressureKpa >= result.timeSeries[index - 1].maximumPorePressureKpa);
  }
});

test("el elemento CST reproduce exactamente un campo afín de deformación constante", () => {
  const patch = verifyCstPatchTest();
  assert.equal(patch.passed, true);
  assert.ok(patch.maximumAbsoluteError < 1e-12);
  assert.equal(patch.elementResults.length, 2);
});

test("el ensamblaje y solver FEM reproducen una solución elástica analítica global", () => {
  const benchmark = verifyGlobalAffineElasticityBenchmark();
  assert.equal(benchmark.passed, true);
  assert.ok(benchmark.maximumAbsoluteDisplacementErrorM < 1e-7);
  assert.ok(benchmark.solverRelativeResidual < 1e-8);
  assert.equal(benchmark.elementCount, benchmark.meshX * benchmark.meshY * 2);
});

test("la carga de presión de poros de Biot reproduce una solución analítica global", () => {
  const benchmark = verifyGlobalAffineBiotPressureBenchmark();
  assert.equal(benchmark.passed, true);
  assert.equal(benchmark.porePressureKpa, 120);
  assert.equal(benchmark.biotCoefficient, 0.85);
  assert.ok(benchmark.rightBoundaryTractionKpa < benchmark.sigmaXXKpa);
  assert.ok(benchmark.topBoundaryTractionKpa < benchmark.sigmaYYKpa);
  assert.ok(benchmark.maximumAbsoluteDisplacementErrorM < 1e-7);
  assert.ok(benchmark.solverRelativeResidual < 1e-8);
});

test("el equilibrio incremental reproduce el campo FEM inducido por lluvia", () => {
  const scenario = { meshX: 10, meshY: 7 };
  const benchmark = buildTa01IncrementalEquilibrium(scenario, 48);
  const run = runFem2D(scenario, [48]);
  assert.equal(benchmark.system.freeDofs.length, benchmark.system.stiffnessRows.length);
  assert.ok(benchmark.system.pcgRelativeResidual < 1e-8);
  for (const node of run.timeSeries[0].nodes) {
    assert.ok(Math.abs(benchmark.system.referenceDisplacementM[node.id * 2] * 1000 - node.deltaUxMm) < 1e-4);
    assert.ok(Math.abs(benchmark.system.referenceDisplacementM[node.id * 2 + 1] * 1000 - node.deltaUyMm) < 1e-4);
  }
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
