import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test("el ensayo hidráulico publicado cierra masa y no exagera la lluvia infiltrada", async () => {
  const rawInput = await readFile(path.join(root, "data/validation/ta01-external-ssrm-input.json"));
  const report = JSON.parse(await readFile(path.join(root, "data/validation/ta01-transient-seep.json"), "utf8"));
  assert.equal(report.source.geometryInputSha256, createHash("sha256").update(rawInput).digest("hex"));
  assert.equal(report.solver.elementOrder, "tri3");
  assert.equal(report.result.converged, true);
  assert.equal(report.assumptions.unsaturatedModel, "vg");
  assert.equal(report.mesh.targetSizeM, 6);
  const { cumulativeInflowM2, storedChangeM2, finalClosureFraction } = report.result.massBalance;
  const directClosure = Math.abs(cumulativeInflowM2 - storedChangeM2) / Math.max(Math.abs(cumulativeInflowM2), Math.abs(storedChangeM2));
  assert.ok(finalClosureFraction <= 0.05);
  assert.ok(directClosure <= 0.05);
  assert.ok(report.assumptions.unappliedRainfallMm > 100);
  assert.deepEqual(report.mesh.observationPointM, { x: 4, y: 96 });
  assert.ok(report.result.frames.some((frame) => frame.hour === 24));
  assert.ok(report.result.frames.every((frame) => Number.isFinite(frame.observationHeadM)));
  assert.match(report.limitation, /SSRM externo condicional/);
});

test("la sensibilidad hidráulica usa un punto fijo y no oculta la malla gruesa", async () => {
  const report = JSON.parse(await readFile(path.join(root, "data/validation/ta01-transient-seep.json"), "utf8"));
  const study = JSON.parse(await readFile(path.join(root, "data/validation/ta01-transient-seep-mesh-sensitivity.json"), "utf8"));
  assert.equal(study.geometryInputSha256, report.source.geometryInputSha256);
  assert.deepEqual(study.observationPointM, report.mesh.observationPointM);
  assert.deepEqual(study.runs.map((run) => run.meshSizeM), [12, 8, 6, 4]);
  assert.ok(study.adjacentDifferences[0].absoluteHeadChange48hDifferenceM > 0.01);
  assert.ok(study.adjacentDifferences[2].absoluteHeadChange48hDifferenceM < 0.001);
  assert.match(study.scientificStatus, /NO_VALIDACION/);
});

test("el contraste espacial compara una cuadrícula común y mantiene la advertencia científica", async () => {
  const report = JSON.parse(await readFile(path.join(root, "data/validation/ta01-transient-seep.json"), "utf8"));
  const study = JSON.parse(await readFile(path.join(root, "data/validation/ta01-transient-seep-field-sensitivity.json"), "utf8"));
  assert.equal(study.geometryInputSha256, report.source.geometryInputSha256);
  assert.deepEqual(study.runs.map((run) => run.meshSizeM), [12, 8, 6, 4]);
  assert.ok(study.grid.commonPointCount > 6000);
  assert.equal(study.grid.commonPointCount, study.grid.candidateCount);
  assert.ok(study.adjacentComparisons.at(-1).rmsHeadDifference48hM > 0);
  assert.ok(study.adjacentComparisons.at(-1).maximumAbsoluteHeadDifference48hM > 0.03);
  assert.ok(study.runs.every((run) => run.maximumPositivePorePressureChange48hKpa < 1e-6));
  assert.match(study.limitation, /no calibra/);
});

test("el escenario húmedo supuesto produce presión de poros medible sin reclamar convergencia espacial", async () => {
  const geometry = await readFile(path.join(root, "data/validation/ta01-external-ssrm-input.json"));
  const source = JSON.parse(await readFile(path.join(root, "data/validation/ta01-transient-seep-wet-scenario-6m.json"), "utf8"));
  const study = JSON.parse(await readFile(path.join(root, "data/validation/ta01-transient-seep-wet-scenario-field-sensitivity.json"), "utf8"));
  assert.equal(source.source.geometryInputSha256, createHash("sha256").update(geometry).digest("hex"));
  assert.equal(study.geometryInputSha256, source.source.geometryInputSha256);
  assert.equal(source.assumptions.soilConductivityMPerSecond, 1e-5);
  assert.equal(source.assumptions.lateralHeadM, -2);
  assert.deepEqual(study.runs.map((run) => run.meshSizeM), [8, 6, 4]);
  assert.equal(study.hydraulicScenario.appliedInfiltrationFluxMPerHour, source.assumptions.appliedInfiltrationFluxMPerHour);
  assert.match(study.runs[1].sourceFieldSha256, /^[a-f0-9]{64}$/);
  const { cumulativeInflowM2, storedChangeM2, finalClosureFraction } = source.result.massBalance;
  assert.ok(finalClosureFraction < 0.05);
  assert.ok(Math.abs(cumulativeInflowM2 - storedChangeM2) / Math.max(Math.abs(cumulativeInflowM2), Math.abs(storedChangeM2)) < 0.05);
  assert.ok(study.runs.every((run) => run.maximumPositivePorePressureChange24hKpa > 1));
  assert.ok(study.adjacentComparisons.at(-1).maximumAbsoluteHeadDifference24hM > 1);
  assert.match(study.limitation, /no calibra/);
});
