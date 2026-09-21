#!/usr/bin/env python3
"""Entrena una LSTM compacta sobre las respuestas FEM semisintéticas de TA-01."""

from __future__ import annotations

import argparse
import copy
import csv
import json
import math
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

import numpy as np


FEATURES = [
    "current_displacement_mm",
    "current_rainfall_mm_h",
    "cumulative_rainfall_mm",
    "forecast_rainfall_mm",
    "maximum_pore_pressure_kpa",
    "mohr_coulomb_safety_index",
    "simulation_hour",
    "cohesion_kpa",
    "friction_angle_deg",
    "unit_weight_kn_m3",
    "young_modulus_mpa",
    "log10_permeability_m_s",
    "drainage_efficiency",
    "water_table_m",
    "storage_coefficient",
]


@dataclass
class SequenceSet:
    x: np.ndarray
    target_delta: np.ndarray
    current: np.ndarray
    actual: np.ndarray
    metadata: list[dict]


def read_csv(path: Path) -> list[dict]:
    with path.open("r", encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


def number(row: dict, key: str) -> float:
    try:
        value = float(row[key])
    except (KeyError, TypeError, ValueError) as error:
        raise ValueError(f"Valor inválido en {key} para {row.get('scenario_id')}, hora {row.get('simulation_hour')}") from error
    if not math.isfinite(value):
        raise ValueError(f"Valor no finito en {key} para {row.get('scenario_id')}, hora {row.get('simulation_hour')}")
    return value


def row_features(row: dict, forecast_rainfall_mm: float) -> list[float]:
    return [
        number(row, "rainfall_induced_max_displacement_mm"),
        number(row, "rainfall_mm_h"),
        number(row, "cumulative_rainfall_mm"),
        forecast_rainfall_mm,
        number(row, "maximum_pore_pressure_kpa"),
        number(row, "mohr_coulomb_safety_index"),
        number(row, "simulation_hour"),
        number(row, "cohesion_kpa"),
        number(row, "friction_angle_deg"),
        number(row, "unit_weight_kn_m3"),
        number(row, "young_modulus_mpa"),
        math.log10(number(row, "permeability_m_s")),
        number(row, "drainage_efficiency"),
        number(row, "water_table_m"),
        number(row, "storage_coefficient"),
    ]


def make_sequences(rows: list[dict], lookback: int, horizon: int) -> SequenceSet:
    grouped: dict[str, list[dict]] = {}
    for row in rows:
        grouped.setdefault(row["scenario_id"], []).append(row)
    sequences: list[list[list[float]]] = []
    deltas: list[float] = []
    current_values: list[float] = []
    actual_values: list[float] = []
    metadata: list[dict] = []
    for scenario_id, scenario_rows in sorted(grouped.items()):
        scenario_rows.sort(key=lambda row: int(row["simulation_hour"]))
        for origin in range(lookback - 1, len(scenario_rows) - horizon):
            current = scenario_rows[origin]
            future = scenario_rows[origin + horizon]
            forecast_rainfall = sum(number(row, "rainfall_mm_h") for row in scenario_rows[origin + 1:origin + horizon + 1])
            sequence_rows = scenario_rows[origin - lookback + 1:origin + 1]
            sequences.append([row_features(row, forecast_rainfall) for row in sequence_rows])
            current_target = number(current, "rainfall_induced_max_displacement_mm")
            actual_target = number(future, "rainfall_induced_max_displacement_mm")
            current_values.append(current_target)
            actual_values.append(actual_target)
            deltas.append(actual_target - current_target)
            metadata.append({
                "scenario_id": scenario_id,
                "origin_hour": int(current["simulation_hour"]),
                "target_hour": int(future["simulation_hour"]),
            })
    if not sequences:
        raise ValueError("No se pudieron construir ventanas temporales")
    return SequenceSet(
        x=np.asarray(sequences, dtype=np.float64),
        target_delta=np.asarray(deltas, dtype=np.float64),
        current=np.asarray(current_values, dtype=np.float64),
        actual=np.asarray(actual_values, dtype=np.float64),
        metadata=metadata,
    )


def sigmoid(value: np.ndarray) -> np.ndarray:
    clipped = np.clip(value, -30.0, 30.0)
    return 1.0 / (1.0 + np.exp(-clipped))


class LstmRegressor:
    def __init__(self, input_size: int, hidden_size: int, seed: int):
        random = np.random.default_rng(seed)
        scale = math.sqrt(2.0 / (input_size + hidden_size))
        self.hidden_size = hidden_size
        self.parameters = {
            "wx": random.normal(0.0, scale, (input_size, hidden_size * 4)),
            "wh": random.normal(0.0, scale, (hidden_size, hidden_size * 4)),
            "b": np.zeros(hidden_size * 4, dtype=np.float64),
            "wy": random.normal(0.0, math.sqrt(2.0 / hidden_size), (hidden_size, 1)),
            "by": np.zeros(1, dtype=np.float64),
        }
        self.parameters["b"][hidden_size:hidden_size * 2] = 1.0

    def forward(self, x: np.ndarray, keep_cache: bool = False):
        batch_size, steps, _ = x.shape
        hidden = np.zeros((batch_size, self.hidden_size), dtype=np.float64)
        cell = np.zeros_like(hidden)
        cache = []
        for step in range(steps):
            previous_hidden = hidden
            previous_cell = cell
            gates = x[:, step] @ self.parameters["wx"] + previous_hidden @ self.parameters["wh"] + self.parameters["b"]
            input_gate = sigmoid(gates[:, :self.hidden_size])
            forget_gate = sigmoid(gates[:, self.hidden_size:self.hidden_size * 2])
            candidate = np.tanh(gates[:, self.hidden_size * 2:self.hidden_size * 3])
            output_gate = sigmoid(gates[:, self.hidden_size * 3:])
            cell = forget_gate * previous_cell + input_gate * candidate
            hidden = output_gate * np.tanh(cell)
            if keep_cache:
                cache.append((x[:, step], previous_hidden, previous_cell, input_gate, forget_gate, candidate, output_gate, cell))
        prediction = (hidden @ self.parameters["wy"] + self.parameters["by"]).reshape(-1)
        return (prediction, cache, hidden) if keep_cache else prediction

    def backward(self, errors: np.ndarray, cache: list, final_hidden: np.ndarray) -> dict[str, np.ndarray]:
        batch_size = errors.shape[0]
        output_gradient = (2.0 / batch_size) * errors.reshape(-1, 1)
        gradients = {name: np.zeros_like(value) for name, value in self.parameters.items()}
        gradients["wy"] = final_hidden.T @ output_gradient
        gradients["by"] = output_gradient.sum(axis=0)
        hidden_gradient = output_gradient @ self.parameters["wy"].T
        cell_gradient = np.zeros_like(hidden_gradient)
        for step in range(len(cache) - 1, -1, -1):
            x, previous_hidden, previous_cell, input_gate, forget_gate, candidate, output_gate, cell = cache[step]
            tanh_cell = np.tanh(cell)
            output_delta = hidden_gradient * tanh_cell
            cell_gradient = cell_gradient + hidden_gradient * output_gate * (1.0 - tanh_cell ** 2)
            forget_delta = cell_gradient * previous_cell
            input_delta = cell_gradient * candidate
            candidate_delta = cell_gradient * input_gate
            previous_cell_gradient = cell_gradient * forget_gate
            gate_gradient = np.concatenate([
                input_delta * input_gate * (1.0 - input_gate),
                forget_delta * forget_gate * (1.0 - forget_gate),
                candidate_delta * (1.0 - candidate ** 2),
                output_delta * output_gate * (1.0 - output_gate),
            ], axis=1)
            gradients["wx"] += x.T @ gate_gradient
            gradients["wh"] += previous_hidden.T @ gate_gradient
            gradients["b"] += gate_gradient.sum(axis=0)
            hidden_gradient = gate_gradient @ self.parameters["wh"].T
            cell_gradient = previous_cell_gradient
        norm = math.sqrt(sum(float(np.sum(gradient ** 2)) for gradient in gradients.values()))
        if norm > 5.0:
            gradients = {name: gradient * (5.0 / norm) for name, gradient in gradients.items()}
        return gradients


class Adam:
    def __init__(self, parameters: dict[str, np.ndarray], learning_rate: float):
        self.learning_rate = learning_rate
        self.first = {name: np.zeros_like(value) for name, value in parameters.items()}
        self.second = {name: np.zeros_like(value) for name, value in parameters.items()}
        self.step_number = 0

    def step(self, parameters: dict[str, np.ndarray], gradients: dict[str, np.ndarray]):
        self.step_number += 1
        for name in parameters:
            self.first[name] = 0.9 * self.first[name] + 0.1 * gradients[name]
            self.second[name] = 0.999 * self.second[name] + 0.001 * gradients[name] ** 2
            first_corrected = self.first[name] / (1.0 - 0.9 ** self.step_number)
            second_corrected = self.second[name] / (1.0 - 0.999 ** self.step_number)
            parameters[name] -= self.learning_rate * first_corrected / (np.sqrt(second_corrected) + 1e-8)


def metrics(actual: np.ndarray, predicted: np.ndarray) -> dict:
    errors = predicted - actual
    total = float(np.sum((actual - actual.mean()) ** 2))
    residual = float(np.sum(errors ** 2))
    return {
        "sampleCount": int(actual.size),
        "maeMm": round(float(np.mean(np.abs(errors))), 8),
        "rmseMm": round(float(np.sqrt(np.mean(errors ** 2))), 8),
        "biasMm": round(float(np.mean(errors)), 8),
        "r2": round(1.0 - residual / total, 6) if total > 1e-16 else None,
    }


def predict_physical(model: LstmRegressor, dataset: SequenceSet, feature_mean: np.ndarray, feature_std: np.ndarray, target_mean: float, target_std: float):
    normalized = (dataset.x - feature_mean) / feature_std
    standardized_delta = model.forward(normalized)
    raw = dataset.current + target_mean + standardized_delta * target_std
    constrained = np.maximum(dataset.current, raw)
    return raw, constrained


def comparable_ridge(prediction_path: Path, metadata: list[dict]) -> np.ndarray:
    rows = read_csv(prediction_path)
    mapping = {
        (row["scenario_id"], int(row["origin_hour"]), int(row["target_hour"])): float(row["ridge_prediction_mm"])
        for row in rows
    }
    values = []
    for item in metadata:
        key = (item["scenario_id"], item["origin_hour"], item["target_hour"])
        if key not in mapping:
            raise ValueError(f"No existe predicción ridge comparable para {key}")
        values.append(mapping[key])
    return np.asarray(values, dtype=np.float64)


def serializable_array(value: np.ndarray):
    return np.round(value, 12).tolist()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--horizon", type=int, default=1, choices=[1, 6])
    parser.add_argument("--lookback", type=int, default=6)
    parser.add_argument("--hidden", type=int, default=12)
    parser.add_argument("--epochs", type=int, default=320)
    parser.add_argument("--patience", type=int, default=40)
    parser.add_argument("--batch-size", type=int, default=128)
    parser.add_argument("--learning-rate", type=float, default=0.003)
    parser.add_argument("--seed", type=int, default=20260916)
    parser.add_argument("--input-prefix", default="data/generated/ta01-fem-500")
    parser.add_argument("--output", default=None)
    parser.add_argument("--predictions", default=None)
    parser.add_argument("--ridge-predictions", default=None)
    arguments = parser.parse_args()
    if arguments.lookback < 2 or arguments.lookback > 18:
        raise ValueError("lookback debe estar entre 2 y 18 horas")

    project_dir = Path(__file__).resolve().parent.parent
    input_prefix = project_dir / arguments.input_prefix
    output_path = project_dir / (arguments.output or f"data/models/ta01-lstm-{arguments.horizon}h.json")
    prediction_path = project_dir / (arguments.predictions or f"data/generated/ta01-lstm-{arguments.horizon}h-test-predictions.csv")
    ridge_prediction_path = project_dir / (arguments.ridge_predictions or f"data/generated/ta01-baseline-{arguments.horizon}h-test-predictions.csv")
    split_manifest_path = Path(f"{input_prefix}-split-manifest.json")
    split_manifest = json.loads(split_manifest_path.read_text(encoding="utf-8"))
    datasets = {
        name: make_sequences(read_csv(Path(f"{input_prefix}-{name}.csv")), arguments.lookback, arguments.horizon)
        for name in ["train", "validation", "test"]
    }

    feature_mean = datasets["train"].x.mean(axis=(0, 1), keepdims=True)
    feature_std = datasets["train"].x.std(axis=(0, 1), keepdims=True)
    feature_std[feature_std < 1e-12] = 1.0
    target_mean = float(datasets["train"].target_delta.mean())
    target_std = float(datasets["train"].target_delta.std()) or 1.0
    train_x = (datasets["train"].x - feature_mean) / feature_std
    train_y = (datasets["train"].target_delta - target_mean) / target_std

    model = LstmRegressor(len(FEATURES), arguments.hidden, arguments.seed)
    optimizer = Adam(model.parameters, arguments.learning_rate)
    random = np.random.default_rng(arguments.seed)
    best_parameters = copy.deepcopy(model.parameters)
    best_validation_mae = math.inf
    best_epoch = 0
    epochs_without_improvement = 0
    history = []
    for epoch in range(1, arguments.epochs + 1):
        order = random.permutation(train_x.shape[0])
        losses = []
        for start in range(0, order.size, arguments.batch_size):
            indices = order[start:start + arguments.batch_size]
            prediction, cache, final_hidden = model.forward(train_x[indices], keep_cache=True)
            errors = prediction - train_y[indices]
            losses.append(float(np.mean(errors ** 2)))
            gradients = model.backward(errors, cache, final_hidden)
            optimizer.step(model.parameters, gradients)
        _, validation_prediction = predict_physical(model, datasets["validation"], feature_mean, feature_std, target_mean, target_std)
        validation_mae = float(np.mean(np.abs(validation_prediction - datasets["validation"].actual)))
        history.append({"epoch": epoch, "trainLossStandardized": round(float(np.mean(losses)), 8), "validationMaeMm": round(validation_mae, 8)})
        if validation_mae < best_validation_mae - 1e-10:
            best_validation_mae = validation_mae
            best_epoch = epoch
            best_parameters = copy.deepcopy(model.parameters)
            epochs_without_improvement = 0
        else:
            epochs_without_improvement += 1
            if epochs_without_improvement >= arguments.patience:
                break
    model.parameters = best_parameters

    evaluations = {}
    predictions = {}
    for name, dataset in datasets.items():
        raw, constrained = predict_physical(model, dataset, feature_mean, feature_std, target_mean, target_std)
        ridge = comparable_ridge(ridge_prediction_path, dataset.metadata) if name == "test" else None
        evaluations[name] = {
            "persistence": metrics(dataset.actual, dataset.current),
            "lstmUnconstrained": metrics(dataset.actual, raw),
            "lstm": metrics(dataset.actual, constrained),
            "physicalViolations": {
                "negativePredictionCountBeforeConstraint": int(np.sum(raw < 0)),
                "decreasingPredictionCountBeforeConstraint": int(np.sum(raw < dataset.current)),
                "correctedPredictionCount": int(np.sum(raw < dataset.current)),
                "violationsAfterConstraint": int(np.sum((constrained < 0) | (constrained < dataset.current))),
            },
        }
        if ridge is not None:
            evaluations[name]["ridgeComparable"] = metrics(dataset.actual, ridge)
        predictions[name] = (raw, constrained, ridge)

    raw_test, constrained_test, ridge_test = predictions["test"]
    prediction_path.parent.mkdir(parents=True, exist_ok=True)
    with prediction_path.open("w", encoding="utf-8", newline="") as handle:
        fieldnames = [
            "scenario_id", "origin_hour", "target_hour", "actual_displacement_mm", "persistence_prediction_mm",
            "ridge_prediction_mm", "lstm_unconstrained_prediction_mm", "lstm_prediction_mm", "lstm_error_mm",
        ]
        writer = csv.DictWriter(handle, fieldnames=fieldnames, lineterminator="\n")
        writer.writeheader()
        for index, item in enumerate(datasets["test"].metadata):
            writer.writerow({
                **item,
                "actual_displacement_mm": f"{datasets['test'].actual[index]:.8f}",
                "persistence_prediction_mm": f"{datasets['test'].current[index]:.8f}",
                "ridge_prediction_mm": f"{ridge_test[index]:.8f}",
                "lstm_unconstrained_prediction_mm": f"{raw_test[index]:.8f}",
                "lstm_prediction_mm": f"{constrained_test[index]:.8f}",
                "lstm_error_mm": f"{constrained_test[index] - datasets['test'].actual[index]:.8f}",
            })

    result = {
        "id": f"TA01-LSTM-{arguments.horizon}H-SEED{arguments.seed}",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "method": "LSTM_NUMPY_BPTT_ADAM_V1",
        "scientificStatus": "LSTM_ENTRENADA_SEMISINTETICA_NO_OPERACIONAL",
        "dataset": {
            "sourceDatasetId": split_manifest["sourceDatasetId"],
            "splitManifest": str(split_manifest_path.relative_to(project_dir)),
            "leakageControl": split_manifest["leakageControl"],
        },
        "architecture": {
            "type": "LSTM many-to-one",
            "lookbackHours": arguments.lookback,
            "horizonHours": arguments.horizon,
            "inputFeatures": FEATURES,
            "hiddenUnits": arguments.hidden,
            "output": "incremento de desplazamiento inducido por lluvia",
            "gates": ["input", "forget", "candidate", "output"],
        },
        "training": {
            "optimizer": "Adam",
            "loss": "MSE sobre incremento estandarizado",
            "epochsRequested": arguments.epochs,
            "epochsCompleted": len(history),
            "bestEpoch": best_epoch,
            "earlyStoppingPatience": arguments.patience,
            "batchSize": arguments.batch_size,
            "learningRate": arguments.learning_rate,
            "seed": arguments.seed,
            "selectionMetric": "MAE de validación después de la restricción física",
        },
        "outputConstraint": "La predicción final no puede ser menor que el desplazamiento inducido acumulado presente.",
        "metrics": evaluations,
        "history": history,
        "model": {
            "featureMean": dict(zip(FEATURES, serializable_array(feature_mean.reshape(-1)))),
            "featureStandardDeviation": dict(zip(FEATURES, serializable_array(feature_std.reshape(-1)))),
            "targetDeltaMean": target_mean,
            "targetDeltaStandardDeviation": target_std,
            "weights": {name: serializable_array(value) for name, value in model.parameters.items()},
        },
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    summary = {
        "model": str(output_path.relative_to(project_dir)),
        "predictions": str(prediction_path.relative_to(project_dir)),
        "bestEpoch": best_epoch,
        "epochsCompleted": len(history),
        "validation": evaluations["validation"],
        "test": evaluations["test"],
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
