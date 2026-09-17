#!/usr/bin/env python3
"""Comprueba procedencia y conclusión limitada del acoplamiento externo TA-01."""

import hashlib
import json
from pathlib import Path


root = Path(__file__).resolve().parent.parent
geometry_bytes = (root / "data/validation/ta01-external-ssrm-input.json").read_bytes()
source = json.loads((root / "data/validation/ta01-transient-seep-field-6m.json").read_text())
report = json.loads((root / "data/validation/ta01-rainfall-external-ssrm.json").read_text())
field_hash = hashlib.sha256(json.dumps(source["field"], sort_keys=True, separators=(",", ":")).encode()).hexdigest()
assert report["source"]["geometryInputSha256"] == hashlib.sha256(geometry_bytes).hexdigest()
assert report["source"]["seepFieldSha256"] == field_hash
assert source["mesh"]["targetSizeM"] == 6
assert source["result"]["converged"]
assert report["projection"]["maximumBoundaryResidualM"] < 1e-8
assert report["projection"]["maximumPositivePorePressureChange24hKpa"] < 1e-6
assert report["results"]["baseline"]["factorOfSafety"] == report["results"]["hour24"]["factorOfSafety"]
assert report["comparison"]["finalIntervalsOverlap"] and not report["comparison"]["resolvedBeyondTolerance"]
assert report["hydrology"]["appliedInfiltrationMm"] < 0.1
print("TA-01 rainfall-to-SSRM provenance and limited conclusion passed")
