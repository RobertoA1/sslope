"""Reconcile field-study metrics and reload every exported seed model.

This is a second path from saved observations/windows/models to reported
forecasts. It never refits models or changes the recorded results.
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import sys

os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")
os.environ.setdefault("TF_ENABLE_ONEDNN_OPTS", "0")
os.environ.setdefault("TF_NUM_INTRAOP_THREADS", "2")
os.environ.setdefault("TF_NUM_INTEROP_THREADS", "1")
os.environ.setdefault("OMP_NUM_THREADS", "2")
import numpy as np
import pandas as pd

# Reloaded float32 neural inference may differ by a few ULP after
# serialisation/runtime execution. 0.0001 mm is below the 0.001 mm reporting
# precision and 1,000 times smaller than a 0.1 mm coordinate export increment.
# This verifies numerical agreement, never byte-identical inference.
TOLERANCE_MM = 0.0001


def reloaded(folder, name, seed, rows):
    current = np.asarray([r["current"] for r in rows])
    if name == "persistence":
        return current
    x = np.asarray([r["x"] for r in rows], dtype=np.float32)
    if name == "trend":
        return current+np.asarray([r["x"][-1][1]*24/max(r["x"][-1][2], 1e-6) for r in rows])
    stem = f"{name}-seed{seed}"
    if name in {"dense", "lstm", "gru"}:
        import tensorflow as tf
        import keras
        tf.config.experimental.enable_op_determinism()
        meta = json.loads((folder/f"{stem}-preprocessing.json").read_text())
        # Match StandardScaler's two in-place float32 operations, rather than
        # introducing a float64 intermediate in an independent inference path.
        shape = x.shape
        normalized = x.reshape(-1, shape[-1]).copy()
        normalized -= np.asarray(meta["input_mean"])
        normalized /= np.asarray(meta["input_scale"])
        net = keras.models.load_model(folder/f"{stem}.keras", compile=False)
        delta = net(normalized.reshape(shape), training=False).numpy().reshape(-1)
        return current+delta*meta["target_scale"]+meta["target_mean"]
    import joblib
    bundle = joblib.load(folder/f"{stem}.joblib")
    transformed = bundle["scaler"].transform(x.reshape(-1, x.shape[-1])).reshape(len(x), -1)
    return current+bundle["model"].predict(transformed)*bundle["scale"]+bundle["mean"]


def reconcile_metrics(rows, predicted, reported):
    actual = np.asarray([r["actual"] for r in rows])
    errors = predicted-actual
    mae = float(np.mean(abs(errors)))
    rmse = float(np.sqrt(np.mean(errors**2)))
    daily = pd.DataFrame({"date": [r["date"] for r in rows], "loss": abs(errors)}).groupby("date").loss.mean()
    assert abs(mae-reported["mae"]) < TOLERANCE_MM
    assert abs(rmse-reported["rmse"]) < TOLERANCE_MM
    assert abs(float(daily.mean())-reported["daily_mae_mm"]) < TOLERANCE_MM
    return {"mae_mm": mae, "rmse_mm": rmse, "daily_mae_mm": float(daily.mean()), "windows": len(rows), "dates": len(daily)}


def verify_southwest(folder):
    report = json.loads((folder/"report.json").read_text())
    sets = json.loads((folder/"sequences.json").read_text())
    rows = sets["test"]
    stored = pd.read_csv(folder/"test-predictions.csv", dtype={"seed": str})
    results = []
    for record in report["test"]:
        name = record["model"]
        predictions = []
        maximum_gap = 0.
        for seed in report["protocol"]["seeds"]:
            predicted = reloaded(folder, name, seed, rows)
            original = stored[(stored.model == name)&(stored.seed == str(seed))]
            assert list(original.sensor) == [r["sensor"] for r in rows]
            assert list(original.date) == [r["date"] for r in rows]
            gap = float(np.max(abs(predicted-original.predicted.to_numpy())))
            maximum_gap = max(maximum_gap, gap)
            if not np.allclose(predicted, original.predicted, atol=TOLERANCE_MM, rtol=0):
                raise AssertionError(f"Reload mismatch {name} seed {seed}: {gap}")
            predictions.append(predicted)
        ensemble = np.mean(predictions, axis=0)
        results.append({"model": name, **reconcile_metrics(rows, ensemble, record), "seeds_reloaded": len(predictions), "max_seed_reload_difference_mm": maximum_gap})
    return results


def verify_westwall(folder):
    root = Path(__file__).resolve().parents[2]
    sys.path.insert(0, str(root/"research-app"))
    from crisp.config import CrispConfig, selected_data
    report = json.loads((folder/"report.json").read_text())
    sets, _, _ = selected_data(CrispConfig(**report["config"]))
    train_sensors = {r["sensor"] for r in sets["train"]+sets["validation"]}
    rows = [r for r in sets["test"] if r["sensor"] in train_sensors]
    development = {(r["sensor"],r["date"]):r for r in sets["train"]+sets["validation"]}
    folds = {r["fold"]:r for r in report["folds"]}
    outer = pd.DataFrame(report["outer_predictions"])
    for r in report["outer_predictions"]:
        original = development[(r["sensor"],r["date"])]
        assert r["actual"] == original["actual"]
        assert folds[r["fold"]]["train_end"] < r["origin"] < r["date"]
    for ranking in report["ranking"]:
        losses=[]
        for fold in folds:
            group = outer[(outer.model==ranking["model"])&(outer.fold==fold)]
            losses.append(float(group.assign(loss=abs(group.actual-group.predicted)).groupby("date").loss.mean().mean()))
        assert abs(float(np.mean(losses))-ranking["outer_daily_mae_mm"]) < 1e-12
    results = []
    for record in report["test_results"]:
        name = record["model"]
        forecasts = [reloaded(folder, name, report["config"]["seed"]+repeat, rows) for repeat in range(report["config"]["repeats"])]
        ensemble = np.mean(forecasts, axis=0)
        stored = [r for r in report["test_predictions"] if r["model"] == name]
        if not np.allclose(ensemble, [r["predicted"] for r in stored], atol=TOLERANCE_MM, rtol=0):
            raise AssertionError(f"West Wall reload mismatch {name}")
        results.append({"model": name, **reconcile_metrics(rows, ensemble, record), "seeds_reloaded": len(forecasts)})
    return results


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--folder", type=Path, required=True)
    parser.add_argument("--case", choices=["southwest", "westwall"], required=True)
    args = parser.parse_args()
    results = verify_southwest(args.folder) if args.case == "southwest" else verify_westwall(args.folder)
    output = {"status": "verified", "case": args.case, "absolute_tolerance_mm": TOLERANCE_MM, "checks": ["all saved seed models reloaded", "prediction key alignment", "forecast agreement within stated float32 tolerance", "MAE/RMSE/daily-MAE reconciliation"], "models": results}
    (args.folder/"independent-verification.json").write_text(json.dumps(output, indent=2)+"\n")
    print(json.dumps(output, indent=2), flush=True)


if __name__ == "__main__":
    main()
