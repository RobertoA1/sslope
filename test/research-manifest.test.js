import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test("el manifiesto suplementario coincide con sus fuentes versionadas", async () => {
  const manifest = JSON.parse(await readFile(path.join(root, "data/validation/ta01-replication-manifest.json"), "utf8"));
  for (const required of [
    "data/validation/ta01-fem-mesh-sensitivity.json",
    "data/generated/ta01-spatial-equilibrium-benchmark.json",
    "data/models/ta01-spatial-pinn.json",
    "data/validation/ta01-spatial-pinn-validation.json",
    "data/validation/external-ssrm-griffiths-lane.json",
    "data/validation/ta01-external-ssrm-input.json",
    "data/validation/ta01-external-ssrm.json",
    "data/validation/ta01-external-ssrm-mesh-sensitivity.json",
    "data/validation/ta01-transient-seep.json",
    "data/validation/ta01-transient-seep-mesh-sensitivity.json",
    "data/validation/ta01-transient-seep-field-sensitivity.json",
    "data/validation/ta01-transient-seep-field-6m.json",
    "data/validation/ta01-rainfall-external-ssrm.json"
  ]) assert.ok(manifest.sources[required], `Falta procedencia de ${required}`);
  for (const [relative, record] of Object.entries(manifest.sources)) {
    const content = await readFile(path.join(root, relative));
    assert.equal(createHash("sha256").update(content).digest("hex"), record.sha256, `SHA-256 desactualizado: ${relative}`);
  }
});
