#!/usr/bin/env python3
"""Evaluación retrospectiva independiente de prismas Century; sin FEM ficticio."""
import copy
import hashlib
import importlib.util
import json
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("century_lstm_core", ROOT / "scripts/train-lstm.py")
core = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = core
spec.loader.exec_module(core)


def evaluate(actual, predicted):
    if not np.isfinite(predicted).all():
        raise ValueError("Pronóstico no finito")
    result = core.metrics(actual, predicted)
    result["incrementMaeMm"] = result["maeMm"]
    return result


def train():
    sequence_path = ROOT / "data/generated/century-sequences.json"
    sequence_bytes = sequence_path.read_bytes()
    data = json.loads(sequence_bytes)
    manifest = json.loads((ROOT / "data/generated/century-dataset-manifest.json").read_text())
    if hashlib.sha256(sequence_bytes).hexdigest() != manifest["sequenceSha256"]:
        raise ValueError("Las ventanas no coinciden con el manifiesto")
    if any(len(data["sets"][part]) < 20 for part in ("train", "validation", "test")):
        raise ValueError("No hay suficientes ventanas en cada partición")
    datasets = {part: {
        "x": np.array([s["x"] for s in rows], dtype=float),
        "current": np.array([s["currentMm"] for s in rows]),
        "actual": np.array([s["targetMm"] for s in rows])
    } for part, rows in data["sets"].items()}
    training = datasets["train"]
    mean = training["x"].mean(axis=(0, 1))
    std = training["x"].std(axis=(0, 1))
    std[std < 1e-8] = 1.0
    delta = training["actual"] - training["current"]
    target_mean, target_std = float(delta.mean()), float(delta.std()) or 1.0
    for d in datasets.values():
        d["normalized"] = (d["x"] - mean) / std
        d["flat"] = np.column_stack([np.ones(len(d["x"])), d["normalized"].reshape(len(d["x"]), -1)])
    target = (delta - target_mean) / target_std
    ridge_candidates = []
    best_ridge = None
    for penalty in [0.001, 0.01, 0.1, 1, 10, 100, 1000]:
        design = training["flat"]
        regularizer = np.eye(design.shape[1]) * penalty
        regularizer[0, 0] = 0
        coefficients = np.linalg.solve(design.T @ design + regularizer, design.T @ target)
        prediction = datasets["validation"]["current"] + target_mean + target_std * (datasets["validation"]["flat"] @ coefficients)
        mae = float(np.mean(np.abs(prediction - datasets["validation"]["actual"])))
        ridge_candidates.append({"lambda": penalty, "validationMaeMm": mae})
        if best_ridge is None or mae < best_ridge["mae"]:
            best_ridge = {"lambda": penalty, "mae": mae, "coefficients": coefficients}

    seed, hidden, epochs, patience = 15003054, 8, 160, 25
    model = core.LstmRegressor(len(data["features"]), hidden, seed)
    optimizer = core.Adam(model.parameters, 0.003)
    rng = np.random.default_rng(seed)
    best_weights, best_mae, best_epoch, stale = None, float("inf"), 0, 0
    history = []
    for epoch in range(1, epochs + 1):
        order = rng.permutation(len(target))
        for start in range(0, len(order), 64):
            batch = order[start:start + 64]
            pred, cache, final_hidden = model.forward(training["normalized"][batch], keep_cache=True)
            optimizer.step(model.parameters, model.backward(pred - target[batch], cache, final_hidden))
        validation = datasets["validation"]
        pred = validation["current"] + target_mean + target_std * model.forward(validation["normalized"])
        mae = float(np.mean(np.abs(pred - validation["actual"])))
        history.append({"epoch": epoch, "validationMaeMm": mae})
        if mae < best_mae - 1e-9:
            best_weights, best_mae, best_epoch, stale = copy.deepcopy(model.parameters), mae, epoch, 0
        else:
            stale += 1
        if stale >= patience:
            break
    model.parameters = best_weights
    predictions, metrics = {}, {}
    for part, d in datasets.items():
        predictions[part] = {
            "PERSISTENCE": d["current"].copy(),
            "TREND": d["current"] + d["x"][:, -1, 1] * 24 / d["x"][:, -1, 2],
            "RIDGE": d["current"] + target_mean + target_std * (d["flat"] @ best_ridge["coefficients"]),
            "LSTM": d["current"] + target_mean + target_std * model.forward(d["normalized"])
        }
        metrics[part] = {name: evaluate(d["actual"], values) for name, values in predictions[part].items()}
    selected = min(metrics["validation"], key=lambda name: metrics["validation"][name]["maeMm"])
    test_best = min(metrics["test"], key=lambda name: metrics["test"][name]["maeMm"])
    model_artifact = {"id": "CENTURY-PRISM-DAILY-LSTM-V1", "sourceId": data["id"], "sequenceSha256": manifest["sequenceSha256"],
        "features": data["features"], "lookbackDays": data["lookbackDays"], "hiddenUnits": hidden,
        "featureMean": mean.tolist(), "featureStd": std.tolist(), "targetMean": target_mean, "targetStd": target_std,
        "weights": {name: value.tolist() for name, value in model.parameters.items()},
        "ridge": {"lambda": best_ridge["lambda"], "coefficients": best_ridge["coefficients"].tolist()},
        "training": {"seed": seed, "epochsRequested": epochs, "epochsCompleted": len(history), "bestEpoch": best_epoch,
                     "patience": patience, "batchSize": 64, "learningRate": 0.003, "history": history},
        "scientificStatus": "ENTRENADA_PRISMAS_REALES_EVALUACION_RETROSPECTIVA_NO_OPERACIONAL"}
    model_path = ROOT / "data/models/century-prism-daily-lstm.json"
    model_path.write_text(json.dumps(model_artifact, indent=2, allow_nan=False) + "\n")
    pairs = []
    for part in ["validation", "test"]:
        for index, sample in enumerate(data["sets"][part]):
            pairs.append({k: sample[k] for k in ["sensorId", "originDate", "targetDate", "originTimestampLocal", "targetTimestampLocal", "actualIntervalHours", "currentMm", "targetMm"]} |
                         {"partition": part, "predictions": {name: float(values[index]) for name, values in predictions[part].items()}})
    report = {"source": manifest["source"], "scientificStatus": model_artifact["scientificStatus"], "warnings": manifest["warnings"],
        "audit": manifest["audit"], "otherFiles": manifest["otherFiles"], "protocol": manifest["protocol"],
        "sequenceSha256": manifest["sequenceSha256"], "preparedDailySha256": manifest["preparedDailySha256"],
        "modelSha256": hashlib.sha256(model_path.read_bytes()).hexdigest(),
        "training": {k: v for k, v in model_artifact["training"].items() if k != "history"},
        "metrics": metrics, "ridgeTuning": ridge_candidates,
        "selection": {"selectedOnValidation": selected, "bestOnTestDescriptiveOnly": test_best,
                      "testUsedForSelection": False, "ta01WeightsApplied": False, "hybridAvailable": False},
        "testBySensor": [], "predictionPairs": pairs}
    test_rows = data["sets"]["test"]
    for sensor in sorted({s["sensorId"] for s in test_rows}):
        indices = [i for i, s in enumerate(test_rows) if s["sensorId"] == sensor]
        report["testBySensor"].append({"sensorId": sensor, "metrics": {name: evaluate(datasets["test"]["actual"][indices], values[indices]) for name, values in predictions["test"].items()}})
    report_path = ROOT / "data/validation/century-real-data-evaluation.json"
    report_path.write_text(json.dumps(report, indent=2, allow_nan=False) + "\n")
    print(json.dumps({"counts": manifest["protocol"]["sequenceCounts"], "training": report["training"], "validation": metrics["validation"], "test": metrics["test"], "selection": report["selection"]}, indent=2))


if __name__ == "__main__":
    train()
