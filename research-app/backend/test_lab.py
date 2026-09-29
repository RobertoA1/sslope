"""Safety and science contracts; tests never touch the article's database/models."""
import json
from pathlib import Path
import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from backend import jobs
from backend.main import app
from backend.data import ExperimentConfig, observations, prepare, describe_dataset
from backend.training import temporal_folds, metrics, block_comparisons, predict, fit


@pytest.fixture
def config():
    return ExperimentConfig(models=["persistence", "ridge"], trials=1, epochs=2)


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(jobs, "RUNTIME", tmp_path)
    monkeypatch.setattr(jobs, "DB", tmp_path/"jobs.sqlite3")
    monkeypatch.setattr(jobs, "PROCESSES", {})
    with TestClient(app) as c:
        yield c


def test_real_source_counts_and_missing_zero():
    df, audit = observations()
    assert audit["raw_readings"] == 7178
    assert audit["daily_readings"] == 3163
    assert audit["sensors"] == 49
    assert audit["missing_rain"] == 43
    assert audit["zero_rain"] == 1692
    assert (df.rain == 0).sum() != df.rain.isna().sum()
    assert df[["sensor", "date"]].duplicated().sum() == 0


def test_windows_temporal_contract(config):
    sets, audit, _ = prepare(config)
    assert audit["partitions"] == {"train": 783, "validation": 198, "test": 231}
    known = {r["sensor"] for r in sets["train"]}
    for name, rows in sets.items():
        for r in rows:
            assert (pd.Timestamp(r["date"])-pd.Timestamp(r["origin"])).days == 1
            assert np.asarray(r["x"]).shape == (6, 4)
            assert np.isfinite(r["x"]).all()
            assert r["x"][-1][0] == r["current"]
            assert r["delta"] == r["actual"]-r["current"]
            if name == "validation":
                assert r["origin"] > config.train_end and r["date"] <= config.validation_end
            if name == "test":
                assert r["origin"] > config.validation_end and r["date"] <= config.test_end
            if name != "train":
                assert r["sensor"] in known


def test_cv_groups_dates_not_sensor_rows(config):
    sets, _, _ = prepare(config)
    for train, valid in temporal_folds(sets["train"]):
        last = max(r["date"] for r in train)
        first = min(r["date"] for r in valid)
        assert last < first
        assert (pd.Timestamp(first)-pd.Timestamp(last)).days >= 2
        assert all(r["origin"] > last for r in valid)
        assert {r["date"] for r in train}.isdisjoint({r["date"] for r in valid})


def test_outliers_never_filter_validation_or_test(config):
    base, _, _ = prepare(config)
    changed, audit, _ = prepare(config.model_copy(update={"remove_train_outliers": True}))
    assert changed["validation"] == base["validation"]
    assert changed["test"] == base["test"]
    assert audit["exclusions"]["train_outliers"] > 0
    assert len(changed["train"]) < len(base["train"])


def test_rain_fill_is_past_only_and_flagged(config):
    _, _, before = prepare(config)
    _, audit, after = prepare(config.model_copy(update={"rain_policy": "past_fill"}))
    assert audit["rain_imputed_rows"] > 0
    assert after.loc[before.rain.notna(), "rain"].equals(before.loc[before.rain.notna(), "rain"])
    weather = before[["rain_date", "rain"]].drop_duplicates().set_index("rain_date").rain
    for row in after[after.rain_imputed].itertuples():
        older = [weather.get(row.rain_date-pd.Timedelta(days=d)) for d in (1, 2)]
        assert any(v is not None and not pd.isna(v) and row.rain == v for v in older)
    assert after.movement.equals(before.movement)


def test_no_rain_feature_is_an_explicit_ablation(config):
    sets, audit, _ = prepare(config.model_copy(update={"use_rain": False}))
    assert len(audit["features"]) == 3
    assert np.asarray(sets["train"][0]["x"]).shape == (6, 3)


def test_eda_filters_and_lags():
    data = describe_dataset("22-1917", "2014-01-01", "2014-01-31", 5)
    assert all("2014-01-01" <= r["date"][:10] <= "2014-01-31" for r in data["series"])
    assert data["lag"] == 5
    assert len(data["correlations"]) == 16
    assert len(data["lagged"]) == 8
    assert len(data["coverage"]) == 49
    assert data["normality"]["n"] > 0
    json.dumps(data, allow_nan=False)


@pytest.mark.parametrize("values", [{"lookback": 100}, {"trials": 50}, {"epochs": 500}, {"seed": -1},
                                  {"train_end": "2014-02-19"}, {"test_end": "2015-01-01"}, {"models": ["fake_model"]}])
def test_invalid_configs(values):
    with pytest.raises(ValidationError):
        ExperimentConfig(**values)


def test_sparse_dates_rejected(config):
    with pytest.raises(ValueError):
        prepare(config.model_copy(update={"validation_end": "2014-02-02"}))


def test_scaler_and_ridge_are_fit_only_on_train(config):
    sets, _, _ = prepare(config)
    train = sets["train"]
    bundle = fit("ridge", train, sets["validation"], {"alpha": 1.}, config, lambda: None)
    x = np.asarray([r["x"] for r in train], dtype=np.float32)
    assert np.allclose(bundle["scaler"].mean_, x.reshape(-1, 4).mean(axis=0), rtol=1e-5, atol=1e-5)
    assert bundle["mean"] == pytest.approx(np.mean([r["delta"] for r in train]), rel=1e-5)
    prediction = predict(bundle, "ridge", sets["test"])
    assert np.isfinite(prediction).all() and len(prediction) == 231


def test_baselines_and_metric_semantics(config):
    sets, _, _ = prepare(config)
    rows = sets["test"]
    current = [r["current"] for r in rows]
    predicted = predict(None, "persistence", rows)
    assert np.allclose(predicted, current)
    score = metrics([r["actual"] for r in rows], predicted, current)
    assert score["mae"] == pytest.approx(6.392488683740258, abs=1e-5)
    assert score["r2_delta"] < 0


def test_no_false_significance_for_nine_dates():
    predictions = []
    for d in pd.date_range("2014-02-12", periods=9):
        for model in ["persistence", "ridge"]:
            predictions.append({"sensor": "a", "date": d.strftime("%Y-%m-%d"), "model": model,
                                "actual": 10., "predicted": 9. if model == "persistence" else 9.5})
    stats = block_comparisons(predictions, 1)[0]
    assert stats["days"] == 9 and stats["blocks"] == 3
    assert stats["p_wilcoxon"] is None and stats["p_holm"] is None
    assert stats["daily_mae_difference_mm"] < 0


def test_api_eda_and_preview(client, config):
    assert client.get("/api/health").status_code == 200
    eda = client.get("/api/dataset?lag=5&sensor=22-1917").json()
    assert eda["lag"] == 5 and eda["series"]
    preview = client.post("/api/preview?sensor=22-1917", json=config.model_dump())
    assert preview.status_code == 200
    assert preview.json()["series"] and preview.json()["folds"]


def test_api_bad_filters_and_foreign_writes(client, config):
    assert client.get("/api/dataset?sensor=not-real").status_code == 422
    assert client.get("/api/dataset?start=invalid").status_code == 422
    assert client.get("/api/dataset?lag=0").status_code == 422
    assert client.post("/api/preview", json=config.model_dump(), headers={"Origin": "https://foreign.example"}).status_code == 403


def test_api_no_report_for_missing_or_failed_job(client, config):
    assert client.get("/api/experiments/not-a-uuid/report").status_code == 422
    missing = "11111111-1111-4111-8111-111111111111"
    assert client.get(f"/api/experiments/{missing}/report").status_code == 404
    with jobs.connect() as db:
        db.execute("INSERT INTO jobs VALUES (?,?,?,?,?,?,?)", (missing, "Test", "2026", "failed", 10, "Failure", config.model_dump_json()))
    assert client.get(f"/api/experiments/{missing}/report").status_code == 409
    assert client.get(f"/api/experiments/{missing}/artifacts").json() == []
    assert client.get(f"/api/experiments/{missing}/files/config.json").status_code == 404


def test_job_history_recovery_and_single_worker(client, config, monkeypatch):
    class FakeProcess:
        def poll(self): return None
        def terminate(self): pass
        def wait(self, timeout): pass
    monkeypatch.setattr(jobs.subprocess, "Popen", lambda *args, **kwargs: FakeProcess())
    first = client.post("/api/experiments", json=config.model_dump())
    assert first.status_code == 202
    assert client.post("/api/experiments", json=config.model_dump()).status_code == 409
    job_id = first.json()["id"]
    assert client.post(f"/api/experiments/{job_id}/cancel").json()["status"] == "cancelled"
    assert client.get("/api/experiments").json()[0]["id"] == job_id
    second = client.post("/api/experiments", json=config.model_dump()).json()["id"]
    jobs.initialize(recover=True)
    assert jobs.get(second)["status"] == "interrupted"


def test_outlier_cv_thresholds_are_fold_local(config):
    from backend.training import training_folds
    config = config.model_copy(update={"remove_train_outliers": True})
    sets, _, _ = prepare(config)
    raw, _, _ = prepare(config.model_copy(update={"remove_train_outliers": False}))
    expected = temporal_folds(raw["train"])
    actual = training_folds(config, sets)
    for (a, _), (cleaned, valid) in zip(expected, actual):
        q1, q3 = np.quantile([r["delta"] for r in a], [.25, .75])
        keep = [r for r in a if q1-3*(q3-q1) <= r["delta"] <= q3+3*(q3-q1)]
        assert cleaned == keep
        assert max(r["date"] for r in cleaned) < min(r["date"] for r in valid)

