#!/usr/bin/env python3
"""Compara cambios hidráulicos en una cuadrícula física común, usando mallas reales."""

from __future__ import annotations

import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

import matplotlib.tri as mtri
import numpy as np
from shapely.geometry import Point

from ta01_xslope_common import build_geometry


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("runs", type=Path, nargs="+")
    parser.add_argument("--geometry", type=Path, default=Path("data/validation/ta01-external-ssrm-input.json"))
    parser.add_argument("--output", type=Path, default=Path("data/validation/ta01-transient-seep-field-sensitivity.json"))
    parser.add_argument("--grid-spacing", type=float, default=2.0)
    args = parser.parse_args()
    if len(args.runs) < 3 or not 1 <= args.grid_spacing <= 5:
        raise ValueError("Se requieren tres o más mallas y espaciado entre 1 y 5 m")
    geometry_bytes = args.geometry.read_bytes()
    geometry = json.loads(geometry_bytes)
    _, domain, _, ground = build_geometry(geometry)
    # El mismo conjunto de puntos en todas las corridas. Se excluye una franja
    # de 0,5 m para que el contraste no dependa de nodos sobre un borde irregular.
    interior = domain.buffer(-0.5)
    x = np.arange(domain.bounds[0] + 1, domain.bounds[2], args.grid_spacing)
    y = np.arange(domain.bounds[1] + 1, domain.bounds[3], args.grid_spacing)
    gx, gy = np.meshgrid(x, y)
    xy = np.column_stack((gx.ravel(), gy.ravel()))
    xy = np.asarray([point for point in xy if interior.contains(Point(point))])
    if len(xy) < 500:
        raise ValueError("La cuadrícula común tiene muy pocos puntos interiores")
    sample_x, sample_y = xy[:, 0], xy[:, 1]
    runs = []
    hydraulic_conditions = set()
    time_limits = set()
    for source in args.runs:
        data = json.loads(source.read_text(encoding="utf-8"))
        if data["source"]["geometryInputSha256"] != hashlib.sha256(geometry_bytes).hexdigest():
            raise ValueError(f"Geometría distinta en {source}")
        if data["assumptions"]["unsaturatedModel"] != "vg" or not data["result"]["converged"]:
            raise ValueError(f"Filtración no acreditada en {source}")
        assumptions = data["assumptions"]
        hydraulic_conditions.add(json.dumps(assumptions, sort_keys=True))
        time_limits.add(data["solver"].get("maximumTimeStepHours", 12.0))
        balance = data["result"]["massBalance"]
        scale = max(abs(balance["cumulativeInflowM2"]), abs(balance["storedChangeM2"]), 1e-8)
        direct_closure = abs(balance["cumulativeInflowM2"] - balance["storedChangeM2"]) / scale
        if max(balance["finalClosureFraction"], direct_closure) > 0.05:
            raise ValueError(f"Cierre de masa insuficiente en {source}")
        field = data.get("field")
        if not field:
            raise ValueError(f"Falta campo nodal en {source}; ejecuta con --include-fields")
        nodes = np.asarray(field["nodesM"])
        triangles = np.asarray(field["triangles"])
        triangulation = mtri.Triangulation(nodes[:, 0], nodes[:, 1], triangles)
        sampled = {}
        for hour in (24, 48):
            nodal_delta = np.asarray(field[f"deltaHead{hour}hM"])
            if len(nodal_delta) != len(nodes):
                raise ValueError("Campo nodal no coincide con la malla")
            values = mtri.LinearTriInterpolator(triangulation, nodal_delta)(sample_x, sample_y)
            sampled[hour] = np.asarray(np.ma.filled(values, np.nan))
        runs.append({"meshSizeM": data["mesh"]["targetSizeM"],
                     "nodeCount": len(nodes), "elementCount": len(triangles),
                     "sourceFieldSha256": hashlib.sha256(json.dumps(field, sort_keys=True, separators=(",", ":")).encode()).hexdigest(),
                     "sampled": sampled})
    runs.sort(key=lambda run: run["meshSizeM"], reverse=True)
    if len(hydraulic_conditions) != 1:
        raise ValueError("Las corridas no comparten exactamente los supuestos hidráulicos")
    if len(time_limits) != 1:
        raise ValueError("Las corridas no comparten el mismo límite de paso temporal")
    scenario = json.loads(next(iter(hydraulic_conditions)))
    lateral_head = scenario["lateralHeadM"]
    if len({run["meshSizeM"] for run in runs}) != len(runs):
        raise ValueError("Tamaños de malla duplicados")
    common = np.logical_and.reduce([np.isfinite(run["sampled"][hour]) for run in runs for hour in (24, 48)])
    if np.count_nonzero(common) / len(xy) < 0.99:
        raise ValueError("Las mallas no cubren al menos 99 % de la misma cuadrícula interior")
    common_xy = xy[common]
    grid_y = sample_y[common]
    rows = []
    for run in runs:
        row = {"meshSizeM": run["meshSizeM"], "nodeCount": run["nodeCount"],
               "elementCount": run["elementCount"], "sourceFieldSha256": run["sourceFieldSha256"]}
        for hour in (24, 48):
            delta = run["sampled"][hour][common]
            pressure_change = 9.81 * (np.maximum(0, lateral_head + delta - grid_y) - np.maximum(0, lateral_head - grid_y))
            row[f"rmsDeltaHead{hour}hM"] = float(np.sqrt(np.mean(delta ** 2)))
            row[f"maximumAbsoluteDeltaHead{hour}hM"] = float(np.max(np.abs(delta)))
            row[f"maximumPositivePorePressureChange{hour}hKpa"] = float(np.max(pressure_change))
        rows.append(row)
    comparisons = []
    for coarse, fine in zip(runs[:-1], runs[1:]):
        entry = {"coarseM": coarse["meshSizeM"], "fineM": fine["meshSizeM"]}
        for hour in (24, 48):
            error = coarse["sampled"][hour][common] - fine["sampled"][hour][common]
            coarse_pressure = np.maximum(0, 9.81 * (lateral_head + coarse["sampled"][hour][common] - grid_y))
            fine_pressure = np.maximum(0, 9.81 * (lateral_head + fine["sampled"][hour][common] - grid_y))
            pressure_error = coarse_pressure - fine_pressure
            pressure_active = (coarse_pressure > 1e-9) | (fine_pressure > 1e-9)
            peak_head = int(np.argmax(np.abs(error)))
            peak_pressure = int(np.argmax(np.abs(pressure_error)))
            peak_head_xy = common_xy[peak_head]
            peak_pressure_xy = common_xy[peak_pressure]
            entry[f"rmsHeadDifference{hour}hM"] = float(np.sqrt(np.mean(error ** 2)))
            entry[f"p95AbsoluteHeadDifference{hour}hM"] = float(np.quantile(np.abs(error), 0.95))
            entry[f"maximumAbsoluteHeadDifference{hour}hM"] = float(np.max(np.abs(error)))
            entry[f"rmsPositivePorePressureDifference{hour}hKpa"] = float(np.sqrt(np.mean(pressure_error ** 2)))
            entry[f"maximumAbsolutePositivePorePressureDifference{hour}hKpa"] = float(np.max(np.abs(pressure_error)))
            entry[f"positivePressureActivePointCount{hour}h"] = int(np.count_nonzero(pressure_active))
            entry[f"maximumAbsoluteHeadDifferenceInPressureActiveZone{hour}hM"] = float(np.max(np.abs(error[pressure_active]))) if np.any(pressure_active) else 0.0
            entry[f"maximumAbsoluteHeadDifferenceOutsidePressureActiveZone{hour}hM"] = float(np.max(np.abs(error[~pressure_active]))) if np.any(~pressure_active) else 0.0
            entry[f"peakHeadDifferencePoint{hour}hM"] = {
                "x": float(peak_head_xy[0]), "y": float(peak_head_xy[1]),
                "distanceToGroundSurfaceM": float(ground.distance(Point(peak_head_xy))),
                "coarsePressureHeadM": float(lateral_head + coarse["sampled"][hour][common][peak_head] - peak_head_xy[1]),
                "finePressureHeadM": float(lateral_head + fine["sampled"][hour][common][peak_head] - peak_head_xy[1]),
            }
            entry[f"peakPositivePorePressureDifferencePoint{hour}hM"] = {
                "x": float(peak_pressure_xy[0]), "y": float(peak_pressure_xy[1]),
                "distanceToGroundSurfaceM": float(ground.distance(Point(peak_pressure_xy))),
            }
        comparisons.append(entry)
    result = {
        "id": "TA01-TRANSIENT-SEEP-FIELD-MESH-SENSITIVITY-V1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "scientificStatus": "CAMPO_HIDRAULICO_COMPARADO_SIN_CALIBRACION_NI_ACOPLAMIENTO_SSRM",
        "geometryInputSha256": hashlib.sha256(geometry_bytes).hexdigest(),
        "hydraulicScenario": scenario,
        "maximumTimeStepHours": next(iter(time_limits)),
        "lateralHeadM": lateral_head,
        "grid": {"spacingM": args.grid_spacing, "interiorMarginM": 0.5,
                 "candidateCount": len(xy), "commonPointCount": int(np.count_nonzero(common))},
        "runs": rows, "adjacentComparisons": comparisons,
        "limitation": "Contrasta cambios de carga a 24/48 h sobre la misma cuadrícula interior; no calibra K, curva de retención, contornos ni escorrentía. La diferencia espacial no equivale a una tolerancia geotécnica de FoS."
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(args.output), "commonPointCount": result["grid"]["commonPointCount"]}, indent=2))


if __name__ == "__main__":
    main()
