#!/usr/bin/env python3
"""Comprobación numérica mínima de la LSTM NumPy."""

import importlib.util
import sys
from pathlib import Path

import numpy as np


module_path = Path(__file__).with_name("train-lstm.py")
spec = importlib.util.spec_from_file_location("ta01_lstm_training", module_path)
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)

random = np.random.default_rng(14)
x = random.normal(size=(3, 4, 2))
target = random.normal(size=3)
model = module.LstmRegressor(input_size=2, hidden_size=3, seed=9)
prediction, cache, final_hidden = model.forward(x, keep_cache=True)
gradients = model.backward(prediction - target, cache, final_hidden)

parameter = model.parameters["wx"]
row, column = 0, 0
original = parameter[row, column]
epsilon = 1e-6
parameter[row, column] = original + epsilon
loss_plus = float(np.mean((model.forward(x) - target) ** 2))
parameter[row, column] = original - epsilon
loss_minus = float(np.mean((model.forward(x) - target) ** 2))
parameter[row, column] = original
numeric = (loss_plus - loss_minus) / (2 * epsilon)
analytic = float(gradients["wx"][row, column])
relative_error = abs(numeric - analytic) / max(1e-10, abs(numeric) + abs(analytic))

assert prediction.shape == (3,)
assert np.isfinite(prediction).all()
assert relative_error < 1e-5, (numeric, analytic, relative_error)
print(f"LSTM gradient check passed; relative_error={relative_error:.3e}")
