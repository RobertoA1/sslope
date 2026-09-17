import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test("el SSRM con lluvia es un ensayo condicional sin cambio de FoS resoluble", async () => {
  const geometry = await readFile(path.join(root, "data/validation/ta01-external-ssrm-input.json"));
  const report = JSON.parse(await readFile(path.join(root, "data/validation/ta01-rainfall-external-ssrm.json"), "utf8"));
  assert.equal(report.source.geometryInputSha256, createHash("sha256").update(geometry).digest("hex"));
  assert.equal(report.solver.elementOrder, "tri6");
  assert.equal(report.projection.nodeCount, 3120);
  assert.ok(report.projection.maximumBoundaryResidualM < 1e-8);
  assert.ok(report.projection.maximumPositivePorePressureChange24hKpa < 1e-6);
  assert.equal(report.comparison.factorOfSafetyDifference, 0);
  assert.equal(report.comparison.finalIntervalsOverlap, true);
  assert.equal(report.comparison.resolvedBeyondTolerance, false);
  assert.match(report.scientificStatus, /NO_CALIBRADO/);
});
