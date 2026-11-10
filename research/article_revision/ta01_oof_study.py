"""Rebuild the TA-01 OOF comparisons from locally available source CSVs.

No claim is made that missing earlier supplementary artefacts were recovered.
This is a new auditable computation, with checkpoint selection at full precision.
"""
from __future__ import annotations

import argparse
import copy
from datetime import datetime, timezone
from hashlib import sha256
import importlib.util
import json
import math
import os
from pathlib import Path
import subprocess
import sys
import time

os.environ.setdefault("OPENBLAS_NUM_THREADS", "2")
os.environ.setdefault("OMP_NUM_THREADS", "2")
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]


def module(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT/"scripts"/filename)
    result = importlib.util.module_from_spec(spec)
    sys.modules[name] = result
    spec.loader.exec_module(result)
    return result


core = module("revision_lstm_core", "train-lstm.py")
physics = module("revision_corrector_core", "train-physics-guided.py")


def write(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False)+"\n")


def subset(data, indices):
    indices = np.asarray(indices)
    return core.SequenceSet(data.x[indices], data.target_delta[indices], data.current[indices], data.actual[indices], [data.metadata[i] for i in indices])


def train_base(train, valid, seed, config, status):
    mean, std = train.x.mean(axis=(0, 1), keepdims=True), train.x.std(axis=(0, 1), keepdims=True)
    std[std < 1e-12] = 1
    y_mean, y_std = float(train.target_delta.mean()), float(train.target_delta.std()) or 1.
    x, y = (train.x-mean)/std, (train.target_delta-y_mean)/y_std
    model = core.LstmRegressor(x.shape[-1], config["hidden"], seed)
    optimizer = core.Adam(model.parameters, config["learning_rate"])
    random = np.random.default_rng(seed)
    best, score, stale, history, epoch_best = None, math.inf, 0, [], 0
    for epoch in range(1, config["epochs"]+1):
        order = random.permutation(len(x))
        for start in range(0, len(order), config["batch_size"]):
            ix = order[start:start+config["batch_size"]]
            pred, cache, final_hidden = model.forward(x[ix], keep_cache=True)
            optimizer.step(model.parameters, model.backward(pred-y[ix], cache, final_hidden))
        raw = valid.current+y_mean+y_std*model.forward((valid.x-mean)/std)
        mae = float(np.mean(abs(np.maximum(valid.current, raw)-valid.actual)))
        history.append({"epoch": epoch, "validation_mae_mm": mae})
        if mae < score:
            score, best, stale, epoch_best = mae, copy.deepcopy(model.parameters), 0, epoch
        else:
            stale += 1
        if epoch % 40 == 0:
            status(f"epoch {epoch}; best validation MAE {score:.12g} mm")
        if stale >= config["patience"]:
            break
    model.parameters = best
    return {"network": model, "mean": mean, "std": std, "y_mean": y_mean, "y_std": y_std,
            "history": history, "best_epoch": epoch_best, "seed": seed}


def raw_delta(bundle, data):
    return bundle["y_mean"]+bundle["y_std"]*bundle["network"].forward((data.x-bundle["mean"])/bundle["std"])


def base_artifact(bundle):
    return {"seed": bundle["seed"], "feature_mean": bundle["mean"].reshape(-1).tolist(), "feature_std": bundle["std"].reshape(-1).tolist(),
            "target_mean": bundle["y_mean"], "target_std": bundle["y_std"], "best_epoch": bundle["best_epoch"],
            "history": bundle["history"], "weights": {k: v.tolist() for k, v in bundle["network"].parameters.items()}}


def train_corrector(train, valid, oof_delta_mm, base, seed, config, weights):
    target_mean, target_std = base["y_mean"], base["y_std"]
    base_values = {"train": (oof_delta_mm-target_mean)/target_std,
                   "validation": (raw_delta(base, valid)-target_mean)/target_std}
    inputs = {"train": physics.corrector_inputs(train, base_values["train"]),
              "validation": physics.corrector_inputs(valid, base_values["validation"])}
    mean, std = inputs["train"].mean(axis=0), inputs["train"].std(axis=0)
    std[std < 1e-12] = 1
    x = (inputs["train"]-mean)/std
    y = (train.target_delta-target_mean)/target_std
    rain, safety = physics.CORRECTOR_FEATURES.index("forecast_rainfall_mm"), physics.CORRECTOR_FEATURES.index("mohr_coulomb_safety_index")
    current_rain = physics.CORRECTOR_FEATURES.index("current_rainfall_mm_h")
    model = physics.PhysicsCorrector(x.shape[1], config["hidden"], seed, rain, safety)
    optimizer = physics.Adam(model.parameters, config["learning_rate"])
    random = np.random.default_rng(seed)
    best, score, stale, history, epoch_best = None, math.inf, 0, [], 0
    for epoch in range(1, config["epochs"]+1):
        order = random.permutation(len(x))
        for start in range(0, len(order), config["batch_size"]):
            ix = order[start:start+config["batch_size"]]
            correction, cache = model.forward(x[ix], keep_cache=True)
            total = base_values["train"][ix]+correction
            gradient = 2*weights["data"]*(total-y[ix])/len(ix)
            physical_delta = total+target_mean/target_std
            decreasing = physical_delta < 0
            gradient[decreasing] += 2*weights["monotonicity"]*physical_delta[decreasing]/len(ix)
            dry = (inputs["train"][ix, rain] <= 1e-10) & (inputs["train"][ix, current_rain] <= 1e-10)
            gradient[dry] += 2*weights["dryBoundary"]*physical_delta[dry]/len(ix)
            grads = model.backward(gradient, cache)
            for name in ("w1", "w2"):
                grads[name] += 2*weights["l2"]*model.parameters[name]
            optimizer.step(model.parameters, grads)
        val_y = base_values["validation"]+model.forward((inputs["validation"]-mean)/std)
        pred = np.maximum(valid.current, valid.current+target_mean+target_std*val_y)
        mae = float(np.mean(abs(pred-valid.actual)))
        history.append({"epoch": epoch, "validation_mae_mm": mae})
        if mae < score:
            score, best, stale, epoch_best = mae, copy.deepcopy(model.parameters), 0, epoch
        else:
            stale += 1
        if stale >= config["patience"]:
            break
    model.parameters = best
    return {"network": model, "mean": mean, "std": std, "best_epoch": epoch_best, "history": history,
            "seed": seed, "target_mean": target_mean, "target_std": target_std}


def proportional(data):
    rain, displacement = data.x[:, :, 2], data.x[:, :, 0]
    denominator = (rain**2).sum(axis=1)
    slope = np.divide((rain*displacement).sum(axis=1), denominator, out=np.zeros(len(rain)), where=denominator > 0)
    expected_rain = rain[:, -1]+data.x[:, -1, 3]
    return np.maximum(data.current, np.maximum(0., slope)*expected_rain)


def run_task(partition, horizon, seed_index, protocol, output, node):
    task = output/f"{partition}-{horizon}h-seed{seed_index}"
    task.mkdir(exist_ok=True)
    if (task/"complete.json").exists():
        return
    prefix = ROOT/protocol["partitions"][partition]
    rows = {part: core.read_csv(Path(f"{prefix}-{part}.csv")) for part in ("train", "validation", "test")}
    data = {part: core.make_sequences(values, protocol["lookback"], horizon) for part, values in rows.items()}
    dates = {part: {r["scenario_id"]: r["source_date"] for r in values} for part, values in rows.items()}
    date_sets = [{r["source_date"] for r in rows[part]} for part in rows]
    if any(date_sets[i]&date_sets[j] for i in range(3) for j in range(i)):
        raise ValueError("Source date crosses dataset partitions")
    source_dates = np.asarray([dates["train"][r["scenario_id"]] for r in data["train"].metadata])
    unique_dates = np.unique(source_dates)
    random = np.random.default_rng(protocol["fold_seed"])
    random.shuffle(unique_dates)
    assignment = {date: i % protocol["folds"] for i, date in enumerate(unique_dates)}
    fold_ids = np.asarray([assignment[date] for date in source_dates])
    write(task/"oof-date-assignment.json", assignment)
    base_seed, correction_seed = protocol["base_seeds"][seed_index], protocol["corrector_seeds"][seed_index]

    def status(message):
        state = {"task": task.name, "message": message, "updated_utc": datetime.now(timezone.utc).isoformat()}
        write(output/"progress.json", state)
        print(json.dumps(state), flush=True)

    oof = np.full(len(source_dates), np.nan)
    for fold in range(protocol["folds"]):
        checkpoint = task/f"fold-{fold}.json"
        held = np.flatnonzero(fold_ids == fold)
        if checkpoint.exists():
            artifact = json.loads(checkpoint.read_text())
            oof[held] = artifact["heldout_delta_mm"]
            continue
        status(f"OOF fold {fold+1}/{protocol['folds']}")
        train = subset(data["train"], np.flatnonzero(fold_ids != fold))
        heldout = subset(data["train"], held)
        fitted = train_base(train, data["validation"], base_seed+fold+1, protocol["lstm"], status)
        oof[held] = raw_delta(fitted, heldout)
        write(checkpoint, {**base_artifact(fitted), "heldout_delta_mm": oof[held].tolist(), "heldout_indices": held.tolist()})
    if not np.isfinite(oof).all():
        raise ValueError("Incomplete cross-fitting")
    status("Full training base network")
    fitted = train_base(data["train"], data["validation"], base_seed, protocol["lstm"], status)
    write(task/"base-network.json", base_artifact(fitted))
    status("OOF residual corrector")
    corrector = train_corrector(data["train"], data["validation"], oof, fitted, correction_seed, protocol["corrector"], protocol["loss_weights"])
    write(task/"corrector.json", {k: v.tolist() if isinstance(v, np.ndarray) else v for k, v in corrector.items() if k != "network"} | {"weights": {k: v.tolist() for k, v in corrector["network"].parameters.items()}})
    baseline_path = task/"ridge.json"
    subprocess.run([node, str(ROOT/"scripts/train-temporal-baseline.js"), f"--input-prefix={prefix}", f"--horizon={horizon}", f"--output={baseline_path}"], check=True, stdout=subprocess.DEVNULL)
    ridge = physics.ridge_predictions(task/"ridge-test-predictions.csv", data["test"].metadata)
    test = data["test"]
    standardized = (raw_delta(fitted, test)-fitted["y_mean"])/fitted["y_std"]
    residual_x = physics.corrector_inputs(test, standardized)
    correction = corrector["network"].forward((residual_x-corrector["mean"])/corrector["std"])
    forecasts = {"persistence": test.current, "proportional": proportional(test), "ridge": ridge,
                 "lstm": np.maximum(test.current, test.current+raw_delta(fitted, test)),
                 "hybrid_oof": np.maximum(test.current, test.current+fitted["y_mean"]+fitted["y_std"]*(standardized+correction))}
    frame = pd.DataFrame([{**m, "source_date": dates["test"][m["scenario_id"]], "actual": float(test.actual[i]), "current": float(test.current[i]),
                           **{name: float(values[i]) for name, values in forecasts.items()}} for i, m in enumerate(test.metadata)])
    frame.to_csv(task/"test-predictions.csv", index=False, float_format="%.17g")
    result = {"partition": partition, "horizon": horizon, "seed_index": seed_index, "base_seed": base_seed, "corrector_seed": correction_seed,
              "windows": len(test.actual), "dates": int(frame.source_date.nunique()), "stored_zero_fraction": float(np.mean(test.actual == 0)),
              "metrics": {name: {"mae_mm": float(np.mean(abs(values-test.actual))), "rmse_mm": float(np.sqrt(np.mean((values-test.actual)**2))),
                                 "bias_mm": float(np.mean(values-test.actual))} for name, values in forecasts.items()},
              "base_best_epoch": fitted["best_epoch"], "corrector_best_epoch": corrector["best_epoch"]}
    write(task/"complete.json", result)
    status("Task complete")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--protocol", type=Path, default=Path(__file__).with_name("ta01-protocol.json"))
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--node", required=True)
    parser.add_argument("--resume", action="store_true")
    args = parser.parse_args()
    output = args.output.resolve()
    protocol = json.loads(args.protocol.read_text())
    if output.exists() and any(output.iterdir()) and not args.resume:
        raise SystemExit("Use --resume only for an existing matching protocol")
    output.mkdir(parents=True, exist_ok=True)
    source_paths = [args.protocol, Path(__file__), ROOT/"scripts/train-lstm.py", ROOT/"scripts/train-physics-guided.py", ROOT/"src/core/temporal-baseline.js"]
    source_paths += [Path(f"{ROOT/prefix}-{part}.csv") for prefix in protocol["partitions"].values() for part in ("train", "validation", "test")]
    frozen = {str(p): sha256(p.read_bytes()).hexdigest() for p in source_paths}
    record = output/"source-hashes.json"
    if record.exists() and json.loads(record.read_text()) != frozen:
        raise SystemExit("Cannot resume after source/protocol changes")
    write(record, frozen)
    if not (output/"protocol-before-training.json").exists():
        write(output/"protocol-before-training.json", {"recorded_utc": datetime.now(timezone.utc).isoformat(), "protocol": protocol})
    try:
        for index in range(len(protocol["base_seeds"])):
            for partition in protocol["partitions"]:
                for horizon in protocol["horizons"]:
                    run_task(partition, horizon, index, protocol, output, args.node)
    except BaseException as exc:
        write(output/"failure.json", {"type": type(exc).__name__, "message": str(exc)})
        raise
    write(output/"completed.json", {"task_count": len(protocol["base_seeds"])*len(protocol["partitions"])*len(protocol["horizons"])})


if __name__ == "__main__":
    main()
