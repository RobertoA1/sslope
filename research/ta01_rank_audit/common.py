from datetime import datetime,timezone
from hashlib import sha256
from pathlib import Path
import json
import importlib.metadata as metadata
import platform,sys

ROOT=Path(__file__).resolve().parents[2]
HERE=Path(__file__).resolve().parent
ARTICLE_ROOT=ROOT.parent/'sslope-articulo'
HISTORICAL=ARTICLE_ROOT/'revision-independiente-2026-11-04/evidence/ta01-oof'
STRUCTURAL=ARTICLE_ROOT/'ta01-auditoria-2026-11-04/evidence/audit-v2'

def digest(path):return sha256(path.read_bytes()).hexdigest()

def write(path,value):
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(value,indent=2,ensure_ascii=False,allow_nan=False)+'\n')

def freeze(output,models=HISTORICAL,reference=STRUCTURAL):
    if output.exists() and any(output.iterdir()):raise ValueError('Use a new output directory')
    output.mkdir(parents=True,exist_ok=True)
    paths=list(HERE.glob('*.py'))+[HERE/'protocol.json',ROOT/'data/generated/ta01-fem-500.csv',ROOT/'data/generated/ta01-fem-500-manifest.json',ROOT/'src/core/study-case-ta01.js',ROOT/'src/core/fem-2d.js',ROOT/'research/article_revision/ta01-protocol.json']
    hashes={str(p.relative_to(ROOT)):digest(p) for p in sorted(paths)}
    forecasts={str(p.relative_to(models)):digest(p) for p in sorted(models.glob('*/test-predictions.csv'))}
    assert len(forecasts)==18
    references={name:digest(reference/name) for name in ['numerical-export-report.json','python-verification.json','all-label-certificate.csv','frozen.json']}
    record={'recorded_utc':datetime.now(timezone.utc).isoformat(),'protocol':json.loads((HERE/'protocol.json').read_text()),'source_hashes':hashes,'forecast_hashes':forecasts,'reference_hashes':references,'models_root':str(models),'reference_root':str(reference),'registration':'Local retrospective protocol; not external preregistration.'}
    write(output/'frozen-before-execution.json',record)
    env={'python':sys.version,'platform':platform.platform(),'packages':{n:metadata.version(n) for n in ['numpy','pandas','scipy','scikit-learn','joblib','threadpoolctl','python-dateutil','pytz','tzdata','six']}}
    write(output/'environment-before-execution.json',env)
    return record

def assert_frozen(output):
    d=json.loads((output/'frozen-before-execution.json').read_text())
    for name,h in d['source_hashes'].items():assert digest(ROOT/name)==h,name
    for name,h in d['forecast_hashes'].items():assert digest(Path(d['models_root'])/name)==h,name
    for name,h in d['reference_hashes'].items():assert digest(Path(d['reference_root'])/name)==h,name
    return d
