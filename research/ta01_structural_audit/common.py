from datetime import datetime, timezone
from hashlib import sha256
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
HERE=Path(__file__).resolve().parent


def write(path,value):
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(value,ensure_ascii=False,indent=2,allow_nan=False)+'\n')


def freeze(folder,models):
    if folder.exists() and any(folder.iterdir()):
        raise ValueError('Use a new output directory; do not replace earlier outcomes.')
    folder.mkdir(parents=True,exist_ok=True)
    original=json.loads((ROOT/'research/article_revision/ta01-protocol.json').read_text())
    paths=list(HERE.glob('*.py'))+list(HERE.glob('*.mjs'))+[HERE/'protocol.json',
        ROOT/'src/core/fem-2d.js',ROOT/'src/core/study-case-ta01.js',ROOT/'scripts/train-lstm.py',
        ROOT/'scripts/train-physics-guided.py',ROOT/'research/article_revision/ta01_oof_study.py',ROOT/'research/article_revision/ta01-protocol.json',
        ROOT/'data/generated/ta01-fem-500.csv',ROOT/'data/generated/ta01-fem-500-manifest.json']
    paths.extend(Path(str(ROOT/prefix)+'-'+part+'.csv') for prefix in original['partitions'].values() for part in ['train','validation','test'])
    code={p.relative_to(ROOT).as_posix():sha256(p.read_bytes()).hexdigest() for p in sorted(set(paths))}
    tasks=[];model_hashes={}
    for partition in original['partitions']:
        for horizon in original['horizons']:
            for seed_index in range(len(original['base_seeds'])):
                name=f'{partition}-{horizon}h-seed{seed_index}';task=models/name
                complete=json.loads((task/'complete.json').read_text())
                assert complete['partition']==partition and complete['horizon']==horizon and complete['seed_index']==seed_index
                assert complete['base_seed']==original['base_seeds'][seed_index]
                assert complete['corrector_seed']==original['corrector_seeds'][seed_index]
                tasks.append({'task':name,'partition':partition,'horizon':horizon,'seed_index':seed_index,'source_prefix':original['partitions'][partition]})
                for filename in ['complete.json','base-network.json','corrector.json','oof-date-assignment.json','test-predictions.csv',*[f'fold-{i}.json' for i in range(original['folds'])]]:
                    p=task/filename;model_hashes[p.relative_to(models).as_posix()]=sha256(p.read_bytes()).hexdigest()
    assert len(tasks)==18
    protocol=json.loads((HERE/'protocol.json').read_text())
    write(folder/'protocol-before-execution.json',{'recorded_utc':datetime.now(timezone.utc).isoformat(),'protocol':protocol,
        'prior_exposure':protocol['prior_exposure'],'registration':'Local retrospective audit specification, not external preregistration.'})
    record={'code_source_hashes':code,'model_hashes':model_hashes,'tasks':tasks,'original_predictive_protocol':original}
    write(folder/'frozen.json',record)
    return record


def assert_frozen(folder,models=None):
    record=json.loads((folder/'frozen.json').read_text())
    for name,digest in record['code_source_hashes'].items():
        assert sha256((ROOT/name).read_bytes()).hexdigest()==digest,name
    if models is not None:
        for name,digest in record['model_hashes'].items():
            assert sha256((models/name).read_bytes()).hexdigest()==digest,name
    return record
