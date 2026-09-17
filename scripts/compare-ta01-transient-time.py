#!/usr/bin/env python3
"""Compara la sensibilidad temporal del mismo campo hidráulico TA-01 y la misma malla."""

from __future__ import annotations

import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("runs", type=Path, nargs="+")
    parser.add_argument("--geometry", type=Path, default=Path("data/validation/ta01-external-ssrm-input.json"))
    parser.add_argument("--output", type=Path, default=Path("data/validation/ta01-transient-seep-time-sensitivity.json"))
    args = parser.parse_args()
    if len(args.runs) < 3:
        raise ValueError("Se requieren tres o más límites temporales distintos")
    geometry_hash = hashlib.sha256(args.geometry.read_bytes()).hexdigest()
    runs = []
    scenario = None
    reference_nodes = reference_triangles = reference_target_size = None
    for source in args.runs:
        data = json.loads(source.read_text(encoding="utf-8"))
        if data["source"]["geometryInputSha256"] != geometry_hash or not data["result"]["converged"]:
            raise ValueError(f"Geometría incompatible o solución no convergida en {source}")
        assumptions = data["assumptions"]
        if scenario is None:
            scenario = assumptions
        elif assumptions != scenario:
            raise ValueError(f"Supuestos hidráulicos distintos en {source}")
        balance = data["result"]["massBalance"]
        scale = max(abs(balance["cumulativeInflowM2"]), abs(balance["storedChangeM2"]), 1e-8)
        direct_closure = abs(balance["cumulativeInflowM2"] - balance["storedChangeM2"]) / scale
        if max(balance["finalClosureFraction"], direct_closure) > 0.05:
            raise ValueError(f"Cierre de masa insuficiente en {source}")
        field = data.get("field")
        if not field:
            raise ValueError(f"Falta campo nodal en {source}")
        nodes = np.asarray(field["nodesM"], dtype=float)
        triangles = np.asarray(field["triangles"], dtype=int)
        if reference_nodes is None:
            reference_nodes, reference_triangles = nodes, triangles
            reference_target_size = data["mesh"]["targetSizeM"]
        elif not np.array_equal(nodes, reference_nodes) or not np.array_equal(triangles, reference_triangles):
            raise ValueError(f"La malla no es exactamente la misma en {source}")
        elif data["mesh"]["targetSizeM"] != reference_target_size:
            raise ValueError(f"Tamaño nominal de malla distinto en {source}")
        limit = float(data["solver"]["maximumTimeStepHours"])
        if not 0 < data["result"]["largestAcceptedTimeStepHours"] <= limit + 1e-9:
            raise ValueError(f"El paso aceptado supera el límite declarado en {source}")
        deltas = {hour: np.asarray(field[f"deltaHead{hour}hM"], dtype=float) for hour in (24, 48)}
        if any(len(delta) != len(nodes) or not np.all(np.isfinite(delta)) for delta in deltas.values()):
            raise ValueError(f"Campo nodal inválido en {source}")
        field_hash = hashlib.sha256(json.dumps(field, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
        runs.append({"maximumTimeStepHours": limit,
                     "largestAcceptedTimeStepHours": data["result"]["largestAcceptedTimeStepHours"],
                     "acceptedStepCount": data["result"]["acceptedStepCount"],
                     "massClosureFraction": max(balance["finalClosureFraction"], direct_closure),
                     "sourceFieldSha256": field_hash, "delta": deltas})
    runs.sort(key=lambda run: run["maximumTimeStepHours"], reverse=True)
    if len({run["maximumTimeStepHours"] for run in runs}) != len(runs):
        raise ValueError("Límites temporales duplicados")
    y = reference_nodes[:, 1]
    baseline_head = scenario["lateralHeadM"]
    baseline_pressure = np.maximum(0, 9.81 * (baseline_head - y))
    summaries = []
    for run in runs:
        row = {key: value for key, value in run.items() if key != "delta"}
        for hour in (24, 48):
            delta = run["delta"][hour]
            pressure_change = np.maximum(0, 9.81 * (baseline_head + delta - y)) - baseline_pressure
            row[f"maximumPositivePorePressureChange{hour}hKpa"] = float(np.max(pressure_change))
        summaries.append(row)
    comparisons = []
    for coarse, fine in zip(runs[:-1], runs[1:]):
        row = {"coarseMaximumTimeStepHours": coarse["maximumTimeStepHours"],
               "fineMaximumTimeStepHours": fine["maximumTimeStepHours"]}
        for hour in (24, 48):
            difference = coarse["delta"][hour] - fine["delta"][hour]
            coarse_u = np.maximum(0, 9.81 * (baseline_head + coarse["delta"][hour] - y))
            fine_u = np.maximum(0, 9.81 * (baseline_head + fine["delta"][hour] - y))
            row[f"rmsHeadDifference{hour}hM"] = float(np.sqrt(np.mean(difference ** 2)))
            row[f"p95AbsoluteHeadDifference{hour}hM"] = float(np.quantile(np.abs(difference), 0.95))
            row[f"maximumAbsoluteHeadDifference{hour}hM"] = float(np.max(np.abs(difference)))
            row[f"maximumAbsolutePositivePorePressureDifference{hour}hKpa"] = float(np.max(np.abs(coarse_u - fine_u)))
        comparisons.append(row)
    report = {
        "id": "TA01-TRANSIENT-SEEP-TIME-SENSITIVITY-V1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "scientificStatus": "SENSIBILIDAD_TEMPORAL_HIDRAULICA_NO_VALIDACION_OPERACIONAL",
        "geometryInputSha256": geometry_hash,
        "hydraulicScenario": scenario,
        "mesh": {"targetSizeM": reference_target_size,
                 "nodeCount": len(reference_nodes), "triangleCount": len(reference_triangles)},
        "runs": summaries,
        "adjacentComparisons": comparisons,
        "limitation": "Contrasta exactamente la misma malla y los mismos supuestos con distintos límites de paso adaptativo. Un error temporal pequeño no valida malla, contornos, permeabilidad, escorrentía ni respuesta geotécnica real."
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(args.output), "runs": len(runs), "nodeCount": len(reference_nodes)}, indent=2))


if __name__ == "__main__":
    main()
