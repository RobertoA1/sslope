#!/usr/bin/env python3
"""Aproxima el desplazamiento incremental TA-01 con una red espacial de equilibrio FEM débil.

El entrenamiento minimiza K u_theta - f en los grados libres de un caso FEM
de referencia y ajusta solo unas pocas observaciones nodales. No implementa
una PINN continua ni validación independiente de la formulación FEM.
"""

from __future__ import annotations

import json
import hashlib
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

SEED = 20260920
HIDDEN_UNITS = 320
SENSOR_COUNT = 12
DATA_WEIGHT = 0.4
RIDGE = 1e-8


def feature_matrix(nodes: list[dict], scenario: dict, hidden_centers: np.ndarray, hidden_widths: np.ndarray) -> np.ndarray:
    coordinates = np.array([[node["xM"] / scenario["slopeWidthM"], node["yM"] / scenario["slopeHeightM"]] for node in nodes])
    x, y = coordinates[:, 0], coordinates[:, 1]
    squared_distance = np.sum((coordinates[:, None, :] - hidden_centers[None, :, :]) ** 2, axis=2)
    hidden = np.exp(-0.5 * squared_distance / hidden_widths[None, :] ** 2)
    features = np.column_stack([np.ones(len(nodes)), x, y, hidden])
    count = features.shape[1]
    basis = np.zeros((len(nodes) * 2, count * 2))
    basis[0::2, :count] = (x * y)[:, None] * features
    basis[1::2, count:] = y[:, None] * features
    return basis


def build_stiffness(rows: list[list[list[float]]]) -> np.ndarray:
    size = len(rows)
    stiffness = np.zeros((size, size), dtype=np.float64)
    for index, entries in enumerate(rows):
        for column, value in entries:
            stiffness[index, int(column)] = value
    if not np.allclose(stiffness, stiffness.T, rtol=1e-11, atol=1e-7):
        raise ValueError("La rigidez exportada no es simétrica")
    return stiffness


def fit(benchmark: dict) -> dict:
    nodes = benchmark["mesh"]["nodes"]
    system = benchmark["system"]
    free_dofs = np.asarray(system["freeDofs"], dtype=np.int64)
    load = np.asarray(system["incrementalLoadKn"], dtype=np.float64)
    reference_mm = np.asarray(system["referenceDisplacementM"], dtype=np.float64) * 1000
    stiffness = build_stiffness(system["stiffnessRows"])
    rng = np.random.default_rng(SEED)
    normalized_coordinates = np.array([[node["xM"] / benchmark["scenario"]["slopeWidthM"], node["yM"] / benchmark["scenario"]["slopeHeightM"]] for node in nodes])
    hidden_centers = normalized_coordinates[rng.choice(len(nodes), size=HIDDEN_UNITS, replace=False)]
    hidden_widths = rng.uniform(0.06, 0.15, size=HIDDEN_UNITS)
    basis = feature_matrix(nodes, benchmark["scenario"], hidden_centers, hidden_widths)
    basis_free = basis[free_dofs]

    # Δu se expresa en mm; K usa kN/m. Escalamos por el RMS de la carga para
    # que el residuo relativo informado corresponda a la pérdida entrenada.
    diagonal = np.diag(stiffness)
    if np.any(diagonal <= 0):
        raise ValueError("La rigidez tiene una diagonal no positiva")
    equilibrium_basis = (stiffness @ basis_free) * 1e-3
    physical_scale = np.linalg.norm(load) / np.sqrt(len(load))
    if physical_scale <= 0:
        raise ValueError("El evento no induce una carga física medible")
    physics_matrix = equilibrium_basis / physical_scale
    physics_target = load / physical_scale

    free_node_ids = np.unique(free_dofs // 2)
    sensor_ids = free_node_ids[np.linspace(0, len(free_node_ids) - 1, SENSOR_COUNT, dtype=int)]
    sensor_dofs = np.array([dof for node_id in sensor_ids for dof in (node_id * 2, node_id * 2 + 1) if dof in set(free_dofs)], dtype=int)
    displacement_scale_mm = np.linalg.norm(reference_mm) / np.sqrt(len(reference_mm))
    sensor_matrix = DATA_WEIGHT * basis[sensor_dofs] / displacement_scale_mm
    sensor_target = DATA_WEIGHT * reference_mm[sensor_dofs] / displacement_scale_mm
    matrix = np.vstack([physics_matrix, sensor_matrix, np.sqrt(RIDGE) * np.eye(basis.shape[1])])
    target = np.concatenate([physics_target, sensor_target, np.zeros(basis.shape[1])])
    output_weights, _, rank, singular_values = np.linalg.lstsq(matrix, target, rcond=1e-10)
    prediction_mm = basis @ output_weights
    residual = stiffness @ (prediction_mm[free_dofs] / 1000) - load
    error_mm = prediction_mm - reference_mm
    held_out = np.ones(len(nodes), dtype=bool)
    held_out[sensor_ids] = False
    held_out_dofs = np.repeat(held_out, 2)
    reference_norm = np.linalg.norm(reference_mm)
    verification = {
        "nodeCount": len(nodes),
        "freeDofCount": len(free_dofs),
        "sensorNodeCount": len(sensor_ids),
        "sensorDofCount": len(sensor_dofs),
        "heldOutNodeCount": int(held_out.sum()),
        "relativeL2DisplacementError": float(np.linalg.norm(error_mm) / reference_norm),
        "relativeL2HeldOutDisplacementError": float(np.linalg.norm(error_mm[held_out_dofs]) / np.linalg.norm(reference_mm[held_out_dofs])),
        "meanAbsoluteHeldOutDisplacementErrorMm": float(np.mean(np.abs(error_mm[held_out_dofs]))),
        "maximumNodalDisplacementErrorMm": float(np.max(np.hypot(error_mm[0::2], error_mm[1::2]))),
        "relativeEquilibriumResidual": float(np.linalg.norm(residual) / np.linalg.norm(load)),
        "maximumFixedDofErrorMm": float(np.max(np.abs(prediction_mm[np.setdiff1d(np.arange(len(reference_mm)), free_dofs)]))),
        "referenceMaximumDisplacementMm": float(np.max(np.hypot(reference_mm[0::2], reference_mm[1::2]))),
        "predictedMaximumDisplacementMm": float(np.max(np.hypot(prediction_mm[0::2], prediction_mm[1::2]))),
    }
    verification["passedInternalApproximationGate"] = (
        verification["relativeL2HeldOutDisplacementError"] < 0.20
        and verification["relativeEquilibriumResidual"] < 0.20
        and verification["maximumFixedDofErrorMm"] < 1e-12
    )
    return {
        "id": "TA01-SPATIAL-PIELM-DISCRETE-EQUILIBRIUM-V1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "method": "PHYSICS_INFORMED_EXTREME_LEARNING_MACHINE_DISCRETE_FEM_EQUILIBRIUM",
        "scientificStatus": "PINN_TA01_EQUILIBRIO_DISCRETO_SEMISINTETICO_NO_VALIDADO_EN_CAMPO",
        "scope": "Un evento de lluvia TA-01, malla 30×20, equilibrio incremental K Δu = Δf del mismo solver FEM de referencia.",
        "limitations": [
            "El equilibrio es la forma débil discreta del FEM, no una pérdida PDE continua independiente.",
            "La referencia FEM y las ecuaciones físicas comparten rigidez y cargas; la comparación no valida el solver FEM.",
            "Solo evalúa un evento y una geometría TA-01; no demuestra generalización, plasticidad ni uso operacional.",
        ],
        "benchmark": {
            "id": benchmark["id"],
            "provenance": benchmark["provenance"],
            "cumulativeRainfallMm": benchmark["cumulativeRainfallMm"],
            "scenario": benchmark["scenario"],
            "pcgRelativeResidual": system["pcgRelativeResidual"],
        },
        "training": {
            "seed": SEED,
            "activation": "gaussian_rbf",
            "hiddenUnits": HIDDEN_UNITS,
            "trainableParameters": "pesos lineales de salida",
            "physicsEquations": len(load),
            "sensorNodeIds": sensor_ids.tolist(),
            "dataWeight": DATA_WEIGHT,
            "ridge": RIDGE,
            "rank": int(rank),
            "conditionNumber": float(singular_values[0] / singular_values[-1]),
        },
        "verification": verification,
        "model": {
            "input": ["x_normalized", "y_normalized"],
            "output": ["delta_ux_mm", "delta_uy_mm"],
            "boundaryEnforcement": "delta_ux=x*y*features; delta_uy=y*features",
            "hiddenCenters": hidden_centers.tolist(),
            "hiddenWidths": hidden_widths.tolist(),
            "outputWeights": output_weights.tolist(),
            "predictedNodalDisplacementMm": prediction_mm.tolist(),
        },
    }


def main() -> None:
    root = Path(__file__).resolve().parent.parent
    benchmark_path = root / "data/generated/ta01-spatial-equilibrium-benchmark.json"
    benchmark = json.loads(benchmark_path.read_text(encoding="utf-8"))
    artifact = fit(benchmark)
    artifact["benchmark"]["sha256"] = hashlib.sha256(benchmark_path.read_bytes()).hexdigest()
    validation = {key: value for key, value in artifact.items() if key != "model"}
    model_path = root / "data/models/ta01-spatial-pinn.json"
    validation_path = root / "data/validation/ta01-spatial-pinn-validation.json"
    model_path.write_text(json.dumps(artifact, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    validation_path.write_text(json.dumps(validation, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"model": str(model_path.relative_to(root)), "validation": str(validation_path.relative_to(root)), "verification": artifact["verification"]}, indent=2))
    if not artifact["verification"]["passedInternalApproximationGate"]:
        raise SystemExit("La aproximación TA-01 no superó el umbral interno predefinido")


if __name__ == "__main__":
    main()
