"""Reload all expanded-study models and reconcile source keys, deltas and losses."""
import argparse
from hashlib import sha256
import itertools
import json
import os
from pathlib import Path
for k,v in {'TF_CPP_MIN_LOG_LEVEL':'2','TF_ENABLE_ONEDNN_OPTS':'0','OMP_NUM_THREADS':'2','TF_NUM_INTRAOP_THREADS':'2','TF_NUM_INTEROP_THREADS':'1'}.items():os.environ.setdefault(k,v)
import numpy as np
import pandas as pd
from sklearn.preprocessing import StandardScaler
from field_sensitivity import ROOT,prepare,features
from backend.folds import temporal_folds

TOL=1e-4


def reload_predict(stem,rows):
    import tensorflow as tf
    import keras
    tf.config.experimental.enable_op_determinism()
    meta=json.loads(stem.with_suffix('.json').read_text())
    model=keras.models.load_model(stem.with_suffix('.keras'),compile=False)
    x=features(rows,meta['variant']);shape=x.shape
    x=x.reshape(-1,shape[-1]).copy();x-=np.asarray(meta['input_mean']);x/=np.asarray(meta['input_scale'])
    output=model(x.reshape(shape),training=False).numpy().reshape(-1)
    return output*meta['target_scale']+meta['target_mean'],meta


def check_scaling(meta,train):
    x=features(train,meta['variant']);scaler=StandardScaler().fit(x.reshape(-1,x.shape[-1]))
    np.testing.assert_allclose(scaler.mean_,meta['input_mean'],rtol=0,atol=1e-12)
    np.testing.assert_allclose(scaler.scale_,meta['input_scale'],rtol=0,atol=1e-12)
    truth=np.asarray([r['delta'] for r in train],dtype=np.float32)
    assert float(truth.mean())==meta['target_mean']
    assert max(float(truth.std()),1e-6)==meta['target_scale']


def date_mae(rows,pred):
    values=abs(np.asarray(pred)-np.asarray([r['delta'] for r in rows]))
    return float(pd.Series(values,index=[r['date'] for r in rows]).groupby(level=0).mean().mean())


def run(folder):
    record=json.loads((folder/'frozen.json').read_text());p=record['protocol']
    for relative,digest in record['source_hashes'].items():assert sha256((ROOT/relative).read_bytes()).hexdigest()==digest,relative
    sets,audit=prepare(p)
    assert sets==json.loads((folder/'sequences.json').read_text())
    assert audit==json.loads((folder/'data-audit.json').read_text())
    folds=temporal_folds(sets['lag2']['train'])
    candidates=[dict(units=u,learning_rate=lr,dropout=d) for u,lr,d in itertools.product(p['units'],p['learning_rates'],p['dropout'])]
    fold_checks=[];maximum=0
    for index,params in enumerate(candidates):
        for fold,(train,valid) in enumerate(folds):
            assert max(r['date'] for r in train)<min(r['origin'] for r in valid)
            stem=folder/f'candidate-{index:02}-fold-{fold}'
            pred,meta=reload_predict(stem,valid);check_scaling(meta,train)
            assert meta['params']==params
            assert meta['best_epoch']==int(np.argmin(meta['history']['val_mean_absolute_error']))+1
            old=pd.read_csv(stem.with_suffix('.csv'),float_precision='round_trip')
            assert list(zip(old.sensor,old.date))==[(r['sensor'],r['date']) for r in valid]
            np.testing.assert_allclose(old.actual_delta,[r['delta'] for r in valid],rtol=0,atol=1e-10)
            gap=float(np.max(abs(pred-old.predicted_delta.to_numpy())));maximum=max(maximum,gap)
            assert gap<TOL,(stem.name,gap)
            score=json.loads(stem.with_name(stem.name+'-score.json').read_text())
            mae=date_mae(valid,pred);assert abs(mae-score['daily_delta_mae_mm'])<TOL
            fold_checks.append({'candidate':index,'fold':fold,'date_mae_mm':mae,'max_reload_gap_mm':gap})
    traces=json.loads((folder/'tuning-traces.json').read_text())
    rebuilt=[]
    for t in traces:
        values=[r['date_mae_mm'] for r in fold_checks if r['candidate']==t['candidate']]
        value=float(np.mean(values));assert abs(value-t['mean_daily_delta_mae_mm'])<TOL
        rebuilt.append((value,t['candidate']))
    selected=json.loads((folder/'selection-before-validation-and-test.json').read_text())
    assert min(rebuilt)[1]==selected['chosen']['candidate']
    assert int(np.median(selected['chosen']['best_epochs']))==selected['refit_epochs']
    saved=pd.read_csv(folder/'predictions.csv',float_precision='round_trip')
    report=json.loads((folder/'report.json').read_text());checks=[];daily={};monthly=[]
    for variant in p['variants']:
        data=sets['lag1' if variant=='lag1' else 'lag2'];predictions={part:[] for part in ['validation','test']}
        for seed in p['seeds']:
            stem=folder/f'final-{variant}-seed{seed}'
            for part in predictions:
                pred,meta=reload_predict(stem,data[part]);check_scaling(meta,data['train'])
                rows=saved[(saved.variant==variant)&(saved.seed==seed)&(saved.partition==part)]
                assert list(zip(rows.sensor,rows.date))==[(r['sensor'],r['date']) for r in data[part]]
                gap=float(np.max(abs(pred-rows.predicted_delta.to_numpy())));maximum=max(maximum,gap)
                assert gap<TOL,(variant,seed,part,gap)
                predictions[part].append(pred)
        for part,values in predictions.items():
            pred=np.mean(values,axis=0);rows=data[part];truth=np.array([r['delta'] for r in rows]);current=np.array([r['current'] for r in rows])
            value=date_mae(rows,pred)
            r=next(x for x in report['ensemble_metrics'] if x['variant']==variant and x['partition']==part)
            assert abs(value-r['daily_delta_mae_mm'])<TOL
            identity=float(np.max(abs((pred-truth)-((current+pred)-np.array([r['actual'] for r in rows])))))
            assert identity<1e-8
            checks.append({'variant':variant,'partition':part,'daily_increment_mae_mm':value,'windows':len(rows),'dates':len({r['date'] for r in rows}),'max_error_identity_gap_mm':identity})
            if part=='test':
                daily[variant]=pd.Series(abs(pred-truth)-abs(truth),index=[r['date'] for r in rows]).groupby(level=0).mean()
            diagnostic=pd.DataFrame({'date':[r['date'] for r in rows],'loss':abs(pred-truth),'zero_loss':abs(truth),'delta':truth})
            diagnostic['month']=diagnostic.date.str[:7]
            for month,g in diagnostic.groupby('month'):
                bydate=g.groupby('date')[['loss','zero_loss']].mean()
                monthly.append({'variant':variant,'partition':part,'month':month,'windows':len(g),'dates':len(bydate),'daily_increment_mae_mm':float(bydate.loss.mean()),'daily_zero_increment_mae_mm':float(bydate.zero_loss.mean()),'negative_delta_fraction':float(np.mean(g.delta<0))})
    rebuilt_loss=pd.DataFrame(daily);stored_loss=pd.read_csv(folder/'paired-daily-losses.csv',index_col=0)
    np.testing.assert_allclose(rebuilt_loss[stored_loss.columns].to_numpy(),stored_loss.to_numpy(),rtol=0,atol=TOL)
    pd.DataFrame(monthly).to_csv(folder/'monthly-diagnostics.csv',index=False)
    output={'status':'verified','tolerance_mm':TOL,'source_windows_rebuilt_from_original_archive':True,'training_only_scaling_verified':True,'fold_models_reloaded':len(fold_checks),'final_seed_models_reloaded':len(p['variants'])*len(p['seeds']),'maximum_model_reload_gap_mm':maximum,'selected_candidate_rebuilt':selected['chosen']['candidate'],'fold_checks':fold_checks,'ensemble_checks':checks,'scope':'Numerical/source/model reconciliation, not independent prospective field validation or calibrated uncertainty.'}
    (folder/'independent-verification.json').write_text(json.dumps(output,indent=2)+'\n')
    print(json.dumps({k:v for k,v in output.items() if k not in ['fold_checks','ensemble_checks']},indent=2))


if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('--folder',type=Path,required=True);run(ap.parse_args().folder)
