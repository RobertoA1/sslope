"""Generate manuscript tables directly from matched TA-01 forecast files."""
import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd

MODELS = ["proportional", "persistence", "ridge", "lstm", "hybrid_oof"]
CONTRASTS = [("lstm", "proportional"), ("hybrid_oof", "proportional"), ("hybrid_oof", "lstm")]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--folder", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--primary-only", action="store_true")
    args = parser.parse_args()
    protocol = json.loads((args.folder/"protocol-before-training.json").read_text())["protocol"]
    if not args.primary_only and not (args.folder/"completed.json").exists():
        raise SystemExit("Full-pipeline seed repetitions are not complete")
    args.output.mkdir(exist_ok=True, parents=True)
    main_rows, contrasts, strata, seeds = [], [], [], []
    rng = np.random.default_rng(20261104)
    reps = protocol["bootstrap_reps"]
    for partition in protocol["partitions"]:
        for horizon in protocol["horizons"]:
            task = args.folder/f"{partition}-{horizon}h-seed0"
            frame = pd.read_csv(task/"test-predictions.csv", float_precision="round_trip")
            main_rows.append({"partition": partition, "horizon_h": horizon, "windows": len(frame), "source_dates": frame.source_date.nunique(),
                              **{name+"_mae_nm": float(np.mean(abs(frame[name]-frame.actual)))*1e6 for name in MODELS}})
            for name in MODELS:
                frame[name+"_loss"] = abs(frame[name]-frame.actual)
            clusters = frame.groupby("source_date").agg({name+"_loss": "sum" for name in MODELS} | {"actual": "size"})
            count = clusters.actual.to_numpy()
            n = len(count)
            differences = np.column_stack([(clusters[a+"_loss"]-clusters[b+"_loss"]).to_numpy() for a, b in CONTRASTS])
            draws = np.empty((reps, len(CONTRASTS)))
            for start in range(0, reps, 1000):
                ix = rng.integers(n, size=(min(1000, reps-start), n))
                draws[start:start+len(ix)] = differences[ix].sum(axis=1)/count[ix].sum(axis=1)[:, None]
            for i, (a, b) in enumerate(CONTRASTS):
                ci = np.quantile(draws[:, i], [.025, .975])*1e6
                family = np.quantile(draws[:, i], [.05/36, 1-.05/36])*1e6
                contrasts.append({"partition": partition, "horizon_h": horizon, "model_a": a, "model_b": b,
                                  "difference_nm": float(np.mean(frame[a+"_loss"]-frame[b+"_loss"]))*1e6,
                                  "ci95_low_nm": ci[0], "ci95_high_nm": ci[1], "family_low_nm": family[0], "family_high_nm": family[1],
                                  "source_dates": n, "bootstrap_reps": reps, "family_size": 18})
            for label, selected in [("stored_zero", frame[frame.actual == 0]), ("positive", frame[frame.actual > 0])]:
                strata.append({"partition": partition, "horizon_h": horizon, "stratum": label, "windows": len(selected),
                               **{name+"_mae_nm": float(np.mean(selected[name+"_loss"]))*1e6 if len(selected) else None for name in MODELS}})
            for index in range(len(protocol["base_seeds"])):
                path = args.folder/f"{partition}-{horizon}h-seed{index}/complete.json"
                if not path.exists():
                    continue
                r = json.loads(path.read_text())
                seeds.append({"partition": partition, "horizon_h": horizon, "base_seed": r["base_seed"], "corrector_seed": r["corrector_seed"],
                              **{name+"_mae_nm": r["metrics"][name]["mae_mm"]*1e6 for name in MODELS}})
    for filename, rows in [("main-comparison.csv", main_rows), ("paired-contrasts.csv", contrasts), ("stored-target-strata.csv", strata), ("full-pipeline-seeds.csv", seeds)]:
        pd.DataFrame(rows).to_csv(args.output/filename, index=False, float_format="%.12g")
    status = {"status": "primary_only_incomplete_seed_sensitivity" if args.primary_only else "complete",
              "primary_comparisons": len(main_rows), "contrasts": len(contrasts), "seed_runs": len(seeds),
              "unit": "nm = 1e-6 mm; agreement with computed target, not sensor precision",
              "inference": "date-cluster percentile bootstrap conditional on fitted primary models; family of 18 contrasts; retrospective/exploratory; dates assumed independent clusters",
              "training_uncertainty": "reported as full-pipeline seed sensitivity separately; not included in date-cluster intervals"}
    (args.output/"summary-status.json").write_text(json.dumps(status, indent=2)+"\n")
    print(json.dumps(status, indent=2))


if __name__ == "__main__":
    main()
