import test from "node:test";
import assert from "node:assert/strict";
import { adaptExternalFemResult } from "../src/core/external-fem-adapter.js";

const sample = {
  id: "EXT-FEM-TEST",
  source: { software: "Solver académico", model: "Talud A", coordinateReference: "local" },
  units: { length: "m", displacement: "m", porePressure: "Pa" },
  nodes: [
    { id: 0, x: 0, y: 0, ux: 0, uy: 0, porePressure: 1000 },
    { id: 1, x: 10, y: 0, ux: 0.0001, uy: -0.0002, porePressure: 2000 },
    { id: 2, x: 0, y: 10, ux: 0.0003, uy: -0.0004, porePressure: 3000 }
  ],
  elements: [{ nodeIds: [0, 1, 2], material: "SOIL" }],
  convergence: { converged: true, relativeResidual: 1e-9 }
};

test("adapta unidades y conectividad FEM externas al contrato del visor", () => {
  const result = adaptExternalFemResult(sample);
  assert.equal(result.method.scientificStatus, "FEM_EXTERNO_IMPORTADO_NO_VERIFICADO");
  assert.equal(result.mesh.nodeCount, 3);
  assert.equal(result.mesh.nodes[2].uxMm, 0.3);
  assert.equal(result.mesh.nodes[2].porePressureKpa, 3);
  assert.equal(result.summary.converged, true);
  assert.equal(result.lstmForecasts[1], undefined);
});

test("rechaza elementos que referencian nodos inexistentes", () => {
  assert.throws(() => adaptExternalFemResult({ ...sample, elements: [{ nodeIds: [0, 1, 99] }] }), /nodos existentes/);
});

test("mantiene la conectividad cuando cambia el orden de nodos entre estados", () => {
  const second = sample.nodes.map((node) => ({ ...node, ux: node.ux + 0.0001 })).reverse();
  const result = adaptExternalFemResult({ ...sample, nodes: undefined, timeSeries: [{ hour: 1, nodes: sample.nodes }, { hour: 2, nodes: second }] });
  assert.deepEqual(result.timeSeries[1].nodes.map((node) => node.sourceNodeId), [0, 1, 2]);
  assert.equal(result.timeSeries[1].nodes[0].uxMm, 0.1);
});

test("rechaza cambios de topología o coordenadas en una serie externa", () => {
  const moved = sample.nodes.map((node) => ({ ...node }));
  moved[2].x = 1;
  assert.throws(() => adaptExternalFemResult({ ...sample, nodes: undefined, timeSeries: [{ nodes: sample.nodes }, { nodes: moved }] }), /cambia de coordenada/);
  assert.throws(() => adaptExternalFemResult({ ...sample, nodes: undefined, timeSeries: [{ nodes: sample.nodes }, { nodes: sample.nodes.slice(0, 2) }] }), /entre 3 y 50000 nodos|topología/);
});
