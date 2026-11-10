"""Deterministic paired-L1 bounds on closed target sets.

These are conditional identified ranges, not confidence regions. In particular,
bootstrap quantiles of pointwise extrema give an outer interval envelope only.
"""
import numpy as np


def _vectors(a, b, lower, upper, weights=None):
    a,b,lower,upper=[np.asarray(v,dtype=np.float64) for v in (a,b,lower,upper)]
    if not (a.ndim==1 and a.size and a.shape==b.shape==lower.shape==upper.shape):
        raise ValueError('Nonempty aligned vectors required')
    if not all(np.isfinite(v).all() for v in (a,b,lower,upper)) or np.any(lower>upper):
        raise ValueError('Finite ordered target intervals required')
    w=np.ones_like(a) if weights is None else np.asarray(weights,dtype=np.float64)
    if w.shape!=a.shape or not np.isfinite(w).all() or np.any(w<0) or w.sum()<=0:
        raise ValueError('Nonnegative weights with positive sum required')
    return a,b,lower,upper,w/w.sum()


def difference(a,b,target):
    return np.abs(np.asarray(a)-target)-np.abs(np.asarray(b)-target)


def box_rows(a,b,lower,upper):
    a,b,lower,upper,_=_vectors(a,b,lower,upper)
    dl,du=difference(a,b,lower),difference(a,b,upper)
    return {'lower':np.minimum(dl,du),'upper':np.maximum(dl,du),
            'lower_witness':np.where(dl<=du,lower,upper),
            'upper_witness':np.where(dl>=du,lower,upper)}


def box_bounds(a,b,lower,upper,stored=None,weights=None):
    a,b,lower,upper,w=_vectors(a,b,lower,upper,weights)
    rr=box_rows(a,b,lower,upper)
    amin=np.maximum(lower-a,0)+np.maximum(a-upper,0)
    bmin=np.maximum(lower-b,0)+np.maximum(b-upper,0)
    amax=np.maximum(np.abs(a-lower),np.abs(a-upper))
    bmax=np.maximum(np.abs(b-lower),np.abs(b-upper))
    out={'lower':float(w@rr['lower']),'upper':float(w@rr['upper']),
         'separate_lower':float(w@(amin-bmax)),
         'separate_upper':float(w@(amax-bmin))}
    if stored is not None:
        y=np.asarray(stored,dtype=np.float64)
        if y.shape!=a.shape or np.any(y<lower) or np.any(y>upper):
            raise ValueError('Stored target must lie inside its target interval')
        point=float(w@difference(a,b,y));radius=float(2*w@np.maximum(np.abs(y-lower),np.abs(y-upper)))
        out.update(observed=point,lipschitz_lower=point-radius,lipschitz_upper=point+radius)
    return out


def coefficient_candidates(predictions,x,interval):
    x=np.asarray(x,dtype=np.float64);p=np.asarray(predictions,dtype=np.float64)
    lo,hi=map(float,interval)
    if x.ndim!=1 or np.any(x<0) or not np.isfinite(x).all() or not 0<=lo<=hi:
        raise ValueError('Nonnegative covariate and nonnegative ordered coefficient interval required')
    p=np.atleast_2d(p)
    if p.shape[1]!=len(x) or not np.isfinite(p).all():raise ValueError('Aligned finite predictions required')
    knots=p[:,x>0]/x[x>0]
    knots=knots[(knots>=lo)&(knots<=hi)]
    # Neighbours guard the last-bit rounding of computed breakpoints. Their
    # inclusion cannot omit an extremum and does not widen the coefficient set.
    values=np.concatenate(([lo,hi],knots,np.nextafter(knots,-np.inf),np.nextafter(knots,np.inf)))
    return np.unique(values[(values>=lo)&(values<=hi)])


def coefficient_bounds(a,b,x,interval,weights=None):
    a,b,x,_unused,w=_vectors(a,b,x,x,weights)
    candidates=coefficient_candidates([a,b],x,interval)
    values=np.array([w@difference(a,b,c*x) for c in candidates])
    lower=int(np.argmin(values));upper=int(np.argmax(values))
    return {'lower':float(values[lower]),'upper':float(values[upper]),
            'lower_alpha':float(candidates[lower]),'upper_alpha':float(candidates[upper]),
            'candidate_count':len(candidates)}


def sign(value,tolerance):
    return -1 if value < -tolerance else 1 if value > tolerance else 0


def certified(lower,upper,tolerance):
    return -1 if upper < -tolerance else 1 if lower > tolerance else 0
