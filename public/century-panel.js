const LABELS = { PERSISTENCE: "Persistencia", TREND: "Tendencia lineal", RIDGE: "Ridge", LSTM: "LSTM" };
const format = (v, digits = 3) => Number.isFinite(v) ? v.toFixed(digits) : "No disponible";
const element = (tag, text) => { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; return e; };

function drawCenturyChart(container, data, method) {
  container.replaceChildren();
  const width = 900, height = 280, pad = { left: 64, right: 18, top: 20, bottom: 42 };
  const values = data.series.map((s) => s.displacementMm).concat(data.pairs.map((p) => p.predictions[method]));
  if (!values.length) return;
  const first = data.series[0].date, last = data.series.at(-1).date;
  const min = Math.min(...values), range = Math.max(1, Math.max(...values) - min);
  const time = (date) => Date.parse(`${date}T00:00:00Z`);
  const x = (date) => pad.left + (time(date) - time(first)) / Math.max(1, time(last) - time(first)) * (width - pad.left - pad.right);
  const y = (v) => height - pad.bottom - (v - min) / range * (height - pad.top - pad.bottom);
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`); svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", `Prisma ${data.selectedSensor}. Movimiento 3D medido y predicciones retrospectivas de ${LABELS[method]}, en milímetros.`);
  const add = (tag, attrs, text) => { const e = document.createElementNS(ns, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v)); if (text !== undefined) e.textContent = text; svg.append(e); };
  for (let i = 0; i < 4; i++) {
    const v = min + i * range / 3;
    add("line", { x1: pad.left, x2: width - pad.right, y1: y(v), y2: y(v), stroke: "#264a3f" });
    add("text", { x: 6, y: y(v) + 4, fill: "#a2bdb4", "font-size": 12 }, `${v.toFixed(1)} mm`);
  }
  for (const date of [first, last]) add("text", { x: x(date), y: height - 12, fill: "#a2bdb4", "font-size": 12, "text-anchor": date === first ? "start" : "end" }, date);
  // Solo conectar fechas consecutivas. Nunca dibujar una interpolación sobre días ausentes.
  data.series.forEach((s, i) => {
    const previous = data.series[i - 1];
    if (previous && time(s.date) - time(previous.date) === 86400000) add("line", { x1: x(previous.date), y1: y(previous.displacementMm), x2: x(s.date), y2: y(s.displacementMm), stroke: "#48e2c2", "stroke-width": 2 });
    add("circle", { cx: x(s.date), cy: y(s.displacementMm), r: 2.8, fill: "#48e2c2" });
  });
  data.pairs.forEach((p) => add("circle", { cx: x(p.targetDate), cy: y(p.predictions[method]), r: 3.2, fill: p.partition === "test" ? "#ffe16b" : "#a5a6ef" }));
  container.append(svg);
}

export function setupCenturyPanel() {
  const panel = document.getElementById("century-study");
  if (!panel) return;
  const sensor = document.getElementById("century-sensor"), method = document.getElementById("century-method");
  const status = document.getElementById("century-status");
  let data, requestNumber = 0;
  function render() {
    document.getElementById("century-provenance").textContent = `${data.source.mine} · ${data.audit.rawReadingCount} lecturas originales de ${data.audit.sensorCount} prismas · ${data.audit.startDate} a ${data.audit.endDate}. Caso independiente de Pasco y TA-01.`;
    document.getElementById("century-protocol").textContent = `Memoria: ${data.protocol.lookbackDays} días. Entrenamiento hasta ${data.protocol.cutoffs.trainEnd}; validación ${data.protocol.cutoffs.validationStart}–${data.protocol.cutoffs.validationEnd}; prueba ${data.protocol.cutoffs.testStart}–${data.protocol.cutoffs.testEnd}. Ventanas: ${Object.entries(data.protocol.sequenceCounts).map(([p, n]) => `${p}: ${n}`).join(", ")}. Normalización solo con entrenamiento; selección solo con validación.`;
    const body = document.getElementById("century-metrics"); body.replaceChildren();
    for (const [id, name] of Object.entries(LABELS)) {
      const tr = element("tr");
      for (const text of [name, format(data.metrics.validation[id].maeMm), format(data.metrics.test[id].maeMm), format(data.metrics.test[id].rmseMm), format(data.metrics.test[id].r2, 4)]) tr.append(element("td", text));
      if (id === data.selection.selectedOnValidation) tr.classList.add("century-selected-model");
      body.append(tr);
    }
    document.getElementById("century-selection").textContent = `Seleccionado por validación: ${LABELS[data.selection.selectedOnValidation]}. Menor MAE en prueba: ${LABELS[data.selection.bestOnTestDescriptiveOnly]} (solo descripción, no reselección). LSTM entrenada: ${data.training.epochsCompleted} épocas, pesos de época ${data.training.bestEpoch}. El híbrido físico no se aplica: faltan presión de poros y calibración mecánica.`;
    const warnings = document.getElementById("century-limitations"); warnings.replaceChildren(...data.warnings.map((text) => element("li", text)));
    drawCenturyChart(document.getElementById("century-chart"), data, method.value);
    const forecast = data.retrospectiveForecast;
    document.getElementById("century-replay").textContent = forecast
      ? `Inferencia ejecutada con pesos guardados, no una simulación FEM. Prisma ${data.selectedSensor}, origen ${forecast.originDate} → lectura ${forecast.targetDate}: ${LABELS[method.value]} ${format(forecast.predictions[method.value])} mm; observado ${format(forecast.observedTargetMm)} mm. Intervalo real ${format(forecast.actualIntervalHours, 1)} h. Reproducción retrospectiva, no pronóstico en vivo.`
      : "Este prisma no tiene ventanas consecutivas suficientes para inferencia retrospectiva.";
    const testSensor = data.testBySensor.find((s) => s.sensorId === data.selectedSensor);
    document.getElementById("century-sensor-metric").textContent = testSensor ? `Prueba del prisma seleccionado: ${testSensor.metrics[method.value].sampleCount} ventanas; MAE ${format(testSensor.metrics[method.value].maeMm)} mm. La tabla superior agrupa todos los prismas.` : "Sin ventanas de prueba para este prisma; se muestran sus mediciones originales reducidas por día.";
    panel.dataset.chatContext = JSON.stringify({ source: data.source, scientificStatus: data.scientificStatus, selectedSensor: data.selectedSensor, displayedMethod: method.value,
      audit: data.audit, protocol: data.protocol, metrics: data.metrics, selection: data.selection, retrospectiveForecast: forecast, displayedSeries: data.series,
      warnings: data.warnings });
    status.textContent = "Datos reales cargados · evaluación retrospectiva · no operacional";
  }
  async function load() {
    const number = ++requestNumber;
    data = undefined;
    delete panel.dataset.chatContext;
    status.textContent = "Cargando caso real Century…";
    try {
      const response = await fetch(`/api/research/century${sensor.value ? `?sensor=${encodeURIComponent(sensor.value)}` : ""}`);
      const next = await response.json();
      if (number !== requestNumber) return;
      if (!response.ok) throw new Error(next.error || "Datos no disponibles");
      data = next;
      if (sensor.options.length !== data.sensors.length) sensor.replaceChildren(...data.sensors.map((id) => { const option = element("option", `Prisma ${id}`); option.value = id; return option; }));
      sensor.value = data.selectedSensor;
      render();
    } catch (error) {
      if (number === requestNumber) {
        data = undefined;
        delete panel.dataset.chatContext;
        for (const id of ["century-provenance", "century-protocol", "century-metrics", "century-selection", "century-chart", "century-limitations", "century-replay", "century-sensor-metric"]) document.getElementById(id).replaceChildren();
        status.textContent = `Century no disponible: ${error.message}`;
      }
    }
  }
  sensor.addEventListener("change", load);
  method.addEventListener("change", () => { if (data) render(); });
  document.getElementById("century-refresh").addEventListener("click", load);
  load();
}

if (typeof document !== "undefined") setupCenturyPanel();
