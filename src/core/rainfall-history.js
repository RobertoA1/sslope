const DATASET_ID = "NASA_POWER_POINT_DAILY_PRECTOTCORR";
const MISSING_VALUE = -999;

function numberFromHeader(header, pattern, label) {
  const match = header.match(pattern);
  if (!match) throw new Error(`No se encontró ${label} en la cabecera NASA POWER`);
  const value = Number(match[1]);
  if (!Number.isFinite(value)) throw new Error(`${label} no es numérico`);
  return value;
}

function dateFromYearAndDay(year, dayOfYear) {
  if (!Number.isInteger(year) || !Number.isInteger(dayOfYear) || dayOfYear < 1 || dayOfYear > 366) {
    throw new Error(`Fecha YEAR/DOY inválida: ${year}/${dayOfYear}`);
  }
  const date = new Date(Date.UTC(year, 0, dayOfYear));
  if (date.getUTCFullYear() !== year) throw new Error(`DOY ${dayOfYear} no existe en ${year}`);
  return date.toISOString().slice(0, 10);
}

function percentile(sortedValues, probability) {
  if (!sortedValues.length) return null;
  const index = Math.round((sortedValues.length - 1) * probability);
  return sortedValues[index];
}

function summarize(records, missingCount) {
  const values = records.map((row) => row.rainfallMmDay).sort((a, b) => a - b);
  const annual = new Map();

  for (const row of records) {
    const year = Number(row.date.slice(0, 4));
    const current = annual.get(year) || { year, recordCount: 0, totalRainfallMm: 0, dryDays: 0, rainyDays: 0, maximumDailyMm: 0 };
    current.recordCount += 1;
    current.totalRainfallMm += row.rainfallMmDay;
    current.maximumDailyMm = Math.max(current.maximumDailyMm, row.rainfallMmDay);
    if (row.rainfallMmDay === 0) current.dryDays += 1;
    else current.rainyDays += 1;
    annual.set(year, current);
  }

  const annualSummary = [...annual.values()].map((row) => ({
    ...row,
    totalRainfallMm: Number(row.totalRainfallMm.toFixed(2)),
    maximumDailyMm: Number(row.maximumDailyMm.toFixed(2))
  }));
  const wettestDays = [...records]
    .sort((a, b) => b.rainfallMmDay - a.rainfallMmDay || a.date.localeCompare(b.date))
    .slice(0, 10);

  return {
    recordCount: records.length,
    missingCount,
    startDate: records.at(0)?.date || null,
    endDate: records.at(-1)?.date || null,
    meanDailyMm: records.length ? Number((values.reduce((sum, value) => sum + value, 0) / records.length).toFixed(3)) : null,
    medianDailyMm: percentile(values, 0.5),
    percentile90Mm: percentile(values, 0.9),
    percentile95Mm: percentile(values, 0.95),
    percentile99Mm: percentile(values, 0.99),
    maximumDailyMm: values.at(-1) ?? null,
    dryDays: values.filter((value) => value === 0).length,
    annual: annualSummary,
    wettestDays,
    recommendedDate: wettestDays.at(0)?.date || null
  };
}

export function parseNasaPowerDailyCsv(text) {
  if (typeof text !== "string" || !text.trim()) throw new Error("El CSV NASA POWER está vacío");
  const normalized = text.replace(/\r/g, "");
  const lines = normalized.trim().split("\n");
  const columnsIndex = lines.findIndex((line) => line.trim() === "YEAR,DOY,PRECTOTCORR");
  if (columnsIndex < 0) throw new Error("El CSV no contiene YEAR, DOY y PRECTOTCORR");

  const header = lines.slice(0, columnsIndex).join("\n");
  const latitude = numberFromHeader(header, /latitude\s+(-?\d+(?:\.\d+)?)/i, "la latitud");
  const longitude = numberFromHeader(header, /longitude\s+(-?\d+(?:\.\d+)?)/i, "la longitud");
  const elevationM = numberFromHeader(header, /region\s*=\s*(-?\d+(?:\.\d+)?)\s*meters/i, "la elevación");
  const missingMatch = header.match(/missing source data[^:]*:\s*(-?\d+(?:\.\d+)?)/i);
  const missingValue = missingMatch ? Number(missingMatch[1]) : MISSING_VALUE;
  const records = [];
  const dates = new Set();
  let missingCount = 0;

  for (const [offset, line] of lines.slice(columnsIndex + 1).entries()) {
    if (!line.trim()) continue;
    const cells = line.split(",").map((cell) => cell.trim());
    if (cells.length !== 3) throw new Error(`Fila CSV inválida en la línea ${columnsIndex + offset + 2}`);
    const year = Number(cells[0]);
    const dayOfYear = Number(cells[1]);
    const rainfallMmDay = Number(cells[2]);
    if (!Number.isFinite(rainfallMmDay)) throw new Error(`Precipitación inválida en ${year}/${dayOfYear}`);
    const date = dateFromYearAndDay(year, dayOfYear);
    if (dates.has(date)) throw new Error(`Fecha duplicada en el CSV: ${date}`);
    dates.add(date);
    if (rainfallMmDay === missingValue) {
      missingCount += 1;
      continue;
    }
    if (rainfallMmDay < 0) throw new Error(`Precipitación negativa no permitida en ${date}`);
    records.push({ date, rainfallMmDay });
  }

  records.sort((a, b) => a.date.localeCompare(b.date));
  const summary = summarize(records, missingCount);
  return {
    metadata: {
      id: DATASET_ID,
      source: "NASA POWER",
      underlyingProduct: "MERRA-2 Precipitation Corrected",
      variable: "PRECTOTCORR",
      unit: "mm/day",
      temporalResolution: "DAILY",
      timeStandard: "LST",
      latitude,
      longitude,
      elevationM,
      missingValue,
      sourceUrl: "https://power.larc.nasa.gov/"
    },
    summary,
    records
  };
}

export function rainfallRecordForDate(dataset, date) {
  if (!dataset?.records) throw new Error("No se cargó un conjunto histórico de lluvia");
  const normalizedDate = String(date || "");
  const record = dataset.records.find((row) => row.date === normalizedDate);
  if (!record) throw new Error(`No existe precipitación NASA POWER para ${normalizedDate || "la fecha solicitada"}`);
  return record;
}

export function uniformHourlyProfile(dailyRainfallMm) {
  const total = Number(dailyRainfallMm);
  if (!Number.isFinite(total) || total < 0) throw new Error("La precipitación diaria debe ser un número no negativo");
  const base = Number((total / 24).toFixed(8));
  const profile = Array.from({ length: 24 }, () => base);
  profile[23] = Number((total - base * 23).toFixed(8));
  return profile;
}
