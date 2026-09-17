#!/usr/bin/env python3
"""SSRM seco de una sección TA-01 extendida con XSLOPE 0.5.2 (tercero)."""

from __future__ import annotations

import argparse
import hashlib
import json
from datetime import datetime, timezone
from importlib.metadata import version
from pathlib import Path

from ta01_xslope_common import build_geometry


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=Path("data/validation/ta01-external-ssrm-input.json"))
    parser.add_argument("--output", type=Path, default=Path("data/validation/ta01-external-ssrm.json"))
    parser.add_argument("--mesh-size", type=float, default=8.0)
    parser.add_argument("--tolerance", type=float, default=0.02)
    args = parser.parse_args()
    if not 3 <= args.mesh_size <= 12 or not 0 < args.tolerance <= 0.05:
        raise ValueError("mesh-size debe estar en [3,12] m y tolerance en (0,0.05]")
    try:
        from xslope.fem import build_fem_data, solve_ssrm
        from xslope.mesh import build_mesh_from_polygons
    except ImportError as error:
        raise SystemExit("Instala xslope[fem]==0.5.2 en un entorno Python aislado") from error
    if version("xslope") != "0.5.2":
        raise ValueError("Esta validación requiere XSLOPE 0.5.2")
    raw = args.input.read_bytes()
    model = json.loads(raw)
    if model.get("id") != "TA01-EXTENDED-DRY-SSRM-V1" or len(model.get("materials", [])) != 3:
        raise ValueError("Entrada TA-01 SSRM desconocida")
    surface, domain, bands, ground = build_geometry(model)
    polygons = [{"coords": list(band.exterior.coords), "mat_id": index}
                for index, band in enumerate(bands)]
    mesh = build_mesh_from_polygons(polygons, target_size=args.mesh_size, element_type="tri6")
    if not len(mesh["elements"]) or any(kind != 6 for kind in mesh["element_types"]):
        raise ValueError("La malla SSRM debe contener solamente triángulos cuadráticos")
    slope_data = {
        "unit_system": "si", "gamma_water": 9.81, "ground_surface": ground,
        "domain_polygon": domain, "polygons": polygons, "side_bc": "rollers",
        "materials": [{"name": item["id"], "option": "mc", "u": "none", **{key: item[key] for key in ("c", "phi", "E", "nu", "gamma")}}
                      for item in model["materials"]],
    }
    fem_data = build_fem_data(slope_data, mesh)
    result = solve_ssrm(fem_data, F_min=0.5, F_max=3.0, tolerance=args.tolerance,
                        failure_criterion="hybrid", capture_failure_state=False)
    factor = result.get("FS")
    if not result.get("converged") or result.get("inconclusive") or not isinstance(factor, (int, float)):
        raise RuntimeError(f"SSRM externo inconcluso: {result.get('error') or result.get('note')}")
    report = {
        "id": "EXTERNAL-SSRM-TA01-EXTENDED-DRY-V1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "scientificStatus": "SSRM_EXTERNO_SECO_NO_CALIBRADO",
        "source": {"input": str(args.input), "inputSha256": hashlib.sha256(raw).hexdigest()},
        "solver": {"name": "XSLOPE", "version": "0.5.2", "method": "Mohr-Coulomb elastoplástico SSRM", "failureCriterion": "hybrid", "elementOrder": "tri6"},
        "case": {"nodeCount": len(mesh["nodes"]), "elementCount": len(mesh["elements"]), "meshSizeM": args.mesh_size,
                 "materialZones": [item["id"] for item in model["materials"]], "domainAreaM2": domain.area,
                 "surfacePoints": len(surface), "dry": True},
        "result": {"factorOfSafety": factor, "finalInterval": result.get("final_interval")},
        "limitation": model["limitation"] + " Un único tamaño de malla tampoco demuestra convergencia espacial."
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(args.output), "factorOfSafety": factor, "nodeCount": len(mesh["nodes"]), "elementCount": len(mesh["elements"])}, indent=2))


if __name__ == "__main__":
    main()
