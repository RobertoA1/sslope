"""Audit saved article evidence or repeat training without changing original results."""
import argparse
from pathlib import Path
import subprocess
import sys

HERE=Path(__file__).resolve().parent


def execute(script,*arguments):
    subprocess.run([sys.executable,str(HERE/script),*map(str,arguments)],check=True)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode",choices=["audit","train"])
    parser.add_argument("--evidence",type=Path,required=True)
    parser.add_argument("--output",type=Path,required=True)
    parser.add_argument("--node",default="node")
    args=parser.parse_args()
    e=args.evidence.resolve();out=args.output.resolve()
    out.mkdir(parents=True,exist_ok=True)
    if args.mode=="audit":
        execute("verify_ta01_evidence.py","--folder",e/"ta01-oof")
        execute("verify_field_evidence.py","--case","southwest","--folder",e/"southwest-full")
        execute("verify_field_evidence.py","--case","westwall","--folder",e/"west-wall-full-resumable")
        execute("summarize_ta01.py","--folder",e/"ta01-oof","--output",out/"ta01-tables")
        print("All model/forecast audits completed; rebuilt tables:",out/"ta01-tables")
    else:
        # Each runner rejects non-empty outputs unless explicitly and safely
        # resuming the same source/protocol; this command starts new runs.
        execute("ta01_oof_study.py","--output",out/"ta01-oof","--node",args.node)
        execute("southwest_study.py","--output",out/"southwest-full")
        execute("run_west_wall.py","--output",out/"west-wall-full-resumable")
        execute("verify_ta01_evidence.py","--folder",out/"ta01-oof")
        execute("verify_field_evidence.py","--case","southwest","--folder",out/"southwest-full")
        execute("verify_field_evidence.py","--case","westwall","--folder",out/"west-wall-full-resumable")
        execute("summarize_ta01.py","--folder",out/"ta01-oof","--output",out/"ta01-tables")
        execute("ta01_robustness.py","--folder",out/"ta01-oof","--output",out/"ta01-robustness")


if __name__=="__main__":main()
