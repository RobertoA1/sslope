import json
from copy import deepcopy
import numpy as np
import pandas as pd
import pytest
from pydantic import ValidationError
from crisp.config import CrispConfig, selected_data, outer_folds, inner_folds, clean_training, preview
from crisp.statistics import evaluate_statistics, longest_run
from crisp.presentation import section, eda_sections, export_html


@pytest.fixture
def config():
    return CrispConfig(models=["persistence", "ridge"], trials=1, epochs=2, repeats=1, bootstrap_reps=500)


def test_actual_data_and_sensor_selection(config):
    sets, audit, frame = selected_data(config)
    assert audit["partitions"] == {"train": 783, "validation": 198, "test": 231}
    config.sensors = sorted(frame.sensor.unique())[:-1]
    chosen, a, df = selected_data(config)
    assert set(df.sensor).issubset(config.sensors)
    assert all(r["sensor"] in config.sensors for rows in chosen.values() for r in rows)
    assert frame.movement.notna().all()


def test_unknown_sensor_rejected():
    with pytest.raises(ValidationError):
        CrispConfig(sensors=["inventado"])


def test_outer_and_inner_chronology_without_test(config):
    sets, _, _ = selected_data(config)
    folds = outer_folds(sets["train"]+sets["validation"], config)
    assert len(folds) == 3
    for fold in folds:
        assert fold["train_end"] < fold["eval_start"] <= fold["eval_end"] <= config.validation_end
        assert all(r["origin"] > fold["train_end"] for r in fold["valid"])
        for train, valid in inner_folds(fold["raw_train"], config):
            assert max(r["date"] for r in train) < min(r["origin"] for r in valid)
            assert max(r["date"] for r in valid) <= fold["train_end"]


def test_fold_iqr_does_not_look_at_future(config):
    config.remove_train_outliers = True
    sets, _, _ = selected_data(config)
    raw = sets["train"]+sets["validation"]
    old = outer_folds(raw, config)[0]
    changed = deepcopy(raw)
    for row in changed:
        if row["date"] > old["train_end"]:
            row["delta"] *= 1e8
    new = outer_folds(changed, config)[0]
    assert old["bounds"] == new["bounds"]
    assert old["train"] == new["train"]
    assert len(old["valid"]) == len(new["valid"])


def predictions(days):
    result = []
    rng = np.random.default_rng(9)
    for i, date in enumerate(pd.date_range("2014-01-01", periods=days)):
        for sensor in ["a", "b"]:
            for name, error in [("persistence", 3+rng.random()), ("ridge", 1+rng.random()), ("gru", 2+rng.random())]:
                result.append({"sensor": sensor, "date": date.strftime("%Y-%m-%d"), "model": name,
                               "actual": 10., "predicted": 10-error})
    return result


def test_nine_dates_do_not_manufacture_p_values(config):
    report = evaluate_statistics(predictions(9), config)
    assert len(report["comparisons"]) == 3  # All pairs, not baseline-only.
    assert all(r["p_hac"] is None and r["p_wilcoxon"] is None for r in report["comparisons"])
    assert all(r["days"] == 9 and r["blocks"] == 3 for r in report["comparisons"])
    json.dumps(report, allow_nan=False)


def test_longer_series_conditional_inference_holm_and_effect(config):
    report = evaluate_statistics(predictions(45), config)
    for row in report["comparisons"]:
        assert 0 <= row["p_hac"] <= row["p_hac_holm"] <= 1
        assert row["hac_ci"][0] <= row["difference_mm"] <= row["hac_ci"][1]
        assert "condicional" in row["status"]
    ridge = next(r for r in report["comparisons"] if r["model_a"] == "persistence" and r["model_b"] == "ridge")
    assert ridge["difference_mm"] > 0
    assert report["common_rows"] == 90 and report["common_days"] == 45


def test_missing_calendar_does_not_join_artificial_blocks(config):
    rows = predictions(40)
    rows = [r for r in rows if r["date"] != "2014-01-20"]
    report = evaluate_statistics(rows, config)
    assert all(r["days"] == 20 and r["p_hac"] is None for r in report["comparisons"])


def test_repeated_seeds_not_independent_samples(config):
    rows = predictions(9)
    with pytest.raises(ValueError, match="repeticiones"):
        evaluate_statistics(rows+rows, config)


def test_explanations_required_and_shared_in_html():
    with pytest.raises(ValueError):
        section(2, "Gráfico", "", "lectura", "límite")
    items = eda_sections(sensor="22-1917")
    report = export_html(items)
    for item in items:
        assert all(item[k] for k in ["method", "interpretation", "limits"])
        assert item["title"] in report
    assert '<script src="' not in report
    assert "Plotly.newPlot" in report


def test_escape_html_and_no_fake_zero():
    report = export_html([section(2, "<script>bad</script>", "método", "lectura", "límite",
                                 table=pd.DataFrame({"p": [None], "text": ["<script>bad</script>"]}))])
    assert "&lt;script&gt;bad&lt;/script&gt;" in report
    assert "No disponible" in report




def test_full_engine_real_ridge_exports_and_explanations(config, tmp_path):
    from crisp.engine import run
    report = run(config, tmp_path)
    assert len(report["ranking"]) == 2
    assert report["selected_model"] in {"persistence", "ridge"}
    assert report["test_days"] == 9
    assert (tmp_path/"selection.json").exists()
    assert (tmp_path/"experiment.zip").exists()
    assert (tmp_path/"report.html").exists()
    explanation = next(e for e in report["explanations"] if e["model"] == "ridge")
    assert len(explanation["importance"]) == 24
    assert len(explanation["local"]) == 4
    assert np.isfinite([r["increase_mae_mm"] for r in explanation["importance"]]).all()
    assert all(r["p_hac"] is None for r in report["statistics"]["comparisons"])
    assert report["artifacts"]["ridge"]
    json.dumps(report, allow_nan=False)

