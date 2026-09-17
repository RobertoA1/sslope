#!/usr/bin/env python3
"""Ensayo de infiltración transitoria TA-01 con XSLOPE; rechaza balances no conservativos."""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from datetime import datetime, timezone
from importlib.metadata import version
from pathlib import Path

import numpy as np
from shapely.geometry import Point

from ta01_xslope_common import build_geometry, require_transient_balance


def observation_triangle(mesh, point):
    nodes = np.asarray(mesh["nodes"], dtype=float)
    for element in mesh["elements"]:
        ids = [int(index) for index in element[:3]]
        (x0, y0), (x1, y1), (x2, y2) = nodes[ids]
        determinant = (x1 - x0) * (y2 - y0) - (y1 - y0) * (x2 - x0)
        if abs(determinant) < 1e-12:
            continue
        w1 = ((point[0] - x0) * (y2 - y0) - (point[1] - y0) * (x2 - x0)) / determinant
        w2 = ((x1 - x0) * (point[1] - y0) - (y1 - y0) * (point[0] - x0)) / determinant
        weights = np.array([1 - w1 - w2, w1, w2])
        if np.min(weights) >= -1e-9:
            return ids, weights
    raise ValueError(f"Punto de observación {point} fuera de la malla")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=Path("data/validation/ta01-external-ssrm-input.json"))
    parser.add_argument("--output", type=Path, default=Path("data/validation/ta01-transient-seep.json"))
    parser.add_argument("--rainfall-mm", type=float, default=102.88, help="Total supuesto sobre 24 h")
    parser.add_argument("--mesh-size", type=float, default=6.0)
    parser.add_argument("--dt-max-hours", type=float, default=12.0,
                        help="Límite superior del paso adaptativo; 12 h reproduce el valor implícito anterior")
    parser.add_argument("--soil-conductivity-m-s", type=float, default=1e-7,
                        help="Conductividad saturada del suelo; escenario supuesto, no medición")
    parser.add_argument("--lateral-head-m", type=float, default=-20.0,
                        help="Carga hidráulica lateral inicial uniforme en m")
    parser.add_argument("--flux-cap-fraction", type=float, default=0.01,
                        help="Fracción máxima de K saturada aplicada como flujo; 0,01 iguala kr0 asumido")
    parser.add_argument("--unsaturated-model", choices=("lf", "vg"), default="vg")
    parser.add_argument("--include-fields", action="store_true", help="Incluye malla y cambios nodales a 24/48 h para contraste espacial")
    args = parser.parse_args()
    if not 0 <= args.rainfall_mm <= 500 or not 4 <= args.mesh_size <= 20 or not 0.1 <= args.dt_max_hours <= 12 or not 0 < args.flux_cap_fraction <= 1 or not 1e-10 <= args.soil_conductivity_m_s <= 1e-3 or not -35 <= args.lateral_head_m <= 0:
        raise ValueError("Lluvia [0,500] mm, malla [4,20] m, dt máximo [0,1,12] h, fracción de flujo (0,1], K [1e-10,1e-3] m/s y carga lateral [-35,0] m")
    try:
        from xslope.mesh import build_mesh_from_polygons
        from xslope.seep import build_seep_data, build_tseep_data, run_transient_seepage
    except ImportError as error:
        raise SystemExit("Instala xslope[fem]==0.5.2 en un entorno Python aislado") from error
    if version("xslope") != "0.5.2":
        raise ValueError("Este experimento requiere XSLOPE 0.5.2")
    raw = args.input.read_bytes()
    model = json.loads(raw)
    if model.get("id") != "TA01-EXTENDED-DRY-SSRM-V1":
        raise ValueError("Entrada TA-01 desconocida")
    surface, domain, bands, ground = build_geometry(model)
    polygons = [{"coords": list(band.exterior.coords), "mat_id": index}
                for index, band in enumerate(bands)]
    mesh = build_mesh_from_polygons(polygons, target_size=args.mesh_size, element_type="tri3")
    x_left, x_right = surface[0][0], surface[-1][0]
    toe_x = x_right - model["geometry"]["toeExtensionM"]
    rainfall_mph = args.rainfall_mm / 1000 / 24
    soil_k_mph = args.soil_conductivity_m_s * 3600
    applied_flux = min(rainfall_mph, soil_k_mph * args.flux_cap_fraction)
    materials = []
    for index, item in enumerate(model["materials"]):
        conductivity = soil_k_mph * [1, 0.25, 0.05][index]
        materials.append({
            "name": item["id"], "option": "mc", "u": "none",
            **{key: item[key] for key in ("c", "phi", "E", "nu", "gamma")},
            "k1": conductivity, "k2": conductivity, "alpha": 0,
            "unsat": args.unsaturated_model, "kr0": 0.01, "h0": -2.0,
            "vg_a": 0.05, "vg_n": 1.5,
            "Ss": 1e-4, "Sy": [0.22, 0.12, 0.05][index],
        })
    slope_data = {
        "unit_system": "si", "time_unit": "hr", "gamma_water": 9.81,
        "ground_surface": ground, "domain_polygon": domain, "polygons": polygons,
        "materials": materials,
        "seepage_bc": {
            "specified_heads": [
                {"head": args.lateral_head_m, "coords": [(x_left, model["geometry"]["baseElevationM"]), (x_left, args.lateral_head_m)]},
                {"head": args.lateral_head_m, "coords": [(x_right, model["geometry"]["baseElevationM"]), (x_right, args.lateral_head_m)]},
            ],
            "exit_face": [(toe_x, 0.0), (x_right, 0.0)],
            "specified_fluxes": [{"flux": "rain", "coords": [point for point in surface if point[0] <= toe_x]}],
        },
        "tseep": {
            "times": [0.0, 0.01, 24.0, 24.01, 48.0],
            "series": {"rain": [0.0, applied_flux, applied_flux, 0.0, 0.0]},
            "duration": 48.0, "save_interval": 12.0,
            "save_times": [0.01, 24.0, 24.01, 48.0],
            "stability_time": 24.0,
        },
    }
    seep_data = build_seep_data(mesh, slope_data)
    tseep_data = build_tseep_data(slope_data)
    last_progress = -6

    def progress(hour, duration):
        nonlocal last_progress
        if hour >= last_progress + 6 or hour >= duration:
            print(f"filtración: {hour:.2f}/{duration:.0f} h", file=sys.stderr, flush=True)
            last_progress = hour
        return True

    # Con h lateral constante, flujo inicial nulo y los cabezales laterales
    # coincidentes, la condición inicial satisface exactamente el problema seco.
    # Se pasa explícitamente para evitar una iteración Picard redundante.
    initial_head = np.full(len(mesh["nodes"]), args.lateral_head_m)
    solution = run_transient_seepage(seep_data, tseep_data, h_init=initial_head,
                                     dt_max=args.dt_max_hours,
                                     verbose=False, progress_callback=progress)
    balance = require_transient_balance(solution)
    nodes = np.asarray(mesh["nodes"])
    near_surface = np.array([ground.distance(Point(x, y)) <= 5.0 for x, y in nodes])
    observation = (4.0, 96.0)
    observation_ids, observation_weights = observation_triangle(mesh, observation)
    frames = []
    for time, frame in zip(solution["times"], solution["frames"]):
        pressure = np.asarray(frame["u"], dtype=float)
        head = np.asarray(frame["head"], dtype=float)
        if not np.all(np.isfinite(pressure)) or not np.all(np.isfinite(head)):
            raise RuntimeError("Campo hidráulico no finito")
        frames.append({
            "hour": float(time), "maximumPorePressureKpa": float(np.max(pressure)),
            "meanNearSurfaceHeadM": float(np.mean(head[near_surface])),
            "meanNearSurfacePressureHeadM": float(np.mean(head[near_surface] - nodes[near_surface, 1])),
            "observationHeadM": float(np.dot(head[observation_ids], observation_weights)),
            "positivePressureNodeCount": int(np.count_nonzero(pressure > 1e-9)),
        })
    report = {
        "id": "TA01-TRANSIENT-SEEP-ASSUMED-V1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "scientificStatus": "FILTRACION_TRANSITORIA_EXTERNA_PARAMETROS_SUPUESTOS_NO_CALIBRADA",
        "source": {"geometryInputSha256": hashlib.sha256(raw).hexdigest()},
        "solver": {"name": "XSLOPE", "version": "0.5.2", "method": "FEM seepage transitorio", "elementOrder": "tri3",
                   "maximumTimeStepHours": args.dt_max_hours},
        "assumptions": {
            "unitSystem": "SI", "timeUnit": "hr", "rainfallMmIn24Hours": args.rainfall_mm,
            "rainfallProfile": "rectangular 24 h, con rampas de 0,01 h",
            "soilConductivityMPerSecond": args.soil_conductivity_m_s,
            "soilConductivityMPerHour": soil_k_mph,
            "fluxCapFractionOfSaturatedConductivity": args.flux_cap_fraction,
            "appliedInfiltrationFluxMPerHour": applied_flux,
            "unappliedRainfallMm": max(0.0, args.rainfall_mm - applied_flux * 24 * 1000),
            "lateralHeadM": args.lateral_head_m, "specificStoragePerM": 1e-4,
            "specificYieldByMaterial": {"SOIL": 0.22, "WEATHERED": 0.12, "ROCK": 0.05},
            "conductivityRatios": {"SOIL": 1, "WEATHERED": 0.25, "ROCK": 0.05},
            "unsaturatedModel": args.unsaturated_model,
            "unsaturatedParameters": {"lfKr0": 0.01, "lfH0M": -2, "vgAlphaPerM": 0.05, "vgN": 1.5},
        },
        "mesh": {"targetSizeM": args.mesh_size, "nodeCount": len(nodes), "elementCount": len(mesh["elements"]),
                 "nearSurfaceSamplingDistanceM": 5.0,
                 "observationPointM": {"x": observation[0], "y": observation[1]}},
        "result": {"converged": True, "frames": frames,
                   "massBalance": {"finalClosureFraction": float(balance["final_closure"]),
                                   "cumulativeInflowM2": float(balance["cumulative_inflow"]),
                                   "storedChangeM2": float(balance["final_stored_change"])},
                   "acceptedStepCount": len(solution["dt_history"]),
                   "largestAcceptedTimeStepHours": float(max(solution["dt_history"])),
                   "smallestAcceptedTimeStepHours": float(min(solution["dt_history"]))},
        "limitation": "Experimento hidráulico separado. Los parámetros y contornos son supuestos, el total diario no fija una lluvia horaria real. La lluvia no aplicada por el tope de flujo no se resuelve como escorrentía. El campo solo puede alimentar un SSRM externo condicional; no alimenta el FEM propio. No es predicción operacional. Solo se escribe si cierra masa con error relativo <=5%.",
    }
    if args.include_fields:
        saved = {float(frame["time"]): np.asarray(frame["head"], dtype=float) for frame in solution["frames"]}
        report["field"] = {
            "nodesM": nodes.tolist(),
            "triangles": np.asarray(mesh["elements"])[:, :3].astype(int).tolist(),
            "deltaHead24hM": (saved[24.0] - saved[0.0]).tolist(),
            "deltaHead48hM": (saved[48.0] - saved[0.0]).tolist(),
        }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(args.output), "frames": len(frames),
                      "headChangeAtObservationM": frames[-1]["observationHeadM"] - frames[0]["observationHeadM"]}, indent=2))


if __name__ == "__main__":
    main()
