"""Paired source-level corruption tests of the newly fitted primary TA-01 models."""
import argparse
import copy
from hashlib import sha256
import json
from pathlib import Path

import numpy as np
import pandas as pd
from ta01_oof_study import ROOT, core, physics, proportional

CHANNELS = ["rainfall_induced_max_displacement_mm", "maximum_pore_pressure_kpa", "mohr_coulomb_safety_index"]


def predictors(task):
    saved = json.loads((task/"base-network.json").read_text())
    net = core.LstmRegressor(len(core.FEATURES), len(saved["weights"]["wy"]), saved["seed"])
    net.parameters = {k: np.asarray(v) for k, v in saved["weights"].items()}
    correction = json.loads((task/"corrector.json").read_text())
    rain, safety = physics.CORRECTOR_FEATURES.index("forecast_rainfall_mm"), physics.CORRECTOR_FEATURES.index("mohr_coulomb_safety_index")
    hidden = len(correction["weights"]["b1"])
    corrector = physics.PhysicsCorrector(len(physics.CORRECTOR_FEATURES), hidden, correction["seed"], rain, safety)
    corrector.parameters = {k: np.asarray(v) for k, v in correction["weights"].items()}
    ridge = json.loads((task/"ridge.json").read_text())

    def forecast(data):
        x = (data.x-np.asarray(saved["feature_mean"]))/np.asarray(saved["feature_std"])
        base_y = net.forward(x)
        features = physics.corrector_inputs(data, base_y)
        residual = corrector.forward((features-np.asarray(correction["mean"]))/np.asarray(correction["std"]))
        model = ridge["model"]
        standardized = (data.x[:, -1, :]-np.asarray([model["featureMeans"][k] for k in core.FEATURES]))/np.asarray([model["featureStandardDeviations"][k] for k in core.FEATURES])
        coefficients = model["coefficientsStandardized"]
        ridge_y = coefficients["intercept"]+standardized@np.asarray([coefficients[k] for k in core.FEATURES])
        return {"persistence": data.current, "proportional": proportional(data),
                "ridge": np.maximum(data.current, data.current+model["targetDeltaMean"]+model["targetDeltaStandardDeviation"]*ridge_y),
                "lstm": np.maximum(data.current, data.current+saved["target_mean"]+saved["target_std"]*base_y),
                "hybrid_oof": np.maximum(data.current, data.current+saved["target_mean"]+saved["target_std"]*(base_y+residual))}
    return forecast


def corrupt(rows, means, scales, protocol, seed):
    random = np.random.default_rng(seed)
    result = [dict(row) for row in rows]
    groups = {}
    for i, row in enumerate(rows):
        groups.setdefault(row["scenario_id"], []).append(i)
    changed = 0
    for indices in groups.values():
        indices.sort(key=lambda i: int(rows[i]["simulation_hour"]))
        for channel in CHANNELS:
            if protocol == "AR1":
                z = random.normal(size=len(indices))
                for j in range(1, len(z)):
                    z[j] = .8*z[j-1]+np.sqrt(1-.8**2)*z[j]
                for index, value in zip(indices, z):
                    result[index][channel] = max(0., float(rows[index][channel])+.05*scales[channel]*value)
                    changed += 1
            elif random.random() < .30:
                start = random.integers(0, len(indices)-2)
                for index in indices[start:start+3]:
                    result[index][channel] = means[channel]
                    changed += 1
    return result, changed


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--folder", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    protocol = json.loads((args.folder/"protocol-before-training.json").read_text())["protocol"]
    specification = {"draws": 30, "seeds": list(range(202611040, 202611070)), "channels": CHANNELS,
                     "AR1": {"rho": .8, "stationary_sd_fraction_of_train_raw_channel_sd": .05, "negative_readings_clipped": True},
                     "BLOCK3": {"probability_per_scenario_channel": .30, "one_outage_hours": 3, "imputation": "training raw-channel mean"},
                     "unchanged": ["future targets", "weather", "static properties", "clock"],
                     "shared_observations": "Each scenario/hour/channel altered once per draw before overlapping windows. All models use the same altered current measurement, including reconstruction and floor.",
                     "scope": "diagnostic sensitivity on computed measurements, not a calibrated sensor-error model; draws quantify perturbation variation conditional on fixed primary fits and events, not sampling CIs",
                     "runner_sha256": sha256(Path(__file__).read_bytes()).hexdigest()}
    (args.output/"specification.json").write_text(json.dumps(specification, indent=2)+"\n")
    records = []
    for partition, prefix in protocol["partitions"].items():
        train_rows = core.read_csv(Path(f"{ROOT/prefix}-train.csv"))
        clean_rows = core.read_csv(Path(f"{ROOT/prefix}-test.csv"))
        means = {k: float(np.mean([float(r[k]) for r in train_rows])) for k in CHANNELS}
        scales = {k: float(np.std([float(r[k]) for r in train_rows])) for k in CHANNELS}
        for horizon in protocol["horizons"]:
            task = args.folder/f"{partition}-{horizon}h-seed0"
            forecast = predictors(task)
            original = core.make_sequences(clean_rows, protocol["lookback"], horizon)
            frozen = pd.read_csv(task/"test-predictions.csv", float_precision="round_trip")
            clean_forecasts = forecast(original)
            for name, values in clean_forecasts.items():
                # The ridge CSV rounds predictions to 1e-8 mm and its exported
                # coefficients to ten decimals; neural exports retain precision.
                tolerance = 1e-8 if name == "ridge" else 1e-14
                assert np.max(abs(values-frozen[name].to_numpy())) < tolerance
            for kind in ("AR1", "BLOCK3"):
                for draw, seed in enumerate(specification["seeds"]):
                    altered, changed = corrupt(clean_rows, means, scales, kind, seed)
                    data = core.make_sequences(altered, protocol["lookback"], horizon)
                    assert data.metadata == original.metadata
                    data.actual = original.actual
                    predictions = forecast(data)
                    for name, values in predictions.items():
                        records.append({"partition": partition, "horizon_h": horizon, "protocol": kind, "draw": draw, "seed": seed,
                                        "model": name, "changed_source_cells": changed, "mae_nm": float(np.mean(abs(values-data.actual)))*1e6})
            print(partition, horizon, "completed", flush=True)
    frame = pd.DataFrame(records)
    frame.to_csv(args.output/"paired-draws.csv", index=False, float_format="%.12g")
    frame.groupby(["partition", "horizon_h", "protocol", "model"]).mae_nm.agg(["mean", "std", "min", "max"]).reset_index().to_csv(args.output/"summary.csv", index=False, float_format="%.12g")
    print("All paired robustness draws completed", flush=True)


if __name__ == "__main__":
    main()
