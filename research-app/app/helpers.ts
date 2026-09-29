import type { Series } from './types';

export const labels: Record<string, string> = {
  movement: 'Desplazamiento (mm)', increment: 'Incremento (mm)', interval: 'Intervalo (h)', rain: 'Lluvia, desfase 2 d (mm)',
  train: 'Entrenamiento', validation: 'Validación', test: 'Prueba', outside: 'Fuera del período',
  persistence: 'Persistencia', trend: 'Tendencia', ridge: 'Ridge', random_forest: 'Random Forest', boosting: 'Boosting', dense: 'Dense', lstm: 'LSTM', gru: 'GRU',
};
export const colors: Record<string, string> = { persistence: '#8995a5', trend: '#c79a33', ridge: '#427cda', random_forest: '#16978c', boosting: '#a85ebc', dense: '#d4774d', lstm: '#554ed2', gru: '#c54c7f' };
export const fmt = (value: number | null | undefined, digits = 2) => value == null || !Number.isFinite(value) ? '—' : value.toLocaleString('es-PE', { maximumFractionDigits: digits, minimumFractionDigits: digits });
export const dateLabel = (value: string) => value.slice(5, 10).replace('-', '/');

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, { cache: 'no-store', ...options, headers: { 'Content-Type': 'application/json', ...options?.headers } });
  if (!res.ok) {
    let detail = '';
    try {
      const body = await res.json();
      detail = typeof body.detail === 'string' ? body.detail : Array.isArray(body.detail) ? body.detail.map((v: { msg: string }) => v.msg).join('. ') : '';
    } catch { /* Proxy unavailable or non-JSON failure. */ }
    throw new Error(detail || `No se pudo conectar con la API (${res.status}). Comprueba que FastAPI esté ejecutándose en el puerto 8001.`);
  }
  return res.json();
}

// Keep missing calendar dates visible as gaps, not interpolated line segments.
export function calendarSeries(series: Series[]): Series[] {
  if (!series.length) return [];
  const found = new Map(series.map(v => [v.date.slice(0, 10), v]));
  const result: Series[] = [];
  const day = new Date(`${series[0].date.slice(0, 10)}T00:00:00Z`);
  const end = series[series.length - 1].date.slice(0, 10);
  for (; day.toISOString().slice(0, 10) <= end; day.setUTCDate(day.getUTCDate() + 1)) {
    const date = day.toISOString().slice(0, 10);
    result.push(found.get(date) ?? { date, movement: null, increment: null, interval: null, rain: null, rain_at_lag: null, rain_quality: '', outlier_descriptive: false });
  }
  return result;
}
