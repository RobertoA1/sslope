import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createForecast } from "../src/core/forecast-engine.js";
import { parseNasaPowerDailyCsv, rainfallRecordForDate, uniformHourlyProfile } from "../src/core/rainfall-history.js";
import { TwinStore } from "../src/store.js";

const sampleCsv = `-BEGIN HEADER-
NASA/POWER Source Native Resolution Daily Data
Dates (month/day/year): 01/01/2024 through 01/03/2024 in LST
Location: latitude  -10.68   longitude -76.26
elevation from MERRA-2: Average for 0.5 x 0.625 degree lat/lon region = 3994.12 meters
The value for missing source data that cannot be computed or is outside of the sources availability range: -999
parameter(s):
PRECTOTCORR     MERRA-2 Precipitation Corrected (mm/day)
-END HEADER-
YEAR,DOY,PRECTOTCORR
2024,1,0
2024,2,24
2024,3,-999`;

test("interpreta un CSV diario NASA POWER y conserva su procedencia", () => {
  const dataset = parseNasaPowerDailyCsv(sampleCsv);
  assert.equal(dataset.metadata.latitude, -10.68);
  assert.equal(dataset.metadata.longitude, -76.26);
  assert.equal(dataset.metadata.elevationM, 3994.12);
  assert.deepEqual(dataset.metadata.spatialResolutionDegrees, { latitude: 0.5, longitude: 0.625 });
  assert.equal(dataset.metadata.spatialSupport, "REGIONAL_REANALYSIS_GRID_NOT_ON_SITE_GAUGE");
  assert.equal(dataset.records.length, 2);
  assert.equal(dataset.summary.missingCount, 1);
  assert.equal(dataset.summary.recommendedDate, "2024-01-02");
  assert.deepEqual(rainfallRecordForDate(dataset, "2024-01-02"), { date: "2024-01-02", rainfallMmDay: 24 });
});

test("el archivo histórico incorporado corresponde al punto declarado de Pasco y conserva su soporte espacial", async () => {
  const csv = await readFile(new URL("../data/rainfall/pasco-nasa-power-2020-2025.csv", import.meta.url), "utf8");
  const dataset = parseNasaPowerDailyCsv(csv);
  assert.equal(dataset.metadata.latitude, -10.68);
  assert.equal(dataset.metadata.longitude, -76.26);
  assert.deepEqual(dataset.metadata.spatialResolutionDegrees, { latitude: 0.5, longitude: 0.625 });
  assert.equal(dataset.summary.startDate, "2020-01-01");
  assert.equal(dataset.summary.endDate, "2025-12-31");
  assert.ok(dataset.summary.recordCount > 2000);
});

test("el perfil horario estimado conserva exactamente el total diario", () => {
  const profile = uniformHourlyProfile(102.88);
  assert.equal(profile.length, 24);
  assert.ok(Math.abs(profile.reduce((sum, value) => sum + value, 0) - 102.88) < 1e-8);
});

test("reproduce lluvia histórica sin presentarla como telemetría horaria observada", () => {
  const dataset = parseNasaPowerDailyCsv(sampleCsv);
  const store = new TwinStore({ rainfallDataset: dataset });
  const { event, readings } = store.simulateHistoricalRainfall({ date: "2024-01-02" });
  assert.equal(readings.length, 24);
  assert.equal(event.totalRainfallMm, 24);
  assert.equal(event.provenance.observedDailyTotalMm, 24);
  assert.equal(event.provenance.temporalDistribution, "UNIFORM_24H_ESTIMATED");
  assert.ok(readings.every((row) => row.source === "historical-rain-replay"));
  assert.ok(readings.every((row) => row.qualityFlag === "SOURCE_DAILY_TEMPORAL_PROFILE_ESTIMATED"));
  assert.equal(store.getTwinStatus().dataStatus, "REANALISIS_LLUVIA_NASA_POWER");
  const forecast = createForecast(store.getReadings(120), 6);
  assert.equal(forecast.modelDiagnostics.dataQuality.status, "DEMOSTRATIVA_SEMISINTETICA");
  assert.equal(forecast.modelDiagnostics.dataQuality.observedShare, 0);
  assert.equal(forecast.modelDiagnostics.dataQuality.passesQualityGate, false);
});
