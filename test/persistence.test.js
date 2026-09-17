import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { OperationalRepository } from "../src/persistence.js";

test("SQLite conserva telemetría, modelos, geometría y alertas entre aperturas", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "sslope-db-"));
  const file = path.join(directory, "test.sqlite");
  try {
    let repository = new OperationalRepository(file);
    const reading = { sensorId: "EXT-01", timestamp: "2026-09-15T00:00:00.000Z", displacementMm: 2.4, porePressureKpa: 80, rainfallMmH: 3, qualityFlag: "VALID", source: "test" };
    repository.recordTelemetry(reading);
    repository.recordGeometry({ id: "GEO-1", createdAt: "2026-09-15T00:00:01.000Z", source: "IMPORTED_MODEL", scientificStatus: "TEST" });
    repository.registerModel({ id: "MODEL-1", scientificStatus: "TEST", architecture: { horizonHours: 1 } }, "LSTM");
    repository.recordAlert({ id: "ALT-1", createdAt: "2026-09-15T00:00:02.000Z", level: "ALERTA", sensorId: "EXT-01", message: "Prueba" });
    repository.recordEvent({ id: "EVENT-1", createdAt: "2026-09-15T00:00:03.000Z", scientificStatus: "TEST" }, "WEATHER");
    repository.recordExperiment({ id: "EXPERIMENT-1", generatedAt: "2026-09-15T00:00:04.000Z", scientificStatus: "TEST" });
    repository.recordFemRun({
      id: "FEM-1", generatedAt: "2026-09-15T00:00:05.000Z",
      method: { id: "FEM-TEST", scientificStatus: "TEST" }, summary: { converged: true }, scenario: {}, rainfall: {},
      lstmForecasts: { 1: { id: "FORECAST-1", generatedAt: "2026-09-15T00:00:06.000Z", modelId: "MODEL-1", runId: "FEM-1", horizonHours: 1, predictedDisplacementMm: 2.5, scientificStatus: "TEST" } },
      physicsGuidedForecasts: {}
    });
    assert.equal(repository.status().counts.telemetry, 3);
    assert.equal(repository.status().counts.sensors, 1);
    repository.close();

    repository = new OperationalRepository(file);
    assert.deepEqual(repository.loadRecentReadings(1), [reading]);
    assert.deepEqual(repository.loadSensors(), [{ sensorId: "EXT-01", firstSeen: reading.timestamp, lastSeen: reading.timestamp, latestSource: "test", readingCount: 1 }]);
    assert.equal(repository.latestGeometry().id, "GEO-1");
    assert.equal(repository.loadRecentAlerts(1)[0].id, "ALT-1");
    assert.equal(repository.status().counts.model_versions, 1);
    assert.equal(repository.status().counts.fem_runs, 1);
    assert.equal(repository.status().counts.forecasts, 1);
    assert.equal(repository.status().counts.operational_events, 1);
    assert.equal(repository.status().counts.experiments, 1);
    repository.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("la escritura de telemetría por lote es atómica", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "sslope-db-batch-"));
  const file = path.join(directory, "test.sqlite");
  const repository = new OperationalRepository(file);
  try {
    const valid = { sensorId: "EXT-01", timestamp: "2026-09-15T00:00:00.000Z", displacementMm: 2.4, porePressureKpa: 80, rainfallMmH: 3, qualityFlag: "VALID", source: "test" };
    const invalid = { ...valid, sensorId: { toString() { throw new Error("fallo inducido"); } }, timestamp: "2026-09-15T01:00:00.000Z" };
    assert.throws(() => repository.recordTelemetryBatch([valid, invalid]), /fallo inducido/);
    assert.equal(repository.status().counts.telemetry, 0);
    assert.deepEqual(repository.recordTelemetryBatch([valid]), { readingCount: 1, variableCount: 3 });
    assert.equal(repository.status().counts.telemetry, 3);
  } finally {
    repository.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
