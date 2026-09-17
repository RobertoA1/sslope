#!/usr/bin/env python3
"""Recalcula la inferencia y el residuo del artefacto espacial TA-01 exportado."""

from __future__ import annotations

import hashlib
import importlib.util
import json
from pathlib import Path

import numpy as np

root = Path(__file__).resolve().parent.parent
module_path = root / "scripts/train-ta01-spatial-pinn.py"
spec = importlib.util.spec_from_file_location("ta01_spatial_pinn", module_path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

benchmark_path = root / "data/generated/ta01-spatial-equilibrium-benchmark.json"
benchmark = json.loads(benchmark_path.read_text(encoding="utf-8"))
artifact = json.loads((root / "data/models/ta01-spatial-pinn.json").read_text(encoding="utf-8"))
validation = json.loads((root / "data/validation/ta01-spatial-pinn-validation.json").read_text(encoding="utf-8"))
assert artifact["benchmark"]["sha256"] == hashlib.sha256(benchmark_path.read_bytes()).hexdigest()
assert validation["verification"] == artifact["verification"]
model = artifact["model"]
basis = module.feature_matrix(
    benchmark["mesh"]["nodes"], benchmark["scenario"],
    np.asarray(model["hiddenCenters"]), np.asarray(model["hiddenWidths"])
)
prediction = basis @ np.asarray(model["outputWeights"])
assert np.max(np.abs(prediction - np.asarray(model["predictedNodalDisplacementMm"]))) < 1e-10

system = benchmark["system"]
free = np.asarray(system["freeDofs"], dtype=int)
stiffness = module.build_stiffness(system["stiffnessRows"])
load = np.asarray(system["incrementalLoadKn"])
residual = stiffness @ (prediction[free] / 1000) - load
relative_residual = np.linalg.norm(residual) / np.linalg.norm(load)
reference = np.asarray(system["referenceDisplacementM"]) * 1000
sensor_ids = set(artifact["training"]["sensorNodeIds"])
held_out = np.asarray([node["id"] not in sensor_ids for node in benchmark["mesh"]["nodes"]]).repeat(2)
relative_error = np.linalg.norm((prediction - reference)[held_out]) / np.linalg.norm(reference[held_out])
assert abs(relative_residual - artifact["verification"]["relativeEquilibriumResidual"]) < 1e-10
assert abs(relative_error - artifact["verification"]["relativeL2HeldOutDisplacementError"]) < 1e-10
assert artifact["verification"]["passedInternalApproximationGate"]
print(f"TA-01 spatial PINN check passed; held_out_relative_error={relative_error:.5f}, relative_equilibrium_residual={relative_residual:.5f}")
