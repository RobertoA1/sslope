import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TA01_FEM_DEFAULTS, ta01SurfaceElevation } from "../src/core/fem-2d.js";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const output = path.join(root, "data/validation/ta01-external-ssrm-input.json");
const scenario = TA01_FEM_DEFAULTS;
const { slopeHeightM: height, slopeWidthM: width, benchCount, benchFlatRatio } = scenario;
const x = new Set([-60, 0, width, width + 60]);
for (let bench = 0; bench < benchCount; bench++) {
  const start = bench * width / benchCount;
  const flatEnd = start + benchFlatRatio * width / benchCount;
  x.add(start);
  x.add(flatEnd);
  for (let step = 1; step <= 8; step++) x.add(flatEnd + (start + width / benchCount - flatEnd) * step / 8);
}
const surface = [...x].sort((a, b) => a - b).map((east) => [east, east < 0 ? height : east > width ? 0 : ta01SurfaceElevation(east, scenario)]);
const materials = [
  { id: "SOIL", c: scenario.cohesionKpa * 0.45, phi: scenario.frictionAngleDeg - 4, E: scenario.youngModulusMpa * 1000 * 0.12, nu: scenario.poissonRatio + 0.08, gamma: scenario.unitWeightKNm3 * 0.86 },
  { id: "WEATHERED", c: scenario.cohesionKpa, phi: scenario.frictionAngleDeg, E: scenario.youngModulusMpa * 1000 * 0.55, nu: scenario.poissonRatio, gamma: scenario.unitWeightKNm3 },
  { id: "ROCK", c: scenario.cohesionKpa * 2.2, phi: scenario.frictionAngleDeg + 6, E: scenario.youngModulusMpa * 1000 * 2.5, nu: scenario.poissonRatio - 0.04, gamma: scenario.unitWeightKNm3 * 1.07 }
];
const input = {
  id: "TA01-EXTENDED-DRY-SSRM-V1",
  source: "TA01_FEM_DEFAULTS and ta01SurfaceElevation in src/core/fem-2d.js",
  units: { length: "m", stress: "kPa", unitWeight: "kN/m³" },
  geometry: { surface, baseElevationM: -40, soilDepthM: 12, weatheredDepthM: 35, crestExtensionM: 60, toeExtensionM: 60 },
  materials,
  conditions: { groundwater: "none", rainfall: "none", bottom: "fixed", sides: "x-roller" },
  limitation: "Variante seca extendida para SSRM externo; la malla, el dominio y la ley constitutiva difieren del FEM lineal TA-01. No es una predicción operativa."
};
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(input, null, 2)}\n`);
console.log(output);
