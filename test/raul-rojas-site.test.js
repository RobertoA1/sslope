import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const siteDir = path.join(root, "data/sites");

async function csvRows(name) {
  const lines = (await readFile(path.join(siteDir, name), "utf8")).trim().split(/\r?\n/);
  const headers = lines.shift().split(",");
  return lines.map((line) => Object.fromEntries(line.split(",").map((value, index) => [headers[index], value])));
}

test("el caso Raúl Rojas NW conserva geometría y procedencia independientes de TA-01", async () => {
  const provenance = JSON.parse(await readFile(path.join(siteDir, "raul-rojas-nw-provenance.json"), "utf8"));
  const transect = JSON.parse(await readFile(path.join(siteDir, "raul-rojas-nw-transect.geojson"), "utf8"));
  assert.equal(provenance.operationalDecisionAllowed, false);
  assert.equal(provenance.status, "research_candidate_not_calibrated");
  assert.equal(transect.features[0].properties.status, "provisional_cartographic_not_surveyed");
  assert.deepEqual(transect.features[0].geometry.coordinates, [
    [-76.26486, -10.67041],
    [-76.25971, -10.67598]
  ]);
  assert.equal(transect.features[1].properties.status, "historical_dem_inference_not_surveyed");
  assert.deepEqual(transect.features[1].geometry.coordinates, [
    [-76.26228502, -10.67319501],
    [-76.25971, -10.67598]
  ]);
  for (const source of provenance.datasets.filter((item) => item.sha256)) {
    const content = await readFile(path.join(siteDir, source.file));
    assert.equal(createHash("sha256").update(content).digest("hex"), source.sha256, source.file);
  }
});

test("el perfil SRTM y la lluvia histórica tienen la cobertura declarada", async () => {
  const profile = await csvRows("raul-rojas-nw-srtm30m-profile.csv");
  const rain = await csvRows("raul-rojas-nw-power-rain-2009-2010.csv");
  assert.equal(profile.length, 25);
  assert.equal(Number(profile[0].elevation_m), 4310);
  assert.equal(Number(profile.at(-1).elevation_m), 4093);
  assert.equal(Number(profile[12].elevation_m), 4310);
  assert.equal(Number(profile[12].distance_m), 418.4);
  assert.ok(profile.every((row, index) => index === 0 || Number(row.distance_m) > Number(profile[index - 1].distance_m)));
  assert.ok(Math.abs(Number(profile.at(-1).distance_m) - 837) < 1);
  assert.equal(rain.length, 184);
  assert.equal(rain[0].date, "2009-08-01");
  assert.equal(rain.at(-1).date, "2010-01-31");
  assert.ok(Math.abs(rain.reduce((sum, row) => sum + Number(row.precipitation_mm_day), 0) - 88.42) < 0.001);
});

test("los prismas publicados son agregados históricos, no una serie temporal", async () => {
  const prisms = await csvRows("raul-rojas-nw-prism-aggregate-2009-2010.csv");
  assert.equal(prisms.length, 11);
  assert.equal(Number(prisms.find((row) => row.prism_id === "PM-71")?.cumulative_displacement_mm), 492.78);
  assert.ok(prisms.every((row) => row.period_start_month === "2009-08" && row.period_end_month === "2010-01"));
  assert.ok(prisms.every((row) => !("measurement_date" in row) && !("longitude" in row)));
});
