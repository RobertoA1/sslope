const normalizeHeader = (value) => String(value)
  .trim()
  .toLowerCase()
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z0-9]+/g, "_")
  .replace(/^_|_$/g, "");

const FIELD_ALIASES = {
  timestamp: ["timestamp", "timestamp_utc", "fecha_hora", "fecha_hora_utc"],
  sensorId: ["sensor_id", "sensorid", "id_sensor", "sensor"],
  displacementMm: ["displacement_mm", "displacementmm", "desplazamiento_mm", "desplazamiento"],
  porePressureKpa: ["pore_pressure_kpa", "porepressurekpa", "presion_poros_kpa", "presion_de_poros_kpa"],
  rainfallMmH: ["rainfall_mm_h", "rainfallmmh", "lluvia_mm_h", "precipitacion_mm_h"],
  qualityFlag: ["quality_flag", "qualityflag", "calidad"],
  source: ["source", "fuente"]
};

function parseDelimited(text, delimiter) {
  const rows = [];
  let row = [], value = "", quoted = false;
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') { value += '"'; index++; }
      else quoted = !quoted;
    } else if (character === delimiter && !quoted) {
      row.push(value); value = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index++;
      row.push(value); value = "";
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
    } else value += character;
  }
  row.push(value);
  if (row.some((cell) => cell.trim())) rows.push(row);
  if (quoted) throw new Error("CSV inválido: comillas sin cerrar");
  return rows;
}

function canonicalize(row) {
  const normalized = Object.fromEntries(Object.entries(row).map(([key, value]) => [normalizeHeader(key), value]));
  const result = {};
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    const alias = aliases.find((candidate) => normalized[candidate] !== undefined);
    if (alias) result[field] = normalized[alias];
  }
  return result;
}

export function parseTelemetryCsv(text) {
  const firstLine = text.split(/\r?\n/, 1)[0] || "";
  const delimiter = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ";" : ",";
  const rows = parseDelimited(text.replace(/^\uFEFF/, ""), delimiter);
  if (rows.length < 2) throw new Error("El CSV debe incluir cabecera y al menos una lectura");
  const headers = rows[0].map(normalizeHeader);
  const requiredFields = ["timestamp", "sensorId", "displacementMm", "porePressureKpa", "rainfallMmH"];
  const missing = requiredFields.filter((field) => !FIELD_ALIASES[field].some((alias) => headers.includes(alias)));
  if (missing.length) throw new Error(`Faltan columnas requeridas: ${missing.join(", ")}`);
  const readings = rows.slice(1).map((values) => canonicalize(Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]))));
  return readings;
}

export function parseTelemetryFile(text, fileName = "telemetry.csv") {
  const extension = fileName.split(".").at(-1)?.toLowerCase();
  if (extension === "json") {
    let parsed;
    try { parsed = JSON.parse(text); } catch { throw new Error("El archivo JSON no es válido"); }
    const readings = Array.isArray(parsed) ? parsed : parsed?.readings;
    if (!Array.isArray(readings)) throw new Error("El JSON debe ser una lista o contener { readings: [...] }");
    return readings.map(canonicalize);
  }
  if (extension !== "csv") throw new Error("Formato no admitido; usa CSV o JSON");
  return parseTelemetryCsv(text);
}
