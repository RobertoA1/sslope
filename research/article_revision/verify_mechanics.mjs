import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {runFem2D, verifyCstPatchTest, verifyGlobalAffineElasticityBenchmark, verifyGlobalAffineBiotPressureBenchmark} from '../../src/core/fem-2d.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const output = process.argv[2];
if (!output) throw new Error('Pass an absolute JSON output path');
const bytes = await readFile(path.join(root, 'data/generated/ta01-fem-500-manifest.json'));
const manifest = JSON.parse(bytes);
const indices = [1, 2, 100, 250, 400, 500];
const totals = [0, 1, 12, 48, 102.88];
const comparisons = [];
for (const index of indices) {
  const scenario = manifest.scenarios[index-1];
  const reference = runFem2D(scenario.parameters, [200]).timeSeries.at(-1);
  for (const rain of totals) {
    const result = runFem2D(scenario.parameters, [rain]).timeSeries.at(-1);
    const predicted = reference.maximumRainfallInducedDisplacementMm*rain/200;
    const discrepancy = Math.abs(result.maximumRainfallInducedDisplacementMm-predicted);
    const roundingBound = 1e-5*(1+rain/200)/2;
    comparisons.push({scenario: scenario.scenarioId, rainfallMm: rain,
      displacementMm: result.maximumRainfallInducedDisplacementMm,
      referenceDisplacementMm: reference.maximumRainfallInducedDisplacementMm,
      scaledReferenceMm: predicted, discrepancyMm: discrepancy,
      combinedRoundingBoundMm: roundingBound,
      withinRoundingBound: discrepancy <= roundingBound,
      solverRelativeResidual: result.solverResidual, solverIterations: result.solverIterations});
  }
}
const result = {
  method: 'Fixed scenario, direct one-step quasi-static solves at five rainfall totals and a 200 mm reference; existing PCG implementation with default 1e-8 tolerance.',
  scope: 'Implementation/generator verification, not constitutive calibration, field validation, strength reduction or mesh convergence.',
  manifestSha256: createHash('sha256').update(bytes).digest('hex'),
  additionalSolves: comparisons.length+indices.length,
  comparisons, maximumDiscrepancyMm: Math.max(...comparisons.map(r=>r.discrepancyMm)),
  roundingBoundFailures: comparisons.filter(r=>!r.withinRoundingBound).length,
  cstPatch: verifyCstPatchTest(), affineElasticity: verifyGlobalAffineElasticityBenchmark(),
  affineBiotPressure: verifyGlobalAffineBiotPressureBenchmark()
};
await writeFile(output, JSON.stringify(result, null, 2)+'\n');
console.log(JSON.stringify({additionalSolves: result.additionalSolves, maximumDiscrepancyMm: result.maximumDiscrepancyMm, roundingBoundFailures: result.roundingBoundFailures}));
