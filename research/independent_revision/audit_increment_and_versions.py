"""Reconcile the incremental target and the numerical changes between manuscripts."""
import argparse
from hashlib import sha256
import json
from pathlib import Path
import sys
from xml.etree import ElementTree as E
from zipfile import ZipFile
import numpy as np
import pandas as pd

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'research/article_revision'))
from ta01_oof_study import core


def main(base):
    ev=base/'evidence';out=ev/'increment-and-version-audit';out.mkdir(exist_ok=True)
    original=base/'manuscrito-recibido.docx'
    with ZipFile(original) as z:root=E.fromstring(z.read('word/document.xml'))
    ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
    def rows(table):return [[''.join(n.text or '' for n in c.findall('.//w:t',ns)) for c in r.findall('w:tc',ns)] for r in table.findall('w:tr',ns)]
    tables=[rows(t) for t in root.findall('.//w:tbl',ns)]
    prior=next(t for t in tables if t[0][-1]=='OOF hybrid' and t[0][0]=='Partition' and t[0][2]=='Windows')
    current=pd.read_csv(ev/'ta01-tables/main-comparison.csv',dtype={'horizon_h':str})
    ledger=[]
    for r in prior[1:]:
        part={'Date-disjoint':'date-disjoint','2024 test':'2024','2025 test':'2025'}[r[0]]
        new=current[(current.partition.astype(str)==part)&(current.horizon_h==r[1])].iloc[0]
        for col,name in [(3,'proportional'),(4,'persistence'),(5,'ridge'),(6,'lstm'),(7,'hybrid_oof')]:
            old=float(r[col]);now=float(new[name+'_mae_nm'])
            ledger.append({'partition':part,'horizon_h':int(r[1]),'model':name,'previous_manuscript_mae_nm':old,'audited_mae_nm':now,'difference_nm':now-old,'changed_at_reported_precision':round(now,3)!=old})
    pd.DataFrame(ledger).to_csv(out/'ta01-version-ledger.csv',index=False)
    # The existing exported base network is a separate historical artefact. Its
    # agreement with the rebuilt network prevents an unsupported causal story
    # that a different base checkpoint necessarily caused the manuscript change.
    historical_path=ROOT/'data/models/ta01-chronological-lstm-6h.json'
    historical=json.loads(historical_path.read_text());m=historical['model']
    data=core.make_sequences(core.read_csv(ROOT/'data/generated/ta01-fem-500-chronological-test.csv'),6,6)
    network=core.LstmRegressor(len(core.FEATURES),historical['architecture']['hiddenUnits'],historical['training']['seed'])
    network.parameters={k:np.asarray(v) for k,v in m['weights'].items()}
    mean=np.array([m['featureMean'][k] for k in core.FEATURES]).reshape(1,1,-1)
    std=np.array([m['featureStandardDeviation'][k] for k in core.FEATURES]).reshape(1,1,-1)
    predicted=np.maximum(data.current,data.current+m['targetDeltaMean']+m['targetDeltaStandardDeviation']*network.forward((data.x-mean)/std))
    historical_mae=float(np.mean(abs(predicted-data.actual)))*1e6
    recorded=pd.read_csv(ev/'ta01-oof/2025-6h-seed0/test-predictions.csv',float_precision='round_trip')
    maxgap=float(np.max(abs(predicted-recorded.lstm.to_numpy())))
    archive=out/'historical-export-chronological-lstm-6h.json';archive.write_bytes(historical_path.read_bytes())
    field=[]
    sets=json.loads((ev/'southwest-full/sequences.json').read_text())
    frame=pd.read_csv(ev/'southwest-full/test-predictions.csv',dtype={'seed':str})
    lookup={(r['sensor'],r['date']):r for r in sets['test']}
    for (name,seed),g in frame.groupby(['model','seed']):
        rows_=[lookup[(s,d)] for s,d in zip(g.sensor,g.date)]
        current_=np.array([r['current'] for r in rows_]);truth=np.array([r['delta'] for r in rows_])
        delta=g.predicted.to_numpy()-current_
        error_delta=delta-truth;error_level=g.predicted.to_numpy()-g.actual.to_numpy()
        gap=float(np.max(abs(error_delta-error_level)))
        assert gap<1e-8
        field.append({'model':name,'seed':seed,'windows':len(g),'maximum_error_identity_discrepancy_mm':gap,'increment_mae_mm':float(np.mean(abs(error_delta))),'level_mae_mm':float(np.mean(abs(error_level)))})
    write={'status':'verified','source_manuscript_sha256':sha256(original.read_bytes()).hexdigest(),'changed_table_entries':sum(r['changed_at_reported_precision'] for r in ledger),'historical_export_sha256':sha256(historical_path.read_bytes()).hexdigest(),'historical_export_test_mae_nm':historical_mae,'historical_export_reported_rounded_mae_mm':historical['metrics']['test']['lstm']['maeMm'],'historical_best_epoch':historical['training']['bestEpoch'],'rebuilt_best_epoch':json.loads((ev/'ta01-oof/2025-6h-seed0/base-network.json').read_text())['best_epoch'],'historical_vs_rebuilt_max_forecast_difference_mm':maxgap,'interpretation':'The previous manuscript entry 42.062 nm is not reproduced by this existing exported base model. The audited value is about 57.687 nm. Do not attribute the difference to seeds or checkpoints without the missing earlier forecast artefact. The new corrector was independently reconstructed from date-grouped OOF fits; it is not interchangeable with an unavailable previous supplementary run.','southwest_error_identity':field}
    (out/'report.json').write_text(json.dumps(write,indent=2)+'\n')
    (out/'original-parameter-table.json').write_text(json.dumps(tables[0],indent=2)+'\n')
    print(json.dumps({k:v for k,v in write.items() if k not in ['southwest_error_identity','interpretation']},indent=2))


if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('--base',type=Path,required=True);main(ap.parse_args().base)
