"""Library-backed model comparison, tuning on train-only temporal folds."""
import os
os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")
os.environ.setdefault("OMP_NUM_THREADS", "2")
os.environ.setdefault("TF_NUM_INTRAOP_THREADS", "2")
os.environ.setdefault("TF_NUM_INTEROP_THREADS", "1")
os.environ.setdefault("TF_ENABLE_ONEDNN_OPTS", "0")

from pathlib import Path
from hashlib import sha256
from importlib.metadata import version
import json
import math
import time
import joblib
import numpy as np
import pandas as pd
import optuna
from scipy import stats
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import Ridge
from sklearn.ensemble import RandomForestRegressor, HistGradientBoostingRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import TimeSeriesSplit
from threadpoolctl import threadpool_limits
from .data import prepare, SOURCE, WARNINGS

NEURAL = {"dense", "lstm", "gru"}
LABELS = {"persistence": "Persistencia", "trend": "Tendencia", "ridge": "Ridge",
          "random_forest": "Random Forest", "boosting": "HistGradientBoosting",
          "dense": "Dense", "lstm": "LSTM", "gru": "GRU"}


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False), encoding="utf-8")


def metrics(actual, predicted, current=None):
    actual, predicted = np.asarray(actual), np.asarray(predicted)
    if not np.isfinite(predicted).all():
        raise ValueError("El modelo produjo valores no finitos")
    result = {"mae": float(mean_absolute_error(actual, predicted)),
              "rmse": float(math.sqrt(mean_squared_error(actual, predicted))),
              "r2": float(r2_score(actual, predicted)) if len(actual) > 1 and np.var(actual) > 0 else None,
              "n": len(actual)}
    if current is not None:
        delta = actual-np.asarray(current)
        result["r2_delta"] = float(r2_score(delta, predicted-np.asarray(current))) if np.var(delta) > 0 else None
    return result


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


def arrays(rows):
    return np.asarray([r["x"] for r in rows], dtype=np.float32), np.asarray([r["delta"] for r in rows], dtype=np.float32)


def suggest(trial, name):
    if name == "ridge":
        return {"alpha": trial.suggest_float("alpha", 1e-3, 1e3, log=True)}
    if name == "random_forest":
        return {"n_estimators": trial.suggest_categorical("n_estimators", [80, 160]),
                "max_depth": trial.suggest_int("max_depth", 3, 12),
                "min_samples_leaf": trial.suggest_int("min_samples_leaf", 2, 12)}
    if name == "boosting":
        return {"learning_rate": trial.suggest_float("learning_rate", .02, .2, log=True),
                "max_leaf_nodes": trial.suggest_int("max_leaf_nodes", 7, 31),
                "l2_regularization": trial.suggest_float("l2_regularization", .001, 10, log=True)}
    return {"units": trial.suggest_categorical("units", [8, 16, 32]),
            "dropout": trial.suggest_float("dropout", 0, .25),
            "learning_rate": trial.suggest_float("learning_rate", .0003, .01, log=True)}


def fit(name, train, valid, params, config, check, tick=None, epochs=None):
    x, y = arrays(train)
    scaler = StandardScaler().fit(x.reshape(-1, x.shape[-1]))
    x = scaler.transform(x.reshape(-1, x.shape[-1])).reshape(x.shape).astype(np.float32)
    mean, scale = float(y.mean()), max(float(y.std()), 1e-6)
    y = (y-mean)/scale
    history = None
    if name not in NEURAL:
        if name == "ridge":
            model = Ridge(**params)
        elif name == "random_forest":
            model = RandomForestRegressor(**params, random_state=config.seed, n_jobs=2)
        else:
            # No random internal early-stopping split of time series.
            model = HistGradientBoostingRegressor(**params, max_iter=120, early_stopping=False, random_state=config.seed)
        check()
        with threadpool_limits(limits=2):
            model.fit(x.reshape(len(x), -1), y)
        return {"model": model, "scaler": scaler, "mean": mean, "scale": scale, "history": history}
    import tensorflow as tf
    import keras
    keras.backend.clear_session()
    keras.utils.set_random_seed(config.seed)
    tf.config.experimental.enable_op_determinism()
    layers = [keras.layers.Input(shape=x.shape[1:])]
    if name == "dense":
        layers += [keras.layers.Flatten(), keras.layers.Dense(params["units"], activation="relu")]
    else:
        layers += [getattr(keras.layers, name.upper())(params["units"])]
    layers += [keras.layers.Dropout(params["dropout"]), keras.layers.Dense(1)]
    model = keras.Sequential(layers)
    model.compile(optimizer=keras.optimizers.Adam(params["learning_rate"]), loss="mean_squared_error")
    options = tf.data.Options()
    options.threading.private_threadpool_size = 1
    options.threading.max_intra_op_parallelism = 1
    ds = tf.data.Dataset.from_tensor_slices((x, y)).batch(64).with_options(options)
    val_ds = None
    if valid:
        vx, vy = arrays(valid)
        vx = scaler.transform(vx.reshape(-1, vx.shape[-1])).reshape(vx.shape).astype(np.float32)
        val_ds = tf.data.Dataset.from_tensor_slices((vx, (vy-mean)/scale)).batch(64).with_options(options)

    class Progress(keras.callbacks.Callback):
        def on_train_batch_end(self, batch, logs=None):
            check()

        def on_epoch_end(self, epoch, logs=None):
            check()
            if tick:
                tick(epoch+1, epochs or config.epochs)

    callbacks = [Progress()]
    if valid:
        callbacks.append(keras.callbacks.EarlyStopping(monitor="val_loss", patience=5, restore_best_weights=True))
    history = model.fit(ds, validation_data=val_ds, epochs=epochs or config.epochs,
                        callbacks=callbacks, shuffle=False, verbose=0).history
    return {"model": model, "scaler": scaler, "mean": mean, "scale": scale, "history": history}


def predict(bundle, name, rows):
    current = np.asarray([r["current"] for r in rows])
    if name == "persistence":
        return current
    if name == "trend":
        return current + np.asarray([r["x"][-1][1]*24/max(r["x"][-1][2], 1e-6) for r in rows])
    x, _ = arrays(rows)
    x = bundle["scaler"].transform(x.reshape(-1, x.shape[-1])).reshape(x.shape).astype(np.float32)
    if name in NEURAL:
        output = bundle["model"](x, training=False).numpy().reshape(-1)
    else:
        with threadpool_limits(limits=2):
            output = bundle["model"].predict(x.reshape(len(x), -1))
    return current + output*bundle["scale"] + bundle["mean"]


def block_comparisons(predictions, seed):
    """Paired date losses, moving-block CI and conservative block Wilcoxon."""
    df = pd.DataFrame(predictions)
    results = []
    baseline = df[df.model == "persistence"].set_index(["sensor", "date"])
    rng = np.random.default_rng(seed)
    for name, group in df.groupby("model"):
        if name == "persistence":
            continue
        joined = group.set_index(["sensor", "date"]).join(baseline[["actual", "predicted"]], rsuffix="_baseline")
        joined["difference"] = abs(joined.actual-joined.predicted) - abs(joined.actual_baseline-joined.predicted_baseline)
        by_date = joined.groupby("date").difference.mean().sort_index()
        values = by_date.to_numpy()
        # Consecutive blocks must not bridge missing calendar days.
        dates = pd.to_datetime(by_date.index)
        blocks = []
        index = 0
        while index+3 <= len(values):
            if (dates[index+2]-dates[index]).days == 2:
                blocks.append(float(values[index:index+3].mean()))
                index += 3
            else:
                index += 1
        starts = [i for i in range(len(values)-2) if (dates[i+2]-dates[i]).days == 2]
        ci = None
        if len(values) >= 6 and starts:
            draws = []
            for _ in range(500):
                chunks = [values[i:i+3] for i in rng.choice(starts, size=math.ceil(len(values)/3))]
                draws.append(float(np.concatenate(chunks)[:len(values)].mean()))
            ci = np.quantile(draws, [.025, .975]).tolist()
        p = None
        if len(blocks) >= 8 and np.any(np.asarray(blocks) != 0):
            p = float(stats.wilcoxon(blocks, alternative="two-sided").pvalue)
        results.append({"model": name, "daily_mae_difference_mm": float(values.mean()), "ci95_exploratory": ci,
                        "days": len(values), "blocks": len(blocks), "p_wilcoxon": p, "p_holm": None,
                        "status": "exploratorio" if p is not None else "fechas insuficientes para prueba (mínimo 8 bloques de 3 días)"})
    ordered = sorted([r for r in results if r["p_wilcoxon"] is not None], key=lambda r: r["p_wilcoxon"])
    previous = 0
    for i, row in enumerate(ordered):
        previous = max(previous, min(1., row["p_wilcoxon"]*(len(ordered)-i)))
        row["p_holm"] = previous
    return results


def run_experiment(config, folder, check, progress):
    started = time.perf_counter()
    sets, audit, cleaned = prepare(config)
    write_json(folder/"config.json", config.model_dump())
    write_json(folder/"data-audit.json", audit)
    cleaned.to_csv(folder/"cleaned-daily.csv", index=False)
    write_json(folder/"sequences.json", sets)
    folds = training_folds(config, sets)
    fold_report = [{"train_dates": [min(r["date"] for r in a), max(r["date"] for r in a)],
                    "validation_dates": [min(r["date"] for r in b), max(r["date"] for r in b)],
                    "train_n": len(a), "validation_n": len(b)} for a, b in folds]
    results, predictions, trials, failures = [], [], [], []
    optuna.logging.set_verbosity(optuna.logging.WARNING)
    for index, name in enumerate(config.models):
        check()
        base = 5 + index/len(config.models)*85
        progress(base, f"{LABELS[name]}: entrenamiento y validación")
        tick = lambda epoch, maximum: progress(base+epoch/maximum*2, f"{LABELS[name]}: época {epoch}/{maximum}")
        model_started = time.perf_counter()
        bundle, params, cv_mae = None, {}, None
        try:
            if name not in {"persistence", "trend"}:
                study = optuna.create_study(direction="minimize", sampler=optuna.samplers.TPESampler(seed=config.seed))

                def objective(trial):
                    selected = suggest(trial, name)
                    scores = []
                    for fold, (a, b) in enumerate(folds):
                        check()
                        progress(base+trial.number/config.trials*6,
                                 f"{LABELS[name]}: ajuste {trial.number+1}/{config.trials}, fold {fold+1}/3")
                        candidate = fit(name, a, b if name in NEURAL else None, selected, config, check)
                        scores.append(float(mean_absolute_error([r["actual"] for r in b], predict(candidate, name, b))))
                    trial.set_user_attr("fold_mae", scores)
                    return float(np.mean(scores))

                study.optimize(objective, n_trials=config.trials)
                params, cv_mae = study.best_params, float(study.best_value)
                trials.extend({"model": name, "trial": t.number+1, "cv_mae": t.value, "params": t.params,
                               "fold_mae": t.user_attrs.get("fold_mae")} for t in study.trials)
                epochs = None
                if name in NEURAL:
                    # Determine stopping using a train-only internal temporal fold; then refit all train.
                    inner = fit(name, *folds[-1], params, config, check, tick=tick)
                    epochs = int(np.argmin(inner["history"]["val_loss"]))+1
                bundle = fit(name, sets["train"], None, params, config, check, tick=tick, epochs=epochs)
                if name in NEURAL:
                    import keras
                    bundle["model"].save(folder/f"{name}.h5", include_optimizer=False)
                    bundle["model"].save(folder/f"{name}.keras")
                    restored = keras.models.load_model(folder/f"{name}.h5", compile=False)
                    roundtrip = {**bundle, "model": restored}
                    original = predict(bundle, name, sets["validation"][:20])
                    reloaded = predict(roundtrip, name, sets["validation"][:20])
                    if not np.allclose(original, reloaded, atol=1e-5, rtol=1e-5):
                        raise ValueError("Falló verificación de recarga HDF5")
                    write_json(folder/f"{name}-preprocessing.json", {
                        "features": audit["features"], "lookback": config.lookback,
                        "input_mean": bundle["scaler"].mean_.tolist(), "input_scale": bundle["scaler"].scale_.tolist(),
                        "target_mean": bundle["mean"], "target_scale": bundle["scale"],
                        "output": "current_mm + normalized_delta * target_scale + target_mean",
                        "h5_roundtrip_max_error_mm": float(np.max(abs(original-reloaded))),
                        "rain_policy": config.rain_policy, "source": SOURCE})
                else:
                    joblib.dump({**bundle, "features": audit["features"], "lookback": config.lookback}, folder/f"{name}.joblib")
            evaluated = {}
            per_sensor = []
            for partition in ("validation", "test"):
                rows = sets[partition]
                predicted = predict(bundle, name, rows)
                evaluated[partition] = metrics([r["actual"] for r in rows], predicted, [r["current"] for r in rows])
                for r, p in zip(rows, predicted):
                    predictions.append({"model": name, "partition": partition, "sensor": r["sensor"], "date": r["date"],
                                        "origin": r["origin"], "current": r["current"], "actual": r["actual"],
                                        "predicted": float(p), "residual": float(r["actual"]-p), "interval_hours": r["interval"]})
                if partition == "test":
                    for sensor in sorted({r["sensor"] for r in rows}):
                        ix = [i for i, r in enumerate(rows) if r["sensor"] == sensor]
                        per_sensor.append({"sensor": sensor, **metrics([rows[i]["actual"] for i in ix], predicted[ix], [rows[i]["current"] for i in ix])})
            results.append({"model": name, "label": LABELS[name], "params": params, "cv_mae": cv_mae,
                            **evaluated, "per_sensor": per_sensor, "seconds": time.perf_counter()-model_started,
                            "history": bundle["history"] if bundle else None,
                            "export": "h5 + keras" if name in NEURAL else "joblib" if bundle else "regla determinista"})
        except RuntimeError:
            raise
        except Exception as error:
            failures.append({"model": name, "error": str(error)[:500]})
            progress(base, f"{LABELS[name]} no pudo completarse; se conserva el diagnóstico")
    check()
    if not results or len(results) == 1 and len(config.models) > 1:
        raise ValueError(f"No se completó una comparación: {failures}")
    winner = min(results, key=lambda r: r["validation"]["mae"])["model"]
    networks = [r for r in results if r["model"] in NEURAL]
    best_neural = min(networks, key=lambda r: r["validation"]["mae"])["model"] if networks else None
    baseline = next(r for r in results if r["model"] == "persistence")
    for row in results:
        row["test_skill_vs_persistence_percent"] = (1-row["test"]["mae"]/baseline["test"]["mae"])*100 if baseline["test"]["mae"] else None
    test_predictions = [p for p in predictions if p["partition"] == "test"]
    report = {"config": config.model_dump(), "source": SOURCE, "warnings": WARNINGS, "audit": audit,
              "folds": fold_report, "models": results, "failures": failures,
              "selected_model": winner, "best_neural_model": best_neural,
              "selection_rule": "MAE de validación externa. Ajuste Optuna en 3 folds de entrenamiento por fecha; prueba nunca decide parámetros.",
              "statistics": block_comparisons(test_predictions, config.seed),
              "statistics_method": "Diferencia de MAE media por fecha frente a persistencia. Bootstrap móvil 3 días, 500 réplicas (exploratorio). Wilcoxon en ≥8 bloques no solapados + Holm. Dependencia espacial/temporal residual posible.",
              "predictions": predictions, "duration_seconds": time.perf_counter()-started,
              "pipeline_sha256": {p.name: sha256(p.read_bytes()).hexdigest() for p in Path(__file__).parent.glob("*.py") if not p.name.startswith("test_")},
              "versions": {p: version(p) for p in ["numpy", "pandas", "scipy", "scikit-learn", "optuna", "keras", "tensorflow-cpu"]}}
    write_json(folder/"report.json", report)
    pd.DataFrame(predictions).to_csv(folder/"predictions.csv", index=False)
    write_json(folder/"trials.json", trials)
    card = f"""# Century Research Lab — ficha del experimento

Fuente: {SOURCE['author']}, {SOURCE['doi']}, {SOURCE['license']}.

Modelo seleccionado por validación: **{LABELS[winner]}**.
Mejor red por validación: **{LABELS.get(best_neural, 'No entrenada')}**. El mejor modelo global no tiene por qué ser una red.

## Método
{report['selection_rule']}
Semilla: {config.seed}. Ventana: {config.lookback} días. Objetivo: magnitud 3D publicada del día siguiente (mm), mediante pronóstico de su incremento.
Escaladores y objetivos normalizados ajustados solo con entrenamiento. No se interpolan prismas ausentes.
Cada resultado comparte particiones y filas. La eliminación de extremos, si se solicita, afecta solo entrenamiento.
El HDF5 contiene la red. Necesita su archivo de preprocesamiento y la lectura actual para inferencia. `.keras` es el formato moderno adicional.
No cargar archivos joblib/HDF5 de orígenes no confiables.

## Resultados
"""
    card += "\n".join(f"- {r['label']}: MAE validación {r['validation']['mae']:.4f} mm; MAE prueba {r['test']['mae']:.4f} mm; RMSE prueba {r['test']['rmse']:.4f} mm." for r in results)
    card += "\n\n## Límites\n" + "\n".join(f"- {w}" for w in WARNINGS)
    card += "\n\n" + report["statistics_method"] + "\n"
    (folder/"model-card.md").write_text(card, encoding="utf-8")
    files = [{"name": p.name, "bytes": p.stat().st_size, "sha256": sha256(p.read_bytes()).hexdigest()}
             for p in folder.iterdir() if p.is_file() and p.name != "worker.log"]
    write_json(folder/"artifacts.json", files)
    progress(98, "Empaquetando resultados, modelos y protocolo")
    import zipfile
    with zipfile.ZipFile(folder/"experiment.zip", "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for item in files:
            archive.write(folder/item["name"], item["name"])
        archive.write(folder/"artifacts.json", "artifacts.json")
    return report

