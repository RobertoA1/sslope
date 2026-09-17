#!/usr/bin/env python3
"""Comprueba las derivadas analíticas de las características espaciales."""

from __future__ import annotations

import importlib.util
from pathlib import Path

import numpy as np


project_dir = Path(__file__).resolve().parent.parent
module_path = project_dir / "scripts" / "train-spatial-pinn.py"
spec = importlib.util.spec_from_file_location("spatial_pinn", module_path)
spatial = importlib.util.module_from_spec(spec)
spec.loader.exec_module(spatial)

rng = np.random.default_rng(11)
weights = rng.normal(size=(7, 2))
bias = rng.normal(size=7)
x = np.array([0.31])
y = np.array([0.67])
analytic = spatial.feature_fields(x, y, weights, bias)
h = 1e-4


def values(x_value: float, y_value: float) -> np.ndarray:
    return spatial.feature_fields(np.array([x_value]), np.array([y_value]), weights, bias)["value"][0]


base = values(x[0], y[0])
xx = (values(x[0] + h, y[0]) - 2 * base + values(x[0] - h, y[0])) / h**2
yy = (values(x[0], y[0] + h) - 2 * base + values(x[0], y[0] - h)) / h**2
xy = (values(x[0] + h, y[0] + h) - values(x[0] + h, y[0] - h) - values(x[0] - h, y[0] + h) + values(x[0] - h, y[0] - h)) / (4 * h**2)

errors = {
    "xx": float(np.max(np.abs(xx - analytic["xx"][0]))),
    "yy": float(np.max(np.abs(yy - analytic["yy"][0]))),
    "xy": float(np.max(np.abs(xy - analytic["xy"][0]))),
}
if max(errors.values()) >= 2e-7:
    raise SystemExit(f"Derivadas espaciales incorrectas: {errors}")
print(f"Spatial PINN derivative check passed; max_absolute_error={max(errors.values()):.3e}")
