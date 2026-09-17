import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildTa01IncrementalEquilibrium } from "../src/core/fem-2d.js";
import { predictTa01SpatialRainfall } from "../src/core/ta01-spatial-inference.js";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const model = JSON.parse(await readFile(path.join(root, "data/models/ta01-spatial-pinn.json"), "utf8"));
const benchmark = JSON.parse(await readFile(path.join(root, "data/generated/ta01-spatial-equilibrium-benchmark.json"), "utf8"));

test("la inferencia espacial acepta solo lluvia dentro del dominio documentado", () => {
  for (const bad of [-1, 501, "abc", "", Infinity]) assert.throws(() => predictTa01SpatialRainfall(model, benchmark, bad));
  assert.equal(predictTa01SpatialRainfall(model, benchmark, 0).maximumPredictedDisplacementMm, 0);
  assert.throws(() => predictTa01SpatialRainfall({ ...model, benchmark: { ...model.benchmark, id: "OTRO" } }, benchmark, 48));
});

test("la extrapolación lineal conserva el error espacial frente al FEM para varias lluvias", () => {
  const heldOut = new Set(model.training.sensorNodeIds);
  for (const rainMm of [12.5, 48, 200]) {
    const prediction = predictTa01SpatialRainfall(model, benchmark, rainMm);
    const reference = buildTa01IncrementalEquilibrium(benchmark.scenario, rainMm);
    let squaredError = 0, squaredReference = 0;
    for (const node of prediction.nodes) {
      if (heldOut.has(node.id)) continue;
      const ux = reference.system.referenceDisplacementM[node.id * 2] * 1000;
      const uy = reference.system.referenceDisplacementM[node.id * 2 + 1] * 1000;
      squaredError += (node.deltaUxMm - ux) ** 2 + (node.deltaUyMm - uy) ** 2;
      squaredReference += ux ** 2 + uy ** 2;
    }
    const relativeError = Math.sqrt(squaredError / squaredReference);
    assert.ok(Math.abs(relativeError - model.verification.relativeL2HeldOutDisplacementError) < 1e-5);
    const free = reference.system.freeDofs;
    const predictedFreeM = free.map((dof) => {
      const node = prediction.nodes[Math.floor(dof / 2)];
      return (dof % 2 ? node.deltaUyMm : node.deltaUxMm) / 1000;
    });
    const loads = reference.system.incrementalLoadKn;
    const residualSquared = reference.system.stiffnessRows.reduce((sum, row, index) => {
      const predictedLoad = row.reduce((total, [column, value]) => total + value * predictedFreeM[column], 0);
      return sum + (predictedLoad - loads[index]) ** 2;
    }, 0);
    const relativeResidual = Math.sqrt(residualSquared / loads.reduce((sum, value) => sum + value ** 2, 0));
    assert.ok(Math.abs(relativeResidual - model.verification.relativeEquilibriumResidual) < 1e-5);
    assert.equal(prediction.mesh.nodeCount, reference.mesh.nodes.length);
    assert.match(prediction.scientificStatus, /NO_OPERACIONAL/);
  }
});
