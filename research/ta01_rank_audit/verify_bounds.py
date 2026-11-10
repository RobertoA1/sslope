"""Small exact rational oracles and invariants for the stated range results."""
from fractions import Fraction as Q
from itertools import product
import numpy as np
from bounds import box_bounds,box_rows,coefficient_bounds,difference

def run():
    rng=np.random.default_rng(731)
    for case in range(40):
        a=[Q(int(v),8) for v in rng.integers(-15,16,4)]
        b=[Q(int(v),8) for v in rng.integers(-15,16,4)]
        lo=[Q(int(v),8) for v in rng.integers(-15,6,4)]
        hi=[v+Q(int(z),8) for v,z in zip(lo,rng.integers(0,20,4))]
        w=[Q(int(v)) for v in rng.integers(1,5,4)]
        values=[sum(ww*(abs(aa-t)-abs(bb-t)) for aa,bb,t,ww in zip(a,b,y,w))/sum(w) for y in product(*zip(lo,hi))]
        af,bf,lf,uf,wf=[np.array(v,dtype=float) for v in [a,b,lo,hi,w]]
        out=box_bounds(af,bf,lf,uf,weights=wf);swap=box_bounds(bf,af,lf,uf,weights=wf)
        assert abs(out['lower']-float(min(values)))<1e-14
        assert abs(out['upper']-float(max(values)))<1e-14
        assert abs(swap['lower']+out['upper'])<1e-14 and abs(swap['upper']+out['lower'])<1e-14
        rr=box_rows(af,bf,lf,uf)
        assert abs(np.average(difference(af,bf,rr['lower_witness']),weights=wf)-out['lower'])<1e-14
        assert out['separate_lower']<=out['lower']+1e-14 and out['separate_upper']>=out['upper']-1e-14
        zero=box_bounds(af,af,lf,uf);assert zero['lower']==zero['upper']==0
        singleton=box_bounds(af,bf,lf,lf);assert singleton['lower']==singleton['upper']
    # D(alpha)=1-|1-alpha| has an interior maximum not at [0,2] endpoints.
    r=coefficient_bounds([0,2],[1,1],[1,1],[0,2])
    assert r['lower']==0 and r['upper']==1 and r['upper_alpha']==1
    # Exact Fraction breakpoint oracle, including a zero-amplitude term.
    a=[Q(1,10),Q(4,5),Q(14,5),Q(19,10)];b=[Q(0),Q(2),Q(17,10),Q(4)]
    x=[Q(0),Q(1),Q(2),Q(3)];lo,hi=Q(1,5),Q(9,5);w=[Q(1),Q(2),Q(3),Q(1)]
    candidates={lo,hi}|{p/v for ps in [a,b] for p,v in zip(ps,x) if v and lo<=p/v<=hi}
    values=[sum(ww*(abs(aa-c*v)-abs(bb-c*v)) for aa,bb,v,ww in zip(a,b,x,w))/sum(w) for c in candidates]
    r=coefficient_bounds(np.array(a,float),np.array(b,float),np.array(x,float),[float(lo),float(hi)],np.array(w,float))
    assert abs(r['lower']-float(min(values)))<1e-14 and abs(r['upper']-float(max(values)))<1e-14
    for bad in [-1,np.nan]:
        try:box_bounds([0],[1],[0],[1],weights=[bad])
        except ValueError:pass
        else:raise AssertionError('Invalid weights accepted')
    return {'status':'verified','exact_box_vertex_cases':40,'fraction_coefficient_case':True,'interior_optimum_case':True,'swap_zero_singleton_and_witness_checks':True}

if __name__=='__main__':print(run())
