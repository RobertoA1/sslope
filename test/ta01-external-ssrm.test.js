import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TA01_FEM_DEFAULTS, ta01SurfaceElevation } from "../src/core/fem-2d.js";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const inputPath = path.join(root, "data/validation/ta01-external-ssrm-input.json");
const reportPath = path.join(root, "data/validation/ta01-external-ssrm.json");

test("la sección SSRM externa conserva la superficie y las tres propiedades TA-01", async () => {
  const input = JSON.parse(await readFile(inputPath, "utf8"));
  const scenario = TA01_FEM_DEFAULTS;
  assert.equal(input.units.stress, "kPa");
  assert.equal(input.conditions.groundwater, "none");
  assert.deepEqual(input.materials.map((material) => material.id), ["SOIL", "WEATHERED", "ROCK"]);
  assert.equal(input.materials[0].c, scenario.cohesionKpa * 0.45);
  assert.equal(input.materials[1].phi, scenario.frictionAngleDeg);
  assert.equal(input.materials[2].E, scenario.youngModulusMpa * 1000 * 2.5);
  for (const [x, y] of input.geometry.surface) {
    if (x >= 0 && x <= scenario.slopeWidthM) {
      assert.ok(Math.abs(y - ta01SurfaceElevation(x, scenario)) < 1e-9, `Superficie distinta en x=${x}`);
    }
  }
});

test("el reporte SSRM externo coincide con el insumo exacto", async () => {
  const raw = await readFile(inputPath);
  const report = JSON.parse(await readFile(reportPath, "utf8"));
  assert.equal(report.source.inputSha256, createHash("sha256").update(raw).digest("hex"));
  assert.equal(report.solver.name, "XSLOPE");
  assert.equal(report.solver.elementOrder, "tri6");
  assert.ok(report.result.factorOfSafety > 0);
  assert.match(report.scientificStatus, /NO_CALIBRADO/);
});

test("la sensibilidad de malla externa usa el mismo insumo y cuantifica la dispersión", async () => {
  const report = JSON.parse(await readFile(reportPath, "utf8"));
  const study = JSON.parse(await readFile(path.join(root, "data/validation/ta01-external-ssrm-mesh-sensitivity.json"), "utf8"));
  assert.equal(study.inputSha256, report.source.inputSha256);
  assert.equal(study.runs.length, 3);
  assert.deepEqual(study.runs.map((run) => run.meshSizeM), [10, 8, 6]);
  assert.ok(study.runs[0].elementCount < study.runs[1].elementCount);
  assert.ok(study.runs[1].elementCount < study.runs[2].elementCount);
  const factors = study.runs.map((run) => run.factorOfSafety);
  assert.equal(study.factorOfSafetySpread, Math.max(...factors) - Math.min(...factors));
  assert.ok(study.factorOfSafetySpread > 0, "No debe ocultarse la sensibilidad numérica");
});
