import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { flatCsv, parseFlatCsv, splitFemChronological } from "../src/core/temporal-baseline.js";

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argument = (name, fallback) => process.argv.slice(2).find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const sourcePath = path.join(projectDir, "data/generated/ta01-fem-500.csv");
const sourceManifestPath = path.join(projectDir, "data/generated/ta01-fem-500-manifest.json");
const outputPrefix = path.resolve(projectDir, argument("output-prefix", "data/generated/ta01-fem-500-chronological"));
const validationFrom = argument("validation-from", "2024-01-01");
const testFrom = argument("test-from", "2025-01-01");
const testBefore = argument("test-before", null);
const source = parseFlatCsv(await readFile(sourcePath, "utf8"));
const sourceManifest = JSON.parse(await readFile(sourceManifestPath, "utf8"));
const split = splitFemChronological(source.rows, sourceManifest.scenarios, { validationFrom, testFrom, testBefore });
await mkdir(path.dirname(outputPrefix), { recursive: true });
for (const name of ["train", "validation", "test"]) {
  await writeFile(`${outputPrefix}-${name}.csv`, flatCsv(source.columns, split.rows[name]), "utf8");
}
const outputManifest = {
  id: `${sourceManifest.id}-CHRONOLOGICAL-${validationFrom}-${testFrom}-${testBefore || "ALL"}`,
  generatedAt: new Date().toISOString(),
  sourceDatasetId: sourceManifest.id,
  sourceCsv: path.relative(projectDir, sourcePath),
  sourceManifest: path.relative(projectDir, sourceManifestPath),
  method: split.method,
  leakageControl: `Entrenamiento anterior a ${validationFrom}; validación desde ${validationFrom} hasta ${testFrom}; prueba desde ${testFrom}${testBefore ? ` hasta ${testBefore}; datos posteriores excluidos` : " en adelante"}. Escenarios y fechas completos en un solo periodo.`,
  cutoffs: split.cutoffs,
  excludedScenarioIds: split.excludedScenarioIds,
  excludedSourceDateCount: split.excludedSourceDateCount,
  sourceDateCounts: split.sourceDateCounts,
  summaries: split.summaries,
  scenarioIds: split.scenarioIds,
  scientificStatus: "EVALUACION_CRONOLOGICA_SEMISINTETICA_NO_VALIDACION_DE_CAMPO"
};
await writeFile(`${outputPrefix}-split-manifest.json`, `${JSON.stringify(outputManifest, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ manifest: path.relative(projectDir, `${outputPrefix}-split-manifest.json`), summaries: split.summaries }, null, 2));
