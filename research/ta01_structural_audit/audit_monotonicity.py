"""Audit finite-grid functional monotonicity of every retained TA-01 pipeline."""
import argparse
import json
import os
from pathlib import Path
import sys
os.environ.setdefault('OPENBLAS_NUM_THREADS','2')
os.environ.setdefault('OMP_NUM_THREADS','2')
import numpy as np
import pandas as pd
from common import ROOT,assert_frozen,write
sys.path.insert(0,str(ROOT/'research/article_revision'))
from ta01_oof_study import core,physics


def run(folder,models):
    frozen=assert_frozen(folder,models)
    protocol=json.loads((folder/'protocol-before-execution.json').read_text())['protocol']
    tolerance=protocol['composite_monotonicity']['decrease_tolerance_mm']
    summaries=[];grids=[];failures=[]
    for task in frozen['tasks']:
        path=models/task['task'];prefix=ROOT/task['source_prefix']
        train_rows=core.read_csv(Path(str(prefix)+'-train.csv'));test_rows=core.read_csv(Path(str(prefix)+'-test.csv'))
        train=core.make_sequences(train_rows,6,task['horizon']);data=core.make_sequences(test_rows,6,task['horizon'])
        dates={r['scenario_id']:r['source_date'] for r in test_rows}
        base=json.loads((path/'base-network.json').read_text());corr=json.loads((path/'corrector.json').read_text())
        assert base['seed']==frozen['original_predictive_protocol']['base_seeds'][task['seed_index']]
        assert corr['seed']==frozen['original_predictive_protocol']['corrector_seeds'][task['seed_index']]
        network=core.LstmRegressor(len(core.FEATURES),frozen['original_predictive_protocol']['lstm']['hidden'],base['seed'])
        network.parameters={k:np.asarray(v) for k,v in base['weights'].items()}
        mean=np.asarray(base['feature_mean']).reshape(1,1,-1);scale=np.asarray(base['feature_std']).reshape(1,1,-1)
        rain=physics.CORRECTOR_FEATURES.index('forecast_rainfall_mm');safety=physics.CORRECTOR_FEATURES.index('mohr_coulomb_safety_index')
        correction=physics.PhysicsCorrector(len(physics.CORRECTOR_FEATURES),frozen['original_predictive_protocol']['corrector']['hidden'],corr['seed'],rain,safety)
        correction.parameters={k:np.asarray(v) for k,v in corr['weights'].items()}
        cmean=np.asarray(corr['mean']);cscale=np.asarray(corr['std'])
        assert (scale>0).all() and (cscale>0).all() and base['target_std']>0
        original=network.forward((data.x-mean)/scale)
        original_residual=correction.forward((physics.corrector_inputs(data,original)-cmean)/cscale)
        saved=pd.read_csv(path/'test-predictions.csv',float_precision='round_trip')
        np.testing.assert_allclose(np.maximum(data.current,data.current+base['target_mean']+base['target_std']*original),saved.lstm,rtol=0,atol=1e-14)
        np.testing.assert_allclose(np.maximum(data.current,data.current+base['target_mean']+base['target_std']*(original+original_residual)),saved.hybrid_oof,rtol=0,atol=1e-14)
        assert list(zip(saved.scenario_id,saved.origin_hour,saved.target_hour))==[(r['scenario_id'],r['origin_hour'],r['target_hour']) for r in data.metadata]
        training_forecast=train.x[:,-1,3]
        choices={'training_quantiles':np.unique(np.quantile(training_forecast,[0,.25,.5,.75,1],method='linear')),
                 'stress':np.array(protocol['composite_monotonicity']['stress_grid_mm'],dtype=float)}
        destination=folder/'monotonicity'/task['task'];destination.mkdir(parents=True,exist_ok=True)
        frames=[]
        for grid_name,values in choices.items():
            grids.append({**task,'grid':grid_name,'values_mm':values.tolist(),'training_min_mm':float(training_forecast.min()),'training_max_mm':float(training_forecast.max()),'histories':len(data.current)})
            outputs={name:[] for name in ['lstm_raw_delta_mm','lstm_floor_delta_mm','composite_raw_delta_mm','composite_floor_delta_mm','conditional_residual_mm']}
            for value in values:
                x=data.x.copy();x[:,:,3]=value
                base_standard=network.forward((x-mean)/scale)
                inputs=physics.corrector_inputs_from_sequence(x,base_standard)
                residual=correction.forward((inputs-cmean)/cscale)
                conditional=correction.forward((physics.corrector_inputs_from_sequence(x,original)-cmean)/cscale)
                delta=base['target_mean']+base['target_std']*base_standard
                total=base['target_mean']+base['target_std']*(base_standard+residual)
                predictions={'lstm_raw_delta_mm':delta,'lstm_floor_delta_mm':np.maximum(delta,0),
                             'composite_raw_delta_mm':total,'composite_floor_delta_mm':np.maximum(total,0),
                             'conditional_residual_mm':base['target_std']*conditional}
                for name,pred in predictions.items():outputs[name].append(pred)
                frame=pd.DataFrame(data.metadata);frame['source_date']=[dates[r['scenario_id']] for r in data.metadata]
                frame['grid']=grid_name;frame['forecast_rainfall_mm']=value;frame['original_forecast_rainfall_mm']=data.x[:,-1,3]
                frame['within_training_marginal_rain_range']=bool(training_forecast.min()<=value<=training_forecast.max())
                frame['current_displacement_mm']=data.current
                for name,pred in predictions.items():frame[name]=pred
                frames.append(frame)
            for name,predictions in outputs.items():
                array=np.asarray(predictions);assert np.isfinite(array).all()
                differences=np.diff(array,axis=0);violations=differences < -tolerance
                pairs=int(differences.size);histories=len(data.current)
                any_violation=violations.any(axis=0) if len(values)>1 else np.zeros(histories,dtype=bool)
                maximum=float(max(0,-differences.min())) if pairs else 0.
                summaries.append({**task,'grid':grid_name,'method':name,'histories':histories,'grid_values':len(values),'adjacent_pairs':pairs,
                    'violating_pairs':int(violations.sum()),'pair_violation_fraction':float(violations.sum()/pairs) if pairs else None,
                    'histories_with_decrease':int(any_violation.sum()),'history_violation_fraction':float(any_violation.mean()) if pairs else None,
                    'maximum_adjacent_decrease_mm':maximum,'tolerance_mm':tolerance})
                if name=='conditional_residual_mm' and violations.any():
                    failures.append({'task':task['task'],'grid':grid_name,'check':'conditional-residual-monotonicity','maximum_decrease_mm':maximum})
                if violations.any():
                    interval_index,history_index=np.nonzero(violations)
                    records=[{**data.metadata[i],'grid':grid_name,'method':name,'rain_lower_mm':float(values[j]),'rain_upper_mm':float(values[j+1]),'decrease_mm':float(-differences[j,i])} for j,i in zip(interval_index,history_index)]
                    pd.DataFrame(records).to_csv(destination/f'{grid_name}-{name}-decreases.csv.gz',index=False,float_format='%.17g',compression={'method':'gzip','mtime':0})
        pd.concat(frames,ignore_index=True).to_csv(destination/'all-grid-predictions.csv.gz',index=False,float_format='%.17g',compression={'method':'gzip','mtime':0})
        print(json.dumps({'task':task['task'],'histories':len(data.current),'grids_complete':list(choices)}),flush=True)
    assert_frozen(folder,models)
    pd.DataFrame(summaries).to_csv(folder/'monotonicity-summary.csv',index=False,float_format='%.17g')
    report={'status':'complete' if not failures else 'checks_failed','tasks':len(frozen['tasks']),'grids':grids,'summaries':summaries,'failures':failures,
            'interpretation':'Counts describe adjacent finite-grid evaluations of retained functions, not independent-event prevalence or global monotonicity proofs. Marginal training ranges do not establish joint support with each history. Wider stress grids are separate.'}
    write(folder/'monotonicity-report.json',report)
    print(json.dumps({'status':report['status'],'tasks':report['tasks'],'summaries':len(summaries),'conditional_control_failures':len(failures)}))
    if failures:raise SystemExit(1)


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--folder',type=Path,required=True);parser.add_argument('--models',type=Path,required=True)
    args=parser.parse_args();run(args.folder.resolve(),args.models.resolve())
