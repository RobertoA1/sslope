import { parseFlatCsv } from "./temporal-baseline.js";

export const CENTURY_SOURCE = Object.freeze({
  id: "CENTURY-ZENODO-15003054", mine: "Century Mine, Australia",
  author: "Tjaart de Wit (Colorado School of Mines)",
  doi: "10.5281/zenodo.15003054", url: "https://zenodo.org/records/15003054",
  article: "https://doi.org/10.26443/seismica.v5i1.1902", license: "CC-BY-4.0",
  archiveMd5: "3adeb6c853d2e87249b7d3549a2a00ca",
  archiveSha256: "b0d3eca632c5c7831d391f6f90b4d88b1a7384b3eb596c19ddaaf64147a24d22",
  deformationFile: "radar-deformation-data/West Wall Prism Movements - 3 months to 20-Feb-14.csv"
});
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY = 86400000;
const numeric = (value, label) => {
  if (String(value ?? "").trim() === "" || !Number.isFinite(Number(value))) throw new Error(`Dato ausente/no numérico: ${label}`);
  return Number(value);
};

export function centuryDate(value) {
  const match = /^(\d{2})-([A-Za-z]{3})-(\d{2})$/.exec(value);
  if (!match || !MONTHS.includes(match[2])) throw new Error(`Fecha de prisma inválida: ${value}`);
  const date = `20${match[3]}-${String(MONTHS.indexOf(match[2]) + 1).padStart(2, "0")}-${match[1]}`;
  if (new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) throw new Error(`Fecha inexistente: ${value}`);
  return date;
}
export const shiftCenturyDate = (date, days) => new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);

export function parseCenturyPrisms(text) {
  const { columns, rows } = parseFlatCsv(text);
  const required = ["Prism", "Date", "Time", "Easting", "Northing", "RL", "Cumulative 3D Movement (mm) Since 20th Nov"];
  if (required.some((column) => !columns.includes(column))) throw new Error("Contrato de prismas Century no reconocido");
  const parsed = rows.map((row, index) => {
    if (!/^[\d]+-[\d]+$/.test(row.Prism)) throw new Error(`Prisma inválido en fila ${index + 2}`);
    if (!/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(row.Time)) throw new Error(`Hora inválida en fila ${index + 2}`);
    const date = centuryDate(row.Date);
    return { sensorId: row.Prism, date, timestampLocal: `${date}T${row.Time}`,
      displacementMm: numeric(row[required[6]], required[6]),
      eastingM: numeric(row.Easting, "Easting"), northingM: numeric(row.Northing, "Northing"), elevationM: numeric(row.RL, "RL"), sourceRow: index + 2 };
  });
  parsed.sort((a, b) => a.sensorId.localeCompare(b.sensorId) || a.timestampLocal.localeCompare(b.timestampLocal));
  return parsed;
}

export function parseCenturyRain(text) {
  const { columns, rows } = parseFlatCsv(text);
  if (!["Year", "Month", "Day", "Rainfall amount (millimetres)"].every((c) => columns.includes(c))) throw new Error("Contrato de lluvia BOM no reconocido");
  return rows.map((row) => {
    const date = `${row.Year}-${row.Month.padStart(2, "0")}-${row.Day.padStart(2, "0")}`;
    if (new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) throw new Error("Fecha BOM inválida");
    const value = row["Rainfall amount (millimetres)"].trim();
    const rainfallMm = value === "" ? null : numeric(value, "lluvia diaria");
    if (rainfallMm !== null && rainfallMm < 0) throw new Error("Lluvia negativa");
    const periodDays = row["Period over which rainfall was measured (days)"].trim();
    return { date, rainfallMm, periodDays: periodDays === "" ? null : numeric(periodDays, "período BOM"),
      quality: row.Quality, station: row["Bureau of Meteorology station number"] };
  });
}

export function prepareCenturyDaily(prisms, rain) {
  const seen = new Map(), daily = new Map(), conflicts = new Set();
  let identicalDuplicates = 0;
  for (const row of prisms) {
    const key = `${row.sensorId}/${row.timestampLocal}`;
    const previous = seen.get(key);
    if (previous) {
      if (["displacementMm", "eastingM", "northingM", "elevationM"].some((k) => previous[k] !== row[k])) conflicts.add(key);
      else identicalDuplicates++;
    } else seen.set(key, row);
  }
  for (const [key, row] of seen) {
    if (conflicts.has(key)) continue;
    const dailyKey = `${row.sensorId}/${row.date}`;
    const group = daily.get(dailyKey) || { readings: [] };
    group.readings.push(row);
    daily.set(dailyKey, group);
  }
  const rainMap = new Map(rain.map((row) => [row.date, row]));
  if (rainMap.size !== rain.length) throw new Error("Fechas de lluvia duplicadas");
  const rows = [...daily.values()].map(({ readings }) => {
    readings.sort((a, b) => a.timestampLocal.localeCompare(b.timestampLocal));
    const last = readings.at(-1);
    // No se conoce la zona horaria del export de prismas ni su relación exacta con el corte BOM.
    // Solo usamos lluvia fechada al menos dos días antes, nunca el total del día objetivo.
    const lagged = rainMap.get(shiftCenturyDate(last.date, -2));
    const validRain = lagged?.rainfallMm !== null && lagged?.rainfallMm !== undefined && lagged.periodDays === 1;
    return { ...last, dailyReadingCount: readings.length,
      rainLag2Date: shiftCenturyDate(last.date, -2), rainLag2Mm: validRain ? lagged.rainfallMm : null,
      rainQuality: lagged?.quality ?? "", porePressureKpa: null, measurementType: "PRISM_3D_MAGNITUDE_REPORTED" };
  }).sort((a, b) => a.sensorId.localeCompare(b.sensorId) || a.date.localeCompare(b.date));
  return { rows, audit: { rawReadingCount: prisms.length, sensorCount: new Set(prisms.map((r) => r.sensorId)).size,
    dailyReadingCount: rows.length, identicalDuplicates, conflictingTimestampCount: conflicts.size,
    missingLaggedRainCount: rows.filter((r) => r.rainLag2Mm === null).length,
    startDate: rows.reduce((v, r) => r.date < v ? r.date : v, "9999"), endDate: rows.reduce((v, r) => r.date > v ? r.date : v, "0000") } };
}

export const CENTURY_FEATURES = ["displacement_mm", "previous_increment_mm", "previous_interval_hours", "rain_lag2_mm"];
export const CENTURY_CUTOFFS = Object.freeze({ trainEnd: "2014-01-31", validationStart: "2014-02-01", validationEnd: "2014-02-10", testStart: "2014-02-11", testEnd: "2014-02-20" });

export function buildCenturySequences(rows, lookback = 6) {
  const sensors = [...new Set(rows.map((r) => r.sensorId))].sort();
  const sets = { train: [], validation: [], test: [] };
  const exclusions = { gapsOrMissingRain: 0, crossingBoundary: 0, unseenSensor: 0 };
  for (const sensorId of sensors) {
    const ordered = rows.filter((r) => r.sensorId === sensorId).sort((a, b) => a.date.localeCompare(b.date));
    for (let index = lookback; index < ordered.length - 1; index++) {
      const history = ordered.slice(index - lookback, index + 1), origin = ordered[index], target = ordered[index + 1];
      if ([...history, target].some((r, j, all) => (j > 0 && shiftCenturyDate(all[j - 1].date, 1) !== r.date)) || history.some((r) => r.rainLag2Mm === null)) { exclusions.gapsOrMissingRain++; continue; }
      let partition;
      if (target.date <= CENTURY_CUTOFFS.trainEnd) partition = "train";
      else if (origin.date >= CENTURY_CUTOFFS.validationStart && target.date <= CENTURY_CUTOFFS.validationEnd) partition = "validation";
      else if (origin.date >= CENTURY_CUTOFFS.testStart && target.date <= CENTURY_CUTOFFS.testEnd) partition = "test";
      if (!partition) { exclusions.crossingBoundary++; continue; }
      const x = history.slice(1).map((r, j) => [r.displacementMm, r.displacementMm - history[j].displacementMm,
        (Date.parse(`${r.timestampLocal}Z`) - Date.parse(`${history[j].timestampLocal}Z`)) / 3600000, r.rainLag2Mm]);
      sets[partition].push({ sensorId, originDate: origin.date, targetDate: target.date, originTimestampLocal: origin.timestampLocal,
        targetTimestampLocal: target.timestampLocal, actualIntervalHours: (Date.parse(`${target.timestampLocal}Z`) - Date.parse(`${origin.timestampLocal}Z`)) / 3600000,
        currentMm: origin.displacementMm, targetMm: target.displacementMm, x });
    }
  }
  const trainedSensors = new Set(sets.train.map((s) => s.sensorId));
  for (const partition of ["validation", "test"]) sets[partition] = sets[partition].filter((s) => {
    if (trainedSensors.has(s.sensorId)) return true;
    exclusions.unseenSensor++; return false;
  });
  return { id: CENTURY_SOURCE.id, features: CENTURY_FEATURES, lookbackDays: lookback, cutoffs: CENTURY_CUTOFFS, exclusions, sets };
}
