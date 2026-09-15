import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { flatCsv, parseFlatCsv, splitFemDataset } from "../src/core/temporal-baseline.js";

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argument = (name, fallback) => process.argv.slice(2).find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const sourcePath = path.resolve(projectDir, argument("input", "data/generated/ta01-fem-500.csv"));
const manifestPath = path.resolve(projectDir, argument("manifest", sourcePath.replace(/\.csv$/i, "-manifest.json")));
const outputPrefix = path.resolve(projectDir, argument("output-prefix", sourcePath.replace(/\.csv$/i, "")));
const seed = Number(argument("seed", "20260916"));

const source = parseFlatCsv(await readFile(sourcePath, "utf8"));
const sourceManifest = JSON.parse(await readFile(manifestPath, "utf8"));
const split = splitFemDataset(source.rows, sourceManifest.scenarios, { seed });
await mkdir(path.dirname(outputPrefix), { recursive: true });
for (const name of ["train", "validation", "test"]) await writeFile(`${outputPrefix}-${name}.csv`, flatCsv(source.columns, split.rows[name]), "utf8");
const outputManifest = {
  id: `${sourceManifest.id}-SPLIT-${seed}`,
  generatedAt: new Date().toISOString(),
  sourceDatasetId: sourceManifest.id,
  sourceCsv: path.relative(projectDir, sourcePath),
  sourceManifest: path.relative(projectDir, manifestPath),
  seed,
  method: "SCENARIO_GROUP_SPLIT_WITH_EXTREME_EVENT_HOLDOUT",
  leakageControl: "Todas las horas de un scenario_id permanecen en una sola partición.",
  ratios: split.ratios,
  reservedExtremeEvents: split.reservedExtremeEvents,
  summaries: split.summaries,
  scenarioIds: split.scenarioIds,
  scientificStatus: sourceManifest.scientificStatus
};
await writeFile(`${outputPrefix}-split-manifest.json`, JSON.stringify(outputManifest, null, 2) + "\n", "utf8");
console.log(JSON.stringify({
  manifest: path.relative(projectDir, `${outputPrefix}-split-manifest.json`),
  splits: split.summaries
}, null, 2));
