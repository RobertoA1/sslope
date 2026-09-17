#!/usr/bin/env python3
"""Evalúa la degradación de LSTM e híbrido ante ruido y datos faltantes."""

from __future__ import annotations

import importlib.util
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def metrics(actual: np.ndarray, predicted: np.ndarray) -> dict:
    error = predicted - actual
    total = float(np.sum((actual - actual.mean()) ** 2))
    residual = float(np.sum(error ** 2))
    return {
        "sampleCount": int(actual.size),
        "maeMm": round(float(np.mean(np.abs(error))), 8),
        "rmseMm": round(float(np.sqrt(np.mean(error ** 2))), 8),
        "biasMm": round(float(np.mean(error)), 8),
        "r2": round(1.0 - residual / total, 6) if total > 1e-16 else None,
    }


def load_networks(project_dir: Path, horizon: int, lstm, physics):
    lstm_artifact = json.loads((project_dir / "data" / "models" / f"ta01-lstm-{horizon}h.json").read_text())
    physics_artifact = json.loads((project_dir / "data" / "models" / f"ta01-physics-guided-{horizon}h.json").read_text())
    lstm_network = lstm.LstmRegressor(len(lstm.FEATURES), lstm_artifact["architecture"]["hiddenUnits"], lstm_artifact["training"]["seed"])
    lstm_network.parameters = {name: np.asarray(value, dtype=np.float64) for name, value in lstm_artifact["model"]["weights"].items()}
    corrector = physics.PhysicsCorrector(len(physics.CORRECTOR_FEATURES), physics_artifact["architecture"]["hiddenUnits"], physics_artifact["training"]["seed"], physics.CORRECTOR_FEATURES.index("forecast_rainfall_mm"), physics.CORRECTOR_FEATURES.index("mohr_coulomb_safety_index"))
    corrector.parameters = {name: np.asarray(value, dtype=np.float64) for name, value in physics_artifact["model"]["weights"].items()}
    feature_mean = np.asarray([lstm_artifact["model"]["featureMean"][name] for name in lstm.FEATURES], dtype=np.float64).reshape(1, 1, -1)
    feature_std = np.asarray([lstm_artifact["model"]["featureStandardDeviation"][name] for name in lstm.FEATURES], dtype=np.float64).reshape(1, 1, -1)
    corrector_mean = np.asarray([physics_artifact["model"]["inputMean"][name] for name in physics.CORRECTOR_FEATURES], dtype=np.float64)
    corrector_std = np.asarray([physics_artifact["model"]["inputStandardDeviation"][name] for name in physics.CORRECTOR_FEATURES], dtype=np.float64)
    return lstm_artifact, physics_artifact, lstm_network, corrector, feature_mean, feature_std, corrector_mean, corrector_std


def predict(dataset, x, lstm_artifact, lstm_network, corrector, feature_mean, feature_std, corrector_mean, corrector_std, physics):
    standardized_delta = lstm_network.forward((x - feature_mean) / feature_std)
    target_mean = float(lstm_artifact["model"]["targetDeltaMean"])
    target_std = float(lstm_artifact["model"]["targetDeltaStandardDeviation"])
    lstm_prediction = np.maximum(dataset.current, dataset.current + target_mean + standardized_delta * target_std)
    corrector_x = physics.corrector_inputs_from_sequence(x, standardized_delta)
    hybrid_delta = standardized_delta + corrector.forward((corrector_x - corrector_mean) / corrector_std)
    hybrid_prediction = np.maximum(dataset.current, dataset.current + target_mean + hybrid_delta * target_std)
    return lstm_prediction, hybrid_prediction


def main():
    project_dir = Path(__file__).resolve().parent.parent
    lstm = load_module("ta01_robust_lstm", project_dir / "scripts" / "train-lstm.py")
    physics = load_module("ta01_robust_physics", project_dir / "scripts" / "train-physics-guided.py")
    rng = np.random.default_rng(20260918)
    results = []
    for horizon in [1, 6]:
        test_rows = lstm.read_csv(project_dir / "data" / "generated" / "ta01-fem-500-test.csv")
        dataset = lstm.make_sequences(test_rows, 6, horizon)
        source_month = {row["scenario_id"]: int(row["source_date"].split("-")[1]) for row in test_rows}
        artifacts = load_networks(project_dir, horizon, lstm, physics)
        lstm_artifact, physics_artifact, lstm_network, corrector, feature_mean, feature_std, corrector_mean, corrector_std = artifacts
        clean_lstm, clean_hybrid = predict(dataset, dataset.x, lstm_artifact, lstm_network, corrector, feature_mean, feature_std, corrector_mean, corrector_std, physics)
        conditions = [{"id": "CLEAN", "kind": "NONE", "level": 0.0, "x": dataset.x.copy()}]
        for level in [0.01, 0.05]:
            noisy = dataset.x + rng.normal(0.0, level, dataset.x.shape) * feature_std
            conditions.append({"id": f"NOISE_{int(level * 100)}PCT_STD", "kind": "GAUSSIAN_NOISE", "level": level, "x": noisy})
        for level in [0.10, 0.30]:
            missing = dataset.x.copy()
            mask = rng.random(missing.shape) < level
            replacement = np.broadcast_to(feature_mean, missing.shape)
            missing[mask] = replacement[mask]
            conditions.append({"id": f"MISSING_{int(level * 100)}PCT", "kind": "MCAR_MEAN_IMPUTATION", "level": level, "x": missing})
        sensor_feature_indices = [lstm.FEATURES.index(name) for name in ["current_displacement_mm", "current_rainfall_mm_h", "cumulative_rainfall_mm", "maximum_pore_pressure_kpa", "mohr_coulomb_safety_index"]]
        for hours in [1, 3]:
            delayed = dataset.x.copy()
            source_step = -hours - 1
            for step in range(-hours, 0): delayed[:, step, sensor_feature_indices] = delayed[:, source_step, sensor_feature_indices]
            conditions.append({"id": f"SENSOR_DELAY_{hours}H", "kind": "LAST_OBSERVATION_CARRIED_FORWARD", "level": hours, "x": delayed})
        evaluated = []
        clean_mae = {"lstm": metrics(dataset.actual, clean_lstm)["maeMm"], "hybrid": metrics(dataset.actual, clean_hybrid)["maeMm"]}
        for condition in conditions:
            lstm_prediction, hybrid_prediction = predict(dataset, condition.pop("x"), lstm_artifact, lstm_network, corrector, feature_mean, feature_std, corrector_mean, corrector_std, physics)
            lstm_metrics = metrics(dataset.actual, lstm_prediction)
            hybrid_metrics = metrics(dataset.actual, hybrid_prediction)
            lstm_metrics["maeIncreasePercent"] = round((lstm_metrics["maeMm"] / clean_mae["lstm"] - 1.0) * 100.0, 2)
            hybrid_metrics["maeIncreasePercent"] = round((hybrid_metrics["maeMm"] / clean_mae["hybrid"] - 1.0) * 100.0, 2)
            evaluated.append({**condition, "lstm": lstm_metrics, "hybrid": hybrid_metrics})
        months = np.asarray([source_month[item["scenario_id"]] for item in dataset.metadata])
        wet_mask = np.isin(months, [11, 12, 1, 2, 3, 4])
        seasonal = []
        for season, season_mask in [("WET_NOV_APR", wet_mask), ("DRY_MAY_OCT", ~wet_mask)]:
            seasonal.append({
                "season": season,
                "definition": "Clasificación climatológica simplificada por mes de la fecha NASA POWER",
                "lstm": metrics(dataset.actual[season_mask], clean_lstm[season_mask]),
                "hybrid": metrics(dataset.actual[season_mask], clean_hybrid[season_mask]),
            })
        results.append({"horizonHours": horizon, "lstmModelId": lstm_artifact["id"], "hybridModelId": physics_artifact["id"], "conditions": evaluated, "seasonalBreakdown": seasonal})
    artifact = {
        "id": "TA01-MODEL-ROBUSTNESS-V1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "seed": 20260918,
        "scientificStatus": "ROBUSTEZ_INTERNA_EN_TEST_SEMISINTETICO_NO_DATOS_DE_CAMPO",
        "method": "Perturbaciones aplicadas solo a entradas de test; ruido relativo a desviación de entrenamiento e imputación con media de entrenamiento",
        "limitations": ["MCAR no representa todas las fallas reales de sensores", "El retraso usa arrastre de la última observación y no modela comunicaciones completas", "Las estaciones son una clasificación mensual simplificada", "No se reentrena bajo perturbación", "Los objetivos provienen del FEM semisintético"],
        "results": results,
    }
    output = project_dir / "data" / "validation" / "ta01-model-robustness.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(artifact, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(output.relative_to(project_dir)), "summary": [{"horizonHours": item["horizonHours"], "conditions": [{"id": condition["id"], "hybridMaeMm": condition["hybrid"]["maeMm"], "increasePercent": condition["hybrid"]["maeIncreasePercent"]} for condition in item["conditions"]]} for item in results]}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
