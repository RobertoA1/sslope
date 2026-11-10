"""Retrospective, source-keyed sensitivity to training budget and rain availability.

The existing main test is known. These are declared diagnostic analyses, not a
new untouched holdout and not an opportunity to replace an unfavourable result.
"""
from __future__ import annotations
import argparse
from datetime import datetime, timezone
from hashlib import sha256
from io import BytesIO
import itertools
import json
import math
import os
from pathlib import Path
import sys
import time
from zipfile import ZipFile

for key,value in {"TF_CPP_MIN_LOG_LEVEL":"2","TF_ENABLE_ONEDNN_OPTS":"0",
                  "OMP_NUM_THREADS":"2","TF_NUM_INTRAOP_THREADS":"2",
                  "TF_NUM_INTEROP_THREADS":"1"}.items():os.environ.setdefault(key,value)
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/"research/article_revision"))
sys.path.insert(0,str(ROOT/"research-app"))
import numpy as np
import pandas as pd
from sklearn.preprocessing import StandardScaler
from backend.folds import temporal_folds
from southwest_study import load_daily, sequences


def write(path,value):
    path.write_text(json.dumps(value,indent=2,allow_nan=False)+"\n")


def key(row):return row["sensor"],row["date"]


def features(rows,variant):
    x=np.asarray([r["x"] for r in rows],dtype=np.float32)
    return x[:,:,[0,1,2]] if variant=="no_rain" else x[:,:,[1,2,3]] if variant=="increment_only" else x


def delta_metrics(rows,predicted):
    truth=np.asarray([r["delta"] for r in rows]);current=np.asarray([r["current"] for r in rows])
    errors=predicted-truth
    loss=pd.Series(abs(errors),index=[r["date"] for r in rows]).groupby(level=0).mean()
    denominator=float(np.sum((truth-truth.mean())**2))
    level_error=(current+predicted)-np.asarray([r["actual"] for r in rows])
    return {"daily_delta_mae_mm":float(loss.mean()),"pooled_delta_mae_mm":float(np.mean(abs(errors))),
            "delta_rmse_mm":float(np.sqrt(np.mean(errors**2))),
            "delta_r2":float(1-np.sum(errors**2)/denominator),
            "level_delta_error_identity_max_mm":float(np.max(abs(errors-level_error))),
            "n":len(rows),"dates":len(loss)}


def fit(train,valid,variant,params,seed,protocol,stem,progress,epochs=None):
    import tensorflow as tf
    import keras
    keras.backend.clear_session();keras.utils.set_random_seed(seed)
    tf.config.experimental.enable_op_determinism()
    x=features(train,variant);shape=x.shape
    scaler=StandardScaler().fit(x.reshape(-1,shape[-1]))
    x=scaler.transform(x.reshape(-1,shape[-1])).reshape(shape).astype(np.float32)
    target=np.asarray([r["delta"] for r in train],dtype=np.float32)
    mean,scale=float(target.mean()),max(float(target.std()),1e-6)
    target=(target-mean)/scale
    model=keras.Sequential([keras.layers.Input(shape=x.shape[1:]),
            keras.layers.LSTM(params["units"]),keras.layers.Dropout(params["dropout"]),keras.layers.Dense(1)])
    model.compile(optimizer=keras.optimizers.Adam(params["learning_rate"]),
                  loss="mean_squared_error",metrics=["mean_absolute_error"])
    options=tf.data.Options();options.threading.private_threadpool_size=1;options.threading.max_intra_op_parallelism=1
    ds=tf.data.Dataset.from_tensor_slices((x,target)).batch(protocol["batch_size"]).with_options(options)
    validation=None
    if valid:
        vx=features(valid,variant);vs=vx.shape
        vx=scaler.transform(vx.reshape(-1,vs[-1])).reshape(vs).astype(np.float32)
        vy=(np.asarray([r["delta"] for r in valid],dtype=np.float32)-mean)/scale
        validation=tf.data.Dataset.from_tensor_slices((vx,vy)).batch(protocol["batch_size"]).with_options(options)
    class Progress(keras.callbacks.Callback):
        def on_epoch_end(self,epoch,logs=None):
            if (epoch+1)%20==0:progress(f"{stem.name}: epoch {epoch+1}")
    callbacks=[Progress()]
    if valid:callbacks.append(keras.callbacks.EarlyStopping(monitor="val_mean_absolute_error",patience=protocol["patience"],restore_best_weights=True))
    history=model.fit(ds,validation_data=validation,epochs=epochs or protocol["epochs"],
                      shuffle=False,verbose=0,callbacks=callbacks).history
    meta={"variant":variant,"params":params,"seed":seed,"input_mean":scaler.mean_.tolist(),
          "input_scale":scaler.scale_.tolist(),"target_mean":mean,"target_scale":scale,
          "history":history,"best_epoch":int(np.argmin(history["val_mean_absolute_error"]))+1 if valid else epochs,
          "monitor":"validation increment MAE; normalised by training-only target scale"}
    model.save(stem.with_suffix(".keras"));write(stem.with_suffix(".json"),meta)
    return model,meta


def predict(model,meta,rows):
    x=features(rows,meta["variant"]);shape=x.shape
    x=x.reshape(-1,shape[-1]).copy();x-=np.asarray(meta["input_mean"]);x/=np.asarray(meta["input_scale"])
    return model(x.reshape(shape),training=False).numpy().reshape(-1)*meta["target_scale"]+meta["target_mean"]


def shared_intervals(daily,length,reps,seed,family):
    groups=pd.to_datetime(daily.index).to_series(index=daily.index).diff().dt.days.ne(1).cumsum()
    rng=np.random.default_rng(seed);total=np.zeros((reps,daily.shape[1]))
    runs=[]
    for _,group in daily.groupby(groups):
        values=group.to_numpy();runs.append(len(values));block=min(length,len(values))
        starts=rng.integers(len(values)-block+1,size=(reps,math.ceil(len(values)/block)))
        ix=(starts[:,:,None]+np.arange(block)).reshape(reps,-1)[:,:len(values)]
        total+=values[ix].sum(axis=1)
    draws=total/len(daily)
    return [{"variant":name,"block_length":length,"difference_mm":float(daily[name].mean()),
             "ci95":np.quantile(draws[:,i],[.025,.975]).tolist(),
             "family_ci":np.quantile(draws[:,i],[.05/(2*family),1-.05/(2*family)]).tolist(),
             "family_size":family,"runs":runs} for i,name in enumerate(daily.columns)]


def prepare(protocol):
    old=json.loads((ROOT/"research/article_revision/southwest-protocol.json").read_text())
    archive=ROOT/"data/external/century-mine/Data.zip"
    daily,audit=load_daily(old,archive);base,excluded=sequences(daily,old)
    with ZipFile(archive) as z:
        rain=pd.concat([pd.read_csv(BytesIO(z.read(f"weather-data/IDCJAC0009_029167_{year}_Data.csv"))) for year in (2013,2014)])
    rain["date"]=pd.to_datetime(dict(year=rain.Year,month=rain.Month,day=rain.Day))
    amount=pd.to_numeric(rain["Rainfall amount (millimetres)"],errors="coerce")
    period=pd.to_numeric(rain["Period over which rainfall was measured (days)"],errors="coerce")
    weather=pd.Series(amount.where((period==1)&(amount>=0)).to_numpy(),index=rain.date)
    alternate=daily.copy();alternate["rain"]=weather.reindex(alternate.date-pd.Timedelta(days=1)).to_numpy()
    lag1,_=sequences(alternate,old)
    common={part:set(map(key,base[part]))&set(map(key,lag1[part])) for part in base}
    sets={"lag2":{p:[r for r in base[p] if key(r) in common[p]] for p in base},
          "lag1":{p:[r for r in lag1[p] if key(r) in common[p]] for p in base}}
    assert all(list(map(key,sets['lag2'][p]))==list(map(key,sets['lag1'][p])) for p in base)
    return sets,{"source":audit,"exclusions":excluded,
        "original_windows":{p:len(base[p]) for p in base},"common_windows":{p:len(sets['lag2'][p]) for p in base}}


def run(args):
    p=json.loads(args.protocol.read_text());out=args.output.resolve()
    out.mkdir(parents=True,exist_ok=True)
    hashes={str(s.relative_to(ROOT)):sha256(s.read_bytes()).hexdigest() for s in [Path(__file__),args.protocol,ROOT/"research/article_revision/southwest_study.py",ROOT/"research-app/backend/folds.py",ROOT/"data/external/century-mine/Data.zip"]}
    if (out/"frozen.json").exists():
        if not args.resume:raise SystemExit("Refusing non-empty output without --resume")
        assert json.loads((out/"frozen.json").read_text())["source_hashes"]==hashes
    elif any(out.iterdir()):raise SystemExit("Use a fresh output directory")
    else:write(out/"frozen.json",{"utc":datetime.now(timezone.utc).isoformat(),"protocol":p,"source_hashes":hashes})
    started=time.monotonic()
    def progress(message):
        state={"message":message,"elapsed_seconds":round(time.monotonic()-started,1)}
        write(out/"progress.json",state);print(json.dumps(state),flush=True)
    sets,audit=prepare(p);write(out/"data-audit.json",audit)
    write(out/"sequences.json",sets)
    folds=temporal_folds(sets["lag2"]["train"])
    candidates=[dict(units=u,learning_rate=lr,dropout=d) for u,lr,d in itertools.product(p['units'],p['learning_rates'],p['dropout'])]
    traces=[]
    for index,params in enumerate(candidates):
        losses=[];epochs=[];histories=[]
        for fold,(train,valid) in enumerate(folds):
            stem=out/f"candidate-{index:02}-fold-{fold}"
            score_path=stem.with_name(stem.name+"-score.json")
            if score_path.exists():record=json.loads(score_path.read_text())
            else:
                progress(f"Candidate {index+1}/{len(candidates)}, fold {fold+1}/3")
                model,meta=fit(train,valid,"lag2",params,p["seeds"][0],p,stem,progress)
                pred=predict(model,meta,valid);result=delta_metrics(valid,pred)
                record={"params":params,"best_epoch":meta["best_epoch"],"train_end":max(r['date'] for r in train),
                        "validation_start":min(r['date'] for r in valid),"validation_end":max(r['date'] for r in valid),**result}
                write(score_path,record)
                pd.DataFrame([{"sensor":r['sensor'],"date":r['date'],"origin":r['origin'],"actual_delta":r['delta'],"predicted_delta":v} for r,v in zip(valid,pred)]).to_csv(stem.with_suffix('.csv'),index=False,float_format='%.17g')
            losses.append(record['daily_delta_mae_mm']);epochs.append(record['best_epoch'])
        traces.append({"candidate":index,"params":params,"fold_daily_delta_mae_mm":losses,"mean_daily_delta_mae_mm":float(np.mean(losses)),"best_epochs":epochs})
        write(out/"tuning-traces.json",traces)
    winner=min(traces,key=lambda x:x['mean_daily_delta_mae_mm'])
    epochs=int(np.median(winner['best_epochs']))
    write(out/"selection-before-validation-and-test.json",{"chosen":winner,"refit_epochs":epochs,"selection_source":"Only three chronological folds in original training period; test is historically known, new analysis remains retrospective."})
    ensembles={};seed_metrics=[];predictions=[]
    for variant in p["variants"]:
        data=sets['lag1' if variant=='lag1' else 'lag2'];results={k:[] for k in ['validation','test']}
        for seed in p['seeds']:
            stem=out/f"final-{variant}-seed{seed}"
            if stem.with_suffix('.keras').exists():
                import keras
                model=keras.models.load_model(stem.with_suffix('.keras'),compile=False);meta=json.loads(stem.with_suffix('.json').read_text())
            else:
                progress(f"Final fit {variant}, seed {seed}, {epochs} epochs")
                model,meta=fit(data['train'],None,variant,winner['params'],seed,p,stem,progress,epochs=epochs)
            for partition in results:
                pred=predict(model,meta,data[partition]);results[partition].append(pred)
                seed_metrics.append({"variant":variant,"seed":seed,"partition":partition,**delta_metrics(data[partition],pred)})
                predictions.extend({"variant":variant,"seed":seed,"partition":partition,"sensor":r['sensor'],"origin":r['origin'],"date":r['date'],"current":r['current'],"actual_delta":r['delta'],"predicted_delta":float(v),"actual_level":r['actual'],"predicted_level":float(r['current']+v),"jump_flag":r['target_coordinate_jump_flag']} for r,v in zip(data[partition],pred))
        ensembles[variant]={part:np.mean(values,axis=0) for part,values in results.items()}
    report=[];daily={};diagnostics={}
    for partition,rows in sets['lag2'].items():
        truth=np.asarray([r['delta'] for r in rows])
        diagnostics[partition]={"windows":len(rows),"dates":len({r['date'] for r in rows}),"negative_delta_fraction":float(np.mean(truth<0)),"delta_quantiles_mm":np.quantile(truth,[0,.1,.25,.5,.75,.9,1]).tolist(),"delta_mean_mm":float(truth.mean()),"delta_sd_mm":float(truth.std()),"rain_mean_mm":float(np.mean([r['x'][-1][3] for r in rows])),"flagged_target_jumps":sum(r['target_coordinate_jump_flag'] for r in rows)}
        zero=delta_metrics(rows,np.zeros(len(rows)));report.append({"variant":"zero_increment","partition":partition,**zero})
        if partition=='train':continue
        base_loss=pd.Series(abs(truth),index=[r['date'] for r in rows]).groupby(level=0).mean()
        for variant,results in ensembles.items():
            pred=results[partition];values=delta_metrics(rows,pred)
            report.append({"variant":variant,"partition":partition,"mae_skill_vs_zero":1-values['daily_delta_mae_mm']/zero['daily_delta_mae_mm'],**values})
            if partition=='test':daily[variant]=pd.Series(abs(pred-truth),index=[r['date'] for r in rows]).groupby(level=0).mean()-base_loss
    frame=pd.DataFrame(predictions);frame.to_csv(out/'predictions.csv',index=False,float_format='%.17g')
    pd.DataFrame(seed_metrics).to_csv(out/'seed-metrics.csv',index=False)
    pd.DataFrame(report).to_csv(out/'ensemble-metrics.csv',index=False)
    losses=pd.DataFrame(daily);losses.to_csv(out/'paired-daily-losses.csv')
    intervals=[r for block in p['blocks'] for r in shared_intervals(losses,block,p['bootstrap_reps'],p['bootstrap_seed']+block,len(p['variants']))]
    write(out/'report.json',{'status':'complete','protocol':p,'selected':winner,'refit_epochs':epochs,'audit':audit,'distribution_diagnostics':diagnostics,'ensemble_metrics':report,'intervals':intervals,'elapsed_seconds':time.monotonic()-started})
    progress('Complete: all predeclared variants and seeds retained')


if __name__=='__main__':
    ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('--output',type=Path,required=True)
    ap.add_argument('--protocol',type=Path,default=Path(__file__).with_name('field-sensitivity-protocol.json'))
    ap.add_argument('--resume',action='store_true');run(ap.parse_args())
