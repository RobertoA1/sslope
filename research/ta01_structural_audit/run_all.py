"""Freeze a new audit specification and execute all checks, retaining failures."""
import argparse
from datetime import datetime,timezone
from pathlib import Path
import subprocess
import sys
from common import HERE,freeze,assert_frozen,write


def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--models',type=Path,required=True);parser.add_argument('--node',required=True)
    args=parser.parse_args();folder=args.output.resolve();models=args.models.resolve()
    record=freeze(folder,models)
    print(f'Frozen {len(record["code_source_hashes"])} source inputs and {len(record["model_hashes"])} model artefacts before new audit execution.',flush=True)
    commands=[('javascript_numerical',[args.node,str(HERE/'export_numerical_checks.mjs'),str(folder)]),
              ('python_numerical',[sys.executable,str(HERE/'verify_numerical_checks.py'),'--folder',str(folder)]),
              ('functional_monotonicity',[sys.executable,str(HERE/'audit_monotonicity.py'),'--folder',str(folder),'--models',str(models)])]
    stages=[]
    for name,command in commands:
        assert_frozen(folder,models)
        start=datetime.now(timezone.utc).isoformat();print('Starting '+name,flush=True)
        with (folder/(name+'.log')).open('w') as log:
            completed=subprocess.run(command,stdout=log,stderr=subprocess.STDOUT)
        stages.append({'stage':name,'exit_code':completed.returncode,'started_utc':start,'finished_utc':datetime.now(timezone.utc).isoformat()})
        write(folder/'run-status.json',{'status':'running','stages':stages})
        print(f'Finished {name}: exit {completed.returncode}',flush=True)
    assert_frozen(folder,models)
    result={'status':'complete' if all(s['exit_code']==0 for s in stages) else 'checks_failed','stages':stages,
            'all_frozen_sources_and_models_unchanged':True,'scope':'Retrospective implementation and functional audit, not external field validation.'}
    write(folder/'run-status.json',result);print(result['status'],flush=True)
    if result['status']!='complete':raise SystemExit(1)


if __name__=='__main__':main()
