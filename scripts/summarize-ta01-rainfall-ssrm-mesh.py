#!/usr/bin/env python3
"""Resume sensibilidad de malla mecánica SSRM con el mismo campo hidráulico TA-01."""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("runs", type=Path, nargs="+")
    parser.add_argument("--output", type=Path, default=Path("data/validation/ta01-rainfall-wet-scenario-ssrm-mesh-sensitivity.json"))
    args = parser.parse_args()
    if len(args.runs) < 3:
        raise ValueError("Se requieren al menos tres mallas mecánicas")
    reports = [json.loads(source.read_text(encoding="utf-8")) for source in args.runs]
    geometry_hashes = {report["source"]["geometryInputSha256"] for report in reports}
    field_hashes = {report["source"]["seepFieldSha256"] for report in reports}
    solvers = {(report["solver"]["version"], report["solver"]["failureCriterion"], report["solver"]["elementOrder"], report["solver"]["tolerance"]) for report in reports}
    hydrologies = {json.dumps(report["hydrology"], sort_keys=True) for report in reports}
    sizes = [report["projection"]["targetMeshSizeM"] for report in reports]
    if len(geometry_hashes) != 1 or len(field_hashes) != 1 or solvers != {("0.5.2", "hybrid", "tri6", 0.02)} or len(hydrologies) != 1 or len(set(sizes)) != len(sizes):
        raise ValueError("Las corridas no comparten geometría, campo hidráulico, solver o tamaños únicos")
    rows = []
    for report in reports:
        if report["comparison"]["resolvedBeyondTolerance"] == report["comparison"]["finalIntervalsOverlap"]:
            raise ValueError("Interpretación FoS contradictoria")
        rows.append({
            "mechanicalMeshSizeM": report["projection"]["targetMeshSizeM"],
            "nodeCount": report["projection"]["nodeCount"],
            "elementCount": report["projection"]["elementCount"],
            "maximumPositivePorePressureChange24hKpa": report["projection"]["maximumPositivePorePressureChange24hKpa"],
            "baselineFactorOfSafety": report["results"]["baseline"]["factorOfSafety"],
            "baselineFinalInterval": report["results"]["baseline"]["finalInterval"],
            "hour24FactorOfSafety": report["results"]["hour24"]["factorOfSafety"],
            "hour24FinalInterval": report["results"]["hour24"]["finalInterval"],
            "factorOfSafetyDifference": report["comparison"]["factorOfSafetyDifference"],
            "resolvedBeyondTolerance": report["comparison"]["resolvedBeyondTolerance"],
        })
    rows.sort(key=lambda row: row["mechanicalMeshSizeM"], reverse=True)
    report = {
        "id": "TA01-RAINFALL-EXTERNAL-SSRM-MECHANICAL-MESH-SENSITIVITY-V1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "scientificStatus": "SENSIBILIDAD_SSRM_EXTERNO_HUMEDO_NO_CALIBRADO",
        "source": {"geometryInputSha256": geometry_hashes.pop(), "seepFieldSha256": field_hashes.pop()},
        "solver": {"name": "XSLOPE", "version": "0.5.2", "failureCriterion": "hybrid", "elementOrder": "tri6", "tolerance": 0.02},
        "hydrology": json.loads(hydrologies.pop()),
        "runs": rows,
        "baselineFactorOfSafetySpread": max(row["baselineFactorOfSafety"] for row in rows) - min(row["baselineFactorOfSafety"] for row in rows),
        "hour24FactorOfSafetySpread": max(row["hour24FactorOfSafety"] for row in rows) - min(row["hour24FactorOfSafety"] for row in rows),
        "maximumFinalIntervalWidth": max(interval[1] - interval[0] for row in rows for interval in (row["baselineFinalInterval"], row["hour24FinalInterval"])),
        "limitation": "Contrasta tres mallas mecánicas con una sola malla hidráulica de origen, parámetros supuestos y FoS de resolución 0,02. No demuestra convergencia mecánica, variación de dominio ni calibración de campo."
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(args.output), "hour24FactorOfSafetySpread": report["hour24FactorOfSafetySpread"]}, indent=2))


if __name__ == "__main__":
    main()
