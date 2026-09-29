import { CENTURY_FEATURES, CENTURY_SOURCE } from "./century-dataset.js";

export function inferCenturyModels(artifact, sample) {
  if (artifact?.sourceId !== CENTURY_SOURCE.id || artifact.features?.join("|") !== CENTURY_FEATURES.join("|")) throw new Error("Modelo incompatible con Century; no se admiten pesos TA-01");
  const h = artifact.hiddenUnits, w = artifact.weights;
  if (!Number.isInteger(h) || h < 1 || h > 128 || !w || w.wx?.length !== 4 || w.wh?.length !== h ||
    w.wx.some((r) => r.length !== h * 4) || w.wh.some((r) => r.length !== h * 4) || w.b?.length !== h * 4 || w.wy?.length !== h || w.wy.some((r) => r.length !== 1) || w.by?.length !== 1) throw new Error("Pesos LSTM inválidos");
  if (!sample?.x || sample.x.length !== artifact.lookbackDays || sample.x.some((r) => r.length !== 4 || r.some((n) => !Number.isFinite(n))) || !Number.isFinite(sample.currentMm)) throw new Error("Ventana Century inválida");
  if (artifact.featureMean?.length !== 4 || artifact.featureStd?.length !== 4 || artifact.featureStd.some((v) => !Number.isFinite(v) || v <= 0)) throw new Error("Normalización inválida");
  const x = sample.x.map((r) => r.map((v, j) => (v - artifact.featureMean[j]) / artifact.featureStd[j]));
  const sigmoid = (v) => 1 / (1 + Math.exp(-Math.max(-60, Math.min(60, v))));
  let hidden = Array(h).fill(0), cell = Array(h).fill(0);
  for (const row of x) {
    const gates = w.b.map((bias, j) => bias + row.reduce((s, v, i) => s + v * w.wx[i][j], 0) + hidden.reduce((s, v, i) => s + v * w.wh[i][j], 0));
    cell = cell.map((v, i) => sigmoid(gates[h + i]) * v + sigmoid(gates[i]) * Math.tanh(gates[2 * h + i]));
    hidden = cell.map((v, i) => sigmoid(gates[3 * h + i]) * Math.tanh(v));
  }
  const flat = [1, ...x.flat()];
  if (artifact.ridge?.coefficients?.length !== flat.length) throw new Error("Pesos ridge inválidos");
  const last = sample.x.at(-1);
  if (last[2] <= 0) throw new Error("Intervalo temporal inválido");
  const forecasts = {
    PERSISTENCE: sample.currentMm,
    TREND: sample.currentMm + last[1] * 24 / last[2],
    RIDGE: sample.currentMm + artifact.targetMean + artifact.targetStd * flat.reduce((s, v, i) => s + v * artifact.ridge.coefficients[i], 0),
    LSTM: sample.currentMm + artifact.targetMean + artifact.targetStd * hidden.reduce((s, v, i) => s + v * w.wy[i][0], w.by[0])
  };
  if (Object.values(forecasts).some((v) => !Number.isFinite(v))) throw new Error("Resultado Century no finito");
  return forecasts;
}
