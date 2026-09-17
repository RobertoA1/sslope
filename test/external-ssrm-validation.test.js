import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

test("el benchmark externo conserva su procedencia y no acredita el FEM propio", async () => {
  const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  const report = JSON.parse(await readFile(path.join(root, "data/validation/external-ssrm-griffiths-lane.json"), "utf8"));
  assert.equal(report.solver.name, "XSLOPE");
  assert.equal(report.solver.version, "0.5.2");
  assert.equal(report.solver.elementOrder, "quadratic");
  assert.match(report.scientificStatus, /NO_VALIDACION_FEM_TA01/);
  assert.equal(report.case.dry, true);
  assert.equal(report.case.frictionAngleDeg, 20);
  assert.equal(report.case.slopeHorizontalToVertical, 2);
  assert.ok(report.result.factorOfSafety >= report.published.lastConvergedTrial);
  assert.ok(report.result.factorOfSafety < report.published.firstFailedTrial);
  assert.ok(report.result.finalInterval[0] <= report.result.factorOfSafety);
  assert.ok(report.result.factorOfSafety <= report.result.finalInterval[1]);
  for (const hash of [report.source.sampleInputSha256, report.source.sampleMeshSha256]) assert.match(hash, /^[0-9a-f]{64}$/);
});
