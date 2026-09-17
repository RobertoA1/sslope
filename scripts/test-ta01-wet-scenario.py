#!/usr/bin/env python3
"""Verifica procedencia y límites del escenario hidráulico húmedo supuesto."""

import hashlib
import json
from pathlib import Path


root = Path(__file__).resolve().parent.parent
geometry = (root / "data/validation/ta01-external-ssrm-input.json").read_bytes()
seep = json.loads((root / "data/validation/ta01-transient-seep-wet-scenario-6m.json").read_text())
mesh = json.loads((root / "data/validation/ta01-transient-seep-wet-scenario-field-sensitivity.json").read_text())
fine_time_mesh = json.loads((root / "data/validation/ta01-transient-seep-wet-scenario-fine-time-mesh-sensitivity.json").read_text())
time_study = json.loads((root / "data/validation/ta01-transient-seep-wet-scenario-time-sensitivity.json").read_text())
projected_pressure = json.loads((root / "data/validation/ta01-wet-scenario-ssrm-pressure-mesh-sensitivity.json").read_text())
ssrm_mesh = json.loads((root / "data/validation/ta01-rainfall-wet-scenario-ssrm-mesh-sensitivity.json").read_text())
ssrm = json.loads((root / "data/validation/ta01-rainfall-wet-scenario-external-ssrm.json").read_text())
field_hash = hashlib.sha256(json.dumps(seep["field"], sort_keys=True, separators=(",", ":")).encode()).hexdigest()
geometry_hash = hashlib.sha256(geometry).hexdigest()
assert seep["source"]["geometryInputSha256"] == geometry_hash
assert mesh["geometryInputSha256"] == geometry_hash == ssrm["source"]["geometryInputSha256"]
assert time_study["geometryInputSha256"] == geometry_hash
assert fine_time_mesh["geometryInputSha256"] == geometry_hash
assert projected_pressure["geometryInputSha256"] == geometry_hash
assert ssrm_mesh["source"]["geometryInputSha256"] == geometry_hash
assert mesh["runs"][1]["sourceFieldSha256"] == field_hash == ssrm["source"]["seepFieldSha256"]
assert time_study["runs"][0]["sourceFieldSha256"] == field_hash
assert fine_time_mesh["runs"][1]["sourceFieldSha256"] == time_study["runs"][-1]["sourceFieldSha256"]
assert fine_time_mesh["maximumTimeStepHours"] == time_study["runs"][-1]["maximumTimeStepHours"] == 0.1
assert projected_pressure["maximumTimeStepHours"] == 0.1
assert projected_pressure["mechanicalMesh"]["nodeCount"] == ssrm["projection"]["nodeCount"] == 3120
assert [run["sourceFieldSha256"] for run in projected_pressure["runs"]] == [run["sourceFieldSha256"] for run in fine_time_mesh["runs"]]
assert projected_pressure["adjacentComparisons"][-1]["maximumAbsolutePositivePorePressureDifference24hKpa"] < 0.1
assert all(run["maximumBoundaryResidualM"] < 1e-8 for run in projected_pressure["runs"])
assert ssrm_mesh["source"]["seepFieldSha256"] == field_hash
assert [run["mechanicalMeshSizeM"] for run in ssrm_mesh["runs"]] == [10, 8, 6]
assert ssrm_mesh["hour24FactorOfSafetySpread"] > 0
assert ssrm_mesh["hour24FactorOfSafetySpread"] <= ssrm_mesh["maximumFinalIntervalWidth"] + 1e-12
assert all(not run["resolvedBeyondTolerance"] for run in ssrm_mesh["runs"])
assert ssrm_mesh["runs"][1]["hour24FactorOfSafety"] == ssrm["results"]["hour24"]["factorOfSafety"]
assert time_study["hydraulicScenario"] == seep["assumptions"]
assert [run["maximumTimeStepHours"] for run in time_study["runs"]] == [12, 3, 1.5, 0.75, 0.375, 0.1875, 0.1]
assert all(run["massClosureFraction"] < 0.05 for run in time_study["runs"])
assert time_study["adjacentComparisons"][-1]["maximumAbsoluteHeadDifference24hM"] < 0.01
assert time_study["adjacentComparisons"][-1]["maximumAbsolutePositivePorePressureDifference24hKpa"] < 0.002
assert seep["assumptions"]["soilConductivityMPerSecond"] == 1e-5
assert seep["assumptions"]["lateralHeadM"] == -2
assert abs(ssrm["hydrology"]["appliedInfiltrationMm"] - 8.64) < 1e-9
assert seep["result"]["massBalance"]["finalClosureFraction"] < 0.05
assert mesh["grid"]["commonPointCount"] > 6000
assert [run["meshSizeM"] for run in mesh["runs"]] == [8, 6, 4]
assert mesh["adjacentComparisons"][-1]["maximumAbsoluteHeadDifference24hM"] > 1
assert fine_time_mesh["adjacentComparisons"][-1]["maximumAbsoluteHeadDifference24hM"] > 2
assert fine_time_mesh["adjacentComparisons"][-1]["maximumAbsolutePositivePorePressureDifference24hKpa"] < 0.1
assert ssrm["projection"]["maximumPositivePorePressureChange24hKpa"] > 1
assert ssrm["comparison"]["finalIntervalsOverlap"]
assert not ssrm["comparison"]["resolvedBeyondTolerance"]
print("TA-01 assumed wet-scenario provenance and limited conclusion passed")
