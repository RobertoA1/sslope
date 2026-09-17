#!/usr/bin/env python3
"""Ensayo condicional: proyecta presión hidráulica TA-01 a SSRM cuadrático externo."""

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
    parser.add_argument("--geometry", type=Path, default=Path("data/validation/ta01-external-ssrm-input.json"))
    parser.add_argument("--seep-report", type=Path, required=True, help="Reporte generado con --include-fields")
    parser.add_argument("--output", type=Path, default=Path("data/validation/ta01-rainfall-external-ssrm.json"))
    parser.add_argument("--mesh-size", type=float, default=8.0)
    parser.add_argument("--mapping-only", action="store_true")
    args = parser.parse_args()
    if not 4 <= args.mesh_size <= 12:
        raise ValueError("mesh-size debe estar entre 4 y 12 m")
    try:
        from xslope.fem import build_fem_data, solve_ssrm
        from xslope.mesh import build_mesh_from_polygons
    except ImportError as error:
        raise SystemExit("Instala xslope[fem]==0.5.2 en un entorno Python aislado") from error
    if version("xslope") != "0.5.2":
        raise ValueError("Este experimento requiere XSLOPE 0.5.2")
    geometry_bytes = args.geometry.read_bytes()
    model = json.loads(geometry_bytes)
    seep = json.loads(args.seep_report.read_text(encoding="utf-8"))
    if seep["source"]["geometryInputSha256"] != hashlib.sha256(geometry_bytes).hexdigest():
        raise ValueError("La geometría hidráulica y la mecánica son distintas")
    if seep["assumptions"]["unsaturatedModel"] != "vg" or not seep["result"]["converged"] or "field" not in seep:
        raise ValueError("Se requiere un campo hidráulico van Genuchten convergido")
    balance = seep["result"]["massBalance"]
    scale = max(abs(balance["cumulativeInflowM2"]), abs(balance["storedChangeM2"]), 1e-8)
    direct_closure = abs(balance["cumulativeInflowM2"] - balance["storedChangeM2"]) / scale
    if max(direct_closure, balance["finalClosureFraction"]) > 0.05:
        raise ValueError("El campo hidráulico no cierra masa dentro de 5 %")
    _, domain, bands, ground = build_geometry(model)
    polygons = [{"coords": list(band.exterior.coords), "mat_id": index} for index, band in enumerate(bands)]
    mesh = build_mesh_from_polygons(polygons, target_size=args.mesh_size, element_type="tri6")
    if not len(mesh["elements"]) or any(kind != 6 for kind in mesh["element_types"]):
        raise ValueError("SSRM requiere malla tri6")
    nodes = np.asarray(mesh["nodes"], dtype=float)
    delta24, mapping = projected_delta(seep["field"], nodes, 24)
    baseline_head = float(seep["assumptions"]["lateralHeadM"])
    baseline_u = np.maximum(0.0, 9.81 * (baseline_head - nodes[:, 1]))
    storm_u = np.maximum(0.0, 9.81 * (baseline_head + delta24 - nodes[:, 1]))
    max_change = float(np.max(np.abs(storm_u - baseline_u)))
    projection = {"targetMeshSizeM": args.mesh_size,
                  "nodeCount": len(nodes), "elementCount": len(mesh["elements"]),
                  "sourceTri3Nodes": seep["mesh"]["nodeCount"],
                  "maximumAbsoluteDeltaHead24hM": float(np.max(np.abs(delta24))),
                  "maximumPositivePorePressureChange24hKpa": max_change, **mapping}
    if args.mapping_only:
        print(json.dumps(projection, indent=2))
        return
    material_data = [{"name": item["id"], "option": "mc", "u": "seep",
                      **{key: item[key] for key in ("c", "phi", "E", "nu", "gamma")}}
                     for item in model["materials"]]
    common = {"unit_system": "si", "gamma_water": 9.81, "ground_surface": ground,
              "domain_polygon": domain, "polygons": polygons, "side_bc": "rollers",
              "materials": material_data}
    results = {}
    for label, pore_pressure in (("baseline", baseline_u), ("hour24", storm_u)):
        slope_data = {**common, "seep_u": pore_pressure}
        fem_data = build_fem_data(slope_data, mesh)
        if np.max(np.abs(fem_data["u"] - pore_pressure)) > 1e-8:
            raise RuntimeError("XSLOPE no aplicó las presiones de poros esperadas")
        result = solve_ssrm(fem_data, F_min=0.5, F_max=3.0, tolerance=0.02,
                            failure_criterion="hybrid", capture_failure_state=False)
        factor = result.get("FS")
        if not result.get("converged") or result.get("inconclusive") or not isinstance(factor, (float, int)):
            raise RuntimeError(f"SSRM {label} inconcluso: {result.get('error') or result.get('note')}")
        results[label] = {"factorOfSafety": factor, "finalInterval": result.get("final_interval")}
    interval0, interval24 = results["baseline"]["finalInterval"], results["hour24"]["finalInterval"]
    intervals_overlap = max(interval0[0], interval24[0]) <= min(interval0[1], interval24[1])
    field_hash = hashlib.sha256(json.dumps(seep["field"], sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    report = {
        "id": "TA01-EXTERNAL-SSRM-TRANSIENT-SEEP-24H-V1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "scientificStatus": "ACOPLAMIENTO_SSRM_EXTERNO_CONDICIONAL_NO_CALIBRADO",
        "source": {"geometryInputSha256": hashlib.sha256(geometry_bytes).hexdigest(),
                   "seepFieldSha256": field_hash},
        "solver": {"name": "XSLOPE", "version": "0.5.2", "method": "Mohr-Coulomb SSRM", "failureCriterion": "hybrid", "elementOrder": "tri6", "tolerance": 0.02},
        "hydrology": {"hour": 24, "rainfallMm": seep["assumptions"]["rainfallMmIn24Hours"],
                      "appliedInfiltrationMm": seep["assumptions"]["rainfallMmIn24Hours"] - seep["assumptions"]["unappliedRainfallMm"],
                      "lateralHeadM": baseline_head, "massClosureFraction": direct_closure},
        "projection": projection,
        "results": results,
        "comparison": {"factorOfSafetyDifference": results["hour24"]["factorOfSafety"] - results["baseline"]["factorOfSafety"],
                       "finalIntervalsOverlap": intervals_overlap,
                       "resolvedBeyondTolerance": not intervals_overlap},
        "limitation": "Acoplamiento experimental entre filtración tri3 y estabilidad tri6 en geometría extendida. Parámetros hidráulicos, contornos y escorrentía no calibrados; el campo hidráulico no demuestra convergencia espacial completa. No debe usarse como alerta ni como predicción de una mina."
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(args.output), "baselineFoS": results["baseline"]["factorOfSafety"],
                      "hour24FoS": results["hour24"]["factorOfSafety"], "maximumPositivePorePressureChange24hKpa": max_change}, indent=2))


if __name__ == "__main__":
    main()
