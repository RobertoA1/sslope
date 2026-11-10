"""Separate CST assembly/direct solves and an amplitude-certificate audit."""
import argparse
from fractions import Fraction
from hashlib import sha256
import json
from pathlib import Path

import numpy as np
import pandas as pd
from scipy import sparse
from scipy.sparse.linalg import spsolve, norm as sparse_norm
from common import assert_frozen

ROOT = Path(__file__).resolve().parents[2]
QUADRATURE = [
    ([1/3]*3, .225),
    *[(b, .132394152788506) for b in [(.059715871789770,.470142064105115,.470142064105115),(.470142064105115,.059715871789770,.470142064105115),(.470142064105115,.470142064105115,.059715871789770)]],
    *[(b, .125939180544827) for b in [(.797426985353087,.101286507323456,.101286507323456),(.101286507323456,.797426985353087,.101286507323456),(.101286507323456,.101286507323456,.797426985353087)]],
]


def eta(k):
    return np.clip(.12+.78*(np.log10(k)+12)/9, .08, .9)


def cst(points, modulus, poisson):
    # Shape gradients from inversion of the interpolation matrix, independently
    # of the explicit coordinate-difference implementation in JavaScript.
    interpolation = np.column_stack([np.ones(3), points])
    gradients = np.linalg.inv(interpolation)[1:, :]
    area = abs(np.linalg.det(interpolation))/2
    b = np.zeros((3, 6))
    b[0, 0::2] = gradients[0]
    b[1, 1::2] = gradients[1]
    b[2, 0::2] = gradients[1]
    b[2, 1::2] = gradients[0]
    mu = modulus/(2*(1+poisson))
    lam = modulus*poisson/((1+poisson)*(1-2*poisson))
    d = np.array([[lam+2*mu,lam,0], [lam,lam+2*mu,0], [0,0,mu]])
    return area, b, d, area*b.T@d@b


def surface(x, s):
    position = min(max(x/s['slopeWidthM'], 0), 1-np.finfo(float).eps)*s['benchCount']
    index = min(s['benchCount']-1, int(np.floor(position)))
    local = position-index
    top = s['slopeHeightM']*(1-index/s['benchCount'])
    drop = s['slopeHeightM']/s['benchCount']
    return top if local <= s['benchFlatRatio'] else max(0, top-(local-s['benchFlatRatio'])*drop/(1-s['benchFlatRatio']))


def nominal_materials(data):
    """Classify the nominal structured-grid geometry with rational arithmetic.

    This resolves exact interface ties using the declared <= convention. It
    does not use the exported material identifier to decide membership.
    The floating algebraic classifier remains recorded as a diagnostic.
    """
    s=data['scenario'];width=Fraction(str(s['slopeWidthM']));height=Fraction(str(s['slopeHeightM']))
    flat=Fraction(str(s['benchFlatRatio']));count=s['benchCount'];points=[]
    for node in data['mesh']['nodes']:
        column=round(node['xM']/(float(width)/s['meshX']));row=round(node['yM']/(float(height)/s['meshY']))
        assert 0<=column<=s['meshX'] and 0<=row<=s['meshY']
        points.append((width*column/s['meshX'],height*row/s['meshY']))
    result={}
    for element in data['mesh']['elements']:
        x=sum(points[i][0] for i in element['nodeIds'])/3;y=sum(points[i][1] for i in element['nodeIds'])/3
        position=x/width*count;index=min(count-1,position.numerator//position.denominator);local=position-index
        drop=height/count;top=height-index*drop
        elevation=top if local<=flat else max(Fraction(0),top-(local-flat)*drop/(1-flat))
        depth=max(Fraction(0),elevation-y)
        result[element['id']]={'material':'SOIL' if depth<=12 else 'WEATHERED' if depth<=35 else 'ROCK',
                               'exact_depth':str(depth),'on_exact_interface':depth in [12,35]}
    return result


def add_block(rr, cc, vv, stiffness, dofs, mapping):
    for i, gi in enumerate(dofs):
        if gi not in mapping:
            continue
        for j, gj in enumerate(dofs):
            if gj in mapping:
                rr.append(mapping[gi]); cc.append(mapping[gj]); vv.append(stiffness[i,j])


def vector_error(a, b):
    absolute = float(np.linalg.norm(a-b))
    denominator = float(np.linalg.norm(b))
    return {'l2_absolute': absolute, 'l2_relative': absolute/denominator if denominator else (0. if absolute == 0 else None),
            'maximum_absolute': float(np.max(abs(a-b))) if len(a) else 0., 'reference_l2': denominator}


def verify_assembly(folder, filename, protocol):
    data = json.loads((folder/filename).read_text()); s = data['scenario']
    coordinates = np.array([[n['xM'],n['yM']] for n in data['mesh']['nodes']])
    tolerance = min(s['slopeWidthM']/s['meshX'],s['slopeHeightM']/s['meshY'])*1e-5
    fixed = set()
    for i, (x,y) in enumerate(coordinates):
        if y <= tolerance:
            fixed.update([2*i,2*i+1])
        elif x <= tolerance:
            fixed.add(2*i)
    free = [i for i in range(2*len(coordinates)) if i not in fixed]
    assert free == data['system']['freeDofs'], filename+' boundary conditions'
    mapping = {global_dof: i for i,global_dof in enumerate(free)}
    rr,cc,vv = [],[],[]; rhs = np.zeros(len(free)); material_checks = [];floating_disagreements=[]
    nominal=nominal_materials(data)
    for element in data['mesh']['elements']:
        ids = element['nodeIds']; points = coordinates[ids]; centroid = points.mean(axis=0)
        depth = max(0,surface(centroid[0],s)-centroid[1])
        floating_material = 'SOIL' if depth <= 12 else 'WEATHERED' if depth <= 35 else 'ROCK'
        material=nominal[element['id']]['material']
        if floating_material!=material:
            floating_disagreements.append({'element':element['id'],'floating_depth':depth,'floating_material':floating_material,
                                          'nominal_reference':nominal[element['id']],'javascript_material':element['material']})
        material_checks.append(material == element['material'])
        if material == 'SOIL':
            modulus = s['youngModulusMpa']*1000*.12; poisson = min(.44,s['poissonRatio']+.08)
        elif material == 'WEATHERED':
            modulus = s['youngModulusMpa']*1000*.55; poisson = s['poissonRatio']
        else:
            modulus = s['youngModulusMpa']*1000*2.5; poisson = max(.08,s['poissonRatio']-.04)
        area,b,d,k = cst(points,modulus,poisson)
        dofs = np.array([[2*i,2*i+1] for i in ids]).reshape(-1)
        add_block(rr,cc,vv,k,dofs,mapping)
        pressure = 9.81*(data['cumulativeRainfallMm']/1000)*eta(s['permeabilityMS'])*(1-s['drainageEfficiency'])/s['storageCoefficient']*np.exp(-depth/14)
        force = area*b.T@np.array([s['biotCoefficient']*pressure]*2+[0])
        for i, dof in enumerate(dofs):
            if dof in mapping: rhs[mapping[dof]] += force[i]
    assert all(material_checks), filename+' material assignment'
    a = sparse.coo_matrix((vv,(rr,cc)),shape=(len(free),len(free))).tocsr()
    jr,jc,jv = [],[],[]
    for i,row in enumerate(data['system']['stiffnessRows']):
        for j,value in row: jr.append(i);jc.append(j);jv.append(value)
    ja = sparse.coo_matrix((jv,(jr,jc)),shape=a.shape).tocsr()
    jf = np.array(data['system']['incrementalLoadKn']); ju = np.array(data['system']['referenceDisplacementM'])[free]
    u = spsolve(a,rhs)
    matrix_relative = float(sparse_norm(a-ja)/sparse_norm(ja))
    load = vector_error(rhs,jf); displacement = vector_error(u,ju)
    residual = vector_error(ja@ju,jf)
    sparse.save_npz(folder/(Path(filename).stem+'-python-stiffness.npz'),a)
    np.savez_compressed(folder/(Path(filename).stem+'-python-solution.npz'),freeDofs=free,load=rhs,displacement=u)
    limits = protocol['independent_assembly']
    passed = matrix_relative <= limits['stiffness_relative_tolerance'] and load['l2_relative'] <= limits['load_relative_tolerance'] and displacement['l2_relative'] <= limits['displacement_relative_tolerance']
    return {'case':filename,'status':'passed' if passed else 'failed','free_dofs':len(free),'nodes':len(coordinates),
            'boundary_conditions_independently_rebuilt':True,'material_identifiers_checked_from_centroids':True,
            'classification_reference':'Exact rational nominal structured-grid geometry with <= interface convention; stiffness and load use exported floating coordinates.',
            'floating_algebraic_classifier_disagreements':floating_disagreements,
            'stiffness_relative_frobenius_difference':matrix_relative,'stiffness_maximum_absolute_difference':float(np.max(abs((a-ja).data))) if (a-ja).nnz else 0.,
            'symmetry_relative_frobenius':float(sparse_norm(a-a.T)/sparse_norm(a)), 'load_difference':load,'displacement_difference':displacement,
            'source_pcg_reported_relative_residual':data['system']['pcgRelativeResidual'],'source_pcg_true_residual':residual,
            'python_direct_true_relative_residual':float(np.linalg.norm(a@u-rhs)/np.linalg.norm(rhs)),
            'scope':'Shared mesh geometry; separate shape gradients, material computation, boundary elimination, assembly and direct solver. Not field validation.'}


def exact(points):
    x,y = points[...,0],points[...,1]; pi=np.pi
    return np.stack([np.sin(pi*x)*np.sin(pi*y),.5*np.sin(2*pi*x)*np.sin(pi*y)],axis=-1)


def exact_strain(point):
    x,y=point;pi=np.pi
    return np.array([pi*np.cos(pi*x)*np.sin(pi*y),.5*pi*np.sin(2*pi*x)*np.cos(pi*y),pi*np.sin(pi*x)*np.cos(pi*y)+pi*np.cos(2*pi*x)*np.sin(pi*y)])


def manufactured(folder,n,protocol):
    config=protocol['manufactured_elasticity'];e=config['young_modulus_kpa'];nu=config['poisson_ratio']
    mu=e/(2*(1+nu));lam=e*nu/((1+nu)*(1-2*nu));pi=np.pi
    def force(point):
        x,y=point
        return pi*pi*np.array([(lam+3*mu)*np.sin(pi*x)*np.sin(pi*y)-(lam+mu)*np.cos(2*pi*x)*np.cos(pi*y),
                              (.5*lam+3*mu)*np.sin(2*pi*x)*np.sin(pi*y)-(lam+mu)*np.cos(pi*x)*np.cos(pi*y)])
    coordinates=np.array([(i/n,j/n) for j in range(n+1) for i in range(n+1)])
    free=[2*(j*(n+1)+i)+axis for j in range(1,n) for i in range(1,n) for axis in [0,1]]
    mapping={g:i for i,g in enumerate(free)};rr,cc,vv=[],[],[];rhs=np.zeros(len(free));elements=[]
    for j in range(n):
        for i in range(n):
            a=j*(n+1)+i;b=a+1;c=a+n+1;d=c+1
            for ids in [[a,b,d],[a,d,c]]:
                points=coordinates[ids];area,bmat,dmat,k=cst(points,e,nu);dofs=np.array([[2*v,2*v+1] for v in ids]).reshape(-1)
                add_block(rr,cc,vv,k,dofs,mapping);elements.append((ids,points,area,bmat,dmat,dofs))
                for bary,w in QUADRATURE:
                    f=force(np.array(bary)@points)
                    for node,shape in zip(ids,bary):
                        for axis in [0,1]:
                            if 2*node+axis in mapping:rhs[mapping[2*node+axis]]+=area*w*shape*f[axis]
    matrix=sparse.coo_matrix((vv,(rr,cc)),shape=(len(free),len(free))).tocsr();u=np.zeros(len(coordinates)*2);u[free]=spsolve(matrix,rhs)
    js=json.loads((folder/f'manufactured-{n}.json').read_text());ju=np.asarray(js['displacementM'])
    l2=0.;energy=0.
    for ids,points,area,b,d,dofs in elements:
        eh=b@u[dofs]
        for bary,w in QUADRATURE:
            point=np.array(bary)@points;uh=np.array(bary)@u.reshape(-1,2)[ids];err=uh-exact(point);de=eh-exact_strain(point)
            l2+=area*w*(err@err);energy+=area*w*(de@d@de)
    gap=vector_error(u,ju);l2=float(np.sqrt(l2));energy=float(np.sqrt(energy))
    true_residual=vector_error(matrix@ju[free],rhs)
    limits=config['independent_numerical_agreement_tolerances']
    passed=gap['l2_relative']<=limits['relative_l2_displacement'] and abs(l2-js['l2Error'])/l2<=limits['relative_l2_error_norm'] and abs(energy-js['energyError'])/energy<=limits['relative_energy_error_norm']
    return {'subdivisions':n,'status':'passed' if passed else 'failed','displacement_comparison':gap,'l2_error':l2,'energy_error':energy,
            'pcg_reported_relative_residual':js['solverRelativeResidual'],'pcg_independently_recomputed_true_residual':true_residual,
            'source_functions_and_adapter_scope':'Original CST element and PCG; manufactured-domain assembly/BC adapter. Not stepped-slope convergence.'}


def certificate(folder,export):
    path=ROOT/'data/generated/ta01-fem-500.csv';frame=pd.read_csv(path,float_precision='round_trip')
    s=export['referenceScenario'];factor=lambda k,d,e,storage:eta(k)*(1-d)/(e*storage)
    reference=factor(s['permeabilityMS'],s['drainageEfficiency'],s['youngModulusMpa'],s['storageCoefficient'])
    coefficient=export['referenceAlphaMmPerMm']*factor(frame.permeability_m_s,frame.drainage_efficiency,frame.young_modulus_mpa,frame.storage_coefficient)/reference
    prediction=coefficient*frame.cumulative_rainfall_mm;truth=frame.rainfall_induced_max_displacement_mm;error=prediction-truth
    rows=frame[['scenario_id','source_date','simulation_hour','cumulative_rainfall_mm','rainfall_induced_max_displacement_mm']].copy()
    rows['certificate_prediction_mm']=prediction;rows['difference_mm']=error;rows.to_csv(folder/'all-label-certificate.csv',index=False,float_format='%.17g')
    strata=[]
    for name,mask in [('stored_zero',truth==0),('stored_positive',truth>0),('zero_exported_rain',frame.cumulative_rainfall_mm==0)]:
        differences=error[mask]
        strata.append({'stratum':name,'labels':int(mask.sum()),'mae_mm':float(abs(differences).mean()),'maximum_absolute_difference_mm':float(abs(differences).max())})
    manifest=json.loads((ROOT/'data/generated/ta01-fem-500-manifest.json').read_text())
    fixed=['slopeHeightM','slopeWidthM','benchCount','benchFlatRatio','poissonRatio','biotCoefficient','meshX','meshY']
    for scenario in manifest['scenarios']:
        assert all(scenario['parameters'][key]==s[key] for key in fixed),scenario['scenarioId']
    return {'labels':len(frame),'scenarios':int(frame.scenario_id.nunique()),'source_csv_sha256':sha256(path.read_bytes()).hexdigest(),
            'reference_alpha_mm_per_mm':export['referenceAlphaMmPerMm'],'reference_fitted_to_labels':False,'fixed_configuration_checked':fixed,
            'mae_mm':float(abs(error).mean()),'rmse_mm':float(np.sqrt(np.mean(error**2))),'bias_mm':float(error.mean()),
            'maximum_absolute_difference_mm':float(abs(error).max()),'differences_above_half_label_step':int((abs(error)>5e-6).sum()),'strata':strata,
            'interpretation':'Residuals include label/rain/profile rounding and numerical solution differences. The 5e-6 mm half-step is descriptive, not a complete error bound.'}


def run(folder):
    assert_frozen(folder)
    protocol=json.loads((folder/'protocol-before-execution.json').read_text())['protocol']
    export=json.loads((folder/'numerical-export-report.json').read_text())
    assembly=[];manufactured_checks=[]
    for name in export['independentAssemblyFiles']:
        try:assembly.append(verify_assembly(folder,name,protocol))
        except Exception as exc:assembly.append({'case':name,'status':'failed','error_type':type(exc).__name__,'error':str(exc)})
    for n in protocol['manufactured_elasticity']['mesh_subdivisions']:
        try:manufactured_checks.append(manufactured(folder,n,protocol))
        except Exception as exc:manufactured_checks.append({'subdivisions':n,'status':'failed','error_type':type(exc).__name__,'error':str(exc)})
    label=certificate(folder,export)
    assert_frozen(folder)
    result={'status':'verified' if all(r['status']=='passed' for r in assembly+manufactured_checks) and not export['failures'] else 'checks_failed',
            'assembly':assembly,'manufactured':manufactured_checks,'amplitude_certificate':label,
            'scope':'Separate implementation and direct solver within the editing research workflow; no independent external team, mine calibration or prospective prediction claim.'}
    (folder/'python-verification.json').write_text(json.dumps(result,indent=2,allow_nan=False)+'\n')
    print(json.dumps({'status':result['status'],'amplitude_certificate':label,'assembly_cases':len(assembly),'manufactured_cases':len(manufactured_checks)},indent=2))
    if result['status']!='verified':raise SystemExit(1)


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--folder',type=Path,required=True);run(parser.parse_args().folder)
