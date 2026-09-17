#!/usr/bin/env python3
"""Comprueba por diferencias finitas el gradiente del corrector físico."""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import numpy as np


path = Path(__file__).resolve().parent / "train-physics-guided.py"
spec = importlib.util.spec_from_file_location("ta01_physics_guided", path)
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)

random = np.random.default_rng(42)
model = module.PhysicsCorrector(input_size=5, hidden_size=3, seed=7, rain_index=1, safety_index=2)
x = random.normal(size=(4, 5))
direction = random.normal(size=4)
prediction, cache = model.forward(x, keep_cache=True)
analytic = model.backward(direction, cache)


def objective():
    return float(np.sum(model.forward(x) * direction))


checks = {
    "w1": [(0, 0), (4, 2)],
    "b1": [(1,)],
    "w2": [(0, 0), (2, 0)],
    "b2": [(0,)],
    "rainRaw": [(0,)],
    "safetyRaw": [(0,)],
}
epsilon = 1e-6
maximum_relative_error = 0.0
for name, indices in checks.items():
    parameter = model.parameters[name]
    for index in indices:
        original = parameter[index]
        parameter[index] = original + epsilon
        positive = objective()
        parameter[index] = original - epsilon
        negative = objective()
        parameter[index] = original
        numerical = (positive - negative) / (2.0 * epsilon)
        expected = float(analytic[name][index])
        relative_error = abs(numerical - expected) / max(1e-10, abs(numerical) + abs(expected))
        maximum_relative_error = max(maximum_relative_error, relative_error)

if maximum_relative_error >= 1e-6:
    raise AssertionError(f"Gradient check failed: relative_error={maximum_relative_error:.3e}")
print(f"Physics-guided gradient check passed; relative_error={maximum_relative_error:.3e}")
