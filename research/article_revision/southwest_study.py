"""Retrospective field forecasting of South West coordinate-derived displacement.

Separate from the TA-01 simulator and the West Wall target. No mechanical
parameters, unobserved sensor values or future rainfall are fabricated.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
from hashlib import sha256
from io import BytesIO, StringIO
import json
import math
import os
from pathlib import Path
import sys
import time
from types import SimpleNamespace
from zipfile import ZipFile

os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")
os.environ.setdefault("TF_ENABLE_ONEDNN_OPTS", "0")
os.environ.setdefault("OMP_NUM_THREADS", "2")
os.environ.setdefault("TF_NUM_INTRAOP_THREADS", "2")
os.environ.setdefault("TF_NUM_INTEROP_THREADS", "1")
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "research-app"))

import numpy as np
import pandas as pd
from backend.folds import temporal_folds
from backend.training import fit, predict, metrics, write_json
from crisp.engine import export_bundle, daily_mae


def load_daily(protocol, archive_path):
    payload = archive_path.read_bytes()
    if sha256(payload).hexdigest() != protocol["archive_sha256"]:
        raise ValueError("Source archive hash mismatch")
    with ZipFile(BytesIO(payload)) as archive:
        member = archive.read(protocol["source_member"])
        text = member.decode("utf-8-sig")
        text = text[text.index("Prism,Date,Time,Easting,Northing,Height,"):]
        raw = pd.read_csv(StringIO(text))
        rain = pd.concat([pd.read_csv(BytesIO(archive.read(f"weather-data/IDCJAC0009_029167_{year}_Data.csv"))) for year in (2013, 2014)], ignore_index=True)
    raw = raw.rename(columns={"Prism": "sensor", "Height": "height", "Easting": "easting", "Northing": "northing"})
    raw["timestamp"] = pd.to_datetime(raw.Date + " " + raw.Time, format="%d-%b-%y %H:%M:%S", errors="coerce")
    raw["source_row"] = np.arange(len(raw)) + 5
    cols = ["easting", "northing", "height"]
    for col in cols:
        raw[col] = pd.to_numeric(raw[col], errors="coerce")
    raw.replace([np.inf, -np.inf], np.nan, inplace=True)
    invalid = raw[["sensor", "timestamp", *cols]].isna().any(axis=1)
    clean = raw.loc[~invalid].copy()
    keys = ["sensor", "timestamp"]
    identical = int(clean.duplicated(keys+cols).sum())
    clean = clean.drop_duplicates(keys+cols)
    conflict = clean.duplicated(keys, keep=False)
    conflicts = int(clean.loc[conflict, keys].drop_duplicates().shape[0])
    clean = clean.loc[~conflict].sort_values(keys)
    clean["date"] = clean.timestamp.dt.normalize()
    daily = clean.drop_duplicates(["sensor", "date"], keep="last").copy()
    reference = daily[daily.date == protocol["reference_date"]].set_index("sensor")[cols]
    keep = daily.sensor.isin(reference.index)
    no_reference_rows = int((~keep).sum())
    no_reference_sensors = int(daily.loc[~keep, "sensor"].nunique())
    daily = daily.loc[keep].copy()
    delta = daily[cols].to_numpy()-reference.reindex(daily.sensor)[cols].to_numpy()
    daily["movement"] = 1000*np.linalg.norm(delta, axis=1)
    # A reference observation is fixed on Jan 1, never estimated from test dates.
    daily["increment"] = daily.groupby("sensor").movement.diff()
    daily["interval"] = daily.groupby("sensor").timestamp.diff().dt.total_seconds()/3600
    daily["consecutive"] = daily.groupby("sensor").date.diff().dt.days == 1
    daily.loc[~daily.consecutive, "increment"] = np.nan
    coordinate_diffs = daily.groupby("sensor")[cols].diff().to_numpy()
    daily["coordinate_jump_over_1m"] = np.linalg.norm(coordinate_diffs, axis=1) > 1
    rain["date"] = pd.to_datetime(dict(year=rain.Year, month=rain.Month, day=rain.Day))
    if rain.date.duplicated().any():
        raise ValueError("Ambiguous rain dates")
    amount = pd.to_numeric(rain["Rainfall amount (millimetres)"], errors="coerce")
    period = pd.to_numeric(rain["Period over which rainfall was measured (days)"], errors="coerce")
    rain["rain"] = amount.where((period == 1) & (amount >= 0))
    weather = rain.set_index("date")
    daily["rain_date"] = daily.date-pd.Timedelta(days=2)
    daily["rain"] = daily.rain_date.map(weather.rain)
    daily["rain_quality"] = daily.rain_date.map(weather.Quality).fillna("")
    audit = {"raw_readings": len(raw), "raw_sensors": int(raw.sensor.nunique()), "invalid_rows": int(invalid.sum()),
             "identical_duplicates": identical, "conflicting_timestamps": conflicts,
             "daily_readings_with_reference": len(daily), "sensors_with_reference": int(daily.sensor.nunique()),
             "excluded_rows_no_jan1_reference": no_reference_rows, "excluded_sensors_no_jan1_reference": no_reference_sensors,
             "observed_dates": int(daily.date.nunique()), "coordinate_jump_flags": int(daily.coordinate_jump_over_1m.sum()),
             "missing_lagged_rain": int(daily.rain.isna().sum()), "member_sha256": sha256(member).hexdigest(),
             "start": daily.date.min().strftime("%Y-%m-%d"), "end": daily.date.max().strftime("%Y-%m-%d"),
             "units": "Coordinate metres interpreted from Quikslope export, consistent with published coordinate differences in mm. CRS and datum unavailable."}
    return daily.reset_index(drop=True), audit


def sequences(daily, protocol):
    sets = {"train": [], "validation": [], "test": []}
    exclusions = {"gaps_or_missing_features": 0, "crossing_boundary": 0, "unseen_sensor": 0}
    lookback = protocol["lookback"]
    for sensor, rows in daily.groupby("sensor", sort=True):
        rows = rows.sort_values("date").reset_index(drop=True)
        for index in range(lookback, len(rows)-1):
            span = rows.iloc[index-lookback:index+2]
            history, origin, target = span.iloc[1:-1], span.iloc[-2], span.iloc[-1]
            cols = ["movement", "increment", "interval", "rain"]
            if (span.date.diff().dropna().dt.days != 1).any() or history[cols].isna().any().any():
                exclusions["gaps_or_missing_features"] += 1
                continue
            od, td = origin.date.strftime("%Y-%m-%d"), target.date.strftime("%Y-%m-%d")
            if td <= protocol["train_end"]:
                part = "train"
            elif od > protocol["train_end"] and td <= protocol["validation_end"]:
                part = "validation"
            elif od > protocol["validation_end"] and td <= protocol["test_end"]:
                part = "test"
            else:
                exclusions["crossing_boundary"] += 1
                continue
            sets[part].append({"sensor": str(sensor), "origin": od, "date": td, "current": float(origin.movement),
                               "actual": float(target.movement), "delta": float(target.movement-origin.movement),
                               "interval": float((target.timestamp-origin.timestamp).total_seconds()/3600),
                               "target_coordinate_jump_flag": bool(target.coordinate_jump_over_1m),
                               "x": history[cols].to_numpy(float).tolist()})
    known = {r["sensor"] for r in sets["train"]}
    for part in ("validation", "test"):
        keep = [r for r in sets[part] if r["sensor"] in known]
        exclusions["unseen_sensor"] += len(sets[part])-len(keep)
        sets[part] = keep
    return sets, exclusions


def segmented_interval(series, length, reps, seed, alpha):
    """Moving blocks from observed consecutive calendar runs, preserving each run's weight.

    Resample each run to its original length; a short run uses its full length
    as a block. This conditions on the observed gap pattern, not missingness.
    """
    series = series.sort_index()
    groups = pd.to_datetime(series.index).to_series(index=series.index).diff().dt.days.ne(1).cumsum()
    runs = [g.to_numpy(float) for _, g in series.groupby(groups)]
    rng = np.random.default_rng(seed)
    total = np.zeros(reps)
    for values in runs:
        block = min(length, len(values))
        windows = np.lib.stride_tricks.sliding_window_view(values, block)
        chunks = math.ceil(len(values)/block)
        selected = windows[rng.integers(len(windows), size=(reps, chunks))].reshape(reps, -1)[:, :len(values)]
        total += selected.sum(axis=1)
    draws = total/len(series)
    return {"difference_mm": float(series.mean()), "ci95": np.quantile(draws, [alpha/2, 1-alpha/2]).tolist(),
            "family_ci": np.quantile(draws, [alpha/6, 1-alpha/6]).tolist(),
            "dates": len(series), "runs": [len(v) for v in runs], "block_length": length,
            "method": "paired segmented moving-block percentile bootstrap; three planned contrasts; exploratory conditional on models and observed missing-date pattern"}


def run(protocol, folder):
    started = time.monotonic()
    daily, audit = load_daily(protocol, ROOT/"data/external/century-mine/Data.zip")
    sets, excluded = sequences(daily, protocol)
    audit.update({"exclusions": excluded, "partitions": {k: len(v) for k, v in sets.items()},
                  "partition_dates": {k: [min(r["date"] for r in v), max(r["date"] for r in v)] for k, v in sets.items()},
                  "partition_days": {k: len({r["date"] for r in v}) for k, v in sets.items()}})
    write_json(folder/"data-audit.json", audit)
    daily.to_csv(folder/"prepared-daily.csv", index=False)
    write_json(folder/"sequences.json", sets)
    folds = temporal_folds(sets["train"])
    traces, selected, chosen_epochs = [], {}, {}
    cfg = SimpleNamespace(seed=protocol["seeds"][0], epochs=protocol["epochs"], rain_policy="drop", lookback=protocol["lookback"])

    def progress(message):
        state = {"message": message, "elapsed_seconds": round(time.monotonic()-started, 1), "updated_utc": datetime.now(timezone.utc).isoformat()}
        write_json(folder/"progress.json", state)
        print(json.dumps(state), flush=True)

    for name in protocol["models"]:
        if name in ("persistence", "trend"):
            selected[name], chosen_epochs[name] = {}, None
            continue
        candidates = [{"alpha": v} for v in protocol["ridge_candidates"]] if name == "ridge" else protocol["lstm_candidates"]
        for trial, params in enumerate(candidates):
            losses, epochs = [], []
            for i, (train, valid) in enumerate(folds):
                progress(f"{name} candidate {trial+1}/{len(candidates)} fold {i+1}/{len(folds)}")
                bundle = fit(name, train, valid if name == "lstm" else None, params, cfg, lambda: None)
                losses.append(daily_mae(valid, predict(bundle, name, valid)))
                if bundle["history"]:
                    epochs.append(int(np.argmin(bundle["history"]["val_loss"]))+1)
            traces.append({"model": name, "candidate": trial, "params": params, "fold_daily_mae": losses,
                           "mean_daily_mae": float(np.mean(losses)), "stopping_epochs": epochs})
            write_json(folder/"tuning.json", traces)
        best = min((r for r in traces if r["model"] == name), key=lambda r: r["mean_daily_mae"])
        selected[name] = best["params"]
        # Median across train-only folds limits dependence on one stopping split.
        chosen_epochs[name] = int(np.median(best["stopping_epochs"])) if name == "lstm" else None
    write_json(folder/"hyperparameters-before-validation.json", {"parameters": selected, "epochs": chosen_epochs})
    predictions, seed_scores, bundles = [], [], {}
    for name in protocol["models"]:
        fitted = []
        for seed in protocol["seeds"]:
            progress(f"Final train-only fit {name}, seed {seed}")
            cfg.seed = seed
            bundle = None if name in ("persistence", "trend") else fit(name, sets["train"], None, selected[name], cfg, lambda: None, epochs=chosen_epochs[name])
            fitted.append((seed, bundle))
        bundles[name] = fitted
        vals = np.mean([predict(bundle, name, sets["validation"]) for _, bundle in fitted], axis=0)
        seed_scores.append({"model": name, "partition": "validation", "daily_mae_mm": daily_mae(sets["validation"], vals),
                            **metrics([r["actual"] for r in sets["validation"]], vals, [r["current"] for r in sets["validation"]])})
    winner = min(seed_scores, key=lambda r: r["daily_mae_mm"])["model"]
    write_json(folder/"selection-before-test.json", {"winner": winner, "validation": seed_scores, "selection_rule": protocol["selection_rule"]})
    test_metrics, per_seed = [], []
    for name, fitted in bundles.items():
        outputs = []
        for seed, bundle in fitted:
            forecast = predict(bundle, name, sets["test"])
            outputs.append(forecast)
            per_seed.append({"model": name, "seed": seed, "daily_mae_mm": daily_mae(sets["test"], forecast),
                             **metrics([r["actual"] for r in sets["test"]], forecast, [r["current"] for r in sets["test"]])})
            # Store all predictions at full CSV precision, including individual seeds.
            predictions.extend({"model": name, "seed": seed, **{k: r[k] for k in ["sensor", "origin", "date", "current", "actual", "target_coordinate_jump_flag"]}, "predicted": float(p)} for r, p in zip(sets["test"], forecast))
            if bundle:
                cfg.seed = seed
                # Existing exporter embeds West Wall's source: immediately supply
                # correct metadata below; models and preprocessing are unchanged.
                export_bundle(folder, name, seed, bundle, sets["test"], protocol["features"], cfg)
                meta_path = folder/f"{name}-seed{seed}-preprocessing.json"
                meta = json.loads(meta_path.read_text())
                meta["source"] = {"doi": "10.5281/zenodo.15003054", "file": protocol["source_member"], "target": protocol["target"], "reference_date": protocol["reference_date"]}
                write_json(meta_path, meta)
        ensemble = np.mean(outputs, axis=0)
        test_metrics.append({"model": name, "daily_mae_mm": daily_mae(sets["test"], ensemble),
                             **metrics([r["actual"] for r in sets["test"]], ensemble, [r["current"] for r in sets["test"]])})
        predictions.extend({"model": name, "seed": "ensemble", **{k: r[k] for k in ["sensor", "origin", "date", "current", "actual", "target_coordinate_jump_flag"]}, "predicted": float(p)} for r, p in zip(sets["test"], ensemble))
    frame = pd.DataFrame(predictions)
    frame.to_csv(folder/"test-predictions.csv", index=False)
    ensemble = frame[frame.seed == "ensemble"].copy()
    ensemble["loss"] = abs(ensemble.actual-ensemble.predicted)
    wide = ensemble.pivot(index=["sensor", "date"], columns="model", values="loss")
    if wide.isna().any().any():
        raise ValueError("Unmatched prediction keys")
    losses = wide.groupby(level="date").mean()
    losses.to_csv(folder/"daily-losses.csv")
    comparisons = []
    for model in ("lstm", "ridge", "trend"):
        for length in protocol["block_lengths"]:
            comparisons.append({"model": model, "reference": "persistence", **segmented_interval(losses[model]-losses.persistence, length, protocol["bootstrap_reps"], protocol["seeds"][0], protocol["alpha"])})
    report = {"protocol": protocol, "audit": audit, "winner_selected_on_validation": winner,
              "validation": seed_scores, "test": test_metrics, "test_per_seed": per_seed,
              "hyperparameters": selected, "epochs": chosen_epochs, "comparisons": comparisons,
              "elapsed_seconds": time.monotonic()-started,
              "limitations": ["Same mine, not independent sites or independent sensor replicates.",
                              "Retrospective coordinate-derived displacement; no calibrated FEM or operational warning validation.",
                              "Metres inferred consistently with exported millimetre differences; CRS and instrumental uncertainty unavailable.",
                              "Bootstrap assumes locally meaningful temporal blocks; phase changes and informative missingness can invalidate coverage.",
                              "Large coordinate jumps remain included; their causes are not established."]}
    write_json(folder/"report.json", report)
    progress("Completed; all outcomes retained")
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--protocol", type=Path, default=Path(__file__).with_name("southwest-protocol.json"))
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    folder = args.output.resolve()
    if folder.exists() and any(folder.iterdir()):
        raise SystemExit("Refusing non-empty output directory")
    folder.mkdir(parents=True, exist_ok=True)
    protocol = json.loads(args.protocol.read_text())
    snapshot = {"recorded_utc": datetime.now(timezone.utc).isoformat(), "protocol": protocol,
                "protocol_sha256": sha256(args.protocol.read_bytes()).hexdigest(), "runner_sha256": sha256(Path(__file__).read_bytes()).hexdigest(),
                "source_sha256": {str(p.relative_to(ROOT)): sha256(p.read_bytes()).hexdigest() for p in sorted((ROOT/"research-app/backend").glob("*.py")) + sorted((ROOT/"research-app/crisp").glob("*.py"))}}
    write_json(folder/"protocol-before-training.json", snapshot)
    try:
        run(protocol, folder)
    except BaseException as exc:
        write_json(folder/"failure.json", {"type": type(exc).__name__, "message": str(exc)})
        raise


if __name__ == "__main__":
    main()
