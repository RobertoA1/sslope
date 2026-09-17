#!/usr/bin/env python3
"""Reproduce Griffiths–Lane ejemplo 1 con XSLOPE; NO valida el FEM propio.

Requiere XSLOPE 0.5.2 con extra FEM y la muestra oficial extraída de
https://xslope.org/en/latest/fem/files/xslope_griffiths1.xslz
El XLSX y su *_mesh.json deben estar juntos.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from datetime import datetime, timezone
from importlib.metadata import version
from pathlib import Path


SAMPLE_URL = "https://xslope.org/en/latest/fem/files/xslope_griffiths1.xslz"
PAPER_URL = "https://inside.mines.edu/~vgriffit/pubs/All_J_Pubs/41.pdf"


def check_sample(slope_data: dict) -> None:
    if slope_data["unit_system"] != "imperial":
        raise ValueError("La muestra debe declarar unidades imperiales: ft, psf, pcf")
    if len(slope_data["materials"]) != 1:
        raise ValueError("El ejemplo 1 debe tener un solo material homogéneo")
    material = slope_data["materials"][0]
    expected = {"gamma": 125.0, "c": 312.5, "phi": 20.0, "E": 2_088_500.0, "nu": 0.3}
    for key, value in expected.items():
        if abs(material[key] - value) > 1e-6:
            raise ValueError(f"Valor inesperado de {key}: {material[key]}")
    if material["u"] != "none":
        raise ValueError("El ejemplo publicado es seco")
    coords = list(slope_data["ground_surface"].coords)
    if coords != [(0.0, 50.0), (60.0, 50.0), (160.0, 0.0)]:
        raise ValueError(f"Geometría inesperada: {coords}")
    mesh = slope_data["mesh"]
    if mesh is None or len(mesh["nodes"]) < 100 or len(mesh["elements"]) < 100:
        raise ValueError("Falta una malla externa suficientemente definida")
    if any(element_type not in (6, 8, 9) for element_type in mesh["element_types"]):
        raise ValueError("SSRM requiere elementos cuadráticos para evitar bloqueo volumétrico")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True, help="XLSX oficial extraído, junto a su *_mesh.json")
    parser.add_argument("--output", type=Path, default=Path("data/validation/external-ssrm-griffiths-lane.json"))
    parser.add_argument("--tolerance", type=float, default=0.01)
    args = parser.parse_args()
    if args.tolerance <= 0 or args.tolerance > 0.05:
        raise ValueError("La tolerancia SSRM debe estar en (0, 0.05]")
    try:
        from xslope.fileio import load_slope_data
        from xslope.fem import build_fem_data, solve_ssrm
    except ImportError as error:
        raise SystemExit("Instala xslope[fem]==0.5.2 en un entorno Python aislado") from error
    package_version = version("xslope")
    if package_version != "0.5.2":
        raise ValueError(f"Se verificó XSLOPE 0.5.2, versión encontrada: {package_version}")
    input_path = args.input.resolve(strict=True)
    mesh_path = input_path.with_name(f"{input_path.stem}_mesh.json")
    mesh_bytes = mesh_path.read_bytes()
    slope_data = load_slope_data(str(input_path))
    check_sample(slope_data)
    fem_data = build_fem_data(slope_data, slope_data["mesh"])
    result = solve_ssrm(
        fem_data, F_min=1.0, F_max=1.8, tolerance=args.tolerance,
        failure_criterion="hybrid", capture_failure_state=False,
    )
    factor = result.get("FS")
    interval = result.get("final_interval")
    if not result.get("converged") or not isinstance(factor, (int, float)):
        raise RuntimeError(f"El SSRM externo no entregó un factor convergido: {result.get('error') or result.get('note')}")
    if result.get("inconclusive"):
        raise RuntimeError("El SSRM externo dejó ensayos inconclusos; no se acredita el benchmark")
    within_published_bracket = 1.35 <= factor < 1.40
    report = {
        "id": "EXTERNAL-SSRM-GRIFFITHS-LANE-EXAMPLE-1-V1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "scientificStatus": "BENCHMARK_PUBLICADO_REPRODUCIDO_CON_SOLVER_EXTERNO_NO_VALIDACION_FEM_TA01" if within_published_bracket else "BENCHMARK_EXTERNO_DISCREPA_NO_VALIDACION_FEM_TA01",
        "source": {
            "paper": PAPER_URL,
            "sample": SAMPLE_URL,
            "sampleInputSha256": hashlib.sha256(input_path.read_bytes()).hexdigest(),
            "sampleMeshSha256": hashlib.sha256(mesh_bytes).hexdigest(),
            "sourceUnits": "ft, psf, pcf",
        },
        "solver": {"name": "XSLOPE", "version": package_version, "method": "Mohr-Coulomb elastoplástico SSRM", "failureCriterion": "hybrid", "elementOrder": "quadratic"},
        "case": {"heightFt": 50, "slopeHorizontalToVertical": 2, "cohesionPsf": 312.5, "frictionAngleDeg": 20, "unitWeightPcf": 125, "dry": True, "nodeCount": len(fem_data["nodes"]), "elementCount": len(fem_data["elements"])},
        "published": {"lastConvergedTrial": 1.35, "firstFailedTrial": 1.40, "reportedFactorOfSafety": 1.40, "interpretation": "El artículo informa 1,4 como primer ensayo fallido en una malla de factores discretos."},
        "result": {"factorOfSafety": factor, "finalInterval": interval, "withinPublishedTrialBracket": within_published_bracket},
        "limitation": "Este resultado reproduce una referencia con XSLOPE, no con el FEM lineal propio. No valida TA-01, la lluvia, la PINN ni datos de campo."
    }
    output_path = args.output.resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(output_path), "factorOfSafety": factor, "finalInterval": interval, "withinPublishedTrialBracket": within_published_bracket}, indent=2))
    if not within_published_bracket:
        raise SystemExit("El resultado externo quedó fuera del intervalo de ensayos publicado; revisar la corrida")


if __name__ == "__main__":
    main()
