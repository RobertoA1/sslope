"""Audit the retained evidence or repeat both study generations in new folders."""
import argparse
from pathlib import Path
import subprocess
import sys

HERE=Path(__file__).resolve().parent
OLD=HERE.parent/'article_revision'


def execute(path,*args):subprocess.run([sys.executable,str(path),*map(str,args)],check=True)


def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('mode',choices=['audit','train']);ap.add_argument('--evidence',type=Path,required=True)
    ap.add_argument('--output',type=Path,required=True);ap.add_argument('--node',default='node')
    a=ap.parse_args();ev=a.evidence.resolve();out=a.output.resolve();out.mkdir(parents=True,exist_ok=True)
    if a.mode=='audit':
        execute(OLD/'reproduce.py','audit','--evidence',ev,'--output',out)
        execute(HERE/'verify_sensitivity.py','--folder',ev/'field-sensitivity')
        execute(HERE/'verify_projection.py','--folder',ev/'field-sensitivity')
    else:
        execute(OLD/'reproduce.py','train','--evidence',ev,'--output',out,'--node',a.node)
        execute(HERE/'field_sensitivity.py','--output',out/'field-sensitivity')
        execute(HERE/'projection_audit.py','--folder',out/'field-sensitivity')
        execute(HERE/'verify_sensitivity.py','--folder',out/'field-sensitivity')
        execute(HERE/'verify_projection.py','--folder',out/'field-sensitivity')
    print('Revision 2 source/model/window/metric audit completed.')


if __name__=='__main__':main()
