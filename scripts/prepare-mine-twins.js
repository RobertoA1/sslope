import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { CENTURY_SOURCE, parseCenturyRain } from "../src/core/century-dataset.js";
import { CENTURY_SPATIAL_FILE, parseCenturySpatial, prepareCenturySpatial } from "../src/core/century-spatial.js";
import { parseFlatCsv } from "../src/core/temporal-baseline.js";

const root = new URL("../", import.meta.url);
const archive = new URL("data/external/century-mine/Data.zip", root);
const hash = (b) => createHash("sha256").update(b).digest("hex");
const bytes = await readFile(archive);
if (hash(bytes) !== CENTURY_SOURCE.archiveSha256) throw new Error("Archivo original Century distinto del verificado");
const extract = (name) => execFileSync("unzip", ["-p", archive.pathname, name], { maxBuffer: 20000000 });
const spatialBytes = extract(CENTURY_SPATIAL_FILE);
const weatherNames = ["weather-data/IDCJAC0009_029167_2013_Data.csv", "weather-data/IDCJAC0009_029167_2014_Data.csv"];
const weatherBytes = weatherNames.map(extract);
const century = prepareCenturySpatial(parseCenturySpatial(spatialBytes.toString()), weatherBytes.flatMap((b) => parseCenturyRain(b.toString())));
century.source = { ...CENTURY_SOURCE, deformationFile: CENTURY_SPATIAL_FILE, deformationSha256: hash(spatialBytes), weatherFiles: weatherNames.map((name, i) => ({ name, sha256: hash(weatherBytes[i]) })), eventReference: { date: "2014-02-23", kind: "ARTICLE_REFERENCE_NOT_MODEL_DETECTION", url: CENTURY_SOURCE.article } };

const provenance = JSON.parse(await readFile(new URL("data/sites/raul-rojas-nw-provenance.json", root)));
const profileBytes = await readFile(new URL("data/sites/raul-rojas-nw-srtm30m-profile.csv", root));
if (hash(profileBytes) !== provenance.datasets.find((d) => d.kind === "derived_historical_topography").sha256) throw new Error("Perfil Pasco no coincide con procedencia");
const profile = parseFlatCsv(profileBytes.toString()).rows;
const baseline = profile.map((r) => [Number(r.distance_m), 0, Number(r.elevation_m)]);
const min = [0, -100, Math.min(...baseline.map((p) => p[2]))], max = [baseline.at(-1)[0], 100, Math.max(...baseline.map((p) => p[2]))];
const faces = [], vertices = [];
baseline.forEach((p, index) => { vertices.push({ pointIndex: index, offsetN: -100 }, { pointIndex: index, offsetN: 100 }); if (index) faces.push([index * 2 - 2, index * 2 - 1, index * 2], [index * 2 - 1, index * 2 + 1, index * 2]); });
const pasco = { id: "PASCO", name: "Cerro de Pasco · tajo Raúl Rojas, pared NW", country: "Perú", status: "PERFIL_SRTM_2000_EXTRUIDO_NO_CALIBRADO", operationalDecisionAllowed: false,
  source: { url: provenance.datasets[1].documentationUrl, profileSha256: hash(profileBytes), datasets: provenance.datasets, observationPeriod: "2000-02" },
  referenceDate: "2000-02", sensorIds: baseline.map((_, i) => `SRTM-${i}`), baseline, origin: [(min[0] + max[0]) / 2, 0, min[2]], bounds: { min, max },
  coordinateReference: "X: distancia sobre transecto A–B (m); Y: ancho esquemático ±100 m; cota SRTM EGM96 (m). Coordenadas geográficas originales en el perfil descargable.",
  geometry: { type: "EXTRUDED_PROFILE", vertices, faces, method: "Perfil histórico SRTM 30 m extruido en un corredor esquemático de 200 m, sin información transversal" },
  pointColumns: ["sensorIndex", "distanceAlongProfileM", "schematicTransverseM", "elevationM"], frames: [{ date: "2000-02", points: baseline.map((p, i) => [i, ...p]), rain: null }],
  audit: { sampleCount: baseline.length, startDate: "2000-02", endDate: "2000-02", sensorCount: 0, trianglesRetained: faces.length },
  warnings: ["Perfil histórico de febrero de 2000, no geometría actual ni levantamiento de bancos.", "Solo las 25 cotas centrales proceden de SRTM. El ancho de 200 m y la superficie transversal son esquemáticos, no medidos.", "Los puntos SRTM no son sensores o prismas. Los agregados publicados de Pasco no incluyen series diarias ni ubicaciones para animar desplazamientos reales.", "Sin movimiento de campo, presión de poros o simulación física calibrada. El laboratorio TA-01 se conserva como demostración separada."] };
for (const data of [century, pasco]) {
  const path = new URL(`data/generated/mine-twin-${data.id.toLowerCase()}.json`, root);
  await writeFile(path, JSON.stringify(data) + "\n");
  console.log(JSON.stringify({ id: data.id, audit: data.audit, bytes: (await readFile(path)).length, sha256: hash(await readFile(path)) }, null, 2));
}
