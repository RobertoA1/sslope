import { mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { runFem2D, verifyCstPatchTest, verifyGlobalAffineBiotPressureBenchmark, verifyGlobalAffineElasticityBenchmark } from "../src/core/fem-2d.js";

const projectDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const meshes = [
  { meshX: 8, meshY: 6 },
  { meshX: 12, meshY: 8 },
  { meshX: 18, meshY: 12 },
  { meshX: 24, meshY: 16 },
  { meshX: 30, meshY: 20 },
  { meshX: 36, meshY: 24 },
  { meshX: 42, meshY: 28 },
  { meshX: 48, meshY: 32 }
];
const rainfallProfileMmH = Array(24).fill(2);
const runs = meshes.map((mesh) => {
  const startedAt = performance.now();
  const result = runFem2D(mesh, rainfallProfileMmH);
  return {
    ...mesh,
    nodeCount: result.mesh.nodeCount,
    elementCount: result.mesh.elementCount,
    maximumRainfallInducedDisplacementMm: result.summary.maximumRainfallInducedDisplacementMm,
    maximumPorePressureKpa: result.summary.maximumPorePressureKpa,
    mohrCoulombSafetyIndex: result.summary.mohrCoulombSafetyIndex,
    maximumSolverResidual: result.summary.maximumSolverResidual,
    elapsedMs: Number((performance.now() - startedAt).toFixed(3))
  };
});

const reference = runs.at(-1);
for (const run of runs) {
  run.relativeDifferenceAgainstFinest = {
    displacement: Number((Math.abs(run.maximumRainfallInducedDisplacementMm - reference.maximumRainfallInducedDisplacementMm) / Math.max(reference.maximumRainfallInducedDisplacementMm, 1e-12)).toFixed(6)),
    porePressure: Number((Math.abs(run.maximumPorePressureKpa - reference.maximumPorePressureKpa) / Math.max(reference.maximumPorePressureKpa, 1e-12)).toFixed(6)),
    safetyIndex: Number((Math.abs(run.mohrCoulombSafetyIndex - reference.mohrCoulombSafetyIndex) / Math.max(reference.mohrCoulombSafetyIndex, 1e-12)).toFixed(6))
  };
}

const defaultRun = runs.find((run) => run.meshX === 30 && run.meshY === 20);
const artifact = {
  id: "TA01-FEM-MESH-SENSITIVITY-V1",
  generatedAt: new Date().toISOString(),
  method: "Refinamiento estructurado del mismo caso de lluvia; referencia interna = malla 48×32",
  scientificStatus: "VERIFICACION_INTERNA_DE_MALLA_NO_BENCHMARK_PUBLICADO_NO_CALIBRADO",
  scenario: {
    totalRainfallMm: rainfallProfileMmH.reduce((sum, value) => sum + value, 0),
    durationHours: rainfallProfileMmH.length,
    otherParameters: "TA01_FEM_DEFAULTS"
  },
  analyticalPatchTest: verifyCstPatchTest(),
  analyticalGlobalBenchmark: verifyGlobalAffineElasticityBenchmark(),
  analyticalBiotPressureBenchmark: verifyGlobalAffineBiotPressureBenchmark(),
  referenceMesh: { meshX: reference.meshX, meshY: reference.meshY, nodeCount: reference.nodeCount, elementCount: reference.elementCount },
  defaultMeshAssessment: {
    meshX: defaultRun.meshX,
    meshY: defaultRun.meshY,
    displacementDifferencePercent: Number((defaultRun.relativeDifferenceAgainstFinest.displacement * 100).toFixed(2)),
    porePressureDifferencePercent: Number((defaultRun.relativeDifferenceAgainstFinest.porePressure * 100).toFixed(2)),
    safetyIndexDifferencePercent: Number((defaultRun.relativeDifferenceAgainstFinest.safetyIndex * 100).toFixed(2))
  },
  acceptanceGuide: "La malla por defecto es adecuada solo para el prototipo si las magnitudes principales no cambian materialmente frente a la referencia interna. No es evidencia de exactitud contra una solución analítica o software certificado.",
  runs
};

const outputPath = path.join(projectDir, "data", "validation", "ta01-fem-mesh-sensitivity.json");
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ output: path.relative(projectDir, outputPath), ...artifact.defaultMeshAssessment }, null, 2));
