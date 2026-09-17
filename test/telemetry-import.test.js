import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseTelemetryCsv, parseTelemetryFile } from "../public/telemetry-import.js";
import { TwinStore } from "../src/store.js";
import { OperationalRepository } from "../src/persistence.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("convierte CSV de telemetría con campos canónicos y comillas", () => {
  const csv = [
    "timestamp_utc,sensor_id,displacement_mm,pore_pressure_kpa,rainfall_mm_h,quality_flag,source",
    '2026-09-15T00:00:00Z,"EXT,01",2.4,80,3,VALID,inclinometer'
  ].join("\n");
  assert.deepEqual(parseTelemetryCsv(csv), [{
    timestamp: "2026-09-15T00:00:00Z",
    sensorId: "EXT,01",
    displacementMm: "2.4",
    porePressureKpa: "80",
    rainfallMmH: "3",
    qualityFlag: "VALID",
    source: "inclinometer"
  }]);
});

test("acepta JSON como lista o envoltorio readings", () => {
  const reading = { timestamp: "2026-09-15T00:00:00Z", sensorId: "EXT-01", displacementMm: 2.4, porePressureKpa: 80, rainfallMmH: 3 };
  assert.deepEqual(parseTelemetryFile(JSON.stringify([reading]), "readings.json"), [reading]);
  assert.deepEqual(parseTelemetryFile(JSON.stringify({ readings: [reading] }), "readings.json"), [reading]);
});

test("rechaza CSV sin columnas requeridas", () => {
  assert.throws(() => parseTelemetryCsv("timestamp_utc,sensor_id\n2026-09-15T00:00:00Z,EXT-01"), /Faltan columnas requeridas/);
});

test("la plantilla descargable contiene 24 lecturas demostrativas válidas", async () => {
  const text = await readFile(path.join(projectRoot, "public", "samples", "telemetry-import-template.csv"), "utf8");
  const readings = parseTelemetryFile(text, "telemetry-import-template.csv");
  assert.equal(readings.length, 24);
  assert.ok(readings.every((reading) => reading.source === "template-example" && reading.qualityFlag === "SIMULATED_TEMPLATE"));
  assert.equal(new TwinStore().addReadings(readings).acceptedCount, 24);
});

test("el almacén valida el lote completo antes de modificar la memoria", () => {
  const store = new TwinStore();
  const before = store.getReadings(500);
  const valid = { timestamp: "2026-09-15T00:00:00Z", sensorId: "EXT-99", displacementMm: 2.4, porePressureKpa: 80, rainfallMmH: 3, source: "inclinometer" };
  assert.throws(() => store.addReadings([valid, { ...valid, timestamp: "no-es-fecha" }]), /Lectura 2/);
  assert.deepEqual(store.getReadings(500), before);
  const result = store.addReadings([{ ...valid, timestamp: "2026-09-15T02:00:00Z" }, valid]);
  assert.equal(result.acceptedCount, 2);
  assert.equal(result.firstTimestamp, "2026-09-15T00:00:00.000Z");
  assert.equal(result.lastTimestamp, "2026-09-15T02:00:00.000Z");
  assert.equal(store.getReadings(10, "EXT-99").length, 2);
  assert.equal(store.getReadings(10, "EXT-01").length, 10);
  assert.ok(store.getSensors().some((sensor) => sensor.sensorId === "EXT-99" && sensor.readingCount === 2));
});

test("la serie seleccionada se recupera por sensor tras reiniciar y no mezcla demostración con campo", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "sslope-sensors-"));
  const file = path.join(directory, "sensors.sqlite");
  try {
    let repository = new OperationalRepository(file);
    let store = new TwinStore({ repository });
    const makeReading = (sensorId, hour, source, displacementMm) => ({
      sensorId,
      timestamp: new Date(Date.UTC(2026, 8, 16, hour)).toISOString(),
      displacementMm, porePressureKpa: 80, rainfallMmH: 0, qualityFlag: "VALID", source
    });
    store.addReadings([
      makeReading("SENSOR-A", 0, "inclinometer", 1),
      makeReading("SENSOR-B", 1, "inclinometer", 30),
      makeReading("SENSOR-A", 2, "inclinometer", 2),
      makeReading("SENSOR-A", 3, "template-example", 99)
    ]);
    assert.deepEqual(store.getReadings(10, "SENSOR-A").map((reading) => reading.displacementMm), [99]);
    assert.deepEqual(store.getReadings(10, "SENSOR-B").map((reading) => reading.displacementMm), [30]);
    repository.close();
    repository = new OperationalRepository(file);
    store = new TwinStore({ repository });
    assert.equal(store.getSensors().find((sensor) => sensor.sensorId === "SENSOR-A").readingCount, 3);
    assert.deepEqual(store.getReadings(10, "SENSOR-A").map((reading) => reading.displacementMm), [99]);
    assert.equal(store.getTwinStatus("SENSOR-B").monitoring.latestReadingAt, makeReading("SENSOR-B", 1, "inclinometer", 30).timestamp);
    repository.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("restablecer un escenario descarta la simulación de lluvia de la vista activa", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "sslope-reset-"));
  const repository = new OperationalRepository(path.join(directory, "scenario.sqlite"));
  try {
    const store = new TwinStore({ repository });
    store.simulateRainfall({ intensityMmH: 50, durationHours: 6 });
    store.loadScenario("normal");
    const active = store.getReadings(120, "EXT-01");
    assert.equal(active.length, 72);
    assert.ok(active.every((reading) => reading.source === "synthetic"));
  } finally {
    repository.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
