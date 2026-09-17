#!/usr/bin/env python3
"""Resume corridas SSRM externas de TA-01 hechas con distintos tamaños de malla."""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("runs", type=Path, nargs="+", help="Reportes de validate-ta01-external-ssrm.py")
    parser.add_argument("--output", type=Path, default=Path("data/validation/ta01-external-ssrm-mesh-sensitivity.json"))
    args = parser.parse_args()
    if len(args.runs) < 3:
        raise ValueError("Se requieren al menos tres tamaños de malla")
    reports = [json.loads(path.read_text(encoding="utf-8")) for path in args.runs]
    hashes = {report["source"]["inputSha256"] for report in reports}
    versions = {report["solver"]["version"] for report in reports}
    criteria = {report["solver"]["failureCriterion"] for report in reports}
    sizes = [report["case"]["meshSizeM"] for report in reports]
    if len(hashes) != 1 or versions != {"0.5.2"} or criteria != {"hybrid"} or len(set(sizes)) != len(sizes):
        raise ValueError("Las corridas no comparten entrada, versión/criterio o tamaño de malla único")
    rows = sorted(({
        "meshSizeM": report["case"]["meshSizeM"],
        "nodeCount": report["case"]["nodeCount"],
        "elementCount": report["case"]["elementCount"],
        "factorOfSafety": report["result"]["factorOfSafety"],
        "finalInterval": report["result"]["finalInterval"],
    } for report in reports), key=lambda row: row["meshSizeM"], reverse=True)
    factors = [row["factorOfSafety"] for row in rows]
    widest_interval = max(row["finalInterval"][1] - row["finalInterval"][0] for row in rows)
    summary = {
        "id": "TA01-EXTERNAL-SSRM-MESH-SENSITIVITY-V1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "scientificStatus": "SENSIBILIDAD_DE_MALLA_SSRM_EXTERNO_SECO_NO_CALIBRADO",
        "inputSha256": hashes.pop(),
        "solver": {"name": "XSLOPE", "version": "0.5.2", "failureCriterion": "hybrid", "elementOrder": "tri6"},
        "runs": rows,
        "factorOfSafetySpread": max(factors) - min(factors),
        "maximumFinalIntervalWidth": widest_interval,
        "limitation": "Tres mallas cuya dispersión es comparable al ancho de un intervalo SSRM son una comprobación preliminar, no una demostración matemática de convergencia. Falta variar dominio/contornos y comprobar presiones de poros transitorias y datos de campo."
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(args.output), "factorOfSafetySpread": summary["factorOfSafetySpread"]}, indent=2))


if __name__ == "__main__":
    main()
