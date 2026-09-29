"""Read-only public observations. No synthetic targets or future imputation."""
from functools import lru_cache
from hashlib import sha256
from io import BytesIO
from pathlib import Path
import json
import zipfile

import numpy as np
import pandas as pd
from scipy import stats
from pydantic import BaseModel, Field, model_validator
from typing import Literal

ROOT = Path(__file__).resolve().parents[1]
ARCHIVE = ROOT / "data/century/Data.zip"
EXPECTED_HASH = "b0d3eca632c5c7831d391f6f90b4d88b1a7384b3eb596c19ddaaf64147a24d22"
SOURCE = {"mine": "Century Mine, Australia", "author": "Tjaart de Wit (Colorado School of Mines)",
          "url": "https://zenodo.org/records/15003054", "doi": "10.5281/zenodo.15003054",
          "license": "CC-BY-4.0", "archiveSha256": EXPECTED_HASH,
          "file": "radar-deformation-data/West Wall Prism Movements - 3 months to 20-Feb-14.csv"}
WARNINGS = [
    "Evaluación retrospectiva con observaciones reales. No es un sistema de alertas validado.",
    "West Wall termina el 20/02/2014, antes de la falla del 23/02. No permite evaluar detección de falla.",
    "El período de prueba ya se examinó en la app original: no es un holdout virgen para un paper nuevo.",
    "Magnitud 3D publicada en mm desde el 20/11. No es radar LOS ni un campo FEM.",
    "Prismas y fechas comparten condiciones. Las ventanas no son muestras independientes.",
    "Pronóstico del próximo día calendario, no 24 horas exactas. Zona horaria no confirmada.",
    "Lluvia BOM disponible con desfase conservador de 2 fechas. No hay presión de poros real.",
    "No se mezclan West Wall y South West: tienen referencias y contratos distintos."
]


class ExperimentConfig(BaseModel):
    name: str = Field(default="Century · comparación temporal", min_length=1, max_length=100)
    models: list[Literal["persistence", "trend", "ridge", "random_forest", "boosting", "dense", "lstm", "gru"]] = Field(
        default=["persistence", "ridge", "boosting", "lstm"], min_length=1, max_length=8)
    lookback: int = Field(default=6, ge=2, le=14)
    train_end: str = "2014-01-31"
    validation_end: str = "2014-02-10"
    test_end: str = "2014-02-20"
    rain_policy: Literal["drop", "past_fill"] = "drop"
    use_rain: bool = True
    remove_train_outliers: bool = False
    trials: int = Field(default=3, ge=1, le=12)
    epochs: int = Field(default=20, ge=2, le=100)
    seed: int = Field(default=15003054, ge=0, le=2**31-1)

    @model_validator(mode="after")
    def valid(self):
        for value in [self.train_end, self.validation_end, self.test_end]:
            try:
                if pd.Timestamp(value).strftime("%Y-%m-%d") != value:
                    raise ValueError()
            except Exception:
                raise ValueError("Fechas requeridas en formato YYYY-MM-DD")
        if not "2013-12-10" <= self.train_end < self.validation_end < self.test_end <= "2014-02-20":
            raise ValueError("Use cortes cronológicos dentro de West Wall (hasta 2014-02-20)")
        self.models = list(dict.fromkeys(["persistence", *self.models]))
        return self


@lru_cache(maxsize=1)
def observations():
    digest = sha256(ARCHIVE.read_bytes()).hexdigest()
    if digest != EXPECTED_HASH:
        raise ValueError("El hash de Data.zip no coincide con la fuente auditada")
    with zipfile.ZipFile(ARCHIVE) as archive:
        raw = pd.read_csv(BytesIO(archive.read(SOURCE["file"])))
        rain = pd.concat([pd.read_csv(BytesIO(archive.read(f"weather-data/IDCJAC0009_029167_{year}_Data.csv")))
                          for year in (2013, 2014)], ignore_index=True)
    raw = raw.rename(columns={"Prism": "sensor", "Cumulative 3D Movement (mm) Since 20th Nov": "movement",
                              "Easting": "easting", "Northing": "northing", "RL": "elevation"})
    raw["timestamp"] = pd.to_datetime(raw["Date"] + " " + raw["Time"], format="%d-%b-%y %H:%M:%S", errors="coerce")
    raw["source_row"] = np.arange(len(raw)) + 2
    for col in ["movement", "easting", "northing", "elevation"]:
        raw[col] = pd.to_numeric(raw[col], errors="coerce")
    raw.replace([np.inf, -np.inf], np.nan, inplace=True)
    invalid = raw[["sensor", "timestamp", "movement", "easting", "northing", "elevation"]].isna().any(axis=1)
    clean = raw.loc[~invalid].copy()
    keys = ["sensor", "timestamp"]
    identical = int(clean.duplicated(keys + ["movement", "easting", "northing", "elevation"]).sum())
    clean = clean.drop_duplicates(keys + ["movement", "easting", "northing", "elevation"])
    conflict = clean.duplicated(keys, keep=False)
    conflict_count = int(clean.loc[conflict, keys].drop_duplicates().shape[0])
    clean = clean.loc[~conflict].sort_values(keys)
    clean["date"] = clean.timestamp.dt.normalize()
    clean["readings"] = clean.groupby(["sensor", "date"]).movement.transform("size")
    daily = clean.drop_duplicates(["sensor", "date"], keep="last").copy()
    rain["date"] = pd.to_datetime(dict(year=rain.Year, month=rain.Month, day=rain.Day))
    if rain.date.duplicated().any():
        raise ValueError("Fechas de lluvia ambiguas")
    amount = pd.to_numeric(rain["Rainfall amount (millimetres)"], errors="coerce")
    period = pd.to_numeric(rain["Period over which rainfall was measured (days)"], errors="coerce")
    rain["rain"] = amount.where((period == 1) & (amount >= 0))
    weather = rain.set_index("date")
    daily["rain_date"] = daily.date - pd.Timedelta(days=2)
    daily["rain"] = daily.rain_date.map(weather.rain)
    daily["rain_quality"] = daily.rain_date.map(weather.Quality).fillna("")
    daily["increment"] = daily.groupby("sensor").movement.diff()
    daily["interval"] = daily.groupby("sensor").timestamp.diff().dt.total_seconds() / 3600
    daily["consecutive"] = daily.groupby("sensor").date.diff().dt.days == 1
    daily.loc[~daily.consecutive, "increment"] = np.nan
    spans = daily.groupby("sensor").date.agg(["min", "max", "size"])
    missing_days = int(((spans["max"] - spans["min"]).dt.days + 1 - spans["size"]).sum())
    audit = {"raw_readings": len(raw), "daily_readings": len(daily), "sensors": daily.sensor.nunique(),
             "invalid_rows": int(invalid.sum()), "identical_duplicates": identical,
             "conflicting_timestamps": conflict_count, "missing_sensor_days": missing_days,
             "missing_rain": int(daily.rain.isna().sum()), "zero_rain": int((daily.rain == 0).sum()),
             "start": daily.date.min().strftime("%Y-%m-%d"), "end": daily.date.max().strftime("%Y-%m-%d"),
             "rain_quality_counts": daily.rain_quality.value_counts().to_dict()}
    return daily.reset_index(drop=True), audit


def json_records(frame):
    return json.loads(frame.to_json(orient="records", date_format="iso"))


def describe_dataset(sensor=None, start=None, end=None, lag=2):
    frame, audit = observations()
    sensors = sorted(frame.sensor.unique().tolist())
    sensor = sensor or sensors[0]
    if sensor not in sensors:
        raise ValueError("Prisma no encontrado")
    selected = frame[frame.sensor == sensor].copy()
    by_date = selected.set_index("date")
    selected["rain_at_lag"] = (selected.date - pd.Timedelta(days=lag-2)).map(by_date.rain)
    for value in (start, end):
        if value and (pd.isna(pd.to_datetime(value, errors="coerce")) or pd.Timestamp(value).strftime("%Y-%m-%d") != value):
            raise ValueError("Filtro de fecha inválido")
    if start:
        selected = selected[selected.date >= pd.Timestamp(start)]
    if end:
        selected = selected[selected.date <= pd.Timestamp(end)]
    if selected.empty:
        raise ValueError("No hay observaciones para ese prisma en el intervalo elegido")
    cols = ["movement", "increment", "interval", "rain"]
    summary = json_records(selected[cols].describe().T.reset_index(names="variable"))
    hist, edges = np.histogram(selected.movement, bins=20)
    histogram = [{"bin": float((edges[i] + edges[i+1])/2), "count": int(v)} for i, v in enumerate(hist)]
    correlations = []
    for a in cols:
        for b in cols:
            pairs = selected[[a, b]].dropna() if a != b else selected[[a]].dropna()
            r = selected[a].corr(selected[b], method="spearman")
            correlations.append({"x": a, "y": b, "rho": float(r) if pd.notna(r) else None, "n": len(pairs)})
    # Exact calendar lags (not row offsets through gaps). Exploratory only.
    lagged = []
    for offset in range(8):
        prior = (selected.date - pd.Timedelta(days=offset)).map(by_date.rain)
        pairs = pd.DataFrame({"rain": prior, "increment": selected.increment}).dropna()
        rho = pairs.rain.corr(pairs.increment, method="spearman")
        lagged.append({"lag": offset + 2, "rho": float(rho) if pd.notna(rho) else None, "n": len(pairs)})
    increments = selected.increment.dropna()
    q1, q3 = increments.quantile([.25, .75])
    selected["outlier_descriptive"] = (selected.increment < q1 - 3*(q3-q1)) | (selected.increment > q3 + 3*(q3-q1))
    normality = None
    if len(increments) >= 3 and increments.nunique() > 1:
        result = stats.shapiro(increments.to_numpy()[:5000])
        normality = {"test": "Shapiro–Wilk (descriptivo)", "statistic": float(result.statistic),
                     "p": float(result.pvalue), "n": len(increments),
                     "caution": "Autocorrelación temporal: el p-valor no prueba independencia ni valida un modelo."}
    return {"source": SOURCE, "audit": audit, "warnings": WARNINGS, "sensors": sensors, "sensor": sensor,
            "series": json_records(selected[["date", "movement", "increment", "interval", "rain", "rain_at_lag", "rain_quality", "outlier_descriptive"]]),
            "summary": summary, "histogram": histogram, "correlations": correlations, "lagged": lagged,
            "normality": normality, "lag": lag,
            "coverage": [{"sensor": sid, "observed": len(g), "missing": int((g.date.max()-g.date.min()).days+1-len(g)),
                          "start": g.date.min().strftime("%Y-%m-%d"), "end": g.date.max().strftime("%Y-%m-%d")}
                         for sid, g in frame.groupby("sensor")],
            "missingness": [{"column": col, "missing": int(frame[col].isna().sum()), "total": len(frame)} for col in cols]}


def prepare(config):
    df, source_audit = observations()
    df = df.copy()
    df["rain_imputed"] = False
    if config.rain_policy == "past_fill":
        # Fill weather by calendar date, using at most two prior dates. No bfill/interpolation.
        weather = df[["rain_date", "rain"]].drop_duplicates().set_index("rain_date").rain
        weather = weather.reindex(pd.date_range(weather.index.min(), weather.index.max()))
        filled = weather.ffill(limit=2)
        replacement = df.rain_date.map(filled)
        df["rain_imputed"] = df.rain.isna() & replacement.notna()
        df["rain"] = df.rain.fillna(replacement)
    features = ["movement_mm", "previous_increment_mm", "previous_interval_hours"] + (["rain_lag2_mm"] if config.use_rain else [])
    sets = {"train": [], "validation": [], "test": []}
    exclusions = {"gaps_or_missing_features": 0, "crossing_boundary": 0, "unseen_sensor": 0, "train_outliers": 0}
    for sensor, rows in df.groupby("sensor", sort=True):
        rows = rows.sort_values("date").reset_index(drop=True)
        for index in range(config.lookback, len(rows)-1):
            span = rows.iloc[index-config.lookback:index+2]
            history, origin, target = span.iloc[1:-1], span.iloc[-2], span.iloc[-1]
            names = ["movement", "increment", "interval"] + (["rain"] if config.use_rain else [])
            if (span.date.diff().dropna().dt.days != 1).any() or history[names].isna().any().any():
                exclusions["gaps_or_missing_features"] += 1
                continue
            od, td = origin.date.strftime("%Y-%m-%d"), target.date.strftime("%Y-%m-%d")
            if td <= config.train_end:
                part = "train"
            elif od > config.train_end and td <= config.validation_end:
                part = "validation"
            elif od > config.validation_end and td <= config.test_end:
                part = "test"
            else:
                exclusions["crossing_boundary"] += 1
                continue
            sets[part].append({"sensor": sensor, "origin": od, "date": td, "current": float(origin.movement),
                               "actual": float(target.movement), "delta": float(target.movement-origin.movement),
                               "interval": (target.timestamp-origin.timestamp).total_seconds()/3600,
                               "x": history[names].to_numpy(dtype=float).tolist()})
    known = {r["sensor"] for r in sets["train"]}
    for part in ("validation", "test"):
        kept = [r for r in sets[part] if r["sensor"] in known]
        exclusions["unseen_sensor"] += len(sets[part])-len(kept)
        sets[part] = kept
    bounds = None
    if config.remove_train_outliers and sets["train"]:
        q1, q3 = np.quantile([r["delta"] for r in sets["train"]], [.25, .75])
        bounds = [float(q1-3*(q3-q1)), float(q3+3*(q3-q1))]
        kept = [r for r in sets["train"] if bounds[0] <= r["delta"] <= bounds[1]]
        exclusions["train_outliers"] = len(sets["train"])-len(kept)
        sets["train"] = kept
    for part, rows in sets.items():
        if len(rows) < 20 or len({r["date"] for r in rows}) < 3:
            raise ValueError(f"Partición {part} insuficiente. Amplíe fechas o reduzca la ventana.")
    audit = {"source": source_audit, "features": features, "partitions": {k: len(v) for k, v in sets.items()},
             "partition_dates": {k: [min(r["date"] for r in v), max(r["date"] for r in v)] for k, v in sets.items()},
             "rain_imputed_rows": int(df.rain_imputed.sum()), "exclusions": exclusions,
             "train_outlier_bounds_mm": bounds, "outlier_rule": "3×IQR de delta, solo entrenamiento. Validación y prueba intactas.",
             "prepared_sha256": sha256(json.dumps(sets, sort_keys=True).encode()).hexdigest()}
    return sets, audit, df

