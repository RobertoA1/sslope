// Sin referencias a WebGL/Three.js: el contexto no pausa ni reconstruye el visor.
export function summarizeFemForChat(run, progress = 0) {
  if (!run) return null;
  const steps = run.timeSeries || [];
  const elapsedHours = Math.min(1, Math.max(0, progress)) * (run.summary?.durationHours || steps.at(-1)?.hour || 0);
  const frame = steps.reduce((best, step) => !best || Math.abs(step.hour - elapsedHours) < Math.abs(best.hour - elapsedHours) ? step : best, null);
  const { nodes, ...frameSummary } = frame || {};
  return {
    id: run.id, imported: run.imported || false, provenance: run.provenance,
    method: run.method, rainfall: run.rainfall, scenario: run.scenario, summary: run.summary,
    mesh: { nodeCount: run.mesh?.nodeCount, elementCount: run.mesh?.elementCount },
    lstmForecasts: run.lstmForecasts, physicsGuidedForecasts: run.physicsGuidedForecasts,
    hourlySummaries: steps.map(({ nodes: _nodes, ...summary }) => summary),
    displayedFrame: { ...frameSummary, elapsedHours, note: "Estado horario más cercano al progreso visual; el visor puede interpolar entre estados.",
      nodeColumns: ["id", "xM", "yM", "uxMm", "uyMm", "rainfallInducedDisplacementMm", "porePressureKpa"],
      nodeValues: (nodes || run.mesh?.nodes || []).slice(0, 1200).map((node) => [node.id, node.xM, node.yM, node.uxMm, node.uyMm, node.rainfallInducedDisplacementMm, node.porePressureKpa]),
      omittedNodeCount: Math.max(0, (nodes || run.mesh?.nodes || []).length - 1200) }
  };
}

export function collectDashboardContext(document, state) {
  const main = document.querySelector("main");
  const activeMine = document.body?.dataset?.mineCase || "LAB";
  const inactiveControl = (input) => activeMine !== "LAB" && input.closest?.(".laboratory-only,#controls-simulation .dashboard-stack,#controls-data .dashboard-stack,#controls-view .layer-controls");
  const controls = [...(main?.querySelectorAll("input,select,textarea") || [])].filter((input) => !["file", "password", "hidden"].includes(input.type) && !inactiveControl(input) && !(activeMine === "PASCO" && input.closest?.(".century-only,.material-motion-toggle"))).map((input) => ({
    id: input.id, parameter: input.dataset?.param || input.dataset?.policy,
    value: ["checkbox", "radio"].includes(input.type) ? input.checked : input.value,
    selectedLabel: input.selectedOptions?.[0]?.textContent,
    disabled: input.disabled
  }));
  const clone = main?.cloneNode(true);
  if (activeMine !== "LAB") clone?.querySelectorAll(".laboratory-only,#controls-simulation .dashboard-stack,#controls-data .dashboard-stack,#controls-view .layer-controls").forEach((node) => node.remove());
  if (activeMine === "PASCO") clone?.querySelectorAll("#century-study,.century-only,.material-motion-toggle").forEach((node)=>node.remove());
  // Las pestañas organizan la interfaz, pero no recortan el conocimiento del chat.
  clone?.querySelectorAll('[role="tabpanel"]').forEach((panel) => panel.removeAttribute("hidden"));
  clone?.querySelectorAll("script,style,[hidden],#photo-preview").forEach((node) => node.remove());
  const dashboardText = clone?.textContent?.replace(/\s+/g, " ").trim() || "";
  const progress = state.playback?.progress || 0;
  let realDataStudy = null;
  try { if (activeMine !== "PASCO") realDataStudy = JSON.parse(document.querySelector("#century-study")?.dataset?.chatContext || "null"); } catch { /* Un contexto malformado no interrumpe el chat. */ }
  return {
    capturedAt: new Date().toISOString(),
    scope: "Instantánea de datos del tablero, no imagen; incluye paneles plegables y todas las pestañas. Controles pueden tener cambios aún no aplicados.",
    dashboardText: dashboardText.slice(0, 60000), omittedTextCharacters: Math.max(0, dashboardText.length - 60000),
    activeControlTab: document.querySelector('[role="tab"][aria-selected="true"]')?.textContent,
    activeMine, mineTwin:state.mineTwinSnapshot || null,
    realDataStudy, controls, forecast: state.forecast, displayedTelemetry: state.readings,
    twin: state.twin, weather: state.weather, researchExperiment: state.researchExperiment,
    visualization: { progress, amplification: state.amplification, externalViewerActive: state.externalViewerActive,
      selectedSensor: document.querySelector("#selected-sensor")?.textContent,
      geometry: state.twin?.geometry?.current, localGeometry: state.geometryAsset ? {
        name: state.geometryAsset.name, format: state.geometryAsset.format, bounds: state.geometryAsset.bounds,
        note: "Metadatos del modelo local; no se envían fotos ni archivos originales." } : null },
    fem: summarizeFemForChat(state.femRun, progress)
  };
}
