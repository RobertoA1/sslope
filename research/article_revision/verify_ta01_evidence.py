"""Reload TA-01 weights and reconcile every forecast with source rows."""
import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd
from ta01_oof_study import ROOT, core, physics, proportional


def verify(folder, allow_partial=False):
    protocol = json.loads((folder/"protocol-before-training.json").read_text())["protocol"]
    required = len(protocol["base_seeds"])*len(protocol["horizons"])*len(protocol["partitions"])
    completed = sorted(folder.glob("*/complete.json"))
    if not allow_partial and len(completed) != required:
        raise AssertionError(f"Only {len(completed)} of {required} required tasks completed")
    results = []
    for path in completed:
        task, report = path.parent, json.loads(path.read_text())
        prefix = ROOT/protocol["partitions"][report["partition"]]
        data = core.make_sequences(core.read_csv(Path(f"{prefix}-test.csv")), protocol["lookback"], report["horizon"])
        stored = pd.read_csv(task/"test-predictions.csv", float_precision="round_trip")
        assert list(stored.scenario_id) == [r["scenario_id"] for r in data.metadata]
        assert list(stored.origin_hour) == [r["origin_hour"] for r in data.metadata]
        assert list(stored.target_hour) == [r["target_hour"] for r in data.metadata]
        assert np.array_equal(stored.actual.to_numpy(), data.actual)
        base = json.loads((task/"base-network.json").read_text())
        network = core.LstmRegressor(len(core.FEATURES), protocol["lstm"]["hidden"], base["seed"])
        network.parameters = {k: np.asarray(v) for k, v in base["weights"].items()}
        mean, std = np.asarray(base["feature_mean"]).reshape(1, 1, -1), np.asarray(base["feature_std"]).reshape(1, 1, -1)
        standard = network.forward((data.x-mean)/std)
        lstm = np.maximum(data.current, data.current+base["target_mean"]+base["target_std"]*standard)
        correction = json.loads((task/"corrector.json").read_text())
        rain, safety = physics.CORRECTOR_FEATURES.index("forecast_rainfall_mm"), physics.CORRECTOR_FEATURES.index("mohr_coulomb_safety_index")
        net = physics.PhysicsCorrector(len(physics.CORRECTOR_FEATURES), protocol["corrector"]["hidden"], correction["seed"], rain, safety)
        net.parameters = {k: np.asarray(v) for k, v in correction["weights"].items()}
        inputs = physics.corrector_inputs(data, standard)
        residual = net.forward((inputs-np.asarray(correction["mean"]))/np.asarray(correction["std"]))
        hybrid = np.maximum(data.current, data.current+base["target_mean"]+base["target_std"]*(standard+residual))
        forecasts = {"lstm": lstm, "hybrid_oof": hybrid, "proportional": proportional(data), "persistence": data.current}
        maximum = 0.
        for name, values in forecasts.items():
            error = float(np.max(abs(values-stored[name].to_numpy())))
            maximum = max(maximum, error)
            assert error < 1e-14, (task.name, name, error)
        for name, values in report["metrics"].items():
            error = stored[name].to_numpy()-data.actual
            assert abs(float(np.mean(abs(error)))-values["mae_mm"]) < 1e-15
            assert abs(float(np.sqrt(np.mean(error**2)))-values["rmse_mm"]) < 1e-15
            assert (stored[name].to_numpy() >= data.current-1e-15).all()
        assignments = json.loads((task/"oof-date-assignment.json").read_text())
        covered = []
        for fold in range(protocol["folds"]):
            saved = json.loads((task/f"fold-{fold}.json").read_text())
            covered.extend(saved["heldout_indices"])
        train_data = core.make_sequences(core.read_csv(Path(f"{prefix}-train.csv")), protocol["lookback"], report["horizon"])
        assert sorted(covered) == list(range(len(train_data.actual)))
        assert len(set(covered)) == len(covered)
        assert set(assignments.values()) == set(range(protocol["folds"]))
        results.append({"task": task.name, "windows": len(data.actual), "max_reload_difference_mm": maximum,
                        "oof_windows_covered_once": len(covered), "metrics_reconciled": True})
    return {"status": "partial_verified" if len(completed) < required else "verified", "required_tasks": required,
            "verified_tasks": len(results), "tasks": results}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--folder", type=Path, required=True)
    parser.add_argument("--allow-partial", action="store_true")
    args = parser.parse_args()
    output = verify(args.folder, args.allow_partial)
    (args.folder/"independent-verification.json").write_text(json.dumps(output, indent=2)+"\n")
    print(json.dumps(output, indent=2))


if __name__ == "__main__":
    main()
