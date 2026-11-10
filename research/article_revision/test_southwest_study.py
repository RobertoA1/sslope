"""Scientific-contract checks for the additional field evaluation."""
import json
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from southwest_study import load_daily, sequences, segmented_interval, ROOT


@pytest.fixture
def protocol():
    return json.loads(Path(__file__).with_name("southwest-protocol.json").read_text())


def test_source_and_reference_are_reconstructed_from_coordinates(protocol):
    daily, audit = load_daily(protocol, ROOT/"data/external/century-mine/Data.zip")
    assert audit["raw_readings"] == 82401
    assert audit["raw_sensors"] == 160
    assert audit["sensors_with_reference"] == 146
    assert audit["identical_duplicates"] == 1
    assert audit["conflicting_timestamps"] == 0
    initial = daily[daily.date == pd.Timestamp("2014-01-01")]
    assert len(initial) == 146 and (initial.movement == 0).all()
    # An independently computed known prism displacement, based on the raw
    # reference shown in the source, is a physical unit/target contract check.
    row = daily[(daily.sensor == "31-1626") & (daily.date == pd.Timestamp("2014-01-02"))].iloc[0]
    ref = initial[initial.sensor == "31-1626"].iloc[0]
    expected = 1000*np.linalg.norm(row[["easting", "northing", "height"]].to_numpy(float)-ref[["easting", "northing", "height"]].to_numpy(float))
    assert row.movement == pytest.approx(expected)
    assert 20 < row.movement < 30


def test_windows_use_past_only_and_never_bridge_absent_dates(protocol):
    daily, _ = load_daily(protocol, ROOT/"data/external/century-mine/Data.zip")
    sets, excluded = sequences(daily, protocol)
    for part, rows in sets.items():
        assert rows
        for row in rows:
            assert (pd.Timestamp(row["date"])-pd.Timestamp(row["origin"])).days == 1
            if part == "train":
                assert row["date"] <= protocol["train_end"]
            elif part == "validation":
                assert protocol["train_end"] < row["origin"] < row["date"] <= protocol["validation_end"]
            else:
                assert protocol["validation_end"] < row["origin"] < row["date"] <= protocol["test_end"]
    keys = [{(r["sensor"], r["date"]) for r in rows} for rows in sets.values()]
    assert not keys[0]&keys[1] and not keys[1]&keys[2] and not keys[0]&keys[2]
    original = sets["test"][0]
    mutated = daily.copy()
    mask = (mutated.sensor == original["sensor"]) & (mutated.date == pd.Timestamp(original["date"]))
    mutated.loc[mask, "movement"] += 9999
    altered_sets, _ = sequences(mutated, protocol)
    altered = next(r for r in altered_sets["test"] if (r["sensor"], r["date"]) == (original["sensor"], original["date"]))
    assert altered["actual"] != original["actual"]
    assert altered["x"] == original["x"]
    assert excluded["gaps_or_missing_features"] > 0


def test_interval_keeps_all_runs_and_does_not_invent_variance():
    series = pd.Series([1., 1., 3., 3.], index=["2014-01-01", "2014-01-02", "2014-01-05", "2014-01-06"])
    result = segmented_interval(series, length=3, reps=100, seed=4, alpha=.05)
    assert result["runs"] == [2, 2]
    assert result["difference_mm"] == 2
    assert result["ci95"] == [2, 2]
    assert result["family_ci"] == [2, 2]


def test_changed_source_archive_is_rejected(protocol, tmp_path):
    altered = tmp_path/"Data.zip"
    altered.write_bytes(b"not the audited source")
    with pytest.raises(ValueError, match="hash mismatch"):
        load_daily(protocol, altered)
