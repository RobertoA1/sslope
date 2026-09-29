import Delaunator from "delaunator";
import { parseFlatCsv } from "./temporal-baseline.js";
import { centuryDate } from "./century-dataset.js";

export const CENTURY_SPATIAL_FILE = "radar-deformation-data/South_West_Corner_06082014.csv";
export const CENTURY_REFERENCE_DATE = "2014-01-01";
const number = (v) => {
  if (String(v ?? "").trim() === "" || !Number.isFinite(Number(v))) throw new Error("Coordenada Century ausente/no finita");
  return Number(v);
};

export function parseCenturySpatial(text) {
  const start = text.indexOf("Prism,Date,Time,Easting,Northing,Height,");
  if (start < 0) throw new Error("Encabezado espacial Century no reconocido");
  const { rows } = parseFlatCsv(text.slice(start));
  return rows.map((r, i) => {
    if (!/^\d+-\d+$/.test(r.Prism) || !/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(r.Time)) throw new Error(`Prisma/hora inválida: fila ${i + 5}`);
    return { id: r.Prism, date: centuryDate(r.Date), time: r.Time,
      coordinate: [number(r.Easting), number(r.Northing), number(r.Height)],
      publishedDifferences: [number(r["Easting Diff"]), number(r["Northing Diff"]), number(r["Height Diff"])], sourceRow: i + 5 };
  }).sort((a, b) => a.id.localeCompare(b.id) || a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
}

export function prepareCenturySpatial(rows, rain, maxEdgeM = 150) {
  const unique = new Map(), conflicts = new Set();
  let identicalDuplicates = 0;
  for (const r of rows) {
    const key = `${r.id}/${r.date}/${r.time}`, previous = unique.get(key);
    if (!previous) unique.set(key, r);
    else if (JSON.stringify([previous.coordinate, previous.publishedDifferences]) === JSON.stringify([r.coordinate, r.publishedDifferences])) identicalDuplicates++;
    else conflicts.add(key);
  }
  const daily = new Map();
  for (const [key, r] of unique) {
    if (conflicts.has(key)) continue;
    const k = `${r.id}/${r.date}`, group = daily.get(k) || { last: r, count: 0 };
    if (r.time > group.last.time) group.last = r;
    group.count++;
    daily.set(k, group);
  }
  const ids = [...new Set(rows.map((r) => r.id))].sort();
  const baseline = ids.map((id) => daily.get(`${id}/${CENTURY_REFERENCE_DATE}`)?.last.coordinate || null);
  const support = baseline.flatMap((coordinate, index) => coordinate ? [{ index, coordinate }] : []);
  if (support.length < 3) throw new Error("No hay soporte geométrico en la fecha de referencia");
  const min = [0, 1, 2].map((j) => Math.min(...support.map((r) => r.coordinate[j])));
  const max = [0, 1, 2].map((j) => Math.max(...support.map((r) => r.coordinate[j])));
  const origin = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, min[2]];
  const triangles = Delaunator.from(support, (r) => r.coordinate[0] - origin[0], (r) => r.coordinate[1] - origin[1]).triangles;
  const faces = [], referenceFaces = [];
  let rejectedLongEdges = 0, rejectedDegenerate = 0;
  for (let i = 0; i < triangles.length; i += 3) {
    const points = [triangles[i], triangles[i + 1], triangles[i + 2]].map((n) => support[n]);
    const [a, b, c] = points.map((p) => p.coordinate);
    const area = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2;
    if (area < 1e-6) { rejectedDegenerate++; continue; }
    referenceFaces.push(points.map((p) => p.index));
    if (points.some((p, n) => Math.hypot(p.coordinate[0] - points[(n + 1) % 3].coordinate[0], p.coordinate[1] - points[(n + 1) % 3].coordinate[1]) > maxEdgeM)) { rejectedLongEdges++; continue; }
    faces.push(points.map((p) => p.index));
  }
  const dates = [...new Set([...daily.values()].map((g) => g.last.date))].sort();
  const rainMap = new Map(rain.map((r) => [r.date, r]));
  const previous = new Map();
  let jumpCount = 0;
  const frames = dates.map((date) => {
    const points = [];
    ids.forEach((id, index) => {
      const group = daily.get(`${id}/${date}`);
      if (!group) return; // No arrastre ni interpolación temporal sobre días sin observación.
      const row = group.last, last = previous.get(id);
      const jumpM = last ? Math.hypot(...row.coordinate.map((v, j) => v - last.coordinate[j])) : 0;
      const qcJump = jumpM > 1;
      if (qcJump) jumpCount++;
      // El salto es una bandera de revisión, no una detección de falla ni motivo para borrar el dato.
      points.push([index, ...row.coordinate, row.time, row.sourceRow, group.count, qcJump, ...row.publishedDifferences]);
      previous.set(id, row);
    });
    const observedRain = rainMap.get(date);
    return { date, points, rain: observedRain || null };
  });
  return { id: "CENTURY", name: "Century Mine · sector sudoeste", country: "Australia",
    status: "PROTOTIPO_RETROSPECTIVO_SUPERFICIE_PARCIAL_NO_CALIBRADA", operationalDecisionAllowed: false,
    referenceDate: CENTURY_REFERENCE_DATE, sensorIds: ids, baseline,
    coordinateReference: "Sistema local del export Quikslope; CRS y datum no declarados. E, N, Height interpretados en m; no se georreferencia a WGS84.",
    origin, bounds: { min, max },
    geometry: { type: "PRISM_TIN", method: "Delaunay en E-N; altura de prismas de referencia; interpolación lineal entre puntos, no topografía medida", library: "delaunator@5.1.0", maxEdgeM, faces, referenceFaces, referenceNote: "Los triángulos descartados por distancia solo completan el fondo gris esquemático, sin deformación ni color analítico." },
    pointColumns: ["sensorIndex", "easting", "northing", "height", "timeLocal", "sourceRow", "dailyReadingCount", "qcCoordinateJumpOver1M", "publishedEastingDiff", "publishedNorthingDiff", "publishedHeightDiff"], frames,
    audit: { rawReadingCount: rows.length, sensorCount: ids.length, referenceSensorCount: support.length, dailyReadingCount: [...daily.values()].length,
      startDate: dates[0], endDate: dates.at(-1), identicalDuplicates, conflictingTimestampCount: conflicts.size,
      trianglesBeforeFiltering: triangles.length / 3, trianglesRetained: faces.length, referenceTriangles: referenceFaces.length, grayContextTriangles: referenceFaces.length - faces.length, rejectedLongEdges, rejectedDegenerate, coordinateJumpFlags: jumpCount },
    warnings: [
      "Reconstrucción parcial del sector instrumentado, no modelo de toda la mina ni levantamiento de bancos. Los prismas son puntos medidos; los triángulos entre ellos son interpolación visual.",
      "Geometría base: última lectura disponible de cada prisma del 1 de enero de 2014. Fechas y horas distintas dentro del día; no es una medición simultánea.",
      "Solo se muestran prismas medidos en el día seleccionado. La superficie histórica de referencia permanece en gris donde faltan lecturas actuales; no se inventan mediciones ni se supone desplazamiento cero. Solo los triángulos con tres lecturas actuales y aristas ≤150 m reciben colores y movimiento. Los triángulos más largos solo completan el fondo gris esquemático, sin representar topografía medida o movimiento.",
      "Movimiento derivado de cambios de coordenadas respecto del 1 de enero. No es el acumulado reportado desde noviembre ni la salida de la LSTM West Wall.",
      "Los saltos de coordenadas mayores de 1 m entre lecturas diarias se marcan para revisión, sin eliminarlos. Pueden representar movimiento real, cambios de referencia o errores; no hay clasificación confirmada.",
      "La lluvia BOM es un total diario observado en la estación 029167; sus partículas son ilustrativas. No se convierte en lluvia horaria medida ni causa una deformación física calculada.",
      "No se conocen presión de poros, parámetros mecánicos ni superficie de falla. Sin FEM calibrado, FoS, alertas operacionales o pronóstico validado de derrumbe.",
      "Sudoeste y West Wall son archivos y objetivos diferentes. La LSTM y sus métricas de West Wall permanecen en su panel independiente; no se transfieren a estos vectores.",
      "El evento documentado comienza el 23 de febrero de 2014. Se marca como referencia bibliográfica, no se infiere a partir de umbrales de esta vista."
    ] };
}
