from contextlib import asynccontextmanager
from typing import Annotated
import importlib.util
import json
import re
import sqlite3
from fastapi import FastAPI, HTTPException, Request, Query, Path as ApiPath
from fastapi.responses import FileResponse
from . import jobs
from .data import ExperimentConfig, describe_dataset, prepare
from .training import LABELS

JobId = Annotated[str, ApiPath(pattern=r"^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$")]


@asynccontextmanager
async def lifespan(app):
    jobs.initialize(recover=True)
    yield
    jobs.shutdown()


app = FastAPI(title="Century Research Lab", version="0.1.0", lifespan=lifespan)


@app.middleware("http")
async def local_writes(request: Request, call_next):
    # Local laboratory, not an authenticated public service. Reject foreign browser origins.
    if request.method not in {"GET", "HEAD", "OPTIONS"}:
        origin = request.headers.get("origin")
        if origin and origin not in {"http://127.0.0.1:3001", "http://localhost:3001", "http://127.0.0.1:8001", "http://localhost:8001"}:
            from fastapi.responses import JSONResponse
            return JSONResponse({"detail": "Origen no autorizado para modificar experimentos"}, status_code=403)
    return await call_next(request)


@app.get("/api/health")
def health():
    return {"application": "century-research-lab", "status": "ok", "tensorflow": importlib.util.find_spec("tensorflow") is not None, "models": LABELS,
            "default_config": ExperimentConfig().model_dump(), "max_concurrent_jobs": 1}


@app.get("/api/dataset")
def dataset(sensor: str | None = None, start: str | None = None, end: str | None = None, lag: int = Query(2, ge=2, le=9)):
    try:
        return describe_dataset(sensor, start, end, lag)
    except ValueError as error:
        raise HTTPException(422, str(error))
    except FileNotFoundError:
        raise HTTPException(503, "Falta el Data.zip público. Consulte el README de la app.")


@app.post("/api/preview")
def preview(config: ExperimentConfig, sensor: str | None = None):
    try:
        from .training import training_folds
        sets, audit, cleaned = prepare(config)
        folds = training_folds(config, sets)
        from .data import observations, json_records
        raw, _ = observations()
        sensor = sensor or sorted(raw.sensor.unique())[0]
        if sensor not in set(raw.sensor):
            raise ValueError("Prisma no encontrado")
        before = raw[raw.sensor == sensor][["date", "rain"]].rename(columns={"rain": "rain_before"})
        after = cleaned[cleaned.sensor == sensor][["date", "movement", "rain", "rain_imputed"]]
        merged = after.merge(before, on="date").sort_values("date")
        merged["partition"] = merged.date.apply(lambda d: "train" if d.strftime("%Y-%m-%d") <= config.train_end else "validation" if d.strftime("%Y-%m-%d") <= config.validation_end else "test" if d.strftime("%Y-%m-%d") <= config.test_end else "outside")
        return {**audit, "sensor": sensor, "series": json_records(merged),
                "folds": [{"train": len(a), "validation": len(b), "train_end": max(r["date"] for r in a),
                           "validation_start": min(r["date"] for r in b)} for a, b in folds]}
    except ValueError as error:
        raise HTTPException(422, str(error))


@app.get("/api/experiments")
def experiments():
    jobs.refresh()
    return jobs.list_jobs()


@app.post("/api/experiments", status_code=202)
def create_experiment(config: ExperimentConfig):
    try:
        # Validate before spawning. Avoid accepted jobs that cannot make temporal folds.
        preview(config)
        return jobs.create(config)
    except ValueError as error:
        raise HTTPException(409, str(error))


def require_job(job_id):
    jobs.refresh()
    row = jobs.get(job_id)
    if not row:
        raise HTTPException(404, "Experimento no encontrado")
    return row


@app.get("/api/experiments/{job_id}")
def experiment(job_id: JobId):
    return require_job(job_id)


@app.post("/api/experiments/{job_id}/cancel")
def cancel(job_id: JobId):
    require_job(job_id)
    return jobs.cancel(job_id)


@app.get("/api/experiments/{job_id}/report")
def report(job_id: JobId):
    row = require_job(job_id)
    if row["status"] != "completed":
        raise HTTPException(409, "El experimento aún no tiene un informe completo")
    return json.loads((jobs.RUNTIME/job_id/"report.json").read_text())


@app.get("/api/experiments/{job_id}/artifacts")
def artifacts(job_id: JobId):
    row = require_job(job_id)
    if row["status"] != "completed":
        return []
    folder = jobs.RUNTIME/job_id
    return [*json.loads((folder/"artifacts.json").read_text()),
            {"name": "artifacts.json", "bytes": (folder/"artifacts.json").stat().st_size},
            {"name": "experiment.zip", "bytes": (folder/"experiment.zip").stat().st_size}]


@app.get("/api/experiments/{job_id}/files/{filename}")
def download(job_id: JobId, filename: str):
    row = require_job(job_id)
    allowed = {"worker.log"} if row["status"] in {"failed", "interrupted", "cancelled"} else set()
    allowed |= {r["name"] for r in artifacts(job_id)}
    if filename not in allowed or not re.fullmatch(r"[a-zA-Z0-9_.-]+", filename):
        raise HTTPException(404, "Archivo no disponible")
    path = jobs.RUNTIME/job_id/filename
    if not path.is_file():
        raise HTTPException(404, "Archivo no encontrado")
    return FileResponse(path, filename=filename, media_type="application/octet-stream")

