"""Post-hoc audit of transporting TA-01's non-decreasing output floor to field targets.

Only the output-floor assumption is tested. This is not a field validation of
the full residual corrector, its rainfall derivative, or unmeasured mechanics.
"""
import argparse
from datetime import datetime,timezone
from hashlib import sha256
import json
from pathlib import Path
import numpy as np
import pandas as pd
from field_sensitivity import shared_intervals


def run(folder):
    spec={'recorded_utc':datetime.now(timezone.utc).isoformat(),'status':'Post-hoc diagnostic specified after the expanded sensitivity results were seen; not a confirmatory primary comparison. No fitting or test-driven model selection.',
          'hypothesis':'Project each of the four saved seed-ensemble increment forecasts onto non-negative increments and compare paired date losses with its unprojected forecast.',
          'family':4,'blocks':[3,7,14],'bootstrap_reps':20000,'seed':20261105,
          'scope':'Only the non-decreasing output floor shared with TA-01, not the full residual correction or mechanical calibration.',
          'prediction_sha256':sha256((folder/'predictions.csv').read_bytes()).hexdigest()}
    (folder/'projection-protocol-before-analysis.json').write_text(json.dumps(spec,indent=2)+'\n')
    frame=pd.read_csv(folder/'predictions.csv',float_precision='round_trip');frame=frame[frame.partition=='test']
    counts=frame.groupby(['variant','sensor','date']).size();assert (counts==5).all()
    grouped=frame.groupby(['variant','sensor','date'],sort=True).agg(predicted_delta=('predicted_delta','mean'),actual_delta=('actual_delta','first'))
    results=[];daily={};strata=[]
    for variant,g in grouped.groupby(level='variant'):
        predicted=g.predicted_delta.to_numpy();truth=g.actual_delta.to_numpy();projected=np.maximum(predicted,0)
        dates=g.index.get_level_values('date')
        losses=pd.DataFrame({'free':abs(predicted-truth),'floor':abs(projected-truth),'bound':np.maximum(-truth,0)},index=dates).groupby(level=0).mean()
        daily[variant]=losses['floor']-losses['free']
        results.append({'variant':variant,'free_daily_mae_mm':float(losses['free'].mean()),'floored_daily_mae_mm':float(losses['floor'].mean()),'floor_minus_free_daily_mae_mm':float(daily[variant].mean()),'minimum_possible_daily_mae_for_any_nonnegative_forecast_mm':float(losses['bound'].mean()),'negative_truth_fraction':float(np.mean(truth<0)),'negative_forecast_fraction':float(np.mean(predicted<0)),'windows':len(g),'dates':len(losses)})
        for label,mask in [('negative',truth<0),('nonnegative',truth>=0)]:
            strata.append({'variant':variant,'stratum':label,'windows':int(mask.sum()),'free_pooled_mae_mm':float(np.mean(abs(predicted[mask]-truth[mask]))),'floor_pooled_mae_mm':float(np.mean(abs(projected[mask]-truth[mask])))})
    losses=pd.DataFrame(daily)
    ci=[r for block in spec['blocks'] for r in shared_intervals(losses,block,spec['bootstrap_reps'],spec['seed']+block,spec['family'])]
    result={'status':'complete','protocol':spec,'metrics':results,'strata':strata,'intervals':ci}
    (folder/'projection-report.json').write_text(json.dumps(result,indent=2)+'\n')
    pd.DataFrame(results).to_csv(folder/'projection-metrics.csv',index=False)
    print(json.dumps(results,indent=2))


if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('--folder',type=Path,required=True);run(ap.parse_args().folder)
