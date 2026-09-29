import os
import sys
import traceback
from . import jobs
from .data import ExperimentConfig
from .training import run_experiment


def main():
    job_id, owner = sys.argv[1], int(sys.argv[2])

    def check():
        row = jobs.get(job_id)
        if not row or row["status"] == "cancelled" or os.getppid() != owner:
            raise RuntimeError("Entrenamiento cancelado o servidor cerrado")

    def progress(value, message):
        check()
        row = jobs.get(job_id)
        jobs.update(job_id, progress=max(row["progress"], min(float(value), 99)), message=message)

    try:
        jobs.update(job_id, status="running", message="Preparando particiones temporales")
        run_experiment(ExperimentConfig(**jobs.get(job_id)["config"]), jobs.RUNTIME/job_id, check, progress)
        check()
        jobs.update(job_id, status="completed", progress=100, message="Comparación terminada. Resultados y modelos disponibles.")
    except Exception as error:
        traceback.print_exc()
        row = jobs.get(job_id)
        if row and row["status"] not in {"cancelled", "interrupted"}:
            jobs.update(job_id, status="failed", message=str(error)[:500])


if __name__ == "__main__":
    main()
