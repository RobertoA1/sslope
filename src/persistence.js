import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const json = (value) => JSON.stringify(value ?? null);
const parsed = (value, fallback = null) => {
  try { return JSON.parse(value); } catch { return fallback; }
};

export class OperationalRepository {
  constructor(filePath) {
    this.filePath = path.resolve(filePath);
    mkdirSync(path.dirname(this.filePath), { recursive: true });
    this.db = new DatabaseSync(this.filePath);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS telemetry (
        record_id TEXT NOT NULL,
        timestamp_utc TEXT NOT NULL,
        sensor_id TEXT NOT NULL,
        variable TEXT NOT NULL,
        value REAL NOT NULL,
        unit TEXT NOT NULL,
        quality_flag TEXT NOT NULL,
        source TEXT NOT NULL,
        ingested_at TEXT NOT NULL,
        original_json TEXT NOT NULL,
        PRIMARY KEY (record_id, variable)
      );
      CREATE INDEX IF NOT EXISTS telemetry_time_idx ON telemetry(timestamp_utc);
      CREATE INDEX IF NOT EXISTS telemetry_sensor_time_idx ON telemetry(sensor_id, timestamp_utc);
      CREATE TABLE IF NOT EXISTS sensors (
        sensor_id TEXT PRIMARY KEY,
        first_seen TEXT NOT NULL,
        last_seen TEXT NOT NULL,
        latest_source TEXT NOT NULL,
        metadata_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS geometry_versions (
        id TEXT PRIMARY KEY, created_at TEXT NOT NULL, source TEXT NOT NULL,
        scientific_status TEXT NOT NULL, payload_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS fem_runs (
        id TEXT PRIMARY KEY, generated_at TEXT NOT NULL, method_id TEXT NOT NULL,
        scientific_status TEXT NOT NULL, summary_json TEXT NOT NULL, provenance_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS model_versions (
        id TEXT PRIMARY KEY, registered_at TEXT NOT NULL, kind TEXT NOT NULL,
        scientific_status TEXT NOT NULL, horizon_hours INTEGER, metadata_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS forecasts (
        id TEXT PRIMARY KEY, generated_at TEXT NOT NULL, model_id TEXT NOT NULL,
        run_id TEXT, horizon_hours INTEGER NOT NULL, prediction_mm REAL,
        scientific_status TEXT NOT NULL, payload_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS alerts (
        id TEXT PRIMARY KEY, created_at TEXT NOT NULL, level TEXT NOT NULL,
        sensor_id TEXT NOT NULL, message TEXT NOT NULL, payload_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS operational_events (
        id TEXT PRIMARY KEY, occurred_at TEXT NOT NULL, category TEXT NOT NULL,
        scientific_status TEXT NOT NULL, payload_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS experiments (
        id TEXT PRIMARY KEY, generated_at TEXT NOT NULL, scientific_status TEXT NOT NULL,
        payload_json TEXT NOT NULL
      );
      INSERT OR IGNORE INTO sensors (sensor_id, first_seen, last_seen, latest_source, metadata_json)
        SELECT sensor_id, MIN(timestamp_utc), MAX(timestamp_utc), MIN(source), '{}'
        FROM telemetry GROUP BY sensor_id;
    `);
    this.insertTelemetry = this.db.prepare(`INSERT OR REPLACE INTO telemetry
      (record_id,timestamp_utc,sensor_id,variable,value,unit,quality_flag,source,ingested_at,original_json)
      VALUES (?,?,?,?,?,?,?,?,?,?)`);
    this.upsertSensor = this.db.prepare(`INSERT INTO sensors
      (sensor_id,first_seen,last_seen,latest_source,metadata_json) VALUES (?,?,?,?,?)
      ON CONFLICT(sensor_id) DO UPDATE SET
        first_seen=MIN(first_seen,excluded.first_seen),
        last_seen=MAX(last_seen,excluded.last_seen),
        latest_source=CASE WHEN excluded.last_seen >= last_seen THEN excluded.latest_source ELSE latest_source END`);
  }

  recordTelemetry(reading) {
    return this.recordTelemetryBatch([reading]);
  }

  recordTelemetryBatch(readings) {
    if (!Array.isArray(readings) || !readings.length) return { readingCount: 0, variableCount: 0 };
    const ingestedAt = new Date().toISOString();
    let variableCount = 0;
    this.db.exec("BEGIN IMMEDIATE");
    try {
      for (const reading of readings) {
        const timestamp = String(reading.timestamp);
        const sensorId = String(reading.sensorId);
        const source = String(reading.source || "unknown");
        const quality = String(reading.qualityFlag || "UNSPECIFIED");
        const recordId = `${sensorId}|${timestamp}|${source}`;
        const fields = [
          ["displacement", reading.displacementMm, "mm"],
          ["pore_pressure", reading.porePressureKpa, "kPa"],
          ["rainfall_intensity", reading.rainfallMmH, "mm/h"]
        ].filter(([, value]) => Number.isFinite(Number(value)));
        for (const [variable, value, unit] of fields) {
          this.insertTelemetry.run(recordId, timestamp, sensorId, variable, Number(value), unit, quality, source, ingestedAt, json(reading));
          variableCount++;
        }
        this.upsertSensor.run(sensorId, timestamp, timestamp, source, "{}");
      }
      this.db.exec("COMMIT");
      return { readingCount: readings.length, variableCount };
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  loadRecentReadings(limit = 500, sensorId = null, sourceMode = null) {
    const count = Math.max(1, Number(limit) || 500);
    const demoSources = "'synthetic','rain-simulation','historical-rain-replay','template-example','api','api-unverified','unknown'";
    const modeClause = sourceMode === "demo" ? `AND source IN (${demoSources})` : sourceMode === "declared" ? `AND source NOT IN (${demoSources})` : "";
    const rows = sensorId
      ? this.db.prepare(`SELECT original_json FROM telemetry WHERE sensor_id=? ${modeClause} GROUP BY record_id ORDER BY timestamp_utc DESC LIMIT ?`).all(sensorId, count)
      : this.db.prepare(`SELECT original_json FROM telemetry GROUP BY record_id ORDER BY timestamp_utc DESC LIMIT ?`).all(count);
    return rows.map((row) => parsed(row.original_json)).filter(Boolean).reverse();
  }

  loadSensors() {
    const rows = this.db.prepare(`SELECT s.sensor_id AS sensorId, s.first_seen AS firstSeen,
      s.last_seen AS lastSeen, s.latest_source AS latestSource,
      COUNT(DISTINCT t.record_id) AS readingCount
      FROM sensors s LEFT JOIN telemetry t ON t.sensor_id=s.sensor_id
      GROUP BY s.sensor_id ORDER BY s.last_seen DESC`).all();
    return rows.map((row) => ({ ...row }));
  }

  recordGeometry(entry) {
    this.db.prepare(`INSERT OR REPLACE INTO geometry_versions VALUES (?,?,?,?,?)`).run(entry.id, entry.createdAt || new Date().toISOString(), entry.source, entry.scientificStatus, json(entry));
  }

  latestGeometry() {
    const row = this.db.prepare(`SELECT payload_json FROM geometry_versions ORDER BY created_at DESC LIMIT 1`).get();
    return row ? parsed(row.payload_json) : null;
  }

  registerModel(artifact, kind) {
    this.db.prepare(`INSERT OR REPLACE INTO model_versions VALUES (?,?,?,?,?,?)`).run(
      artifact.id, new Date().toISOString(), kind, artifact.scientificStatus || "NO_ESPECIFICADO",
      artifact.architecture?.horizonHours ?? null,
      json({
        id: artifact.id, method: artifact.method, scope: artifact.scope,
        architecture: artifact.architecture, dataset: artifact.dataset,
        metrics: artifact.metrics?.test, pde: artifact.pde,
        training: artifact.training, verification: artifact.verification
      })
    );
  }

  recordFemRun(run) {
    const forecasts = { lstm: run.lstmForecasts, physicsGuided: run.physicsGuidedForecasts };
    this.db.prepare(`INSERT OR REPLACE INTO fem_runs VALUES (?,?,?,?,?,?)`).run(run.id, run.generatedAt, run.method.id, run.method.scientificStatus, json(run.summary), json({ rainfall: run.rainfall, scenario: run.scenario, forecasts }));
    Object.values(run.lstmForecasts || {}).forEach((forecast) => this.recordForecast(forecast));
    Object.values(run.physicsGuidedForecasts || {}).forEach((forecast) => this.recordForecast(forecast));
  }

  recordForecast(forecast) {
    const id = forecast.id || `FORECAST-${forecast.sensorId}-${forecast.generatedAt}-${forecast.horizonHours}`;
    this.db.prepare(`INSERT OR REPLACE INTO forecasts VALUES (?,?,?,?,?,?,?,?)`).run(
      id, forecast.generatedAt, forecast.modelId || forecast.method?.id || "REDUCED_HYBRID",
      forecast.runId || null, forecast.horizonHours, forecast.predictedDisplacementMm,
      forecast.scientificStatus || "PROTOTIPO_NO_OPERACIONAL", json(forecast)
    );
  }

  recordAlert(alert) {
    this.db.prepare(`INSERT OR REPLACE INTO alerts VALUES (?,?,?,?,?,?)`).run(alert.id, alert.createdAt, alert.level, alert.sensorId, alert.message, json(alert));
  }

  loadRecentAlerts(limit = 50) {
    return this.db.prepare(`SELECT payload_json FROM alerts ORDER BY created_at DESC LIMIT ?`).all(Math.max(1, Number(limit) || 50)).map((row) => parsed(row.payload_json)).filter(Boolean);
  }

  recordEvent(event, category = "WEATHER") {
    this.db.prepare(`INSERT OR REPLACE INTO operational_events VALUES (?,?,?,?,?)`).run(event.id, event.createdAt || new Date().toISOString(), category, event.scientificStatus || "NO_ESPECIFICADO", json(event));
  }

  recordExperiment(experiment) {
    this.db.prepare(`INSERT OR REPLACE INTO experiments VALUES (?,?,?,?)`).run(experiment.id, experiment.generatedAt || new Date().toISOString(), experiment.scientificStatus || "MVP_NO_VALIDADO", json(experiment));
  }

  status() {
    const tables = ["sensors", "telemetry", "geometry_versions", "fem_runs", "model_versions", "forecasts", "alerts", "operational_events", "experiments"];
    return {
      engine: "SQLite",
      filePath: this.filePath,
      journalMode: this.db.prepare("PRAGMA journal_mode").get().journal_mode,
      counts: Object.fromEntries(tables.map((table) => [table, this.db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count])),
      scientificStatus: "PERSISTENCIA_LOCAL_DE_PROTOTIPO_NO_REPLICA_NO_CIFRADA"
    };
  }

  close() { this.db.close(); }
}
