import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'../..');
const output=process.argv[2];
if(!output)throw new Error('Pass a new output directory');
await mkdir(output,{recursive:true});
const digest=b=>createHash('sha256').update(b).digest('hex');
const frozen=JSON.parse(await readFile(path.join(output,'frozen.json'),'utf8'));
for(const [filename,hash] of Object.entries(frozen.code_source_hashes)){
  if(digest(await readFile(path.join(root,filename)))!==hash)throw new Error('Frozen source changed: '+filename);
}
const sourcePath=path.join(root,'src/core/fem-2d.js');
const source=await readFile(sourcePath);
// Additional exports expose the exact source functions for verification.
// The production file is read only and its bytes are checked again at the end.
const hooked=source.toString()+'\nexport const auditHooks={elementMatrices,solvePcg,prepareSystem,buildLoad,fullDisplacement};\n';
const fem=await import('data:text/javascript;base64,'+Buffer.from(hooked).toString('base64'));
const protocol=JSON.parse(await readFile(path.join(here,'protocol.json'),'utf8'));
const write=async(name,data)=>writeFile(path.join(output,name),JSON.stringify(data,null,2)+'\n');
const norm=u=>Math.hypot(...u);
const maximum=u=>Math.max(...Array.from({length:u.length/2},(_,i)=>1000*Math.hypot(u[2*i],u[2*i+1])));
const eta=k=>Math.max(.08,Math.min(.9,.12+.78*(Math.log10(k)+12)/9));
const factor=s=>eta(s.permeabilityMS)*(1-s.drainageEfficiency)/(s.youngModulusMpa*s.storageCoefficient);
const manifestPath=path.join(root,'data/generated/ta01-fem-500-manifest.json');
const manifestBytes=await readFile(manifestPath);const manifest=JSON.parse(manifestBytes);
const reference=fem.buildTa01IncrementalEquilibrium({...fem.TA01_FEM_DEFAULTS,meshX:30,meshY:20},48);
await write('certificate-reference.json',reference);
const records=[];
for(const index of protocol.amplitude_certificate.direct_scenario_solves){
  const s=manifest.scenarios[index-1];
  const actual=fem.buildTa01IncrementalEquilibrium(s.parameters,48);
  const ratio=factor(actual.scenario)/factor(reference.scenario);
  const expected=reference.system.referenceDisplacementM.map(v=>ratio*v);
  const delta=actual.system.referenceDisplacementM.map((v,i)=>v-expected[i]);
  records.push({scenario:s.scenarioId,ratio,maximumMm:maximum(actual.system.referenceDisplacementM),
    relativeVectorDifference:norm(delta)/norm(expected),solverResidual:actual.system.pcgRelativeResidual});
}
function trueResidual(rows,u,f){
  const residual=rows.map((row,i)=>[...row].reduce((sum,[j,a])=>sum+a*u[j],0)-f[i]);
  const absolute=norm(residual),denominator=norm(f);
  return {l2Absolute:absolute,l2Relative:denominator?absolute/denominator:(absolute===0?0:null),rightHandSideNorm:denominator};
}
const solverCancellation=[];
for(const index of protocol.amplitude_certificate.direct_scenario_solves){
  const archived=manifest.scenarios[index-1],mesh=fem.createTa01Mesh(archived.parameters),prepared=fem.auditHooks.prepareSystem(mesh);
  const dryLoad=fem.auditHooks.buildLoad(prepared,0,mesh.scenario),dry=fem.auditHooks.solvePcg(prepared.rows,dryLoad);
  const dryFull=fem.auditHooks.fullDisplacement(prepared,dry.solution);
  const ratio=factor(mesh.scenario)/factor(reference.scenario);
  for(const rain of protocol.amplitude_certificate.cancellation_rain_totals_mm){
    const wetLoad=fem.auditHooks.buildLoad(prepared,rain,mesh.scenario),wet=fem.auditHooks.solvePcg(prepared.rows,wetLoad);
    const deltaLoad=Float64Array.from(wetLoad,(v,i)=>v-dryLoad[i]),increment=fem.auditHooks.solvePcg(prepared.rows,deltaLoad);
    const wetFull=fem.auditHooks.fullDisplacement(prepared,wet.solution),incrementFull=fem.auditHooks.fullDisplacement(prepared,increment.solution);
    const wetMinusDry=wetFull.map((v,i)=>v-dryFull[i]),expected=reference.system.referenceDisplacementM.map(v=>v*ratio*rain/48);
    const expectedNorm=norm(expected);
    solverCancellation.push({scenario:archived.scenarioId,rainfallMm:rain,lawMaximumMm:maximum(expected),
      directIncrementMaximumMm:maximum(incrementFull),unroundedWetMinusDryMaximumMm:maximum(wetMinusDry),
      wetMinusDryRoundedFiveDecimalsMm:Number(maximum(wetMinusDry).toFixed(5)),
      lawVsDirectVectorRelative:expectedNorm?norm(incrementFull.map((v,i)=>v-expected[i]))/expectedNorm:null,
      lawVsWetMinusDryVectorRelative:expectedNorm?norm(wetMinusDry.map((v,i)=>v-expected[i]))/expectedNorm:null,
      lawVsDirectVectorMaximumMm:1000*Math.max(...incrementFull.map((v,i)=>Math.abs(v-expected[i]))),
      lawVsWetMinusDryVectorMaximumMm:1000*Math.max(...wetMinusDry.map((v,i)=>Math.abs(v-expected[i]))),
      directVsWetMinusDryMaximumVectorDifferenceMm:1000*Math.max(...wetMinusDry.map((v,i)=>Math.abs(v-incrementFull[i]))),
      dryTrueResidual:trueResidual(prepared.rows,dry.solution,dryLoad),wetTrueResidual:trueResidual(prepared.rows,wet.solution,wetLoad),
      directTrueResidual:trueResidual(prepared.rows,increment.solution,deltaLoad),
      dryReportedResidual:dry.relativeResidual,wetReportedResidual:wet.relativeResidual,directReportedResidual:increment.relativeResidual,
      allSolvesConverged:dry.converged&&wet.converged&&increment.converged});
  }
}
const ranges={cohesionKpa:[60,240],frictionAngleDeg:[26,44],unitWeightKNm3:[18,26],youngModulusMpa:[400,3000],
  permeabilityMS:[1e-10,3e-6],drainageEfficiency:[0,.85],waterTableM:[10,65],storageCoefficient:[.12,.35]};
const interventions=[];
for(const [parameter,endpoints] of Object.entries(ranges)){
  for(const value of endpoints){
    const actual=fem.buildTa01IncrementalEquilibrium({...reference.scenario,[parameter]:value},48);
    const ratio=factor(actual.scenario)/factor(reference.scenario);
    const expected=reference.system.referenceDisplacementM.map(v=>ratio*v);
    interventions.push({parameter,value,expectedAmplitudeRatio:ratio,
      observedAmplitudeRatio:maximum(actual.system.referenceDisplacementM)/maximum(reference.system.referenceDisplacementM),
      relativeVectorDifference:norm(actual.system.referenceDisplacementM.map((v,i)=>v-expected[i]))/norm(expected),
      solverResidual:actual.system.pcgRelativeResidual});
  }
}
const twice=fem.buildTa01IncrementalEquilibrium({...reference.scenario,youngModulusMpa:2*reference.scenario.youngModulusMpa},48);
interventions.push({parameter:'youngModulusMpa-doubled-positive-control',value:twice.scenario.youngModulusMpa,expectedAmplitudeRatio:.5,
  observedAmplitudeRatio:maximum(twice.system.referenceDisplacementM)/maximum(reference.system.referenceDisplacementM),
  relativeVectorDifference:norm(twice.system.referenceDisplacementM.map((v,i)=>v-.5*reference.system.referenceDisplacementM[i]))/norm(twice.system.referenceDisplacementM),
  solverResidual:twice.system.pcgRelativeResidual});
const independentCases=[];
for(const [index,c] of protocol.independent_assembly.cases.entries()){
  const result=fem.buildTa01IncrementalEquilibrium({...fem.TA01_FEM_DEFAULTS,slopeHeightM:c.height,slopeWidthM:c.width,
    benchCount:c.benches,poissonRatio:c.poisson,meshX:15,meshY:10},48);
  const filename=`assembly-case-${index+1}.json`;await write(filename,result);independentCases.push(filename);
}

const quadrature=[
  {b:[1/3,1/3,1/3],w:.225},
  ...[[.059715871789770,.470142064105115,.470142064105115],[.470142064105115,.059715871789770,.470142064105115],[.470142064105115,.470142064105115,.059715871789770]].map(b=>({b,w:.132394152788506})),
  ...[[.797426985353087,.101286507323456,.101286507323456],[.101286507323456,.797426985353087,.101286507323456],[.101286507323456,.101286507323456,.797426985353087]].map(b=>({b,w:.125939180544827}))
];
const E=protocol.manufactured_elasticity.young_modulus_kpa,nu=protocol.manufactured_elasticity.poisson_ratio;
const mu=E/(2*(1+nu)),lambda=E*nu/((1+nu)*(1-2*nu)),pi=Math.PI;
function exact(x,y){
  return [Math.sin(pi*x)*Math.sin(pi*y),.5*Math.sin(2*pi*x)*Math.sin(pi*y)];
}
function strain(x,y){
  return [pi*Math.cos(pi*x)*Math.sin(pi*y),.5*pi*Math.sin(2*pi*x)*Math.cos(pi*y),
    pi*Math.sin(pi*x)*Math.cos(pi*y)+pi*Math.cos(2*pi*x)*Math.sin(pi*y)];
}
function force(x,y){
  const [u,v]=exact(x,y);
  return [pi*pi*((lambda+3*mu)*u-(lambda+mu)*Math.cos(2*pi*x)*Math.cos(pi*y)),
    pi*pi*((lambda+6*mu)*v-(lambda+mu)*Math.cos(pi*x)*Math.cos(pi*y))];
}
const manufactured=[];
for(const n of protocol.manufactured_elasticity.mesh_subdivisions){
  const nodes=[];const free=[];const dofToFree=new Map();
  for(let j=0;j<=n;j++)for(let i=0;i<=n;i++){
    const id=nodes.length;nodes.push({id,x:i/n,y:j/n});
    if(i>0&&i<n&&j>0&&j<n)for(const axis of [0,1]){dofToFree.set(2*id+axis,free.length);free.push(2*id+axis);}
  }
  const rows=Array.from({length:free.length},()=>new Map());const rhs=new Float64Array(free.length);const elements=[];
  const addElement=ids=>{
    const element={id:elements.length,nodeIds:ids,material:{youngModulusKpa:E,poissonRatio:nu}};
    const m=fem.auditHooks.elementMatrices(element,nodes);elements.push({...element,...m});
    for(let a=0;a<6;a++){
      const row=dofToFree.get(m.dofs[a]);if(row===undefined)continue;
      for(let b=0;b<6;b++){
        const column=dofToFree.get(m.dofs[b]);if(column===undefined)continue;
        rows[row].set(column,(rows[row].get(column)||0)+m.stiffness[a][b]);
      }
    }
    for(const q of quadrature){
      const x=ids.reduce((v,id,i)=>v+q.b[i]*nodes[id].x,0),y=ids.reduce((v,id,i)=>v+q.b[i]*nodes[id].y,0);
      const f=force(x,y);
      for(let a=0;a<3;a++)for(const axis of [0,1]){
        const row=dofToFree.get(2*ids[a]+axis);if(row!==undefined)rhs[row]+=m.area*q.w*q.b[a]*f[axis];
      }
    }
  };
  for(let j=0;j<n;j++)for(let i=0;i<n;i++){
    const a=j*(n+1)+i,b=a+1,c=a+n+1,d=c+1;addElement([a,b,d]);addElement([a,d,c]);
  }
  const solved=fem.auditHooks.solvePcg(rows,rhs,protocol.manufactured_elasticity.pcg_relative_tolerance,protocol.manufactured_elasticity.max_iterations);
  const u=Array(nodes.length*2).fill(0);free.forEach((dof,i)=>{u[dof]=solved.solution[i];});
  let l2=0,energy=0;
  for(const element of elements){
    const local=element.dofs.map(i=>u[i]);const eh=element.B.map(r=>r.reduce((v,b,i)=>v+b*local[i],0));
    for(const q of quadrature){
      const x=element.nodeIds.reduce((v,id,i)=>v+q.b[i]*nodes[id].x,0),y=element.nodeIds.reduce((v,id,i)=>v+q.b[i]*nodes[id].y,0);
      const actual=exact(x,y),es=strain(x,y),diff=eh.map((v,i)=>v-es[i]);
      const uh=[0,1].map(axis=>element.nodeIds.reduce((v,id,i)=>v+q.b[i]*u[2*id+axis],0));
      l2+=element.area*q.w*((uh[0]-actual[0])**2+(uh[1]-actual[1])**2);
      energy+=element.area*q.w*diff.reduce((v,a,i)=>v+a*element.D[i].reduce((s,d,j)=>s+d*diff[j],0),0);
    }
  }
  const record={subdivisions:n,nodes:nodes.length,elements:elements.length,freeDofs:free.length,converged:solved.converged,
    solverRelativeResidual:solved.relativeResidual,iterations:solved.iterations,l2Error:Math.sqrt(l2),energyError:Math.sqrt(energy),
    l2Order:manufactured.length?Math.log(manufactured.at(-1).l2Error/Math.sqrt(l2))/Math.log(2):null,
    energyOrder:manufactured.length?Math.log(manufactured.at(-1).energyError/Math.sqrt(energy))/Math.log(2):null};
  await write(`manufactured-${n}.json`,{...record,displacementM:u});manufactured.push(record);
}
const failures=[];const tol=protocol.amplitude_certificate.numerical_relative_tolerance;
for(const r of [...records,...interventions])if(r.relativeVectorDifference>tol)failures.push({check:'amplitude-vector',record:r});
const last=manufactured.at(-1);const accept=protocol.manufactured_elasticity.acceptance;
if(last.l2Order<accept.minimum_final_l2_order||last.energyOrder<accept.minimum_final_energy_order)failures.push({check:'manufactured-order',record:last});
for(const r of manufactured)if(!r.converged)failures.push({check:'manufactured-solver',record:r});
for(const r of solverCancellation)if(!r.allSolvesConverged)failures.push({check:'cancellation-solver',record:r});
for(const r of solverCancellation)if(r.rainfallMm===0&&Math.max(r.lawVsDirectVectorMaximumMm,r.lawVsWetMinusDryVectorMaximumMm)>protocol.amplitude_certificate.zero_absolute_tolerance_mm)failures.push({check:'zero-rain-absolute',record:r});
const unchanged=digest(await readFile(sourcePath))===digest(source);if(!unchanged)failures.push({check:'production-source-changed'});
const report={status:failures.length?'checks_failed':'complete',sourceSha256:digest(source),inMemoryHookedModuleSha256:digest(Buffer.from(hooked)),
  sourceBytesUnchanged:unchanged,manifestSha256:digest(manifestBytes),referenceAlphaMmPerMm:maximum(reference.system.referenceDisplacementM)/48,
  referenceScenario:reference.scenario,scenarioVectors:records,parameterInterventions:interventions,solverCancellation,independentAssemblyFiles:independentCases,
  manufactured,failures,scope:protocol.scope};
await write('numerical-export-report.json',report);
console.log(JSON.stringify({status:report.status,manufactured,failures},null,2));
if(failures.length)process.exitCode=1;
