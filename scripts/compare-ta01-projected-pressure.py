#!/usr/bin/env python3
"""Compara presión de poros proyectada desde distintas mallas hidráulicas al mismo SSRM."""

from __future__ import annotations

import argparse
import hashlib
import json
from datetime import datetime, timezone
from importlib.metadata import version
from pathlib import Path

import numpy as np

from ta01_projection import projected_delta
from ta01_xslope_common import build_geometry


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("runs", type=Path, nargs="+")
    parser.add_argument("--geometry", type=Path, default=Path("data/validation/ta01-external-ssrm-input.json"))
    parser.add_argument("--output", type=Path, default=Path("data/validation/ta01-wet-scenario-ssrm-pressure-mesh-sensitivity.json"))
    parser.add_argument("--mechanical-mesh-size", type=float, default=8.0)
    args = parser.parse_args()
    if len(args.runs) < 3 or not 4 <= args.mechanical_mesh_size <= 12:
        raise ValueError("Se requieren al menos tres campos y malla mecánica entre 4 y 12 m")
    if version("xslope") != "0.5.2":
        raise ValueError("El contraste requiere XSLOPE 0.5.2")
    from xslope.mesh import build_mesh_from_polygons

    geometry_bytes = args.geometry.read_bytes()
    geometry_hash = hashlib.sha256(geometry_bytes).hexdigest()
    model = json.loads(geometry_bytes)
    _, _, bands, _ = build_geometry(model)
    polygons = [{"coords": list(band.exterior.coords), "mat_id": index} for index, band in enumerate(bands)]
    target = build_mesh_from_polygons(polygons, target_size=args.mechanical_mesh_size, element_type="tri6")
    if any(kind != 6 for kind in target["element_types"]):
        raise ValueError("La malla mecánica debe contener solo tri6")
    nodes = np.asarray(target["nodes"], dtype=float)
    scenario = None
    time_limit = None
    runs = []
    for source in args.runs:
        data = json.loads(source.read_text(encoding="utf-8"))
        if data["source"]["geometryInputSha256"] != geometry_hash or not data["result"]["converged"]:
            raise ValueError(f"Geometría distinta o filtración no convergida en {source}")
        if data["assumptions"]["unsaturatedModel"] != "vg" or "field" not in data:
            raise ValueError(f"Se requiere campo nodal van Genuchten en {source}")
        if scenario is None:
            scenario = data["assumptions"]
            time_limit = data["solver"].get("maximumTimeStepHours", 12.0)
        elif data["assumptions"] != scenario or data["solver"].get("maximumTimeStepHours", 12.0) != time_limit:
            raise ValueError("Las corridas no comparten supuestos ni límite temporal")
        balance = data["result"]["massBalance"]
        scale = max(abs(balance["cumulativeInflowM2"]), abs(balance["storedChangeM2"]), 1e-8)
        direct_closure = abs(balance["cumulativeInflowM2"] - balance["storedChangeM2"]) / scale
        if max(balance["finalClosureFraction"], direct_closure) > 0.05:
            raise ValueError(f"Balance de masa insuficiente en {source}")
        delta, mapping = projected_delta(data["field"], nodes, 24)
        baseline_head = scenario["lateralHeadM"]
        baseline_u = np.maximum(0, 9.81 * (baseline_head - nodes[:, 1]))
        hour24_u = np.maximum(0, 9.81 * (baseline_head + delta - nodes[:, 1]))
        field_hash = hashlib.sha256(json.dumps(data["field"], sort_keys=True, separators=(",", ":")).encode()).hexdigest()
        runs.append({"hydraulicMeshSizeM": data["mesh"]["targetSizeM"],
                     "sourceFieldSha256": field_hash,
                     "sourceNodeCount": data["mesh"]["nodeCount"],
                     "maximumBoundaryResidualM": mapping["maximumBoundaryResidualM"],
                     "boundaryInterpolationNodeCount": mapping["boundaryInterpolationNodeCount"],
                     "maximumPositivePorePressureChange24hKpa": float(np.max(hour24_u - baseline_u)),
                     "positivePressureNodeCount24h": int(np.count_nonzero(hour24_u > 1e-9)),
                     "hour24Pressure": hour24_u})
    runs.sort(key=lambda run: run["hydraulicMeshSizeM"], reverse=True)
    if len({run["hydraulicMeshSizeM"] for run in runs}) != len(runs):
        raise ValueError("Mallas hidráulicas duplicadas")
    summaries = [{key: value for key, value in run.items() if key != "hour24Pressure"} for run in runs]
    comparisons = []
    for coarse, fine in zip(runs[:-1], runs[1:]):
        error = coarse["hour24Pressure"] - fine["hour24Pressure"]
        peak = int(np.argmax(np.abs(error)))
        comparisons.append({
            "coarseHydraulicMeshM": coarse["hydraulicMeshSizeM"],
            "fineHydraulicMeshM": fine["hydraulicMeshSizeM"],
            "rmsPositivePorePressureDifference24hKpa": float(np.sqrt(np.mean(error ** 2))),
            "p95AbsolutePositivePorePressureDifference24hKpa": float(np.quantile(np.abs(error), 0.95)),
            "maximumAbsolutePositivePorePressureDifference24hKpa": float(np.max(np.abs(error))),
            "peakDifferenceMechanicalNode": {"index": peak, "x": float(nodes[peak, 0]), "y": float(nodes[peak, 1])},
        })
    report = {
        "id": "TA01-PROJECTED-SSRM-PORE-PRESSURE-MESH-SENSITIVITY-V1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "scientificStatus": "PROYECCION_NODAL_SSRM_EXTERNA_NO_VALIDACION_OPERACIONAL",
        "geometryInputSha256": geometry_hash,
        "hydraulicScenario": scenario,
        "maximumTimeStepHours": time_limit,
        "mechanicalMesh": {"targetSizeM": args.mechanical_mesh_size, "nodeCount": len(nodes),
                           "elementCount": len(target["elements"])},
        "runs": summaries,
        "adjacentComparisons": comparisons,
        "limitation": "Compara presiones positivas proyectadas a una malla mecánica común; no calcula FoS para cada campo, no valida SSRM frente a observaciones ni demuestra independencia de la malla mecánica."
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(args.output), "mechanicalNodes": len(nodes),
                      "runs": len(runs)}, indent=2))


if __name__ == "__main__":
    main()
