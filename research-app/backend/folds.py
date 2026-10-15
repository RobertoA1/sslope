"""Shared temporal folds for previews and local training."""
import numpy as np
from sklearn.model_selection import TimeSeriesSplit
from .data import prepare


def temporal_folds(rows):
    dates = sorted({r["date"] for r in rows})
    if len(dates) < 12:
        raise ValueError("Se requieren al menos 12 fechas de entrenamiento para tres folds temporales")
    folds = []
    # Split dates, NOT stacked prism rows. A full-date gap purges boundary crossings.
    for a, b in TimeSeriesSplit(n_splits=3, gap=1).split(dates):
        train_dates, val_dates = {dates[i] for i in a}, {dates[i] for i in b}
        train = [r for r in rows if r["date"] in train_dates]
        known = {r["sensor"] for r in train}
        val = [r for r in rows if r["date"] in val_dates and r["sensor"] in known and r["origin"] > dates[a[-1]]]
        if len(train) < 10 or len(val) < 10:
            raise ValueError("Folds insuficientes: amplíe el período de entrenamiento")
        folds.append((train, val))
    return folds


def training_folds(config, sets):
    # If final training is cleaned, CV must still derive its own thresholds from each fold.
    source = prepare(config.model_copy(update={"remove_train_outliers": False}))[0] if config.remove_train_outliers else sets
    folds = temporal_folds(source["train"])
    if config.remove_train_outliers:
        cleaned = []
        for a, b in folds:
            q1, q3 = np.quantile([r["delta"] for r in a], [.25, .75])
            low, high = q1-3*(q3-q1), q3+3*(q3-q1)
            a = [r for r in a if low <= r["delta"] <= high]
            known = {r["sensor"] for r in a}
            b = [r for r in b if r["sensor"] in known]
            if len(a) < 10 or len(b) < 10:
                raise ValueError("Limpieza demasiado restrictiva para los folds de entrenamiento")
            cleaned.append((a, b))
        folds = cleaned
    return folds


