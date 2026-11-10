// Mesh-sensitivity diagnostic for assessing a TA-01-only study.
// This is not field validation or an assertion of asymptotic convergence.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildTa01IncrementalEquilibrium} from '../../src/core/fem-2d.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const out=process.argv[2];if(!out)throw new Error('Pass an output JSON path');
const manifestPath=path.join(root,'data/generated/ta01-fem-500-manifest.json');
const manifestBytes=await readFile(manifestPath);const manifest=JSON.parse(manifestBytes);
const rows=[];
for(const index of [1,2,100,250,400,500]){
  for(const [meshX,meshY] of [[15,10],[30,20],[60,40]]){
    const scenario=manifest.scenarios[index-1];
    const result=buildTa01IncrementalEquilibrium({...scenario.parameters,meshX,meshY},48);
    const u=result.system.referenceDisplacementM;
    const maximumMm=Math.max(...result.mesh.nodes.map(n=>1000*Math.hypot(u[2*n.id],u[2*n.id+1])));
    rows.push({scenario:scenario.scenarioId,meshX,meshY,nodes:result.mesh.nodes.length,elements:result.mesh.elements.length,
      maximumIncrementalDisplacementMm:maximumMm,relativeResidual:result.system.pcgRelativeResidual,iterations:result.system.pcgIterations});
  }
}
const comparisons=[];
for(const scenario of [...new Set(rows.map(r=>r.scenario))]){
  const group=rows.filter(r=>r.scenario===scenario);const [coarse,base,fine]=group.map(r=>r.maximumIncrementalDisplacementMm);
  comparisons.push({scenario,coarseToBaseRelativeChange:Math.abs(base-coarse)/Math.abs(base),baseToFineRelativeChange:Math.abs(fine-base)/Math.abs(fine),
    monotonicAcrossTheseThreeMeshes:(base-coarse)*(fine-base)>0,valuesMm:[coarse,base,fine]});
}
const digest=p=>readFile(p).then(b=>createHash('sha256').update(b).digest('hex'));
const result={status:'complete',purpose:'Feasibility diagnostic for additional numerical verification without mine access.',
  scope:'Unrounded maximum nodal norm of the linear incremental equilibrium at 48 mm accumulated rain. Three mesh resolutions approximate the same assumed scenario. Mesh-dependent boundary/material discretisation and maxima preclude an automatic Richardson/GCI claim. This diagnostic is not in the currently reviewed manuscript and does not validate a mine.',
  manifestSha256:createHash('sha256').update(manifestBytes).digest('hex'),femSourceSha256:await digest(path.join(root,'src/core/fem-2d.js')),scriptSha256:await digest(fileURLToPath(import.meta.url)),rows,comparisons};
await mkdir(path.dirname(out),{recursive:true});await writeFile(out,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({status:result.status,solves:rows.length,comparisons},null,2));
