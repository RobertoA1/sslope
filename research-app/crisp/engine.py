"""Nested temporal evaluation. Tuning/selection never read final-test targets."""
from pathlib import Path
from copy import deepcopy
from hashlib import sha256
from importlib.metadata import version
import time
import zipfile
import joblib
import numpy as np
import pandas as pd
import optuna
from sklearn.base import BaseEstimator, RegressorMixin
from sklearn.inspection import permutation_importance
from backend.data import SOURCE, WARNINGS
from backend.training import fit, predict, metrics, suggest, write_json, NEURAL, LABELS
from .config import selected_data, outer_folds, inner_folds, clean_training
from .statistics import evaluate_statistics


def daily_mae(rows, predicted):
    return float(pd.DataFrame({"date": [r["date"] for r in rows],
                               "error": np.abs(np.asarray([r["actual"] for r in rows])-predicted)}).groupby("date").error.mean().mean())


def tune(name, rows, config, check):
    if name in {"persistence", "trend"}:
        return {}, None, []
    folds = inner_folds(rows, config)
    study = optuna.create_study(direction="minimize", sampler=optuna.samplers.TPESampler(seed=config.seed))
    def objective(trial):
        parameters = suggest(trial, name)
        scores = []
        for a, b in folds:
            check()
            bundle = fit(name, a, b if name in NEURAL else None, parameters, config, check)
            scores.append(daily_mae(b, predict(bundle, name, b)))
        trial.set_user_attr("fold_mae", scores)
        return float(np.mean(scores))
    study.optimize(objective, n_trials=config.trials)
    return study.best_params, float(study.best_value), [
        {"trial": t.number+1, "cv_mae": t.value, "params": t.params, "fold_mae": t.user_attrs["fold_mae"]} for t in study.trials]


def train_bundle(name, raw, train, params, config, check):
    if name in {"persistence", "trend"}:
        return None
    epochs = None
    if name in NEURAL:
        a, b = inner_folds(raw, config)[-1]
        stopped = fit(name, a, b, params, config, check)
        epochs = int(np.argmin(stopped["history"]["val_loss"]))+1
    return fit(name, train, None, params, config, check, epochs=epochs)


def prediction_records(name, rows, predicted, **extra):
    return [{"model": name, "sensor": r["sensor"], "date": r["date"], "origin": r["origin"],
             "current": r["current"], "actual": r["actual"], "predicted": float(p),
             "residual": float(r["actual"]-p), **extra} for r, p in zip(rows, predicted)]


class DeltaEstimator(RegressorMixin, BaseEstimator):
    def __init__(self, bundle, name, shape):
        self.bundle, self.name, self.shape = bundle, name, shape
    def fit(self, X, y=None):
        self.is_fitted_ = True
        return self
    def predict(self, X):
        x = np.asarray(X).reshape((-1, *self.shape))
        rows = [{"x": v.tolist(), "current": 0, "delta": 0} for v in x]
        return predict(self.bundle, self.name, rows)


def explain(bundle, name, train, valid, features, seed):
    if bundle is None:
        return {"model": name, "rule": "El pronóstico es la lectura actual." if name == "persistence" else "Lectura actual más el último incremento ajustado a 24 horas.", "importance": [], "local": []}
    # Only an outer evaluation fold. Final test does not guide feature selection.
    indices = np.linspace(0, len(valid)-1, min(250, len(valid)), dtype=int)
    selected = [valid[i] for i in indices]
    x = np.asarray([r["x"] for r in selected])
    y = np.asarray([r["delta"] for r in selected])
    estimator = DeltaEstimator(bundle, name, x.shape[1:]).fit(x.reshape(len(x), -1))
    result = permutation_importance(estimator, x.reshape(len(x), -1), y,
                                    scoring="neg_mean_absolute_error", n_repeats=3, random_state=seed, n_jobs=1)
    names = [f"{feature} · t−{x.shape[1]-1-lag}" for lag in range(x.shape[1]) for feature in features]
    importance = [{"variable": label, "increase_mae_mm": float(mean), "repeat_std_mm": float(std)}
                  for label, mean, std in zip(names, result.importances_mean, result.importances_std)]
    example = deepcopy(valid[-1])
    base = float(predict(bundle, name, [example])[0])
    medians = np.median(np.asarray([r["x"] for r in train]), axis=0)
    local = []
    for i, feature in enumerate(features):
        changed = deepcopy(example)
        for lag in range(len(changed["x"])):
            changed["x"][lag][i] = float(medians[lag, i])
        p = float(predict(bundle, name, [changed])[0])
        local.append({"variable": feature, "prediction_reference_mm": base, "prediction_replaced_mm": p,
                      "change_mm": p-base})
    return {"model": name, "importance": importance, "local": local, "sensor": example["sensor"],
            "date": example["date"], "n": len(selected), "partition": "último fold externo, primera semilla",
            "method": "Permutation importance de scikit-learn por variable/retardo (3 repeticiones); sensibilidad local al reemplazar trayectoria por medianas de entrenamiento. La lectura actual de referencia se mantiene fija.",
            "limits": "Diagnóstico del modelo, no causalidad ni SHAP. La permutación puede romper relaciones temporales y crear entradas irreales; variables correlacionadas comparten importancia. Desviación entre 3 permutaciones no es intervalo de confianza. No representa el ensamble final."}


def export_bundle(folder, name, seed, bundle, rows, features, config):
    if bundle is None:
        return None
    stem = f"{name}-seed{seed}"
    meta = {"features": features, "lookback": config.lookback, "seed": seed,
            "input_mean": bundle["scaler"].mean_.tolist(), "input_scale": bundle["scaler"].scale_.tolist(),
            "target_mean": bundle["mean"], "target_scale": bundle["scale"],
            "output": "current_mm + normalized_delta * target_scale + target_mean", "source": SOURCE,
            "rain_policy": config.rain_policy, "history": bundle["history"]}
    if name in NEURAL:
        import keras
        bundle["model"].save(folder/f"{stem}.h5", include_optimizer=False)
        bundle["model"].save(folder/f"{stem}.keras")
        restored = keras.models.load_model(folder/f"{stem}.h5", compile=False)
        a = predict(bundle, name, rows[:20])
        b = predict({**bundle, "model": restored}, name, rows[:20])
        if not np.allclose(a, b, atol=1e-5, rtol=1e-5):
            raise ValueError("No se pudo verificar la recarga del modelo H5")
        meta["h5_roundtrip_max_error_mm"] = float(np.max(abs(a-b)))
        artifact = f"{stem}.h5"
    else:
        joblib.dump({**bundle, "features": features, "lookback": config.lookback}, folder/f"{stem}.joblib")
        artifact = f"{stem}.joblib"
    write_json(folder/f"{stem}-preprocessing.json", meta)
    return artifact


def run(config, folder, check=lambda: None, progress=lambda value, message: None):
    folder = Path(folder)
    folder.mkdir(parents=True, exist_ok=True)
    started = time.perf_counter()
    optuna.logging.set_verbosity(optuna.logging.WARNING)
    sets, audit, cleaned = selected_data(config)
    development = sets["train"]+sets["validation"]
    folds = outer_folds(development, config)
    write_json(folder/"config.json", config.model_dump())
    cleaned.to_csv(folder/"cleaned-daily.csv", index=False)
    write_json(folder/"data-audit.json", audit)
    scores, outer_predictions, raw_predictions, trials, explanations = [], [], [], [], []
    task_count = len(folds)*len(config.models)
    for fold_index, fold in enumerate(folds):
        for model_index, name in enumerate(config.models):
            check()
            progress(3+65*(fold_index*len(config.models)+model_index)/task_count,
                     f"Fold externo {fold_index+1}/{len(folds)} · {LABELS[name]} · ajuste interno")
            params, cv, trace = tune(name, fold["raw_train"], config, check)
            trials.extend({"model": name, "outer_fold": fold["fold"], **t} for t in trace)
            predictions = []
            for repeat in range(config.repeats):
                cfg = config.model_copy(update={"seed": config.seed+repeat})
                bundle = train_bundle(name, fold["raw_train"], fold["train"], params, cfg, check)
                p = predict(bundle, name, fold["valid"])
                predictions.append(p)
                scores.append({"model": name, "fold": fold["fold"], "seed": cfg.seed,
                               "daily_mae_mm": daily_mae(fold["valid"], p), **metrics([r["actual"] for r in fold["valid"]], p, [r["current"] for r in fold["valid"]])})
                raw_predictions.extend(prediction_records(name, fold["valid"], p, fold=fold["fold"], seed=cfg.seed, partition="outer"))
                if fold_index == len(folds)-1 and repeat == 0:
                    explanations.append(explain(bundle, name, fold["train"], fold["valid"], audit["features"], config.seed))
            ensemble = np.mean(predictions, axis=0)
            outer_predictions.extend(prediction_records(name, fold["valid"], ensemble, fold=fold["fold"], partition="outer"))
    # Rank algorithms by equal-weight outer-fold daily MAE of the seed ensemble.
    ranked = []
    for name in config.models:
        values = []
        for fold in folds:
            rows = [r for r in outer_predictions if r["model"] == name and r["fold"] == fold["fold"]]
            values.append(daily_mae(rows, np.asarray([r["predicted"] for r in rows])))
        ranked.append({"model": name, "label": LABELS[name], "outer_daily_mae_mm": float(np.mean(values)),
                       "fold_std_mm": float(np.std(values, ddof=1)), "fold_scores_mm": values})
    ranked.sort(key=lambda r: r["outer_daily_mae_mm"])
    winner = ranked[0]["model"]
    best_neural = next((r["model"] for r in ranked if r["model"] in NEURAL), None)
    # Selection is frozen before fitting any final model or reading any test outcome.
    write_json(folder/"selection.json", {"selected_model": winner, "best_neural_model": best_neural, "ranking": ranked})
    final_train, final_bounds = clean_training(development, config.remove_train_outliers)
    known = {r["sensor"] for r in final_train}
    test = [r for r in sets["test"] if r["sensor"] in known]
    if len(test) < 20:
        raise ValueError("No hay prueba final suficiente tras la selección de entrenamiento")
    test_predictions, artifacts, final_results, learning = [], {}, [], []
    for index, name in enumerate(config.models):
        progress(70+23*index/len(config.models), f"Selección congelada · {LABELS[name]} · ajuste final y exportación")
        params, cv, trace = tune(name, development, config, check)
        trials.extend({"model": name, "outer_fold": "final", **t} for t in trace)
        predictions, exports = [], []
        for repeat in range(config.repeats):
            check()
            cfg = config.model_copy(update={"seed": config.seed+repeat})
            bundle = train_bundle(name, development, final_train, params, cfg, check)
            p = predict(bundle, name, test)
            predictions.append(p)
            raw_predictions.extend(prediction_records(name, test, p, seed=cfg.seed, partition="test"))
            artifact = export_bundle(folder, name, cfg.seed, bundle, test, audit["features"], config)
            if artifact:
                exports.append(artifact)
            if bundle and bundle["history"]:
                learning.extend({"model": name, "seed": cfg.seed, "epoch": epoch+1, "loss": float(loss)}
                                for epoch, loss in enumerate(bundle["history"]["loss"]))
        ensemble = np.mean(predictions, axis=0)
        test_predictions.extend(prediction_records(name, test, ensemble, partition="test"))
        final_results.append({"model": name, "label": LABELS[name], "params": params,
                              "daily_mae_mm": daily_mae(test, ensemble),
                              **metrics([r["actual"] for r in test], ensemble, [r["current"] for r in test]),
                              "negative_predictions": int((ensemble < 0).sum()), "exports": exports})
        artifacts[name] = exports
    app_root = Path(__file__).resolve().parents[1]
    source_paths = [p for root in (app_root/"crisp", app_root/"backend") for p in root.glob("*.py") if not p.name.startswith("test_")]
    source_paths += [app_root/"streamlit_app.py", app_root/"requirements-streamlit.txt", app_root/".streamlit/config.toml"]
    report = {"schema": "century-crisp-dm-v1", "source": SOURCE, "warnings": WARNINGS,
              "config": config.model_dump(), "audit": audit, "selected_model": winner, "best_neural_model": best_neural,
              "selection_rule": "Media de MAE diario en folds externos temporales del ensamble de semillas. Optuna solo en folds internos. Test final nunca selecciona ni ajusta parámetros.",
              "folds": [{k: v for k, v in f.items() if k not in {"raw_train", "train", "valid"}} for f in folds],
              "ranking": ranked, "outer_scores": scores, "outer_predictions": outer_predictions,
              "test_results": final_results, "test_predictions": test_predictions, "trials": trials,
              "explanations": explanations, "learning": learning, "artifacts": artifacts,
              "statistics": evaluate_statistics(test_predictions, config),
              "final_train_outlier_bounds": final_bounds, "final_train_n": len(final_train),
              "test_n": len(test), "test_days": len({r["date"] for r in test}),
              "ensemble_rule": "Promedio aritmético de predicciones de todas las semillas exportadas. Un archivo H5 individual no representa el ensamble.",
              "duration_seconds": time.perf_counter()-started,
              "pipeline_sha256": {str(p.relative_to(app_root)): sha256(p.read_bytes()).hexdigest() for p in source_paths},
              "versions": {p: version(p) for p in ["streamlit", "plotly", "statsmodels", "numpy", "pandas", "scipy", "scikit-learn", "optuna", "keras", "tensorflow-cpu"]}}
    progress(95, "Generando explicaciones y reportes CRISP-DM")
    write_json(folder/"report.json", report)
    pd.DataFrame(raw_predictions).to_csv(folder/"predictions-by-seed.csv", index=False)
    pd.DataFrame(outer_predictions+test_predictions).to_csv(folder/"ensemble-predictions.csv", index=False)
    write_json(folder/"ensemble.json", {"selected_model": winner, "best_neural_model": best_neural, "rule": report["ensemble_rule"], "models": artifacts})
    from .presentation import build_sections, export_html, export_markdown
    sections = build_sections(report)
    (folder/"report.html").write_text(export_html(sections, report), encoding="utf-8")
    (folder/"report.md").write_text(export_markdown(sections, report), encoding="utf-8")
    write_json(folder/"explanations.json", [{k: v for k, v in section.items() if k not in {"figure", "table"}} for section in sections])
    with zipfile.ZipFile(folder/"experiment.zip", "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(folder.iterdir()):
            if path.is_file() and path.name not in {"experiment.zip", "worker.log"}:
                archive.write(path, path.name)
        for path in source_paths:
            archive.write(path, "code/"+str(path.relative_to(app_root)))
    return report


