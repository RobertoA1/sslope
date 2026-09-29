from pydantic import Field, model_validator
from backend.data import ExperimentConfig, observations, prepare
from backend.training import temporal_folds
from sklearn.model_selection import TimeSeriesSplit
import numpy as np


class CrispConfig(ExperimentConfig):
    name: str = "Century · CRISP-DM temporal"
    sensors: list[str] = Field(default_factory=list)
    outer_folds: int = Field(default=3, ge=3, le=5)
    repeats: int = Field(default=2, ge=1, le=5)
    block_days: int = Field(default=3, ge=2, le=7)
    bootstrap_reps: int = Field(default=2000, ge=500, le=5000)
    alpha: float = Field(default=.05, ge=.01, le=.1)
    practical_mm: float = Field(default=1., ge=0, le=100)
    business_goal: str = Field(default="Comparar pronósticos del movimiento 3D del próximo día en West Wall.", max_length=2000)
    success_criterion: str = Field(default="Reducir el MAE diario frente a persistencia, con incertidumbre y costo computacional documentados.", max_length=2000)

    @model_validator(mode="after")
    def selected_sensors(self):
        known = set(observations()[0].sensor)
        if set(self.sensors)-known:
            raise ValueError("La selección contiene prismas que no existen en West Wall")
        self.sensors = sorted(set(self.sensors))
        if self.seed+self.repeats > 2**31-1:
            raise ValueError("Semilla demasiado grande para las repeticiones")
        return self


def clean_training(rows, enabled):
    if not enabled:
        return rows, None
    q1, q3 = np.quantile([r["delta"] for r in rows], [.25, .75])
    bounds = [float(q1-3*(q3-q1)), float(q3+3*(q3-q1))]
    return [r for r in rows if bounds[0] <= r["delta"] <= bounds[1]], bounds


def selected_data(config):
    # All thresholds are recomputed at the level that actually fits a model.
    sets, audit, df = prepare(config.model_copy(update={"remove_train_outliers": False}))
    if config.sensors:
        sets = {key: [r for r in rows if r["sensor"] in config.sensors] for key, rows in sets.items()}
        df = df[df.sensor.isin(config.sensors)].copy()
    for key, rows in sets.items():
        if len(rows) < 20 or len({r["date"] for r in rows}) < 3:
            raise ValueError(f"Selección insuficiente para {key}: amplíe prismas o fechas")
    audit["partitions"] = {k: len(v) for k, v in sets.items()}
    audit["selected_sensors"] = sorted(set(df.sensor))
    audit["partition_dates"] = {k: [min(r["date"] for r in v), max(r["date"] for r in v)] for k, v in sets.items()}
    return sets, audit, df


def inner_folds(rows, config):
    result = []
    for train, valid in temporal_folds(rows):
        train, _ = clean_training(train, config.remove_train_outliers)
        known = {r["sensor"] for r in train}
        valid = [r for r in valid if r["sensor"] in known]
        if len(train) < 10 or len(valid) < 10:
            raise ValueError("Limpieza o selección insuficiente para ajuste interno")
        result.append((train, valid))
    return result


def outer_folds(development, config):
    dates = sorted({r["date"] for r in development})
    result = []
    # Retain enough initial history for three meaningful inner folds.
    test_size = min(10, (len(dates)-36)//config.outer_folds)
    if test_size < 3:
        raise ValueError("Se requieren más fechas de desarrollo para CV anidada (al menos 36 iniciales y 3 por fold)")
    for i, (a, b) in enumerate(TimeSeriesSplit(n_splits=config.outer_folds, test_size=test_size, gap=1).split(dates), 1):
        da, db = {dates[j] for j in a}, {dates[j] for j in b}
        raw = [r for r in development if r["date"] in da]
        inner_folds(raw, config)  # Fail in preview, not halfway through training.
        train, bounds = clean_training(raw, config.remove_train_outliers)
        known = {r["sensor"] for r in train}
        valid = [r for r in development if r["date"] in db and r["origin"] > dates[a[-1]] and r["sensor"] in known]
        if len(train) < 20 or len(valid) < 20:
            raise ValueError("Fold externo insuficiente; amplíe selección o reduzca folds")
        result.append({"fold": i, "raw_train": raw, "train": train, "valid": valid, "bounds": bounds,
                       "train_start": min(r["date"] for r in train), "train_end": max(r["date"] for r in train),
                       "eval_start": min(r["date"] for r in valid), "eval_end": max(r["date"] for r in valid),
                       "n_train": len(train), "n_eval": len(valid)})
    return result


def preview(config):
    sets, audit, _ = selected_data(config)
    folds = outer_folds(sets["train"]+sets["validation"], config)
    return audit, [{k: v for k, v in f.items() if k not in {"raw_train", "train", "valid"}} for f in folds]


