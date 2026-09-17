#!/usr/bin/env python3
"""Resume sensibilidad local de malla de ensayos hidráulicos TA-01 aceptados por masa."""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("runs", type=Path, nargs="+")
    parser.add_argument("--output", type=Path, default=Path("data/validation/ta01-transient-seep-mesh-sensitivity.json"))
    args = parser.parse_args()
    if len(args.runs) < 3:
        raise ValueError("Se requieren al menos tres mallas")
    reports = [json.loads(path.read_text(encoding="utf-8")) for path in args.runs]
    hashes = {report["source"]["geometryInputSha256"] for report in reports}
    rainfall = {report["assumptions"]["rainfallMmIn24Hours"] for report in reports}
    flux = {report["assumptions"]["appliedInfiltrationFluxMPerHour"] for report in reports}
    points = {(report["mesh"]["observationPointM"]["x"], report["mesh"]["observationPointM"]["y"]) for report in reports}
    if len(hashes) != 1 or len(rainfall) != 1 or len(flux) != 1 or len(points) != 1:
        raise ValueError("Las corridas no comparten geometría, lluvia, flujo o punto de observación")
    rows = []
    for report in reports:
        if report["assumptions"]["unsaturatedModel"] != "vg" or not report["result"]["converged"]:
            raise ValueError("Solo se resumen corridas van Genuchten convergidas")
        frames = {frame["hour"]: frame for frame in report["result"]["frames"]}
        balance = report["result"]["massBalance"]
        net, stored = balance["cumulativeInflowM2"], balance["storedChangeM2"]
        direct_closure = abs(stored - net) / max(abs(stored), abs(net), 1e-12)
        if max(direct_closure, balance["finalClosureFraction"]) > 0.05:
            raise ValueError("Una corrida no supera el cierre de masa de 5 %")
        rows.append({
            "meshSizeM": report["mesh"]["targetSizeM"],
            "nodeCount": report["mesh"]["nodeCount"],
            "elementCount": report["mesh"]["elementCount"],
            "headChange24hM": frames[24.0]["observationHeadM"] - frames[0.0]["observationHeadM"],
            "headChange48hM": frames[48.0]["observationHeadM"] - frames[0.0]["observationHeadM"],
            "directMassClosureFraction": direct_closure,
        })
    rows.sort(key=lambda row: row["meshSizeM"], reverse=True)
    if len({row["meshSizeM"] for row in rows}) != len(rows):
        raise ValueError("Tamaños de malla duplicados")
    adjacent = [{"coarseM": a["meshSizeM"], "fineM": b["meshSizeM"],
                 "absoluteHeadChange24hDifferenceM": abs(a["headChange24hM"] - b["headChange24hM"]),
                 "absoluteHeadChange48hDifferenceM": abs(a["headChange48hM"] - b["headChange48hM"])}
                for a, b in zip(rows[:-1], rows[1:])]
    report = {
        "id": "TA01-TRANSIENT-SEEP-LOCAL-MESH-SENSITIVITY-V1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "scientificStatus": "SENSIBILIDAD_LOCAL_DE_MALLA_NO_VALIDACION_DEL_CAMPO_HIDRAULICO_COMPLETO",
        "geometryInputSha256": hashes.pop(),
        "observationPointM": dict(zip(("x", "y"), points.pop())),
        "rainfallMmIn24Hours": rainfall.pop(),
        "appliedInfiltrationFluxMPerHour": flux.pop(),
        "runs": rows, "adjacentDifferences": adjacent,
        "limitation": "Compara una única carga hidráulica interpolada en (4,96) m. No prueba convergencia de toda la presión de poros, nivel freático, frontera de infiltración ni FoS. El flujo aplicado y los parámetros siguen siendo supuestos."
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(args.output), "meshSizesM": [row["meshSizeM"] for row in rows]}, indent=2))


if __name__ == "__main__":
    main()
