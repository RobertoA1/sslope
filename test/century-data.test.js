import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { centuryDate, parseCenturyPrisms, parseCenturyRain, prepareCenturyDaily, buildCenturySequences, CENTURY_SOURCE } from "../src/core/century-dataset.js";
import { inferCenturyModels } from "../src/core/century-inference.js";
import { regressionMetrics, parseFlatCsv } from "../src/core/temporal-baseline.js";
import { serveCenturyStudy, loadCenturyStudy } from "../src/century-study.js";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url));
const json = async (path) => JSON.parse(await read(path));

test("Century: fechas explícitas, vacíos no se convierten en cero", () => {
  assert.equal(centuryDate("20-Nov-13"), "2013-11-20");
  assert.throws(() => centuryDate("31-Feb-14"));
  assert.throws(() => centuryDate("2014-01-01"));
  const header = "Prism,Date,Time,Easting,Northing,RL,Cumulative 3D Movement (mm) Since 20th Nov\n";
  assert.throws(() => parseCenturyPrisms(header + "22-1917,01-Jan-14,10:00:00,1,2,3,"), /ausente/);
  const rain = parseCenturyRain("Year,Month,Day,Rainfall amount (millimetres),Period over which rainfall was measured (days),Quality,Bureau of Meteorology station number\n2014,01,01,,1,N,029167\n2014,01,02,0,1,N,029167");
  assert.equal(rain[0].rainfallMm, null);
  assert.equal(rain[1].rainfallMm, 0);
});

test("Century: duplicados contradictorios se excluyen y lluvia usa desfase, no futuro", () => {
  const base = { sensorId: "22-1917", date: "2014-01-03", timestampLocal: "2014-01-03T10:00:00", displacementMm: 12, eastingM: 1, northingM: 2, elevationM: 3 };
  const rain = [{ date: "2014-01-01", rainfallMm: 5, periodDays: 1, quality: "N" }, { date: "2014-01-03", rainfallMm: 999, periodDays: 1, quality: "N" }];
  const result = prepareCenturyDaily([base, { ...base }, { ...base, timestampLocal: "2014-01-03T18:00:00", displacementMm: 15 }], rain);
  assert.equal(result.audit.identicalDuplicates, 1);
  assert.equal(result.rows[0].displacementMm, 15);
  assert.equal(result.rows[0].rainLag2Mm, 5);
  assert.equal(result.rows[0].porePressureKpa, null);
  const conflict = prepareCenturyDaily([base, { ...base, displacementMm: 999 }], rain);
  assert.equal(conflict.rows.length, 0);
  assert.equal(conflict.audit.conflictingTimestampCount, 1);
});

test("Century: original verificado y datos observados independientes", async () => {
  assert.equal(createHash("sha256").update(await read("data/external/century-mine/Data.zip")).digest("hex"), CENTURY_SOURCE.archiveSha256);
  const manifest = await json("data/generated/century-dataset-manifest.json");
  assert.equal(manifest.audit.rawReadingCount, 7178);
  assert.equal(manifest.audit.sensorCount, 49);
  assert.equal(manifest.audit.startDate, "2013-11-20");
  assert.equal(manifest.audit.endDate, "2014-02-20");
  assert.equal(manifest.otherFiles.southwestPrismReadings, 82401);
  assert.equal(manifest.protocol.ta01WeightsApplied, false);
  assert.equal(manifest.protocol.missingPorePressureImputed, false);
  assert.equal(manifest.protocol.operationalDecisionAllowed, false);
});

test("Century: particiones cronológicas no comparten objetivos ni cruzan límites", async () => {
  const data = await json("data/generated/century-sequences.json");
  const keys = (part) => new Set(data.sets[part].map((s) => `${s.sensorId}/${s.targetDate}`));
  const train = keys("train"), validation = keys("validation"), testKeys = keys("test");
  assert.ok([...train].every((key) => !validation.has(key) && !testKeys.has(key)));
  assert.ok([...validation].every((key) => !testKeys.has(key)));
  assert.ok(data.sets.train.every((s) => s.targetDate <= data.cutoffs.trainEnd));
  assert.ok(data.sets.validation.every((s) => s.originDate >= data.cutoffs.validationStart && s.targetDate <= data.cutoffs.validationEnd));
  assert.ok(data.sets.test.every((s) => s.originDate >= data.cutoffs.testStart && s.targetDate <= data.cutoffs.testEnd));
  const rows = parseFlatCsv((await read("data/generated/century-prisms-daily.csv")).toString()).rows.map((r) => ({ ...r, displacementMm: Number(r.displacementMm), rainLag2Mm: r.rainLag2Mm === "" ? null : Number(r.rainLag2Mm) }));
  assert.deepEqual(buildCenturySequences(rows), data);
  assert.ok(data.exclusions.gapsOrMissingRain > 0);
});

test("Century: inferencia JS reproduce Python y no consulta el desplazamiento futuro", async () => {
  const model = await json("data/models/century-prism-daily-lstm.json");
  const sequences = await json("data/generated/century-sequences.json");
  const report = await json("data/validation/century-real-data-evaluation.json");
  for (const part of ["validation", "test"]) {
    const actual = [], predictions = { PERSISTENCE: [], TREND: [], RIDGE: [], LSTM: [] };
    for (const sample of sequences.sets[part]) {
      const predicted = inferCenturyModels(model, sample);
      const original = report.predictionPairs.find((p) => p.partition === part && p.sensorId === sample.sensorId && p.originDate === sample.originDate);
      for (const name of Object.keys(predictions)) {
        assert.ok(Math.abs(predicted[name] - original.predictions[name]) < 1e-7, name);
        predictions[name].push(predicted[name]);
      }
      actual.push(sample.targetMm);
      assert.deepEqual(inferCenturyModels(model, { ...sample, targetMm: 999999 }), predicted);
    }
    for (const [name, values] of Object.entries(predictions)) {
      const metrics = regressionMetrics(actual, values);
      assert.equal(metrics.maeMm, report.metrics[part][name].maeMm);
      assert.equal(metrics.rmseMm, report.metrics[part][name].rmseMm);
      assert.equal(metrics.r2, report.metrics[part][name].r2);
    }
  }
  assert.throws(() => inferCenturyModels({ ...model, sourceId: "TA-01" }, sequences.sets.test[0]), /incompatible/);
  assert.equal(report.selection.selectedOnValidation, "LSTM");
  assert.equal(report.selection.bestOnTestDescriptiveOnly, "PERSISTENCE");
  assert.equal(report.selection.testUsedForSelection, false);
});

test("Century: API entrega caso aislado, inferencia real y descargas con límites", async () => {
  const study = await loadCenturyStudy();
  const call = async (query) => {
    const res = { status: null, headers: null, content: null, writeHead(s, h) { this.status = s; this.headers = h; }, end(c) { this.content = c; } };
    await serveCenturyStudy(res, new URL(`http://localhost/api/research/century${query}`));
    return res;
  };
  const response = await call("");
  assert.equal(response.status, 200);
  const data = JSON.parse(response.content);
  assert.equal(data.sensors.length, 49);
  assert.equal(data.retrospectiveForecast.mode, "RETROSPECTIVE_REPLAY");
  assert.equal(data.retrospectiveForecast.operationalDecisionAllowed, false);
  assert.ok(data.series.every((r) => r.sensorId === data.selectedSensor));
  assert.equal(data.weights, undefined);
  assert.equal((await call("?sensor=EXT-01")).status, 400);
  assert.equal((await call(`?sensor=${data.selectedSensor}&origin=2099-01-01`)).status, 400);
  const download = await call("?download=daily");
  assert.equal(download.status, 200);
  assert.equal(download.content, study.dailyBytes);
  assert.match(download.headers["Content-Disposition"], /century-prisms-daily/);
});
