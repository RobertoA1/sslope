"""Execute the declared field protocol without overwriting existing experiments.

Run from any directory with research-app/.venv/bin/python. This program saves
the protocol and source hashes before fitting and preserves unfavourable output.
It uses the existing, tested Century Lab nested evaluation engine.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import sys
import time

ROOT = Path(__file__).resolve().parents[2]
APP = ROOT / "research-app"
sys.path.insert(0, str(APP))
os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")
os.environ.setdefault("TF_ENABLE_ONEDNN_OPTS", "0")
os.environ.setdefault("OMP_NUM_THREADS", "2")
os.environ.setdefault("TF_NUM_INTRAOP_THREADS", "2")
os.environ.setdefault("TF_NUM_INTEROP_THREADS", "1")


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--protocol", type=Path, default=Path(__file__).with_name("west-wall-protocol.json"))
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--resume", action="store_true")
    args = parser.parse_args()
    folder = args.output.resolve()
    if folder.exists() and any(folder.iterdir()) and not args.resume:
        raise SystemExit("Refusing to overwrite a non-empty experiment directory")
    folder.mkdir(parents=True, exist_ok=True)
    protocol = json.loads(args.protocol.read_text())
    code_paths = sorted(APP.glob("backend/*.py")) + sorted(APP.glob("crisp/*.py"))
    frozen = {
        "recorded_utc": datetime.now(timezone.utc).isoformat(),
        "status": "retrospective_protocol_recorded_before_this_run_not_external_preregistration",
        "prior_exposure": "The same final-test period has already been examined in earlier local experiments. This run cannot be presented as confirmatory or as an untouched holdout.",
        "configuration": protocol,
        "protocol_sha256": digest(args.protocol),
        "archive_sha256": digest(APP / "data/century/Data.zip"),
        "source_sha256": {str(p.relative_to(ROOT)): digest(p) for p in code_paths + [Path(__file__), Path(__file__).with_name("west_wall_engine.py")]},
        "reporting_rule": "Preserve all algorithms, seeds and failures. Select on outer CV only. Do not choose the best final-test model retrospectively.",
        "inference_rule": "Dates are temporal units; sensor rows and training seeds do not create independent field sites. Final-test comparisons are exploratory.",
    }
    frozen_path = folder / "protocol-before-training.json"
    if frozen_path.exists():
        previous = json.loads(frozen_path.read_text())
        for key in ("configuration", "protocol_sha256", "archive_sha256", "source_sha256"):
            if previous.get(key) != frozen[key]:
                raise SystemExit(f"Cannot resume with changed {key}")
    else:
        frozen_path.write_text(json.dumps(frozen, indent=2) + "\n")
    import importlib.metadata
    packages = ["tensorflow-cpu", "keras", "numpy", "pandas", "scipy", "scikit-learn", "optuna", "statsmodels", "joblib", "streamlit", "plotly"]
    (folder / "environment.json").write_text(json.dumps({"python": sys.version, "packages": {p: importlib.metadata.version(p) for p in packages}}, indent=2) + "\n")
    from crisp.config import CrispConfig
    from west_wall_engine import run
    config = CrispConfig(**protocol)
    last = [0.0, ""]

    def progress(value, message):
        now = time.monotonic()
        state = {"progress": round(value, 2), "message": message, "updated_utc": datetime.now(timezone.utc).isoformat()}
        (folder / "progress.json").write_text(json.dumps(state, indent=2) + "\n")
        if message != last[1] or now-last[0] >= 30:
            print(json.dumps(state, ensure_ascii=False), flush=True)
            last[:] = [now, message]

    try:
        report = run(config, folder, progress=progress)
    except BaseException as exc:
        (folder / "failure.json").write_text(json.dumps({"type": type(exc).__name__, "message": str(exc)}, indent=2) + "\n")
        raise
    progress(100, "Completed; all results retained")
    print(json.dumps({"selected_model": report["selected_model"], "test_days": report["test_days"], "test_n": report["test_n"], "output": str(folder)}, indent=2), flush=True)


if __name__ == "__main__":
    main()
