"""Persistent local runs with one bounded CPU worker; no task broker required."""
from pathlib import Path
from datetime import datetime, timezone
from threading import Lock
import os
import json
import sqlite3
import subprocess
import sys
import uuid

APP_ROOT = Path(__file__).resolve().parents[1]
RUNTIME = Path(os.environ.get("CENTURY_LAB_RUNTIME", str(APP_ROOT/"runtime"))).resolve()
DB = RUNTIME/"experiments.sqlite3"
PROCESSES = {}
LOCK = Lock()


def connect():
    RUNTIME.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DB, timeout=15)
    db.row_factory = sqlite3.Row
    return db


def initialize(recover=False):
    with connect() as db:
        db.execute("CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, name TEXT, created TEXT, status TEXT, progress REAL, message TEXT, config TEXT)")
        if recover:
            db.execute("UPDATE jobs SET status='interrupted', message='El servidor se reinició. Resultados previos conservados.' WHERE status IN ('running','queued')")


def unpack(row):
    if row is None:
        return None
    value = dict(row)
    value["config"] = json.loads(value["config"])
    return value


def get(job_id):
    with connect() as db:
        return unpack(db.execute("SELECT * FROM jobs WHERE id=?", (job_id,)).fetchone())


def list_jobs():
    with connect() as db:
        return [unpack(row) for row in db.execute("SELECT * FROM jobs ORDER BY created DESC LIMIT 100")]


def update(job_id, status=None, progress=None, message=None):
    changes = {k: v for k, v in {"status": status, "progress": progress, "message": message}.items() if v is not None}
    with connect() as db:
        if changes:
            db.execute(f"UPDATE jobs SET {', '.join(k+'=?' for k in changes)} WHERE id=?", (*changes.values(), job_id))


def refresh():
    for job_id, process in list(PROCESSES.items()):
        if process.poll() is not None:
            row = get(job_id)
            if row and row["status"] in {"queued", "running"}:
                update(job_id, status="failed", message="El proceso terminó inesperadamente. Consulte worker.log.")
            PROCESSES.pop(job_id, None)


def create(config):
    with LOCK:
        refresh()
        job_id = str(uuid.uuid4())
        with connect() as db:
            db.execute("BEGIN IMMEDIATE")
            if db.execute("SELECT COUNT(*) FROM jobs WHERE status IN ('queued','running')").fetchone()[0]:
                raise ValueError("Ya hay un entrenamiento activo. Espere o cancélelo.")
            folder = RUNTIME/job_id
            folder.mkdir()
            db.execute("INSERT INTO jobs VALUES (?,?,?,?,?,?,?)", (job_id, config.name, datetime.now(timezone.utc).isoformat(),
                       "queued", 0, "Preparando datos reales", config.model_dump_json()))
        try:
            with (folder/"worker.log").open("w") as log:
                PROCESSES[job_id] = subprocess.Popen([sys.executable, "-m", "backend.worker", job_id, str(os.getpid())],
                    cwd=APP_ROOT, stdout=log, stderr=log, env={**os.environ, "CENTURY_LAB_RUNTIME": str(RUNTIME)},
                    stdin=subprocess.DEVNULL)
        except Exception:
            update(job_id, status="failed", message="No se pudo iniciar el entrenamiento")
            raise
        return get(job_id)


def cancel(job_id):
    with LOCK:
        refresh()
        row = get(job_id)
        if row is None:
            raise KeyError(job_id)
        if row["status"] not in {"queued", "running"}:
            return row
        update(job_id, status="cancelled", message="Cancelado por el usuario. No se declara un ganador.")
        process = PROCESSES.pop(job_id, None)
        if process is not None and process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)
        return get(job_id)


def shutdown():
    for job_id in list(PROCESSES):
        cancel(job_id)
