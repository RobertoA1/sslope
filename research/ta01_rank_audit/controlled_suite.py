"""Controlled evaluation-precision study; save every fit, no test selection."""
import argparse,csv,json,os,time
from pathlib import Path
os.environ.setdefault('OMP_NUM_THREADS','2')
os.environ.setdefault('OPENBLAS_NUM_THREADS','2')
import numpy as np
import pandas as pd
import joblib
from sklearn.ensemble import RandomForestRegressor,HistGradientBoostingRegressor
from sklearn.linear_model import Ridge
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from itertools import combinations
from bounds import box_bounds,certified,sign,difference
from common import assert_frozen,write,digest

FUNCTIONS=['friedman1','ishigami','sobol_g']
MODELS=['ridge','random_forest','hist_gradient_boosting']

def sample_function(name,rng,n):
    if name=='friedman1':
        x=rng.uniform(0,1,(n,10));y=10*np.sin(np.pi*x[:,0]*x[:,1])+20*(x[:,2]-.5)**2+10*x[:,3]+5*x[:,4]
    elif name=='ishigami':
        x=rng.uniform(-np.pi,np.pi,(n,3));y=np.sin(x[:,0])+7*np.sin(x[:,1])**2+.1*x[:,2]**4*np.sin(x[:,0])
    elif name=='sobol_g':
        x=rng.uniform(0,1,(n,6));a=np.array([0,1,4.5,9,99,99]);y=np.prod((np.abs(4*x-2)+a)/(1+a),axis=1)
    else:raise ValueError(name)
    return x,y

def fit_models(seed):
    return {'ridge':make_pipeline(StandardScaler(),Ridge(alpha=1)),
      'random_forest':RandomForestRegressor(n_estimators=64,max_depth=6,min_samples_leaf=4,max_features=1.0,n_jobs=1,random_state=seed),
      'hist_gradient_boosting':HistGradientBoostingRegressor(max_iter=100,max_leaf_nodes=15,learning_rate=.1,l2_regularization=1,early_stopping=False,random_state=seed)}

def run(output):
    frozen=assert_frozen(output);p=frozen['protocol']['controlled_suite'];records=[];tasks=[]
    tolerance=p['decision_tolerance_training_sd'];started=time.monotonic()
    for fi,name in enumerate(FUNCTIONS):
        for rep in range(p['replicates_per_function']):
            task=output/'controlled'/f'{name}-{rep:03d}';task.mkdir(parents=True,exist_ok=False)
            seq=np.random.SeedSequence([p['root_seed'],fi,rep]);rng=np.random.default_rng(seq);model_seed=int(seq.generate_state(1)[0])
            x,y=sample_function(name,rng,p['train_rows']+p['test_rows']);n=p['train_rows']
            mean=float(y[:n].mean());scale=float(y[:n].std());assert scale>0 and np.isfinite(y).all()
            z=(y-mean)/scale;predictions={};reload_errors={}
            for model_name,model in fit_models(model_seed).items():
                model.fit(x[:n],z[:n]);pred=model.predict(x[n:]);assert np.isfinite(pred).all()
                path=task/(model_name+'.joblib');joblib.dump(model,path,compress=3)
                reloaded=joblib.load(path).predict(x[n:]);delta=float(np.max(np.abs(pred-reloaded)))
                assert delta<=1e-13,(name,rep,model_name,delta)
                predictions[model_name]=pred;reload_errors[model_name]=delta
            np.savez_compressed(task/'source-and-predictions.npz',x_train=x[:n],x_test=x[n:],z_train=z[:n],z_test=z[n:],y_train=y[:n],y_test=y[n:],**predictions)
            keys=np.arange(p['test_rows']);frame=pd.DataFrame({'row':keys,'exact_target_training_sd':z[n:],**predictions})
            for q in p['rounding_steps_training_sd']:
                label=z[n:].copy() if q==0 else np.rint(z[n:]/q)*q
                lower=label-q/2;upper=label+q/2
                assert np.max(np.maximum(lower-z[n:],z[n:]-upper))<=1e-13
                frame[f'rounded_q_{q:g}']=label
                for a,b in combinations(MODELS,2):
                    bound=box_bounds(predictions[a],predictions[b],lower,upper,stored=label)
                    true=float(np.mean(difference(predictions[a],predictions[b],z[n:])))
                    assert bound['lower']-1e-13<=true<=bound['upper']+1e-13
                    for method in ['sharp','separate','lipschitz']:
                        lo=bound['lower' if method=='sharp' else method+'_lower'];hi=bound['upper' if method=='sharp' else method+'_upper']
                        cert=certified(lo,hi,tolerance)
                        if cert:assert cert==sign(true,tolerance),(name,rep,q,a,b,method)
                    assert bound['separate_lower']<=bound['lower']+1e-13 and bound['separate_upper']>=bound['upper']-1e-13
                    assert bound['lipschitz_lower']<=bound['lower']+1e-13 and bound['lipschitz_upper']>=bound['upper']-1e-13
                    observed_sign=sign(bound['observed'],tolerance);true_sign=sign(true,tolerance)
                    row={'function':name,'replicate':rep,'model_seed':model_seed,'q_training_sd':q,'model_a':a,'model_b':b,'true_difference':true,**bound,
                         'true_sign':true_sign,'observed_sign':observed_sign,
                         'rank_reversal':int(observed_sign*true_sign==-1)}
                    for method in ['sharp','separate','lipschitz']:
                        lo=bound['lower' if method=='sharp' else method+'_lower'];hi=bound['upper' if method=='sharp' else method+'_upper']
                        row[method+'_certified']=int(certified(lo,hi,tolerance)!=0)
                        row[method+'_false_certified']=int(certified(lo,hi,tolerance) not in [0,true_sign])
                        row[method+'_width']=hi-lo
                    if q==0:assert max(abs(bound['lower']-true),abs(bound['upper']-true))<1e-13
                    records.append(row)
            frame.to_csv(task/'test-predictions.csv',index=False,float_format='%.17g')
            metadata={'function':name,'replicate':rep,'model_seed':model_seed,'train_rows':n,'test_rows':len(keys),'training_target_mean':mean,'training_target_sd':scale,'reload_maximum_absolute_differences':reload_errors,
                      'files':{q.name:digest(q) for q in task.iterdir() if q.is_file()}}
            write(task/'complete.json',metadata);tasks.append(metadata)
            if (rep+1)%10==0:print(f'{name}: {rep+1}/{p["replicates_per_function"]} complete',flush=True)
    frame=pd.DataFrame(records);frame.to_csv(output/'controlled-comparisons.csv',index=False,float_format='%.17g')
    assert len(records)==3600 and len(tasks)==300
    rng=np.random.default_rng(20261106);summaries=[]
    metrics=['rank_reversal','sharp_certified','separate_certified','lipschitz_certified','sharp_false_certified','separate_false_certified','lipschitz_false_certified','sharp_width','separate_width','lipschitz_width']
    for name in FUNCTIONS:
        for q in p['rounding_steps_training_sd']:
            group=frame[(frame.function==name)&(frame.q_training_sd==q)]
            # Rows are dependent model-pair comparisons. Resample 100 complete
            # data-generating replications, retaining all three pairs together.
            values=group.groupby('replicate',sort=True)[metrics].mean().to_numpy()
            assert values.shape==(100,len(metrics))
            indices=rng.integers(100,size=(10000,100));boot=values[indices].mean(axis=1)
            row={'function':name,'q_training_sd':q,'replicates':100,'pair_comparisons':len(group)}
            for i,metric in enumerate(metrics):
                lo,hi=np.quantile(boot[:,i],[.025,.975]);row[metric]=float(values[:,i].mean());row[metric+'_mc95_lower']=float(lo);row[metric+'_mc95_upper']=float(hi)
            summaries.append(row)
    pd.DataFrame(summaries).to_csv(output/'controlled-summary.csv',index=False,float_format='%.17g')
    report={'status':'complete','datasets':len(tasks),'fitted_models':len(tasks)*3,'pair_comparisons':len(records),'false_certified':int(frame[['sharp_false_certified','separate_false_certified','lipschitz_false_certified']].to_numpy().sum()),'reload_maximum_difference':max(max(t['reload_maximum_absolute_differences'].values()) for t in tasks),'elapsed_seconds':time.monotonic()-started,'scope':'Verification and informativeness under constructed noiseless functions; exact targets are known. No mine generalisation or empirical confidence-coverage claim.'}
    write(output/'controlled-report.json',report);assert_frozen(output);return report

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--output',type=Path,required=True);args=parser.parse_args()
    print(json.dumps(run(args.output),indent=2))
