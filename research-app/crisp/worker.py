import os
import sys
import traceback
from backend import jobs
from .config import CrispConfig
from .engine import run


def main():
    job_id, owner = sys.argv[1], int(sys.argv[2])
    def check():
        row = jobs.get(job_id)
        if not row or row["status"] not in {"queued", "running"} or os.getppid() != owner:
            raise RuntimeError("Entrenamiento cancelado o aplicación cerrada")
    def progress(value, message):
        check()
        jobs.update(job_id, progress=value, message=message)
    try:
        jobs.update(job_id, status="running", message="Preparando CRISP-DM con datos reales")
        run(CrispConfig(**jobs.get(job_id)["config"]), jobs.RUNTIME/job_id, check, progress)
        check()
        jobs.update(job_id, status="completed", progress=100, message="Evaluación, modelos y reportes terminados")
    except Exception as error:
        traceback.print_exc()
        row = jobs.get(job_id)
        if row and row["status"] not in {"cancelled", "interrupted"}:
            jobs.update(job_id, status="failed", message=str(error)[:500])


if __name__ == "__main__":
    main()
