import { approximateFromPhoto, readModel } from "./geometry-adapters.js";
import { SlopeScene3D } from "./slope-scene-3d.js";
import { parseTelemetryFile } from "./telemetry-import.js";
import { amplificationFromSlider, sliderFromAmplification } from "./displacement-scale.js";

const $ = (selector) => document.querySelector(selector);
const api = async (path, options) => {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Error de servicio");
  return data;
};
const emptyWeather = () => ({ active: false, rainfallMmH: 0, durationHours: 0, event: null });
const scene = { yaw: -0.62, pitch: 0.52, zoom: 2.25, panX: 0, panY: 5, drag: null, hits: [], coordinateHits: [], forecast: null, readings: [], freecam: false, camera: { x: 0, y: 0, z: 0 }, geometryAsset: null, photoApproximation: null, twin: null, weather: emptyWeather(), researchExperiment: null, femRun: null, playback: { progress: 0, playing: false, lastFrame: 0, lastDraw: 0, raf: null } };
let sceneRenderer = null;
let viewerWindow = null;
let lastViewerPublish = 0;
let lastPublishedForecast = null;
let lastPublishedReadings = null;
let lastPublishedGeometry = null;
let lastPublishedPhoto = null;
let lastPublishedFem = null;
let externalViewerActive = false;
let viewerCloseTimer = null;
let rainfallHistory = null;
const isViewerWindow = new URLSearchParams(window.location.search).get("viewer") === "1";
if (isViewerWindow) document.body.classList.add("viewer-only");
const clamp = (v, min = 0, max = 1) => Math.min(Math.max(v, min), max);
const slopeFootprint = (x, z, parameters = {}) => {
  const width = parameters.slopeWidthM || 160, halfWidth = width / 2, halfDepth = width * .42;
  const type = parameters.geometryType || "LINEAR";
  if (type === "CIRCULAR" || type === "WASTE_DUMP") return Math.hypot(x / halfWidth, z / halfDepth) <= 1;
  // Semidisco abierto hacia el pie: una pared de mina tipo anfiteatro.
  if (type === "SEMICIRCULAR") return Math.hypot((x - halfWidth) / width, z / halfDepth) <= 1;
  return true;
};
const terrainHeight = (x, z = 0, parameters = {}) => {
  const width = parameters.slopeWidthM || 160, height = parameters.slopeHeightM || 90, halfWidth = width / 2, halfDepth = width * .42;
  const type = parameters.geometryType || "LINEAR", progress = clamp((x + halfWidth) / width);
  if (type === "LINEAR") return height * (1 - progress);
  if (type === "BENCHED") return Math.round((height * (1 - progress)) / 12) * 12;
  if (type === "CIRCULAR") {
    const radius = clamp(Math.hypot(x / halfWidth, z / halfDepth));
    return height * (.08 + .92 * radius); // fosa elíptica: centro bajo y corona alta
  }
  if (type === "SEMICIRCULAR") {
    const radius = clamp(Math.hypot((x - halfWidth) / width, z / halfDepth));
    return height * radius; // anfiteatro abierto hacia el frente
  }
  const radius = clamp(Math.hypot(x / halfWidth, z / halfDepth));
  return height * (1 - radius) ** .72; // botadero radial, alto al centro
};

function riskMessage(level) {
  return ({ NORMAL: "Las condiciones actuales se mantienen dentro del rango definido.", VIGILANCIA: "Se recomienda aumentar la observación y revisar la calidad de telemetría.", ALERTA: "Existe tendencia de deterioro: active el protocolo de revisión geotécnica.", CRITICO: "Condición prioritaria: siga el protocolo operacional de seguridad." })[level];
}
function riskColor(level) { return ({ NORMAL:"#48e2c2", VIGILANCIA:"#ffca6a", ALERTA:"#ff9655", CRITICO:"#ff6374" })[level]; }

function drawChart(rows, forecast) {
  if (!forecast || !rows?.length) return;
  const canvas = $("#chart"), ctx = canvas.getContext("2d"), width = canvas.width, height = canvas.height;
  const dpr = window.devicePixelRatio || 1; const cssWidth = canvas.clientWidth;
  canvas.width = cssWidth * dpr; canvas.height = 260 * dpr; ctx.scale(dpr, dpr);
  const w = cssWidth, h = 260, pad = { left:48,right:22,top:18,bottom:29 };
  ctx.clearRect(0,0,w,h); const values = rows.map((x) => x.displacementMm).concat([forecast.predictedDisplacementMm]);
  const min = Math.min(...values) * .96, max = Math.max(...values) * 1.04, range = Math.max(.1,max-min);
  const x = (i,total) => pad.left + (i/(total-1)) * (w-pad.left-pad.right); const y = (v) => pad.top+(max-v)/range*(h-pad.top-pad.bottom);
  ctx.strokeStyle="#1d3d33";ctx.lineWidth=1;ctx.font="10px DM Mono";ctx.fillStyle="#719087";
  for(let i=0;i<4;i++){ const gy=pad.top+i*(h-pad.top-pad.bottom)/3;ctx.beginPath();ctx.moveTo(pad.left,gy);ctx.lineTo(w-pad.right,gy);ctx.stroke();ctx.fillText((max-i*range/3).toFixed(1)+" mm",4,gy+3); }
  ctx.beginPath(); rows.forEach((row,i)=> i?ctx.lineTo(x(i,rows.length),y(row.displacementMm)):ctx.moveTo(x(i,rows.length),y(row.displacementMm)));ctx.strokeStyle="#48e2c2";ctx.lineWidth=2;ctx.stroke();
  const last = rows.at(-1); ctx.beginPath();ctx.setLineDash([5,5]);ctx.moveTo(x(rows.length-1,rows.length+1),y(last.displacementMm));ctx.lineTo(x(rows.length,rows.length+1),y(forecast.predictedDisplacementMm));ctx.strokeStyle="#ffca6a";ctx.stroke();ctx.setLineDash([]);
  ctx.fillStyle="#48e2c2";ctx.beginPath();ctx.arc(x(rows.length-1,rows.length+1),y(last.displacementMm),3,0,Math.PI*2);ctx.fill();ctx.fillStyle="#ffca6a";ctx.beginPath();ctx.arc(x(rows.length,rows.length+1),y(forecast.predictedDisplacementMm),4,0,Math.PI*2);ctx.fill();
  ctx.fillStyle="#719087";ctx.fillText("historial",pad.left,h-8);ctx.fillText(`+${forecast.horizonHours} h`,w-pad.right-28,h-8);
}

function colorFor(value, highContrast = true) { const hue = 162 - clamp(value) * 160; return `hsl(${hue} ${highContrast ? 82 : 52}% ${highContrast ? 42 + clamp(value) * 15 : 37 + clamp(value) * 9}%)`; }
function materialFor(depth, parameters) { if (parameters.bedrockCondition !== "NONE" && depth >= parameters.bedrockDepthM) return "rock"; return depth > 12 ? "weathered" : "soil"; }
function materialColor(material, x, z, highContrast) {
  const variation = ((Math.sin(x * .13 + z * .08) + 1) * .5 - .5) * (highContrast ? 9 : 4);
  const palette = { rock: [29, 17, 47], weathered: [27, 38, 38], soil: [24, 38, 30] };
  const [hue, saturation, light] = palette[material];
  return `hsl(${hue} ${saturation}% ${light + variation}%)`;
}
function layerMeta(layer, forecast, readings) {
  const last = readings.at(-1) || { porePressureKpa: 0 };
  const values = {
    risk: { label: "Riesgo bajo → alto", source: "Capa exploratoria del modelo reducido temporal–físico; no proviene del FEM 2D TA-01.", base: forecast.risk.score, unit: "índice" },
    displacement: { label: "Desplazamiento bajo → alto", source: "Desplazamiento previsto por el modelo temporal corregido por física.", base: clamp(forecast.predictedIncrementMm / 40), unit: "mm" },
    pore: { label: "Presión baja → alta", source: "Presión de poros de la última telemetría, interpolada sobre el talud.", base: clamp(last.porePressureKpa / 210), unit: "kPa" },
    safety: { label: "Índice mayor → menor", source: "Campo demostrativo derivado del índice de seguridad reducido; no es un FoS FEM.", base: clamp((1.5 - forecast.femState.factorOfSafety) / 0.6), unit: "índice" },
    uncertainty: { label: "Certeza alta → baja", source: "Incertidumbre del pronóstico combinada con variación espacial demostrativa.", base: forecast.risk.uncertainty, unit: "%" }
  };
  return values[layer];
}

function playbackState(forecast = scene.forecast) {
  const progress = clamp(scene.playback.progress), horizonHours = scene.femRun?.summary?.durationHours || forecast?.horizonHours || 0;
  if (scene.femRun) {
    const steps = scene.femRun.timeSeries || [];
    const index = progress <= 0 ? -1 : Math.min(steps.length - 1, Math.ceil(progress * steps.length) - 1);
    const displacementMm = index < 0 ? 0 : steps[index].maximumRainfallInducedDisplacementMm;
    return { progress, horizonHours, elapsedHours: horizonHours * progress, baselineMm: 0, incrementMm: scene.femRun.summary.maximumRainfallInducedDisplacementMm, displacementMm };
  }
  const baselineMm = forecast?.currentDisplacementMm || 0, incrementMm = Math.max(0, forecast?.predictedIncrementMm ?? ((forecast?.predictedDisplacementMm || baselineMm) - baselineMm));
  return { progress, horizonHours, elapsedHours: horizonHours * progress, baselineMm, incrementMm, displacementMm: baselineMm + incrementMm * progress };
}
const visualAmplification = () => amplificationFromSlider($("#playback-amplification")?.value);
function spatialForecastPoint(point, parameters, forecast, force = false) {
  const state = playbackState(forecast);
  if (!state.progress || !forecast) return point;
  if (!force && !$("#material-motion-enabled")?.checked) return point;
  const width = parameters.slopeWidthM || 160, halfWidth = width / 2, halfDepth = width * .42;
  const normalizedX = clamp((point.x + halfWidth) / width), normalizedZ = clamp((point.z + halfDepth) / (halfDepth * 2));
  const type = parameters.geometryType || "LINEAR";
  let influence = Math.exp(-(((normalizedX - .47) ** 2) / .075 + ((normalizedZ - .52) ** 2) / .16));
  let direction = { x: .92, y: -.28, z: .08 };
  if (type === "CIRCULAR" || type === "WASTE_DUMP") {
    const radial = { x: point.x / Math.max(halfWidth, 1), z: point.z / Math.max(halfDepth, 1) }, length = Math.hypot(radial.x, radial.z) || 1;
    direction = { x: radial.x / length, y: type === "CIRCULAR" ? -.18 : -.1, z: radial.z / length };
    influence = type === "CIRCULAR" ? clamp(1 - Math.hypot(radial.x, radial.z) * .58) : clamp(.35 + Math.hypot(radial.x, radial.z) * .5);
  } else if (type === "SEMICIRCULAR") {
    const radial = { x: (point.x - halfWidth) / Math.max(width, 1), z: point.z / Math.max(halfDepth, 1) }, length = Math.hypot(radial.x, radial.z) || 1;
    direction = { x: radial.x / length, y: -.2, z: radial.z / length };
    influence = clamp(1 - length * .6);
  }
  // El modelo entrega mm; se multiplica solo en pantalla para que el campo sea legible.
  const visualMeters = Math.min(22, state.incrementMm * .001 * visualAmplification()) * state.progress * influence;
  return { x: point.x + direction.x * visualMeters, y: point.y + direction.y * visualMeters, z: point.z + direction.z * visualMeters };
}
function renderPlaybackUi() {
  const forecast = scene.forecast; if (!forecast) return;
  const state = playbackState(forecast), percent = Math.round(state.progress * 100), track = $(".playback-track");
  $("#playback-time").textContent = `t = +${state.elapsedHours.toFixed(1)} h / ${state.horizonHours} h`;
  const guided = scene.femRun?.physicsGuidedForecasts?.[$("#fem-lstm-horizon")?.value];
  $("#playback-displacement").textContent = guided ? `FEM: ${state.displacementMm.toFixed(4)} mm · IA h${guided.targetHour}: ${guided.predictedDisplacementMm.toFixed(4)} mm` : `Desplazamiento: ${state.displacementMm.toFixed(2)} mm`;
  $("#playback-progress").style.width = `${percent}%`; track.setAttribute("aria-valuenow", String(percent));
  $("#playback-seek").value = String(percent);
  $("#playback-amplification-value").textContent = `${visualAmplification()}×`;
  $("#playback-scale-1x").disabled = visualAmplification() === 1;
  $("#playback-note").textContent = scene.femRun
    ? visualAmplification() === 1
      ? "Campo nodal FEM 2D por hora a 1×, sin amplificación. El panel y el JSON muestran los desplazamientos calculados en mm."
      : "Campo nodal FEM 2D por hora con autoescala visual. El panel y el JSON mantienen los desplazamientos calculados en mm."
    : visualAmplification() === 1
      ? "Visualización espacial interpolada del pronóstico a 1×, sin amplificar su magnitud. No representa una falla FEM nodo a nodo."
      : "Visualización espacial interpolada del pronóstico. La deformación está amplificada para ser visible; no representa una falla FEM nodo a nodo.";
  $("#play-displacement").textContent = state.progress > 0 && state.progress < 1 && !scene.playback.playing ? "▶ Reanudar simulación" : "▶ Simular desplazamiento";
  $("#play-displacement").disabled = scene.playback.playing; $("#pause-displacement").disabled = !scene.playback.playing;
}
function stopDisplacementPlayback() {
  scene.playback.playing = false;
  if (scene.playback.raf) cancelAnimationFrame(scene.playback.raf);
  scene.playback.raf = null; renderPlaybackUi();
}
function playbackFrame(timestamp) {
  if (!scene.playback.playing || !scene.forecast) return;
  const speed = Number($("#playback-speed").value) || 1, previous = scene.playback.lastFrame || timestamp;
  scene.playback.progress = clamp(scene.playback.progress + (timestamp - previous) / (12000 / speed)); scene.playback.lastFrame = timestamp;
  if (scene.playback.progress >= 1) { scene.playback.progress = 1; stopDisplacementPlayback(); drawScene(); return; }
  if (!scene.playback.lastDraw || timestamp - scene.playback.lastDraw >= 45) {
    scene.playback.lastDraw = timestamp;
    drawScene();
  }
  scene.playback.raf = requestAnimationFrame(playbackFrame);
}
function playDisplacementPlayback() {
  if (!scene.forecast) return;
  if (scene.playback.progress >= 1) scene.playback.progress = 0;
  scene.playback.playing = true; scene.playback.lastFrame = performance.now(); scene.playback.lastDraw = 0; renderPlaybackUi(); scene.playback.raf = requestAnimationFrame(playbackFrame);
}
function resetDisplacementPlayback() { stopDisplacementPlayback(); scene.playback.progress = 0; renderPlaybackUi(); drawScene(); }
function setupPlaybackControls() {
  $("#play-displacement").addEventListener("click", playDisplacementPlayback);
  $("#pause-displacement").addEventListener("click", stopDisplacementPlayback);
  $("#reset-displacement").addEventListener("click", resetDisplacementPlayback);
  $("#playback-speed").addEventListener("change", renderPlaybackUi);
  $("#playback-seek").addEventListener("input", (event) => {
    stopDisplacementPlayback();
    scene.playback.progress = Number(event.target.value) / 100;
    renderPlaybackUi();
    drawScene();
  });
  $("#playback-amplification").addEventListener("input", () => { renderPlaybackUi(); drawScene(); });
  $("#playback-scale-1x").addEventListener("click", () => {
    $("#playback-amplification").value = "0";
    renderPlaybackUi();
    drawScene();
  });
}

const coordinateText = (value) => Math.abs(value) >= 1000 ? Math.round(value).toLocaleString("es-PE") : Number(value.toFixed(1)).toString();
function drawCoordinateHud(ctx, info) {
  ctx.save(); ctx.globalAlpha = .94; ctx.fillStyle = "#071a15dd"; ctx.strokeStyle = "#386157"; ctx.lineWidth = 1; ctx.fillRect(14, 14, 244, 110); ctx.strokeRect(14, 14, 244, 110);
  ctx.font = "10px DM Mono"; ctx.fillStyle = "#73a79a"; ctx.fillText("SISTEMA DE COORDENADAS", 25, 34); ctx.fillStyle = "#d7f3ea"; ctx.font = "9px DM Mono"; ctx.fillText(info.system, 25, 51);
  [["E / X", info.east, "#ff846d"], ["N / Y", info.north, "#59dcc0"], ["COTA / Z", info.elevation, "#87b6ff"]].forEach(([axis, range, color], index) => { const y = 70 + index * 16; ctx.fillStyle = color; ctx.fillText(axis, 25, y); ctx.fillStyle = "#d7f3ea"; ctx.fillText(range, 91, y); }); ctx.restore();
}
function renderCoordinateInspector(info, enabled) {
  const inactive = { system: "Coordenadas ocultas", east: "—", north: "—", elevation: "—", summary: "Cuadrícula y coordenadas desactivadas" };
  const value = enabled ? info : inactive;
  $("#coordinate-readout").textContent = value.summary; $("#coordinate-system").textContent = value.system; $("#coordinate-east").textContent = value.east; $("#coordinate-north").textContent = value.north; $("#coordinate-elevation").textContent = value.elevation;
  if (!enabled) $("#coordinate-hover").textContent = "Activa la cuadrícula para inspeccionar referencias.";
}
const reportRiskColor = (level) => ({ NORMAL: "#227f68", VIGILANCIA: "#a97522", ALERTA: "#ad6132", CRITICO: "#9b3442" })[level] || "#527f75";
function reportModel() {
  const forecast = scene.forecast, parameters = forecast?.simulationParameters || {}, last = scene.readings.at(-1) || {};
  if (!forecast) throw new Error("Actualiza el gemelo antes de generar el informe.");
  const geometry = scene.geometryAsset?.format ? `Malla importada ${scene.geometryAsset.format}` : scene.photoApproximation ? "Aproximacion visual desde fotografia" : "Talud parametrico";
  return {
    generatedAt: new Date().toLocaleString("es-PE"), risk: forecast.risk.level, riskColor: reportRiskColor(forecast.risk.level), geometry, coordinates: $("#coordinate-readout")?.textContent || "Referencia espacial no disponible", parameters, forecast, last,
    metrics: [
      ["Índice de seguridad reducido", forecast.femState.factorOfSafety.toFixed(3), "índice"], ["Desplazamiento actual", `${(last.displacementMm || forecast.currentDisplacementMm).toFixed(2)}`, "mm"], ["Prediccion", `${forecast.predictedDisplacementMm.toFixed(2)}`, `mm / ${forecast.horizonHours} h`],
      ["Velocidad", forecast.femState.displacementRateMmH.toFixed(3), "mm/h"], ["Presion de poros", (last.porePressureKpa || 0).toFixed(1), "kPa"], ["Incertidumbre", `${(forecast.risk.uncertainty * 100).toFixed(1)}`, "%"]
    ]
  };
}
const pdfSafeText = (value) => String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7E]/g, " ").replace(/([\\()])/g, "\\$1");
const pdfRgb = (hex, stroke = false) => { const value = hex.replace("#", ""); return `${parseInt(value.slice(0, 2), 16) / 255} ${parseInt(value.slice(2, 4), 16) / 255} ${parseInt(value.slice(4, 6), 16) / 255} ${stroke ? "RG" : "rg"}`; };
function pdfCanvas() {
  const ops = [];
  return { ops, rect:(x,y,w,h,color)=>ops.push(`${pdfRgb(color)} ${x} ${y} ${w} ${h} re f`), line:(x1,y1,x2,y2,color,width=.7)=>ops.push(`${pdfRgb(color,true)} ${width} w ${x1} ${y1} m ${x2} ${y2} l S`), text:(text,x,y,size=10,color="#162b27",bold=false)=>ops.push(`${pdfRgb(color)} BT /${bold ? "F2" : "F1"} ${size} Tf ${x} ${y} Td (${pdfSafeText(text)}) Tj ET`) };
}
function pdfHeader(page, title) {
  page.rect(0, 800, 595, 42, "#0b241e"); page.text("RC", 48, 815, 18, "#56d6bd", true); page.text("DIGITAL TWIN DE ESTABILIDAD DE TALUDES", 88, 815, 8, "#e6faf4", true); page.text(title, 445, 815, 8, "#b8d9d0");
  page.line(46, 35, 549, 35, "#c7ddd6"); page.text("RC | Informe tecnico", 46, 20, 8, "#58716a"); page.text(`Pagina ${title} de 3`, 493, 20, 8, "#58716a");
}
function pdfTrend(page, model) {
  const x=52,y=275,w=490,h=130, values=scene.readings.map((row)=>row.displacementMm).concat([model.forecast.predictedDisplacementMm]), min=Math.min(...values)*.94,max=Math.max(...values)*1.05,range=Math.max(.1,max-min);
  page.text("COMPORTAMIENTO HISTORICO Y PREDICCION", x, y+h+22, 10, "#16362f", true); page.rect(x,y,w,h,"#f2f7f5"); for(let i=0;i<4;i++) page.line(x,y+i*h/3,x+w,y+i*h/3,"#d5e2de",.45);
  const px=(index,total)=>x+index*w/(total-1), py=(value)=>y+(value-min)*h/range;
  const rows=scene.readings; for(let i=1;i<rows.length;i++) page.line(px(i-1,values.length),py(rows[i-1].displacementMm),px(i,values.length),py(rows[i].displacementMm),"#299f88",1.6);
  if(rows.length){ const last=rows.length-1; page.line(px(last,values.length),py(rows[last].displacementMm),px(last+1,values.length),py(model.forecast.predictedDisplacementMm),"#c88d32",1.6); }
  page.text("Telemetria", x+8, y+8, 8, "#217e6b"); page.text(`Pronostico +${model.forecast.horizonHours} h`, x+w-105, y+8, 8, "#a97522"); page.text(`${max.toFixed(1)} mm`, x+4, y+h-12, 8, "#58716a"); page.text(`${min.toFixed(1)} mm`, x+4, y+2, 8, "#58716a");
}
function pdfSceneSnapshot() {
  const source = $("#scene-3d");
  if (!source?.width || !source?.height) return null;
  const target = document.createElement("canvas"), width = 360, height = 220;
  target.width = width; target.height = height;
  const context = target.getContext("2d", { willReadFrequently: true }); context.drawImage(source, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height).data; let hex = "";
  for (let index = 0; index < pixels.length; index += 4) hex += [pixels[index], pixels[index + 1], pixels[index + 2]].map((value) => value.toString(16).padStart(2, "0")).join("");
  return { width, height, hex };
}
function createPdfReport(model) {
  const p1=pdfCanvas(), p2=pdfCanvas(), p3=pdfCanvas(), p4=pdfCanvas(), dark="#0b241e", pale="#eef6f3", ink="#18352e", snapshot=pdfSceneSnapshot();
  p1.rect(0,0,595,842,dark); p1.rect(0,0,15,842,"#54d4bb"); p1.text("RC", 438, 730, 72, "#54d4bb", true); p1.text("DIGITAL TWIN", 55, 748, 11, "#7bdcc8", true); p1.text("Informe tecnico", 55, 625, 32, "#ffffff", true); p1.text("Estabilidad de taludes en mina a cielo abierto", 55, 592, 14, "#cfeae3");
  p1.line(55,548,340,548,"#54d4bb",1.2); p1.text("Estado del analisis",55,520,10,"#7bdcc8",true); p1.text(`Nivel de riesgo: ${model.risk}`,55,490,20,"#ffffff",true); p1.rect(55,450,180,24,model.riskColor); p1.text("RESULTADO DEL GEMELO",65,458,8,"#ffffff",true);
  [["Fecha",model.generatedAt],["Mina / talud","Talud analizado - configuracion activa"],["Geometria",model.geometry],["Horizonte",`${model.forecast.horizonHours} horas`]].forEach(([label,value],i)=>{const y=390-i*47;p1.text(label.toUpperCase(),55,y+18,8,"#7bdcc8",true);p1.text(value,155,y+18,10,"#ffffff");p1.line(55,y,440,y,"#315a50",.5);}); p1.text("RC | Digital Twin de Estabilidad de Taludes",55,66,9,"#a4cfc5"); p1.text("Informe tecnico generado por el sistema",55,48,8,"#719d92");
  pdfHeader(p2,"2"); p2.text("ESTADO DEL TALUD",46,758,18,ink,true); p2.text("Resumen de indicadores actuales y resultado de prediccion",46,739,10,"#58716a"); model.metrics.forEach(([label,value,unit],index)=>{const col=index%3,row=Math.floor(index/3),x=46+col*168,y=650-row*74;p2.rect(x,y,155,60,pale);p2.line(x,y+60,x+155,y+60,"#66b8a7",1);p2.text(label.toUpperCase(),x+10,y+43,7,"#58716a",true);p2.text(value,x+10,y+20,18,ink,true);p2.text(unit,x+100,y+22,8,"#58716a");});
  p2.text("RIESGO Y PREDICCION",46,535,10,ink,true); p2.rect(46,486,503,34,"#f3f7f5"); p2.rect(46,486,10,34,model.riskColor); p2.text(`Nivel ${model.risk} - Indice ${(model.forecast.risk.score*100).toFixed(1)} / 100`,68,500,12,ink,true); p2.text(`Pronostico: ${model.forecast.predictedIncrementMm.toFixed(2)} mm de incremento en ${model.forecast.horizonHours} h`,68,489,8,"#58716a"); pdfTrend(p2,model);
  pdfHeader(p3,"3"); p3.text("MODELO, GEOMETRIA Y PARAMETROS",46,758,18,ink,true); p3.text("Referencia espacial y configuracion geotecnica usada por el gemelo",46,739,10,"#58716a");
  [["Geometria",model.geometry],["Coordenadas",model.coordinates],["Tipo de talud",model.parameters.geometryType],["Dimensiones",`${model.parameters.slopeHeightM} m alto | ${model.parameters.slopeWidthM} m ancho`],["Angulo",`${model.parameters.slopeAngleDeg} grados`],["Resistencia",`c ${model.parameters.cohesionKpa} kPa | phi ${model.parameters.frictionAngleDeg} grados`],["Agua y drenaje",`Presion ${Math.round(model.parameters.waterPressureFactor*100)}% | Drenaje ${Math.round(model.parameters.drainageEfficiency*100)}%`],["Material",model.parameters.bedrockCondition === "NONE" ? "Sin roca competente configurada" : model.parameters.bedrockCondition]].forEach(([label,value],index)=>{const y=680-index*56;p3.rect(46,y,503,42,index%2?"#f7faf9":"#eef6f3");p3.text(label.toUpperCase(),58,y+25,8,"#4d746a",true);p3.text(String(value).slice(0,82),190,y+25,9,ink);});
  p3.text("CONCLUSION TECNICA",46,198,11,ink,true); p3.rect(46,122,503,62,"#f6f8f7"); p3.rect(46,122,8,62,model.riskColor); p3.text(`El gemelo clasifica la condicion actual como ${model.risk}.`,68,158,11,ink,true); p3.text("Este informe es un apoyo academico a la decision y requiere validacion geotecnica antes de uso operacional.",68,139,8,"#58716a");
  pdfHeader(p4,"4"); p4.text("MODELO 3D DEL GEMELO",46,758,18,ink,true); p4.text("Captura del simulador espacial en el estado que fue analizado",46,739,10,"#58716a");
  if(snapshot) { p4.ops.push(`q 500 0 0 306 46 378 cm /Im1 Do Q`); p4.line(46,378,546,378,"#c7ddd6"); p4.line(46,684,546,684,"#c7ddd6"); p4.line(46,378,46,684,"#c7ddd6"); p4.line(546,378,546,684,"#c7ddd6"); } else { p4.rect(46,430,500,180,"#f2f7f5"); p4.text("Captura del modelo 3D no disponible en esta sesion.",68,520,12,"#58716a"); }
  p4.text("LECTURA ESPACIAL",46,330,10,ink,true); p4.rect(46,264,500,48,"#f2f7f5"); p4.rect(46,264,8,48,model.riskColor); p4.text(`Geometria: ${model.geometry}`,68,289,10,ink,true); p4.text(`Capa visual: ${$("#scene-layer")?.selectedOptions?.[0]?.textContent || "Riesgo pronosticado"} | ${model.coordinates}`,68,275,8,"#58716a");
  const contents=[p1.ops.join("\n"),p2.ops.join("\n"),p3.ops.join("\n"),p4.ops.join("\n")], pageIds=[3,5,7,9], contentIds=[4,6,8,10], fontNormal=11,fontBold=12, imageId=13;
  const objects=["<< /Type /Catalog /Pages 2 0 R >>",`<< /Type /Pages /Kids [${pageIds.map((id)=>`${id} 0 R`).join(" ")}] /Count 4 >>`]; contents.forEach((content,index)=>{const resources=`/Font << /F1 ${fontNormal} 0 R /F2 ${fontBold} 0 R >>${index===3&&snapshot?` /XObject << /Im1 ${imageId} 0 R >>`:""}`;objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << ${resources} >> /Contents ${contentIds[index]} 0 R >>`,`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);}); objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>","<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>"); if(snapshot) objects.push(`<< /Type /XObject /Subtype /Image /Width ${snapshot.width} /Height ${snapshot.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /ASCIIHexDecode /Length ${snapshot.hex.length + 1} >>\nstream\n${snapshot.hex}>\nendstream`);
  let pdf="%PDF-1.4\n% RC\n",offsets=[0];objects.forEach((object,index)=>{offsets.push(pdf.length);pdf+=`${index+1} 0 obj\n${object}\nendobj\n`;});const xref=pdf.length;pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.slice(1).map((offset)=>`${String(offset).padStart(10,"0")} 00000 n `).join("\n")}\ntrailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;return new Blob([pdf],{type:"application/pdf"});
}
const rtfSafeText = (value) => String(value).replace(/\\/g, "\\\\").replace(/[{}]/g, "\\$&").replace(/[^\x00-\x7F]/g, (character) => `\\u${character.charCodeAt(0)}?`);
function rtfTable(rows, widths=[2600,7300]) { return rows.map((row,index)=>{const style=index===0?"\\trhdr\\clcbpat1\\clcbpat1\\cf8":"\\cf0";return `\\trowd\\trkeep\\trgaph120\\trleft0\\cellx${widths[0]}\\cellx${widths[1]}${style}\\intbl\\b ${rtfSafeText(row[0])}\\b0\\cell\\intbl ${rtfSafeText(row[1])}\\cell\\row\\cf0`;}).join("\n"); }
function rtfImageFromCanvas(id, widthGoal = 9500) { const source=$(id); if(!source?.width || !source?.height) return ""; const png=source.toDataURL("image/png").split(",")[1]; let hex=""; const binary=atob(png); for(let index=0;index<binary.length;index++) hex+=binary.charCodeAt(index).toString(16).padStart(2,"0"); const heightGoal=Math.round(widthGoal*source.height/source.width); return `{\\pict\\pngblip\\picw${source.width}\\pich${source.height}\\picwgoal${widthGoal}\\pichgoal${heightGoal} ${hex}}`; }
function createWordReport(model) {
  const metrics=model.metrics, paramRows=[["Geometria",model.geometry],["Coordenadas",model.coordinates],["Tipo de talud",model.parameters.geometryType],["Dimensiones",`${model.parameters.slopeHeightM} m alto | ${model.parameters.slopeWidthM} m ancho`],["Angulo",`${model.parameters.slopeAngleDeg} grados`],["Cohesion",`${model.parameters.cohesionKpa} kPa`],["Friccion interna",`${model.parameters.frictionAngleDeg} grados`],["Drenaje",`${Math.round(model.parameters.drainageEfficiency*100)}%`]];
  const header=`{\\header\\pard\\qr\\cf2\\b RC\\b0\\cf0  |  Digital Twin de Estabilidad de Taludes\\par}`;const footer=`{\\footer\\pard\\qc Informe tecnico RC  |  Pagina {\\field{\\*\\fldinst PAGE}} de {\\field{\\*\\fldinst NUMPAGES}}\\par}`;
  const riskColour={NORMAL:4,VIGILANCIA:5,ALERTA:6,CRITICO:7}[model.risk]||3, sceneImage=rtfImageFromCanvas("#scene-3d"), chartImage=rtfImageFromCanvas("#chart");
  const cover=`\\pard\\qc\\cf2\\fs64\\b RC\\b0\\fs20\\par\\par\\cf2\\b DIGITAL TWIN\\b0\\cf0\\par\\par\\fs44\\b Informe tecnico de estabilidad\\b0\\fs20\\par\\par Estabilidad de taludes en mina a cielo abierto\\par\\par\\par\\cf${riskColour}\\b NIVEL DE RIESGO\\b0\\cf0\\par\\fs30\\cf${riskColour}\\b ${rtfSafeText(model.risk)}\\b0\\cf0\\fs20\\par\\par Generado: ${rtfSafeText(model.generatedAt)}\\par Geometria: ${rtfSafeText(model.geometry)}\\par Horizonte: ${model.forecast.horizonHours} h\\par\\page`;
  const metricRows=[["INDICADOR","RESULTADO"],...metrics.map(([label,value,unit])=>[label,`${value} ${unit}`])];const risk=`\\pard\\sa180\\b RIESGO Y PREDICCION\\b0\\par Nivel ${rtfSafeText(model.risk)} | Indice ${(model.forecast.risk.score*100).toFixed(1)} / 100 | Pronostico ${model.forecast.predictedDisplacementMm.toFixed(2)} mm a ${model.forecast.horizonHours} h\\par`;
  const content=`\\pard\\fs30\\b ESTADO DEL TALUD\\b0\\fs20\\par Resumen de indicadores actuales y resultados del gemelo.\\par\\par${rtfTable(metricRows)}\\par${risk}\\pard\\b COMPORTAMIENTO HISTORICO\\b0\\par Telemetria y proyeccion del horizonte seleccionado. Ultimo desplazamiento: ${(model.last.displacementMm||0).toFixed(2)} mm.\\par\\par${chartImage}\\par\\page\\pard\\fs30\\b MODELO Y CONFIGURACION\\b0\\fs20\\par Referencia espacial y parametros activos.\\par\\par${rtfTable([["CAMPO","VALOR"],...paramRows])}\\par\\pard\\b CONCLUSION TECNICA\\b0\\par El gemelo clasifica la condicion como \\cf${riskColour}\\b ${rtfSafeText(model.risk)}\\b0\\cf0. Este informe es apoyo academico y requiere validacion geotecnica antes de uso operacional.\\par\\page\\pard\\fs30\\b MODELO 3D DEL GEMELO\\b0\\fs20\\par Captura del simulador espacial en el estado analizado.\\par\\par${sceneImage}\\par\\pard\\b LECTURA ESPACIAL\\b0\\par Geometria: ${rtfSafeText(model.geometry)}\\par Coordenadas: ${rtfSafeText(model.coordinates)}\\par`;
  return new Blob([`{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Arial;}}{\\colortbl ;\\red11\\green36\\blue30;\\red41\\green159\\blue136;\\red88\\green113\\blue106;\\red34\\green127\\blue104;\\red169\\green117\\blue34;\\red173\\green97\\blue50;\\red155\\green52\\blue66;\\red255\\green255\\blue255;}\\paperw11906\\paperh16838\\margl900\\margr900\\margt900\\margb900${header}${footer}\n${cover}\n${content}}`],{type:"application/rtf"});
}
function downloadReport(blob, extension) {
  const stamp = new Date().toISOString().slice(0, 10), link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `informe-m1-digital-twin-${stamp}.${extension}`; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
function setupReportControls() {
  $("#download-pdf").addEventListener("click", () => { try { downloadReport(createPdfReport(reportModel()), "pdf"); $("#report-status").textContent = "PDF tecnico RC generado con portada, indicadores y resultados."; } catch (error) { $("#report-status").textContent = error.message; } });
  $("#download-word").addEventListener("click", () => { try { downloadReport(createWordReport(reportModel()), "rtf"); $("#report-status").textContent = "Documento Word compatible RC generado con la misma estructura tecnica."; } catch (error) { $("#report-status").textContent = error.message; } });
}

function renderResearchExperiment(experiment) {
  if (!experiment) return;
  scene.researchExperiment = experiment;
  $("#research-results").innerHTML = experiment.results.map((result) => `
    <tr class="${result.id === experiment.bestByMae ? "best" : ""}">
      <td><strong>${result.label}</strong>${result.id === experiment.bestByMae ? "<small>Mejor MAE</small>" : ""}</td>
      <td>${result.components}</td>
      <td>${result.maeMm.toFixed(8)} mm</td>
      <td>${result.rmseMm.toFixed(8)} mm</td>
      <td>${result.r2 === null ? "—" : result.r2.toFixed(4)}</td>
    </tr>`).join("");
  $("#research-status").textContent = `${experiment.sampleCount} ventanas · horizonte ${experiment.horizonHours} h · datos ${experiment.datasetStatus}. ${experiment.note}`;
  $("#download-experiment").disabled = false;
}

function renderResearchStatus(research) {
  if (!research) return;
  $("#research-protocol-status").textContent = research.protocol.scientificStatus.replaceAll("_", " ");
  $("#research-objective").textContent = research.protocol.objective;
  $("#research-components").innerHTML = research.components.map((component) => `<article><span>${component.component}</span><strong>${component.status.replaceAll("_", " ")}</strong><small>${component.detail}</small></article>`).join("");
  renderFemStatus(research.fem2d);
  if (research.latestExperiment) renderResearchExperiment(research.latestExperiment);
}

async function loadScientificValidation() {
  const container = $("#validation-evidence");
  try {
    const [mesh, robustness, spatialPinn, ta01SpatialPinn, externalSsr, ta01ExternalSsr, ta01SsrMesh, transientSeep, transientMesh, transientField, rainfallSsr, wetScenario] = await Promise.all([api("/api/research/fem-validation"), api("/api/research/robustness"), api("/api/research/spatial-pinn-validation"), api("/api/research/ta01-spatial-pinn-validation"), api("/api/research/external-ssrm-validation").catch(() => null), api("/api/research/ta01-external-ssrm").catch(() => null), api("/api/research/ta01-external-ssrm-mesh").catch(() => null), api("/api/research/ta01-transient-seep").catch(() => null), api("/api/research/ta01-transient-seep-mesh").catch(() => null), api("/api/research/ta01-transient-seep-field").catch(() => null), api("/api/research/ta01-rainfall-external-ssrm").catch(() => null), api("/api/research/ta01-wet-scenario").catch(() => null)]);
    const robust1 = robustness.results.find((item) => item.horizonHours === 1).conditions;
    const robust6 = robustness.results.find((item) => item.horizonHours === 6).conditions;
    const missing1 = robust1.find((item) => item.id === "MISSING_30PCT").hybrid.maeIncreasePercent;
    const missing6 = robust6.find((item) => item.id === "MISSING_30PCT").hybrid.maeIncreasePercent;
    const noise1 = robust1.find((item) => item.id === "NOISE_5PCT_STD").hybrid.maeIncreasePercent;
    const noise6 = robust6.find((item) => item.id === "NOISE_5PCT_STD").hybrid.maeIncreasePercent;
    const delay1 = robust1.find((item) => item.id === "SENSOR_DELAY_3H").hybrid.maeIncreasePercent;
    const delay6 = robust6.find((item) => item.id === "SENSOR_DELAY_3H").hybrid.maeIncreasePercent;
    const wet1 = robustness.results.find((item) => item.horizonHours === 1).seasonalBreakdown.find((item) => item.season === "WET_NOV_APR").hybrid.maeMm;
    const dry1 = robustness.results.find((item) => item.horizonHours === 1).seasonalBreakdown.find((item) => item.season === "DRY_MAY_OCT").hybrid.maeMm;
    const assessment = mesh.defaultMeshAssessment;
    container.innerHTML = `
      <article><small>Malla FEM por defecto</small><strong>${assessment.meshX}×${assessment.meshY}</strong><span>${assessment.displacementDifferencePercent.toFixed(2)}% frente a 48×32</span></article>
      <article><small>FEM · solución analítica global</small><strong>${mesh.analyticalGlobalBenchmark.maximumAbsoluteDisplacementErrorM.toExponential(2)} m</strong><span>error máximo del campo afín; verifica ensamblaje, contornos y solver elástico</span></article>
      ${mesh.analyticalBiotPressureBenchmark ? `<article><small>FEM · presión uniforme de Biot</small><strong>${mesh.analyticalBiotPressureBenchmark.maximumAbsoluteDisplacementErrorM.toExponential(2)} m</strong><span>error máximo del campo afín con 120 kPa; verifica la carga mecánica de agua, no la infiltración real</span></article>` : ""}
      <article><small>Ruido 5% de σ</small><strong>+${noise1.toFixed(1)}% / +${noise6.toFixed(1)}%</strong><span>MAE híbrido a 1 h / 6 h</span></article>
      <article class="warning"><small>30% de datos faltantes</small><strong>+${missing1.toFixed(1)}% / +${missing6.toFixed(1)}%</strong><span>requiere control de calidad e imputación</span></article>
      <article><small>Retraso de sensores 3 h</small><strong>+${delay1.toFixed(1)}% / +${delay6.toFixed(1)}%</strong><span>arrastre de última observación</span></article>
      <article class="warning"><small>Estacionalidad a 1 h</small><strong>${(wet1 / Math.max(dry1, 1e-12)).toFixed(1)}×</strong><span>MAE húmedo frente a seco</span></article>
      <article><small>PINN espacial · solución manufacturada</small><strong>${spatialPinn.verification.relativeRmsEquilibriumResidual.toExponential(2)}</strong><span>residuo RMS relativo de equilibrio · error máx. ${spatialPinn.verification.maximumDisplacementError.toExponential(2)}</span></article>
      <article><small>TA-01 · desplazamiento espacial</small><strong>${(ta01SpatialPinn.verification.relativeL2HeldOutDisplacementError * 100).toFixed(2)}%</strong><span>error relativo en ${ta01SpatialPinn.verification.heldOutNodeCount} nodos sin datos de sensor; ${ta01SpatialPinn.verification.sensorNodeCount} sensores FEM semisintéticos</span></article>
      <article><small>TA-01 · equilibrio FEM discreto</small><strong>${(ta01SpatialPinn.verification.relativeEquilibriumResidual * 100).toFixed(2)}%</strong><span>residuo relativo KΔu−Δf; contorno fijo exacto</span></article>
      ${externalSsr ? `<article class="${externalSsr.result.withinPublishedTrialBracket ? "" : "warning"}"><small>SSRM externo · Griffiths y Lane</small><strong>${externalSsr.result.factorOfSafety.toFixed(3)}</strong><span>XSLOPE ${externalSsr.solver.version}; ${externalSsr.result.withinPublishedTrialBracket ? "dentro del intervalo publicado" : "fuera del intervalo publicado"} (1,35 estable / 1,40 fallido). No valida el FEM propio.</span></article>` : ""}
      ${ta01ExternalSsr ? `<article class="warning"><small>TA-01 extendido y seco · SSRM externo</small><strong>${ta01ExternalSsr.result.factorOfSafety.toFixed(3)}</strong><span>XSLOPE ${ta01ExternalSsr.solver.version}; ${ta01ExternalSsr.case.elementCount} triángulos cuadráticos. ${ta01SsrMesh ? `Variación ${ta01SsrMesh.factorOfSafetySpread.toFixed(3)} en ${ta01SsrMesh.runs.length} mallas.` : "Sin estudio de malla."} Sin lluvia ni calibración; no es el índice lineal del visor.</span></article>` : ""}
      ${transientSeep ? `<article class="warning"><small>TA-01 · filtración transitoria externa</small><strong>Exploratoria</strong><span>Balance de masa aceptado, pero el campo completo no está validado entre mallas. ${transientMesh ? `En (4, 96) m, la malla de 12 m difiere de la de 8 m en ${transientMesh.adjacentDifferences[0].absoluteHeadChange48hDifferenceM.toFixed(3)} m a 48 h.` : ""} Solo ${(transientSeep.assumptions.rainfallMmIn24Hours - transientSeep.assumptions.unappliedRainfallMm).toFixed(3)} mm de ${transientSeep.assumptions.rainfallMmIn24Hours.toFixed(2)} mm se aplicaron como infiltración. Acoplamiento externo condicional, no al FEM propio.</span></article>` : ""}
      ${transientField ? `<article class="warning"><small>Filtración · contraste de campo completo</small><strong>${transientField.adjacentComparisons.at(-1).rmsHeadDifference48hM.toFixed(4)} m</strong><span>Error RMS del cambio de carga entre mallas 6 y 4 m en ${transientField.grid.commonPointCount} puntos a 48 h; máximo ${transientField.adjacentComparisons.at(-1).maximumAbsoluteHeadDifference48hM.toFixed(3)} m. Campo no validado para una evaluación operacional.</span></article>` : ""}
      ${rainfallSsr ? `<article class="warning"><small>TA-01 · filtración→SSRM externo</small><strong>ΔFoS no resuelta</strong><span>FoS ${rainfallSsr.results.baseline.factorOfSafety.toFixed(3)} → ${rainfallSsr.results.hour24.factorOfSafety.toFixed(3)} a 24 h; intervalos SSRM superpuestos. Solo ${rainfallSsr.hydrology.appliedInfiltrationMm.toFixed(3)} mm infiltrados bajo supuestos no calibrados. Ensayo condicional, no predicción.</span></article>` : ""}
      ${wetScenario ? `<article class="warning"><small>TA-01 · escenario húmedo hipotético</small><strong>+${wetScenario.stability.projection.maximumPositivePorePressureChange24hKpa.toFixed(2)} kPa</strong><span>${wetScenario.stability.hydrology.appliedInfiltrationMm.toFixed(2)} mm de infiltración supuesta; el ΔFoS por lluvia sigue sin resolverse. El FoS entre mallas mecánicas 10/8/6 m varía ${wetScenario.stabilityMeshStudy.hour24FactorOfSafetySpread.toFixed(3)}. Con pasos ≤0,1 h, las mallas hidráulicas 6/4 m difieren hasta ${wetScenario.meshStudyFineTime.adjacentComparisons.at(-1).maximumAbsoluteHeadDifference24hM.toFixed(2)} m de carga; en los nodos SSRM, hasta ${wetScenario.projectedPressure.adjacentComparisons.at(-1).maximumAbsolutePositivePorePressureDifference24hKpa.toFixed(3)} kPa. No validado para una mina.</span></article>` : ""}
      <p>Las pruebas TA-01 son internas y semisintéticas: modelo y referencia comparten rigidez y cargas FEM. Los SSRM usan otro solver; el caso publicado no valida TA-01, y la variante TA-01 seca no valida lluvia ni el FEM propio. Ninguna de estas pruebas acredita calibración de campo ni uso operacional.</p>`;
  } catch (error) {
    container.innerHTML = `<span>${error.message}</span>`;
  }
}

function renderFemRun(run) {
  if (!run) return;
  scene.femRun = run;
  const summary = run.summary;
  $("#fem-metrics").innerHTML = [
    ["Movimiento por lluvia", `${summary.maximumRainfallInducedDisplacementMm.toFixed(4)} mm`],
    ["Presión de poros máxima", `${summary.maximumPorePressureKpa.toFixed(2)} kPa`],
    ["Índice Mohr–Coulomb", summary.mohrCoulombSafetyIndex === null ? "No disponible" : summary.mohrCoulombSafetyIndex.toFixed(3)],
    ["Malla", `${run.mesh.nodeCount} nodos · ${run.mesh.elementCount} elementos`]
  ].map(([label, value]) => `<article><small>${label}</small><strong>${value}</strong></article>`).join("");
  $("#fem-status").textContent = run.imported
    ? `FEM externo de ${run.provenance.sourceSoftware} · ${run.method.scientificStatus.replaceAll("_", " ")} · ${summary.converged ? "convergencia declarada" : "convergencia no acreditada"}. No se aplica la LSTM TA-01.`
    : `${run.rainfall.observedDailyTotalMm} mm/día del ${run.rainfall.date} · ${run.rainfall.temporalProfile.replaceAll("_", " ")} · ${summary.riskLevel} · convergencia ${summary.maximumSolverResidual.toExponential(2)}.`;
  renderFemLstmForecast(run.lstmForecasts?.[$("#fem-lstm-horizon").value], run.physicsGuidedForecasts?.[$("#fem-lstm-horizon").value]);
  $("#download-fem").disabled = false;
  $("#show-fem-3d").disabled = false;
  stopDisplacementPlayback();
  scene.playback.progress = 0;
  $("#scene-layer").value = "displacement";
  drawScene();
  playDisplacementPlayback();
  loadPersistenceStatus();
}

function renderFemLstmForecast(forecast, physicsGuided) {
  const container = $("#fem-lstm-result");
  if (!forecast) {
    container.innerHTML = "<span>No existe un pronóstico IA compatible para este horizonte.</span>";
    return;
  }
  const signedError = forecast.errorAgainstFemMm >= 0 ? `+${forecast.errorAgainstFemMm.toFixed(8)}` : forecast.errorAgainstFemMm.toFixed(8);
  const guidedError = physicsGuided ? (physicsGuided.errorAgainstFemMm >= 0 ? `+${physicsGuided.errorAgainstFemMm.toFixed(8)}` : physicsGuided.errorAgainstFemMm.toFixed(8)) : null;
  container.innerHTML = `
    <div><small>Origen y objetivo</small><strong>h ${forecast.originHour} → h ${forecast.targetHour}</strong></div>
    <div><small>LSTM</small><strong>${forecast.predictedDisplacementMm.toFixed(8)} mm</strong></div>
    <div><small>Híbrido físico</small><strong>${physicsGuided ? `${physicsGuided.predictedDisplacementMm.toFixed(8)} mm` : "No disponible"}</strong></div>
    <div><small>Referencia FEM</small><strong>${forecast.femReferenceDisplacementMm.toFixed(8)} mm</strong></div>
    <p>${forecast.forecastRainfallMm.toFixed(2)} mm de lluvia futura conocida · error LSTM ${signedError} mm${physicsGuided ? ` · error híbrido ${guidedError} mm · intervalo nominal ${(physicsGuided.intervalMm.nominalCoverage * 100).toFixed(0)}%: ${physicsGuided.intervalMm.lower.toFixed(8)}–${physicsGuided.intervalMm.upper.toFixed(8)} mm` : ""}. Red física agregada, no PINN espacial PDE y no operacional.</p>`;
}

function renderFemStatus(status) {
  if (!status) return;
  const button = $("#run-fem");
  $("#fem-method-status").textContent = status.method.scientificStatus.replaceAll("_", " ");
  button.disabled = !status.available;
  if (status.rainfall) {
    const date = $("#fem-date");
    date.min = status.rainfall.summary.startDate;
    date.max = status.rainfall.summary.endDate;
    if (!date.value) date.value = status.rainfall.summary.recommendedDate;
  }
}

function setupFemControls() {
  $("#fem-lstm-horizon").addEventListener("change", () => {
    if (scene.femRun) renderFemLstmForecast(scene.femRun.lstmForecasts?.[$("#fem-lstm-horizon").value], scene.femRun.physicsGuidedForecasts?.[$("#fem-lstm-horizon").value]);
  });
  $("#run-fem").addEventListener("click", async () => {
    const button = $("#run-fem");
    button.disabled = true;
    $("#fem-status").textContent = "Ensamblando la malla y resolviendo 24 estados horarios…";
    try {
      const run = await api("/api/fem/run", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ date:$("#fem-date").value, concentrationHours:Number($("#fem-rain-profile").value) }) });
      renderFemRun(run);
    } catch (error) { $("#fem-status").textContent = error.message; }
    finally { button.disabled = false; }
  });
  $("#import-fem").addEventListener("click", async () => {
    const file = $("#external-fem-file").files[0];
    if (!file) { $("#fem-status").textContent = "Selecciona un JSON FEM externo antes de importarlo."; return; }
    const button = $("#import-fem");
    button.disabled = true;
    $("#fem-status").textContent = `Validando ${file.name}…`;
    try {
      const payload = JSON.parse(await file.text());
      const run = await api("/api/fem/import", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(payload) });
      renderFemRun(run);
    } catch (error) { $("#fem-status").textContent = error.message; }
    finally { button.disabled = false; }
  });
  $("#download-fem").addEventListener("click", () => {
    if (!scene.femRun) return;
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([JSON.stringify(scene.femRun, null, 2)], { type:"application/json" }));
    link.download = `${scene.femRun.id.toLowerCase()}-ta01.json`;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  });
  $("#show-fem-3d").addEventListener("click", () => {
    if (!scene.femRun) return;
    $("#scene-3d").scrollIntoView({ behavior:"smooth", block:"center" });
    scene.playback.progress = 0;
    playDisplacementPlayback();
  });
}

function setupResearchControls() {
  $("#run-ablation").addEventListener("click", async () => {
    const button = $("#run-ablation");
    button.disabled = true;
    $("#research-status").textContent = "Leyendo la ablación entrenada sobre el conjunto de prueba aislado…";
    try {
      const horizonHours = Number($("#research-horizon").value);
      const artifact = await api(`/api/research/physics-guided?horizon=${horizonHours}`);
      const experiment = {
        id: `${artifact.id}-ABLATION`,
        horizonHours,
        sampleCount: artifact.ablation.sampleCount,
        datasetStatus: "SEMISINTÉTICO FEM · TEST AISLADO",
        bestByMae: artifact.ablation.bestByMae,
        results: artifact.ablation.variants,
        note: `${artifact.ablation.method}. ${artifact.ablation.limitation}`,
        scientificStatus: artifact.scientificStatus,
        sourceModelId: artifact.id
      };
      renderResearchExperiment(experiment);
    } catch (error) { $("#research-status").textContent = error.message; }
    finally { button.disabled = false; }
  });
  $("#download-experiment").addEventListener("click", () => {
    if (!scene.researchExperiment) return;
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([JSON.stringify(scene.researchExperiment, null, 2)], { type:"application/json" }));
    link.download = `${scene.researchExperiment.id.toLowerCase()}-ablation.json`;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  });
  $("#load-baseline").addEventListener("click", loadTemporalBaseline);
  $("#baseline-horizon").addEventListener("change", loadTemporalBaseline);
  $("#baseline-protocol").addEventListener("change", loadTemporalBaseline);
}

async function loadTemporalBaseline() {
  const button = $("#load-baseline");
  button.disabled = true;
  $("#baseline-status").textContent = "Leyendo el modelo y las métricas de prueba…";
  try {
    const horizon = $("#baseline-horizon").value;
    if ($("#baseline-protocol").value.startsWith("chronological-")) {
      const testYear = Number($("#baseline-protocol").value.slice(-4));
      const evaluation = await api(`/api/research/chronological?horizon=${horizon}&testYear=${testYear}`);
      const { persistence, ridgeComparable: ridge, lstm, pinn: guided, uncertainty } = evaluation.metrics;
      $("#baseline-metrics").innerHTML = [
        ["MAE persistencia", `${persistence.maeMm.toFixed(8)} mm`],
        ["MAE ridge", `${ridge.maeMm.toFixed(8)} mm`],
        ["MAE LSTM", `${lstm.maeMm.toFixed(8)} mm`],
        ["MAE híbrido físico", `${guided.maeMm.toFixed(8)} mm`],
        ["RMSE híbrido", `${guided.rmseMm.toFixed(8)} mm`]
      ].map(([label, value]) => `<article><small>${label}</small><strong>${value}</strong></article>`).join("");
      const improvement = lstm.maeMm > 0 ? (1 - guided.maeMm / lstm.maeMm) * 100 : 0;
      const interval = evaluation.pairedBootstrap?.confidenceInterval95Mm;
      const intervalNote = interval ? ` IC 95% pareado por fecha para MAE(LSTM)−MAE(híbrido): [${interval[0].toExponential(2)}, ${interval[1].toExponential(2)}] mm${interval[0] <= 0 && interval[1] >= 0 ? "; incluye cero, sin ventaja concluyente" : ""}.` : "";
      const selection = evaluation.validationSelection;
      const selectionNote = selection ? ` La selección por validación (${selection.selectedOnValidation === "LSTM" ? "LSTM" : "híbrido"}) ${selection.selectionMatchesTest ? "coincidió" : "no coincidió"} con el menor MAE de prueba.` : "";
      $("#baseline-status").textContent = `Prueba cronológica ${testYear} · ${guided.sampleCount} ventanas comparables · entrenamiento 2020–${testYear - 2} (${evaluation.scenarioCounts.train} escenarios), validación ${testYear - 1} (${evaluation.scenarioCounts.validation}) y prueba ${testYear} (${evaluation.scenarioCounts.test}). El híbrido ${improvement >= 0 ? "mejora" : "empeora"} el MAE observado ${Math.abs(improvement).toFixed(1)}% frente a LSTM.${intervalNote}${selectionNote} Cobertura ${(uncertainty.empiricalCoverage * 100).toFixed(1)}% para intervalo nominal 95%. Desplazamientos FEM semisintéticos: no es validación de mina.`;
      return;
    }
    const [baseline, result, physics] = await Promise.all([api(`/api/research/baseline?horizon=${horizon}`), api(`/api/research/lstm?horizon=${horizon}`), api(`/api/research/physics-guided?horizon=${horizon}`)]);
    const persistence = result.metrics.test.persistence;
    const ridge = result.metrics.test.ridgeComparable;
    const lstm = result.metrics.test.lstm;
    const guided = physics.metrics.test.pinn;
    const improvement = ridge.maeMm > 0 ? (1 - lstm.maeMm / ridge.maeMm) * 100 : 0;
    $("#baseline-metrics").innerHTML = [
      ["MAE persistencia", `${persistence.maeMm.toFixed(8)} mm`],
      ["MAE ridge", `${ridge.maeMm.toFixed(8)} mm`],
      ["MAE LSTM", `${lstm.maeMm.toFixed(8)} mm`],
      ["MAE híbrido físico", `${guided.maeMm.toFixed(8)} mm`],
      ["LSTM frente a ridge", `${improvement >= 0 ? "+" : ""}${improvement.toFixed(1)}%`]
    ].map(([label, value]) => `<article><small>${label}</small><strong>${value}</strong></article>`).join("");
    const corrections = result.metrics.test.physicalViolations.correctedPredictionCount;
    const rmseComparison = lstm.rmseMm <= ridge.rmseMm ? "La LSTM también mejora RMSE." : `Ridge conserva menor RMSE (${ridge.rmseMm.toFixed(8)} frente a ${lstm.rmseMm.toFixed(8)} mm).`;
    const guidedImprovement = (1 - guided.maeMm / lstm.maeMm) * 100;
    const physicalChecks = physics.metrics.test.physicsChecks;
    const uncertainty = physics.metrics.test.uncertainty;
    $("#baseline-status").textContent = `${lstm.sampleCount} ventanas comparables · LSTM de ${result.architecture.hiddenUnits} unidades y ${result.architecture.lookbackHours} h de memoria · híbrido ${guidedImprovement >= 0 ? "mejora" : "empeora"} MAE ${Math.abs(guidedImprovement).toFixed(1)}% frente a LSTM · ${physicalChecks.rainSensitivityViolations + physicalChecks.safetySensitivityViolations} violaciones condicionales · cobertura ${(uncertainty.empiricalCoverage * 100).toFixed(1)}% para intervalo nominal ${(uncertainty.nominalCoverage * 100).toFixed(0)}%. ${rmseComparison} Ridge completo: λ=${baseline.selectedLambda}.`;
  } catch (error) {
    $("#baseline-status").textContent = error.message;
  } finally {
    button.disabled = false;
  }
}
function drawCoordinateFrame(ctx, project, asset, parameters, highContrast) {
  scene.coordinateHits = [];
  const drawLine = (points, color, dashed = false) => {
    const screen = points.map(project); ctx.save(); ctx.globalAlpha = .82; ctx.strokeStyle = color; ctx.lineWidth = highContrast ? 1.25 : .8;
    if (dashed) ctx.setLineDash([3, 3]); ctx.beginPath(); screen.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y)); ctx.stroke(); ctx.restore(); return screen;
  };
  const label = (text, point, color) => { const screen = project(point); ctx.save(); ctx.fillStyle = color; ctx.font = "10px DM Mono"; ctx.fillText(text, screen.x + 4, screen.y - 4); ctx.restore(); };
  const coordinateHit = (point, text) => scene.coordinateHits.push({ p: project(point), text });
  const mesh = asset?.mesh;
  if (mesh?.coordinateTransform && mesh.bounds) {
    const { centre, scale } = mesh.coordinateTransform, { min, max } = mesh.bounds;
    const toViewer = ([x, y, z]) => ({ x: (x - centre[0]) * scale, y: (z - centre[2]) * scale + 35, z: (y - centre[1]) * scale });
    const [x0, y0, z0] = min, [x1, y1, z1] = max;
    for (let step = 0; step <= 4; step++) {
      const x = x0 + (x1 - x0) * step / 4, y = y0 + (y1 - y0) * step / 4;
      drawLine([toViewer([x, y0, z0]), toViewer([x, y1, z0])], "#38594e", true);
      drawLine([toViewer([x0, y, z0]), toViewer([x1, y, z0])], "#38594e", true);
      label(`E ${coordinateText(x)}`, toViewer([x, y0, z0]), "#8fbbb0");
      label(`N ${coordinateText(y)}`, toViewer([x0, y, z0]), "#8fbbb0");
      coordinateHit(toViewer([x, y0, z0]), `Este: ${coordinateText(x)} · Norte: ${coordinateText(y0)} · Cota: ${coordinateText(z0)}`);
      coordinateHit(toViewer([x0, y, z0]), `Este: ${coordinateText(x0)} · Norte: ${coordinateText(y)} · Cota: ${coordinateText(z0)}`);
    }
    const origin = toViewer([x0, y0, z0]);
    drawLine([origin, toViewer([x1, y0, z0])], "#ff765e"); drawLine([origin, toViewer([x0, y1, z0])], "#55d9bc"); drawLine([origin, toViewer([x0, y0, z1])], "#79aaff");
    label("E", toViewer([x1, y0, z0]), "#ff765e"); label("N", toViewer([x0, y1, z0]), "#55d9bc"); label("COTA", toViewer([x0, y0, z1]), "#79aaff");
    const info = { system: asset.coordinateReference || "Coordenadas del archivo", east: `${coordinateText(x0)} → ${coordinateText(x1)}`, north: `${coordinateText(y0)} → ${coordinateText(y1)}`, elevation: `${coordinateText(z0)} → ${coordinateText(z1)}`, summary: `${asset.coordinateReference || "Coordenadas del archivo"} · E ${coordinateText(x0)}–${coordinateText(x1)} · N ${coordinateText(y0)}–${coordinateText(y1)} · Cota ${coordinateText(z0)}–${coordinateText(z1)}` };
    drawCoordinateHud(ctx, info); return info;
  }
  const width = parameters.slopeWidthM || 160, depth = width * .42, halfWidth = width / 2, halfDepth = depth / 2;
  for (let step = 0; step <= 4; step++) {
    const x = -halfWidth + width * step / 4, z = -halfDepth + depth * step / 4;
    drawLine([{ x, y: 0, z: -halfDepth }, { x, y: 0, z: halfDepth }], "#38594e", true);
    drawLine([{ x: -halfWidth, y: 0, z }, { x: halfWidth, y: 0, z }], "#38594e", true);
    label(`X ${coordinateText(x)} m`, { x, y: 0, z: -halfDepth }, "#8fbbb0");
    coordinateHit({ x, y: 0, z: -halfDepth }, `X: ${coordinateText(x)} m · Y: ${coordinateText(-halfDepth)} m · Cota: 0 m`);
  }
  drawLine([{ x: -halfWidth, y: 0, z: -halfDepth }, { x: halfWidth, y: 0, z: -halfDepth }], "#ff765e"); drawLine([{ x: -halfWidth, y: 0, z: -halfDepth }, { x: -halfWidth, y: 0, z: halfDepth }], "#55d9bc"); drawLine([{ x: -halfWidth, y: 0, z: -halfDepth }, { x: -halfWidth, y: parameters.slopeHeightM || 90, z: -halfDepth }], "#79aaff");
  const info = { system: "Sistema local del simulador", east: `${coordinateText(-halfWidth)} → ${coordinateText(halfWidth)} m`, north: `${coordinateText(-halfDepth)} → ${coordinateText(halfDepth)} m`, elevation: `0 → ${parameters.slopeHeightM || 90} m`, summary: `Sistema local · X ${-halfWidth}–${halfWidth} m · Y ${-halfDepth}–${halfDepth} m · Cota 0–${parameters.slopeHeightM || 90} m` };
  drawCoordinateHud(ctx, info); return info;
}

function coordinateInfoForScene(parameters, geometryAsset) {
  if (geometryAsset?.mesh?.bounds) {
    const { min, max } = geometryAsset.mesh.bounds;
    return {
      system: geometryAsset.coordinateReference || "Coordenadas del modelo importado",
      east: `${coordinateText(min[0])} → ${coordinateText(max[0])}`,
      north: `${coordinateText(min[1])} → ${coordinateText(max[1])}`,
      elevation: `${coordinateText(min[2])} → ${coordinateText(max[2])}`,
      summary: `${geometryAsset.format} · extensión original ${coordinateText(max[0] - min[0])} × ${coordinateText(max[1] - min[1])} × ${coordinateText(max[2] - min[2])}`
    };
  }
  const width = parameters.slopeWidthM || 160;
  const halfWidth = width / 2;
  const halfDepth = width * 0.42;
  return {
    system: "Sistema local del simulador",
    east: `${coordinateText(-halfWidth)} → ${coordinateText(halfWidth)} m`,
    north: `${coordinateText(-halfDepth)} → ${coordinateText(halfDepth)} m`,
    elevation: `0 → ${parameters.slopeHeightM || 90} m`,
    summary: `Sistema local · X ${coordinateText(-halfWidth)}–${coordinateText(halfWidth)} m · Y ${coordinateText(-halfDepth)}–${coordinateText(halfDepth)} m · Cota 0–${parameters.slopeHeightM || 90} m`
  };
}

function drawScene() {
  if (!sceneRenderer) return drawSceneLegacy();
  if (!scene.forecast) return;
  const forecast = scene.forecast;
  const parameters = forecast.simulationParameters || {};
  const layer = $("#scene-layer").value;
  const meta = layerMeta(layer, forecast, scene.readings);
  const options = {
    realistic: $("#realism-enabled").checked,
    terrain: $("#terrain-enabled").checked,
    materials: $("#materials-enabled").checked,
    overlay: $("#overlay-enabled").checked,
    highContrast: $("#contrast-enabled").checked,
    coordinates: $("#coordinates-enabled").checked,
    materialMotion: $("#material-motion-enabled").checked
  };
  if (!externalViewerActive || isViewerWindow) {
    sceneRenderer.render({
      forecast,
      readings: scene.readings,
      geometryAsset: scene.geometryAsset,
      photoApproximation: scene.photoApproximation,
      layer,
      options,
      playback: { progress: scene.playback.progress, amplification: visualAmplification() },
      femRun: scene.femRun,
      weather: scene.weather
    });
    if (scene.pendingFit) {
      sceneRenderer.fit();
      scene.pendingFit = false;
    }
  }
  renderCoordinateInspector(coordinateInfoForScene(parameters, scene.geometryAsset), options.coordinates);
  $("#coordinate-hover").textContent = options.coordinates ? "La retícula usa la referencia espacial mostrada arriba." : "Activa la cuadrícula para inspeccionar referencias.";
  const shapeName = { LINEAR:"RECTO", BENCHED:"BANCOS", CIRCULAR:"FOSA CIRCULAR", SEMICIRCULAR:"ANFITEATRO", WASTE_DUMP:"BOTADERO" }[parameters.geometryType] || "PARAMÉTRICO";
  const geometryState = scene.photoApproximation ? `FOTO · ${shapeName}` : scene.geometryAsset?.mesh ? `MALLA ${scene.geometryAsset.format}` : shapeName;
  $("#layer-legend").innerHTML = scene.femRun ? '<span class="legend-gradient"></span>FEM 2D · movimiento por lluvia · mm' : options.overlay ? `<span class="legend-gradient"></span>${meta.label} · ${meta.unit}` : "Capa analítica desactivada · solo materiales";
  $("#layer-source").textContent = scene.femRun ? "Corte triangular CST calculado nodo a nodo; verde–rojo indica magnitud relativa dentro de la corrida." : options.overlay ? meta.source : "Se visualiza la geometría y materiales del talud sin superposición analítica.";
  $("#scene-status").textContent = `${forecast.risk.level} · ${geometryState}${scene.femRun ? " · FEM 2D" : ""}${options.realistic ? " · REALISTA" : ""}`;
  $("#scene-status").className = `chip ${forecast.risk.level}`;
  const projectionLabel = $("#camera-projection").value === "ORTHOGRAPHIC" ? "Ortográfica técnica" : "Perspectiva 3D";
  $("#camera-mode").textContent = scene.freecam ? `${projectionLabel} · vuelo libre · WASD/Q/E` : `${projectionLabel} · órbita, rueda y paneo`;
  renderPlaybackUi();
  renderSceneEventHud();
  publishViewerState();
}

function renderSceneEventHud() {
  const hud = $("#scene-event-hud");
  const parts = [];
  if (scene.weather.active) parts.push(`🌧 LLUVIA · ${scene.weather.rainfallMmH} mm/h · ${scene.weather.durationHours} h`);
  if (scene.playback.progress > 0.005) {
    const mode = $("#material-motion-enabled").checked ? "DEFORMACIÓN DE MATERIALES" : "VECTORES DE DESPLAZAMIENTO";
    parts.push(scene.femRun ? `↘ FEM 2D · ${mode} · ${visualAmplification() === 1 ? "ESCALA 1×" : "AUTOESCALA VISUAL"} · ${Math.round(scene.playback.progress * 100)}%` : `↘ ${mode} · ${visualAmplification()}× · ${Math.round(scene.playback.progress * 100)}%`);
  }
  const guided = scene.femRun?.physicsGuidedForecasts?.[$("#fem-lstm-horizon")?.value];
  if (guided) parts.push(`IA +${guided.horizonHours} h · objetivo h${guided.targetHour} · ${guided.predictedDisplacementMm.toFixed(4)} mm`);
  hud.hidden = parts.length === 0;
  hud.textContent = parts.join("  |  ");
  hud.className = `scene-event-hud${scene.weather.active ? " rain" : " displacement"}`;
}

function viewerPayload(includeGeometry = false) {
  const payload = {
    type: "M1_SCENE_STATE",
    weather: scene.weather,
    playback: { progress: scene.playback.progress, amplification: visualAmplification() },
    layer: $("#scene-layer").value,
    projection: $("#camera-projection").value,
    options: {
      realistic: $("#realism-enabled").checked,
      terrain: $("#terrain-enabled").checked,
      materials: $("#materials-enabled").checked,
      overlay: $("#overlay-enabled").checked,
      highContrast: $("#contrast-enabled").checked,
      coordinates: $("#coordinates-enabled").checked,
      materialMotion: $("#material-motion-enabled").checked
    }
  };
  const dataChanged = includeGeometry || scene.forecast !== lastPublishedForecast || scene.readings !== lastPublishedReadings;
  if (dataChanged) {
    payload.forecast = scene.forecast;
    payload.readings = scene.readings.slice(-72);
  }
  const femChanged = includeGeometry || scene.femRun !== lastPublishedFem;
  if (femChanged) payload.femRun = scene.femRun;
  const geometryChanged = includeGeometry || scene.geometryAsset !== lastPublishedGeometry || scene.photoApproximation !== lastPublishedPhoto;
  if (geometryChanged) {
    payload.geometryAsset = scene.geometryAsset;
    payload.photoApproximation = scene.photoApproximation;
  }
  return payload;
}

function publishViewerState(includeGeometry = false) {
  if (isViewerWindow || !viewerWindow || viewerWindow.closed || !scene.forecast) return;
  const now = performance.now();
  if (!includeGeometry && now - lastViewerPublish < 100) return;
  lastViewerPublish = now;
  viewerWindow.postMessage(viewerPayload(includeGeometry), window.location.origin);
  lastPublishedForecast = scene.forecast;
  lastPublishedReadings = scene.readings;
  lastPublishedGeometry = scene.geometryAsset;
  lastPublishedPhoto = scene.photoApproximation;
  lastPublishedFem = scene.femRun;
}

function drawSceneLegacy() {
  const canvas = $("#scene-3d"); if (!canvas || !scene.forecast) return;
  const ctx = canvas.getContext("2d"), dpr = window.devicePixelRatio || 1, w = canvas.clientWidth, h = canvas.clientHeight;
  canvas.width = Math.max(1, Math.floor(w * dpr)); canvas.height = Math.max(1, Math.floor(h * dpr)); ctx.scale(dpr, dpr); ctx.clearRect(0, 0, w, h);
  const forecast = scene.forecast, readings = scene.readings, layer = $("#scene-layer").value, meta = layerMeta(layer, forecast, readings);
  const terrainEnabled = $("#terrain-enabled").checked, materialsEnabled = $("#materials-enabled").checked, overlayEnabled = $("#overlay-enabled").checked, highContrast = $("#contrast-enabled").checked, coordinatesEnabled = $("#coordinates-enabled").checked;
  const parameters = forecast.simulationParameters || {}, temporalState = playbackState(forecast);
  const heightAt = (x, z = 0) => {
    const base = terrainEnabled ? terrainHeight(x, z, parameters) : 12;
    if (!scene.photoApproximation?.profile) return base;
    const profile = scene.photoApproximation.profile, width = parameters.slopeWidthM || 160;
    const index = clamp(Math.round(((x + width / 2) / width) * (profile.length - 1)), 0, profile.length - 1);
    // Una foto no permite calcular cotas reales. El perfil solo deforma la
    // superficie demostrativa para que el usuario pueda reconocer que se aplicó.
    return base * (.48 + profile[index] * .82);
  };
  const background = ctx.createLinearGradient(0, 0, 0, h); background.addColorStop(0,"#0b221c"); background.addColorStop(1,"#06110f");ctx.fillStyle=background;ctx.fillRect(0,0,w,h);
  const project = (point) => {
    const cy=Math.cos(scene.yaw), sy=Math.sin(scene.yaw), cp=Math.cos(scene.pitch), sp=Math.sin(scene.pitch);
    const camera = scene.freecam ? scene.camera : { x: 0, y: 0, z: 0 };
    const local = { x: point.x - camera.x, y: point.y - camera.y, z: point.z - camera.z };
    const rx=local.x*cy-local.z*sy, rz=local.x*sy+local.z*cy;
    const ry=local.y*cp-rz*sp, depth=rz*cp+local.y*sp+460;
    const factor=(scene.zoom*520)/Math.max(120,depth);
    return { x:w/2+scene.panX+rx*factor, y:h*.61+scene.panY-ry*factor, depth };
  };
  const polygon = (points, fill, stroke="#173b31", alpha=1) => { const p=points.map(project);ctx.save();ctx.globalAlpha=alpha;ctx.beginPath();p.forEach((v,i)=>i?ctx.lineTo(v.x,v.y):ctx.moveTo(v.x,v.y));ctx.closePath();ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=highContrast ? .75 : .38;ctx.stroke();}ctx.restore();return p; };
  const faces=[]; const slopeWidth = parameters.slopeWidthM || 160, halfWidth = slopeWidth / 2, halfDepth = slopeWidth * .42;
  // Malla suficientemente densa para curvas continuas, sin simular que es FEM.
  const xs=Array.from({length:29},(_,i)=>-halfWidth+i*(slopeWidth/28)), zs=Array.from({length:21},(_,i)=>-halfDepth+i*((halfDepth*2)/20));
  if (scene.geometryAsset?.mesh) {
    const { vertices, faces: importedFaces } = scene.geometryAsset.mesh;
    importedFaces.slice(0, 5000).forEach((indices) => {
      const points = indices.map((index) => vertices[index]).filter(Boolean);
      if (points.length < 3) return;
      const centre = points.reduce((sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y, z: sum.z + point.z }), { x: 0, y: 0, z: 0 });
      centre.x /= points.length; centre.y /= points.length; centre.z /= points.length;
      const value = clamp(meta.base + centre.y / 400);
      const displayPoints = points.map((point) => spatialForecastPoint(point, parameters, forecast)), displayCentre = spatialForecastPoint(centre, parameters, forecast);
      faces.push({ points: displayPoints, base: materialsEnabled ? materialColor("rock", centre.x, centre.z, highContrast) : "hsl(159 31% 22%)", overlay: colorFor(value, highContrast), depth: project(displayCentre).depth });
    });
  } else for(let xi=0;xi<xs.length-1;xi++) for(let zi=0;zi<zs.length-1;zi++) {
    const x=xs[xi], z=zs[zi], x2=xs[xi+1], z2=zs[zi+1];
    const midX=(x+x2)/2, midZ=(z+z2)/2;
    if (!slopeFootprint(midX, midZ, parameters)) continue;
    const y1=heightAt(x,z), y2=heightAt(x2,z), y3=heightAt(x2,z2), y4=heightAt(x,z2), y=(y1+y2+y3+y4)/4;
    const spatial=clamp(((x+120)/240)*.17+((z+80)/160)*.06); const value=clamp(meta.base+spatial);
    const material = materialFor(Math.max(0, (parameters.slopeHeightM || 90) - y), parameters);
    const photoColorIndex = scene.photoApproximation?.colors ? clamp(Math.round(((midX + halfWidth) / slopeWidth) * (scene.photoApproximation.colors.length - 1)), 0, scene.photoApproximation.colors.length - 1) : null;
    const photoColor = photoColorIndex === null ? null : scene.photoApproximation.colors[photoColorIndex];
    const base = materialsEnabled ? (photoColor || materialColor(material,x,z,highContrast)) : "hsl(159 31% 22%)";
    const points = [{x,y:y1,z},{x:x2,y:y2,z},{x:x2,y:y3,z:z2},{x,y:y4,z:z2}], centre = {x:(x+x2)/2,y,z:(z+z2)/2};
    faces.push({ points: points.map((point) => spatialForecastPoint(point, parameters, forecast)), base, overlay:colorFor(value,highContrast), depth:project(spatialForecastPoint(centre, parameters, forecast)).depth });
  }
  faces.sort((a,b)=>b.depth-a.depth); faces.forEach(face=>{polygon(face.points,face.base);if(overlayEnabled)polygon(face.points,face.overlay,null,highContrast ? .67 : .28);});
  if (!$("#material-motion-enabled").checked && temporalState.progress > .005) {
    ctx.save(); ctx.strokeStyle="#ffca6a"; ctx.fillStyle="#ffca6a"; ctx.lineWidth=2;
    [[-.32,-.35],[-.12,.2],[.08,-.2],[.28,.35],[.43,0]].forEach(([xRatio,zRatio])=>{
      const start={x:xRatio*slopeWidth,y:heightAt(xRatio*slopeWidth,zRatio*halfDepth)+1.5,z:zRatio*halfDepth};
      if(!slopeFootprint(start.x,start.z,parameters))return;
      const a=project(start),b=project(spatialForecastPoint(start,parameters,forecast,true));
      const angle=Math.atan2(b.y-a.y,b.x-a.x),length=Math.max(8,Math.hypot(b.x-a.x,b.y-a.y));
      const end={x:a.x+Math.cos(angle)*length,y:a.y+Math.sin(angle)*length};
      ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(end.x,end.y);ctx.stroke();
      ctx.beginPath();ctx.moveTo(end.x,end.y);ctx.lineTo(end.x-Math.cos(angle-.55)*7,end.y-Math.sin(angle-.55)*7);ctx.lineTo(end.x-Math.cos(angle+.55)*7,end.y-Math.sin(angle+.55)*7);ctx.closePath();ctx.fill();
    }); ctx.restore();
  }
  if (!coordinatesEnabled) scene.coordinateHits = [];
  const coordinateInfo = coordinatesEnabled ? drawCoordinateFrame(ctx, project, scene.geometryAsset, parameters, highContrast) : null;
  renderCoordinateInspector(coordinateInfo, coordinatesEnabled);
  // Bank labels make the engineering geometry legible without claiming an FEM 3D mesh.
  if(terrainEnabled && parameters.geometryType === "BENCHED"){ctx.fillStyle="#d3d1bc";ctx.font="10px DM Mono";[0,24,48,72].filter((e)=>e<=(parameters.slopeHeightM||90)).forEach((e)=>{const p=project({x:-halfWidth*.95,y:e,z:-halfDepth*1.04});ctx.fillText(`Banco ${e} m`,p.x,p.y);});}
  const sensorDefinitions=[{id:forecast.sensorId,name:"Sensor activo",x:-slopeWidth*.06,z:-halfDepth*.06,detail:`Desplazamiento actual: ${forecast.currentDisplacementMm.toFixed(2)} mm; previsto: ${forecast.predictedDisplacementMm.toFixed(2)} mm.`},{id:"PZ-02",name:"Piezómetro",x:slopeWidth*.30,z:halfDepth*.35,detail:`Presión de poros interpolada: ${(readings.at(-1)?.porePressureKpa || 0).toFixed(1)} kPa.`},{id:"INC-03",name:"Inclinómetro",x:-slopeWidth*.45,z:halfDepth*.4,detail:`Velocidad derivada: ${forecast.femState.displacementRateMmH.toFixed(3)} mm/h.`}];
  scene.hits=[];sensorDefinitions.filter((sensor)=>slopeFootprint(sensor.x,sensor.z,parameters)).forEach(sensor=>{const y=heightAt(sensor.x,sensor.z)+5,p=project(spatialForecastPoint({x:sensor.x,y,z:sensor.z}, parameters, forecast));scene.hits.push({...sensor,p});ctx.beginPath();ctx.arc(p.x,p.y,6,0,Math.PI*2);ctx.fillStyle=sensor.id===$("#selected-sensor").textContent?"#ffffff":"#071411";ctx.fill();ctx.lineWidth=2;ctx.strokeStyle="#51ead0";ctx.stroke();ctx.fillStyle="#ddfff5";ctx.font="10px DM Mono";ctx.fillText(sensor.id,p.x+9,p.y-8);});
  if (temporalState.progress > 0 || scene.playback.playing) { ctx.save(); ctx.fillStyle="#071a15dd";ctx.strokeStyle="#386157";ctx.lineWidth=1;ctx.fillRect(w-225,16,211,60);ctx.strokeRect(w-225,16,211,60);ctx.fillStyle="#73a79a";ctx.font="9px DM Mono";ctx.fillText("REPRODUCCION DEL PRONOSTICO",w-214,35);ctx.fillStyle="#e7fff8";ctx.font="11px DM Mono";ctx.fillText(`+${temporalState.elapsedHours.toFixed(1)} h / ${temporalState.horizonHours} h`,w-214,54);ctx.fillStyle="#ffca6a";ctx.font="9px DM Mono";ctx.fillText(`${temporalState.displacementMm.toFixed(2)} mm · deformacion visual x${visualAmplification()}`,w-214,68);ctx.restore(); }
  const shapeName = { LINEAR:"RECTO", BENCHED:"BANCOS", CIRCULAR:"FOSA CIRCULAR", SEMICIRCULAR:"ANFITEATRO", WASTE_DUMP:"BOTADERO" }[parameters.geometryType] || "PARAMÉTRICO";
  const geometryState = scene.photoApproximation ? `FOTO · ${shapeName}` : scene.geometryAsset?.mesh ? `MALLA ${scene.geometryAsset.format}` : shapeName;
  $("#layer-legend").innerHTML=overlayEnabled?`<span class="legend-gradient"></span>${meta.label} · ${meta.unit}`:"Capa analítica desactivada · solo materiales"; $("#layer-source").textContent=overlayEnabled?meta.source:"Se visualiza la geometría y materiales del talud sin superposición analítica."; $("#scene-status").textContent=`${forecast.risk.level} · ${geometryState}`; $("#scene-status").className=`chip ${forecast.risk.level}`; $("#camera-mode").textContent=scene.freecam?"Vuelo libre · WASD mueve · Q/E sube/baja":"Cámara orbital · arrastra para rotar"; renderPlaybackUi();renderSceneEventHud();publishViewerState();
}

function parameterLabel(key, value) {
  const number = Number(value);
  if (["waterPressureFactor", "rainfallFactor", "weatheringFactor", "drainageEfficiency"].includes(key)) return `${Math.round(number * 100)}%`;
  if (key === "slopeAngleDeg" || key === "frictionAngleDeg") return `${number}°`;
  if (key === "seismicCoefficient") return `${number.toFixed(2)} g`;
  if (["slopeHeightM", "slopeWidthM", "bedrockDepthM"].includes(key)) return `${number} m`;
  if (key === "rockDiscontinuityFactor") return `${Math.round(number * 100)}%`;
  return `${number} kPa`;
}
function applySimulationParameters(parameters) {
  Object.entries(parameters || {}).forEach(([key, value]) => {
    const input = document.querySelector(`[data-param="${key}"]`), output = $(`#${key}-value`);
    if (input) input.value = value;
    if (output) output.textContent = parameterLabel(key, value);
  });
}
function fitScene(parameters = scene.forecast?.simulationParameters || {}) {
  if (sceneRenderer) {
    scene.freecam = false;
    scene.pendingFit = true;
    const freecam = $("#freecam-enabled");
    if (freecam) freecam.checked = false;
    return;
  }
  const width = parameters.slopeWidthM || 160, height = parameters.slopeHeightM || 90;
  scene.freecam = false; scene.camera = { x: 0, y: 0, z: 0 }; scene.yaw = -.62; scene.pitch = .48; scene.panX = 0; scene.panY = 5;
  scene.zoom = clamp(2.25 * 160 / Math.max(width, height * 1.65), .55, 2.25);
  const freecam = $("#freecam-enabled"); if (freecam) freecam.checked = false;
}
function goToViewpoint(name) {
  if (sceneRenderer) {
    scene.freecam = false;
    $("#freecam-enabled").checked = false;
    sceneRenderer.setViewpoint(name);
    $("#camera-mode").textContent = "Punto de observación · usa el ratón para explorar";
    return;
  }
  const parameters = scene.forecast?.simulationParameters || {}, width = parameters.slopeWidthM || 160, height = parameters.slopeHeightM || 90, depth = width * .42;
  if (name === "overview") { fitScene(parameters); drawScene(); return; }
  const views = {
    crest: { camera:{x:-width*.32,y:height*.42,z:-depth*.88},yaw:-.12,pitch:.12,zoom:1.95 },
    midbench: { camera:{x:-width*.04,y:height*.28,z:-depth*.72},yaw:-.28,pitch:.2,zoom:2.05 },
    toe: { camera:{x:width*.34,y:height*.1,z:-depth*.72},yaw:-.45,pitch:.15,zoom:2.05 }
  };
  Object.assign(scene, views[name], { freecam:true, panX:0, panY:5 }); $("#freecam-enabled").checked = true; drawScene();
}
function setupSimulationControls() {
  document.querySelectorAll("[data-param]").forEach((input) => {
    const updateLabel = () => { const output = $(`#${input.dataset.param}-value`); if (output) output.textContent = parameterLabel(input.dataset.param, input.value); };
    input.addEventListener("input", updateLabel);
    input.addEventListener("change", async () => {
      try {
        // Los selectores (p. ej., CIRCULAR) son categorías, no números.
        const value = input.tagName === "SELECT" ? input.value : Number(input.value);
        const result = await api("/api/simulation", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ [input.dataset.param]: value }) });
        applySimulationParameters(result.parameters);
        if (["geometryType","slopeHeightM","slopeWidthM"].includes(input.dataset.param)) {
          scene.forecast = { ...scene.forecast, simulationParameters: result.parameters };
          fitScene(result.parameters); drawScene();
        }
        await refresh();
      } catch (error) { $("#risk-description").textContent = error.message; }
    });
  });
}
function renderTwinStatus(twin, forecast, readings) {
  scene.twin = twin;
  renderResearchStatus(twin.research);
  const rain = twin.weather?.latestEvent;
  scene.weather = rain ? { active: true, rainfallMmH: rain.intensityMmH, durationHours: rain.durationHours, event: rain } : emptyWeather();
  renderWeatherStatus();
  const last = readings.at(-1);
  $("#state-current").textContent = last ? `${last.displacementMm.toFixed(2)} mm` : "Sin lectura";
  $("#state-detail").textContent = last ? `${last.sensorId} · ${new Date(last.timestamp).toLocaleString()} · ${twin.dataStatus.replace("_", " ")}` : "Esperando telemetría.";
  $("#state-prediction").textContent = `+${forecast.predictedIncrementMm.toFixed(2)} mm / ${forecast.horizonHours} h`;
  const quality = forecast.modelDiagnostics.dataQuality;
  $("#prediction-detail").textContent = `Salida temporal + corrección física · incertidumbre ${(forecast.risk.uncertainty * 100).toFixed(1)}% · datos ${quality.status.replaceAll("_", " ")}.`;
  $("#state-risk").textContent = forecast.risk.level;
  $("#risk-detail").textContent = forecast.operationalDecisionAllowed
    ? `Política: ${twin.riskPolicy.status}. Telemetría observada; todavía requiere validación geotécnica.`
    : quality.passesQualityGate
      ? "Datos con calidad estructural suficiente; modelo no calibrado ni validado. No habilitado para decisiones operacionales."
      : `Solo demostración: ${quality.reasonCodes.join(", ").replaceAll("_", " ").toLowerCase()}. No habilitado para decisiones operacionales.`;
  if (!scene.geometryAsset && !scene.photoApproximation) {
    const current = twin.geometry.current;
    const source = $("#geometry-source"), file = $("#geometry-file");
    // Los navegadores no pueden reabrir un archivo local tras recargar la página.
    // Conservamos su trazabilidad en el servidor, pero pedimos el archivo otra vez
    // antes de afirmar que su geometría está en pantalla.
    if (["PROCEDURAL", "PHOTO_APPROXIMATION", "IMPORTED_MODEL"].includes(current.source)) {
      source.value = current.source;
      file.accept = current.source === "PHOTO_APPROXIMATION" ? "image/*" : current.source === "IMPORTED_MODEL" ? ".csv,.dxf,.obj,.stl,.gltf,.glb" : "";
    }
    const localReload = current.source === "PROCEDURAL" ? "" : " Selecciona el archivo nuevamente para escanearlo y mostrarlo en esta sesión.";
    $("#geometry-status").textContent = `${current.name} · ${current.scientificStatus}.${localReload}`;
  }
  Object.entries(twin.riskPolicy).forEach(([key, value]) => { const input = document.querySelector(`[data-policy="${key}"]`), output = $(`#${key}-value`); if (input) input.value = value; if (output) output.textContent = Number(value).toFixed(2); });
  drawScene();
}

function renderWeatherStatus(message = "") {
  const panel = $(".weather-simulation");
  panel.classList.toggle("is-raining", scene.weather.active);
  if (message) {
    $("#weather-status").textContent = message;
    return;
  }
  const event = scene.weather.event;
  if (!event) {
    $("#weather-status").textContent = "Sin evento meteorológico aplicado.";
    return;
  }
  const provenance = event.provenance || {};
  const sourceText = provenance.sourceDate
    ? `NASA POWER ${provenance.sourceDate}: ${provenance.observedDailyTotalMm} mm/día; perfil horario uniforme estimado. `
    : "";
  $("#weather-status").textContent = `${sourceText}${event.totalRainfallMm} mm aplicados · presión +${event.porePressureIncreaseKpa} kPa · desplazamiento +${event.displacementIncreaseMm} mm.`;
}

function setupWeatherControls() {
  const intensity = $("#rain-intensity");
  const source = $("#rain-source");
  const dateInput = $("#rain-history-date");
  const duration = $("#rain-duration");
  const simulateButton = $("#simulate-rain");
  const selectedHistoricalRecord = () => rainfallHistory?.records?.find((row) => row.date === dateInput.value);
  const renderHistoricalSelection = () => {
    const record = selectedHistoricalRecord();
    const grid = rainfallHistory?.metadata?.spatialResolutionDegrees;
    $("#rain-history-value").textContent = record
      ? `${record.rainfallMmDay.toFixed(2)} mm/día · NASA POWER/MERRA-2${grid ? `, celda regional ${grid.latitude}°×${grid.longitude}°` : ""}; no es pluviómetro del talud. Se distribuirá uniformemente en 24 h (supuesto).`
      : "No hay datos para la fecha seleccionada.";
  };
  const applyRainSource = () => {
    const historical = source.value === "historical";
    $("#manual-rain-controls").hidden = historical;
    $("#historical-rain-controls").hidden = !historical;
    duration.disabled = historical;
    if (historical) duration.value = "24";
    simulateButton.textContent = historical ? "Reproducir día" : "Simular lluvia";
    simulateButton.disabled = historical && !selectedHistoricalRecord();
    renderHistoricalSelection();
  };
  intensity.addEventListener("input", () => { $("#rain-intensity-value").textContent = `${intensity.value} mm/h`; });
  source.addEventListener("change", applyRainSource);
  dateInput.addEventListener("input", () => { renderHistoricalSelection(); applyRainSource(); });
  api("/api/rainfall-history").then((history) => {
    rainfallHistory = history.available ? history : null;
    if (!rainfallHistory) throw new Error(history.error || "Datos históricos no disponibles");
    dateInput.min = history.summary.startDate;
    dateInput.max = history.summary.endDate;
    dateInput.value = history.summary.recommendedDate;
    renderHistoricalSelection();
    applyRainSource();
  }).catch((error) => {
    source.querySelector('[value="historical"]').disabled = true;
    $("#rain-history-value").textContent = error.message;
  });
  applyRainSource();
  simulateButton.addEventListener("click", async () => {
    const button = simulateButton;
    button.disabled = true;
    renderWeatherStatus("Calculando infiltración y respuesta del talud…");
    try {
      const historical = source.value === "historical";
      const path = historical ? "/api/weather-event/historical" : "/api/weather-event";
      const body = historical
        ? { date: dateInput.value }
        : { intensityMmH: Number(intensity.value), durationHours: Number(duration.value) };
      const result = await api(path, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body) });
      scene.weather = { active: result.event.totalRainfallMm > 0, rainfallMmH: result.event.intensityMmH, durationHours: result.event.durationHours, event: result.event };
      $("#scene-layer").value = "pore";
      await refresh();
      scene.playback.progress = 0;
      playDisplacementPlayback();
    } catch (error) {
      renderWeatherStatus(error.message);
    } finally {
      button.disabled = source.value === "historical" && !selectedHistoricalRecord();
    }
  });
  $("#clear-weather").addEventListener("click", async () => {
    try {
      await api("/api/scenario", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ name:$("#scenario").value }) });
      scene.weather = emptyWeather();
      stopDisplacementPlayback();
      scene.playback.progress = 0;
      await refresh();
    } catch (error) { renderWeatherStatus(error.message); }
  });
}

function setupSceneWindowControls() {
  const card = $(".scene-card");
  const setExternalViewerActive = (active) => {
    externalViewerActive = active;
    $("#external-viewer-notice").hidden = !active;
    $("#popout-scene").disabled = active;
    if (viewerCloseTimer) clearInterval(viewerCloseTimer);
    viewerCloseTimer = null;
    if (active) {
      viewerCloseTimer = setInterval(() => {
        if (!viewerWindow || viewerWindow.closed) setExternalViewerActive(false);
      }, 600);
    } else {
      viewerWindow = null;
      requestAnimationFrame(drawScene);
    }
  };
  $("#fullscreen-scene").addEventListener("click", async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await card.requestFullscreen();
    } catch (error) { $("#camera-mode").textContent = `No fue posible ampliar: ${error.message}`; }
  });
  document.addEventListener("fullscreenchange", () => {
    $("#fullscreen-scene").textContent = document.fullscreenElement ? "✕ Salir" : "⛶ Ampliar";
    requestAnimationFrame(drawScene);
  });
  $("#popout-scene").addEventListener("click", () => {
    viewerWindow = window.open(`${window.location.pathname}?viewer=1`, "m1-slope-viewer", "popup,width=1500,height=950,resizable=yes");
    if (!viewerWindow) $("#camera-mode").textContent = "El navegador bloqueó la ventana adicional; permite ventanas emergentes para este sitio.";
  });
  $("#close-external-viewer").addEventListener("click", () => {
    if (viewerWindow && !viewerWindow.closed) {
      viewerWindow.postMessage({ type:"M1_VIEWER_CLOSE" }, window.location.origin);
      viewerWindow.close();
    }
    setExternalViewerActive(false);
    window.focus();
  });
  window.addEventListener("message", (event) => {
    if (event.origin !== window.location.origin) return;
    if (!isViewerWindow && event.data?.type === "M1_VIEWER_READY") {
      viewerWindow = event.source;
      setExternalViewerActive(true);
      publishViewerState(true);
      return;
    }
    if (!isViewerWindow && event.data?.type === "M1_VIEWER_CLOSED") {
      setExternalViewerActive(false);
      window.focus();
      return;
    }
    if (isViewerWindow && event.data?.type === "M1_VIEWER_CLOSE") {
      window.close();
      return;
    }
    if (!isViewerWindow || event.data?.type !== "M1_SCENE_STATE") return;
    const state = event.data;
    scene.forecast = state.forecast || scene.forecast;
    scene.readings = state.readings || scene.readings;
    scene.weather = state.weather || scene.weather;
    scene.playback.progress = state.playback?.progress ?? scene.playback.progress;
    if (state.femRun !== undefined) scene.femRun = state.femRun;
    if (state.geometryAsset !== undefined) scene.geometryAsset = state.geometryAsset;
    if (state.photoApproximation !== undefined) scene.photoApproximation = state.photoApproximation;
    if (state.layer) $("#scene-layer").value = state.layer;
    if (state.projection) {
      $("#camera-projection").value = state.projection;
      sceneRenderer?.setProjection(state.projection);
    }
    if (state.playback?.amplification !== undefined) $("#playback-amplification").value = sliderFromAmplification(state.playback.amplification);
    const optionSelectors = { realistic:"#realism-enabled", terrain:"#terrain-enabled", materials:"#materials-enabled", overlay:"#overlay-enabled", highContrast:"#contrast-enabled", coordinates:"#coordinates-enabled", materialMotion:"#material-motion-enabled" };
    Object.entries(optionSelectors).forEach(([key, selector]) => { if (state.options?.[key] !== undefined) $(selector).checked = state.options[key]; });
    renderWeatherStatus();
    drawScene();
  });
  if (isViewerWindow && window.opener) {
    window.opener.postMessage({ type:"M1_VIEWER_READY" }, window.location.origin);
    window.addEventListener("beforeunload", () => window.opener?.postMessage({ type:"M1_VIEWER_CLOSED" }, window.location.origin));
  }
}
async function loadGeometrySource() {
  const source = $("#geometry-source").value, file = $("#geometry-file").files[0];
  try {
    if (source === "PROCEDURAL") {
      scene.geometryAsset = null; scene.photoApproximation = null;
      $("#photo-preview").hidden = true;
      const result = await api("/api/geometry", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ source, name:"Talud paramétrico", scientificStatus:"DEMONSTRACION", note:"Geometría paramétrica del Digital Twin." }) });
      $("#geometry-status").textContent = `${result.geometry.name} activa.`; fitScene(); drawScene(); return;
    }
    if (!file) throw new Error("Selecciona un archivo antes de cargar la geometría.");
    $("#geometry-status").textContent = `Escaneando ${file.name}…`;
    if (source === "PHOTO_APPROXIMATION") {
      const isImage = file.type.startsWith("image/") || /\.(png|jpe?g|webp|gif|bmp)$/i.test(file.name);
      if (!isImage) throw new Error("La aproximación visual requiere una imagen PNG, JPG, WEBP, GIF o BMP.");
      const approximation = await approximateFromPhoto(file);
      scene.photoApproximation = approximation; scene.geometryAsset = null;
      $("#photo-preview").src = approximation.previewUrl; $("#photo-preview").hidden = false;
      const result = await api("/api/geometry", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ source, name:file.name, format:file.type, scientificStatus:"APROXIMACION_NO_METRICA", note:approximation.note }) });
      $("#geometry-status").textContent = `ESCANEO COMPLETO (${approximation.width} × ${approximation.height} px; 32 muestras visuales). ${result.geometry.scientificStatus}: ${approximation.note}`; fitScene(); drawScene(); return;
    }
    const asset = await readModel(file);
    scene.geometryAsset = asset.mesh ? asset : null; scene.photoApproximation = null; $("#photo-preview").hidden = true;
    const status = asset.mesh ? "MALLA_LOCAL_PREVISUALIZADA" : "METADATOS_REGISTRADOS";
    const result = await api("/api/geometry", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ source, name:file.name, format:asset.format, scientificStatus:status, note:asset.note }) });
    $("#geometry-status").textContent = asset.mesh ? `ESCANEO COMPLETO: ${result.geometry.scientificStatus}. ${asset.note}` : `${result.geometry.scientificStatus}: ${asset.note} Se conserva el talud paramétrico para no mostrar una malla vacía.`;
    fitScene(); drawScene();
  } catch (error) { $("#geometry-status").textContent = error.message; }
}
function setupGeometryControls() {
  $("#load-geometry").addEventListener("click", loadGeometrySource);
  $("#geometry-file").addEventListener("change", () => {
    if (!$("#geometry-file").files[0]) return;
    if ($("#geometry-source").value === "PROCEDURAL") {
      $("#geometry-status").textContent = "Elige «Aproximación desde fotografía» o «Modelo 3D importado» para escanear el archivo seleccionado.";
      return;
    }
    loadGeometrySource();
  });
  $("#geometry-source").addEventListener("change", () => {
    const source = $("#geometry-source").value;
    $("#geometry-file").accept = source === "PHOTO_APPROXIMATION" ? "image/*" : source === "IMPORTED_MODEL" ? ".csv,.dxf,.geojson,.json,.obj,.stl,.gltf,.glb" : "";
    // Garantiza que elegir de nuevo el mismo archivo dispare el evento change.
    $("#geometry-file").value = "";
    scene.geometryAsset = null; scene.photoApproximation = null; $("#photo-preview").hidden = true;
    if (source === "PROCEDURAL") { loadGeometrySource(); return; }
    $("#geometry-status").textContent = source === "PHOTO_APPROXIMATION" ? "Selecciona una fotografía: se escaneará automáticamente y cambiará el relieve y color del talud." : "Selecciona un CSV XYZ, DXF, GeoJSON 3D, OBJ, STL, glTF o GLB: se escaneará automáticamente y su malla aparecerá en el simulador.";
    fitScene(); drawScene();
  });
}
function setupTelemetryControls() {
  const fileInput = $("#telemetry-file");
  const button = $("#import-telemetry");
  const status = $("#telemetry-import-status");
  fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    button.disabled = !file;
    status.textContent = file
      ? `${file.name} · ${(file.size / 1024).toFixed(1)} kB · listo para validar.`
      : "Selecciona un CSV o JSON para validar e importar.";
  });
  button.addEventListener("click", async () => {
    const file = fileInput.files[0];
    if (!file) return;
    if (file.size > 8_000_000) { status.textContent = "El archivo excede el máximo de 8 MB."; return; }
    button.disabled = true;
    status.textContent = "Validando el archivo completo…";
    try {
      const readings = parseTelemetryFile(await file.text(), file.name);
      if (!readings.length) throw new Error("El archivo no contiene lecturas");
      if (readings.length > 5000) throw new Error("El archivo supera el máximo de 5000 lecturas");
      const result = await api("/api/telemetry/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ readings })
      });
      status.textContent = `${result.acceptedCount} lecturas importadas · ${result.sensorIds.join(", ")} · ${new Date(result.firstTimestamp).toLocaleString()} a ${new Date(result.lastTimestamp).toLocaleString()}.`;
      await refresh();
    } catch (error) {
      status.textContent = `No se importó ninguna lectura: ${error.message}`;
    } finally {
      button.disabled = false;
    }
  });
}
function setupRiskPolicyControls() {
  document.querySelectorAll("[data-policy]").forEach((input) => {
    input.addEventListener("input", () => { $(`#${input.dataset.policy}-value`).textContent = Number(input.value).toFixed(2); });
    input.addEventListener("change", async () => {
      try { await api("/api/risk-policy", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ [input.dataset.policy]: Number(input.value) }) }); await refresh(); }
      catch (error) { $("#risk-detail").textContent = error.message; await refresh(); }
    });
  });
}
function selectSensor(hit) { $("#selected-sensor").textContent=hit.id; $("#sensor-detail").textContent=hit.name+". "+hit.detail; drawScene(); }
function setupSceneControls() {
  const canvas=$("#scene-3d");
  if (sceneRenderer) {
    let pointerStart = null;
    canvas.addEventListener("pointerdown", (event) => { pointerStart = { x: event.clientX, y: event.clientY }; });
    canvas.addEventListener("pointerup", (event) => {
      if (pointerStart && Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) < 4) sceneRenderer.selectAt(event);
      pointerStart = null;
    });
    $("#scene-layer").addEventListener("change", drawScene);
    $("#camera-projection").addEventListener("change", (event) => {
      sceneRenderer.setProjection(event.target.value);
      $("#camera-mode").textContent = `${event.target.value === "ORTHOGRAPHIC" ? "Ortográfica técnica" : "Perspectiva 3D"} · ${scene.freecam ? "vuelo libre" : "órbita"}`;
      publishViewerState();
    });
    ["#realism-enabled","#material-motion-enabled","#terrain-enabled","#materials-enabled","#overlay-enabled","#contrast-enabled","#coordinates-enabled"].forEach((selector) => $(selector).addEventListener("change", drawScene));
    $("#freecam-enabled").addEventListener("change", (event) => {
      scene.freecam = event.target.checked;
      canvas.focus();
      $("#camera-mode").textContent = scene.freecam ? "Vuelo libre · WASD mueve · Q/E sube/baja" : "Órbita 3D · arrastra, rueda o usa botón derecho";
    });
    document.querySelectorAll("[data-viewpoint]").forEach((button) => button.addEventListener("click", () => {
      document.querySelectorAll("[data-viewpoint]").forEach((item) => item.classList.toggle("active", item === button));
      goToViewpoint(button.dataset.viewpoint);
    }));
    window.addEventListener("keydown", (event) => {
      if (!scene.freecam || ["INPUT","SELECT","TEXTAREA"].includes(document.activeElement.tagName)) return;
      if (sceneRenderer.moveFreeCamera(event.key.toLowerCase(), event.shiftKey ? 16 : 7)) event.preventDefault();
    });
    const resetView = () => { fitScene(); drawScene(); };
    $("#reset-camera").addEventListener("click", resetView);
    $("#fit-scene").addEventListener("click", resetView);
    return;
  }
  canvas.addEventListener("pointerdown",(event)=>{canvas.setPointerCapture(event.pointerId);scene.drag={x:event.clientX,y:event.clientY,yaw:scene.yaw,pitch:scene.pitch,panX:scene.panX,panY:scene.panY,shift:event.shiftKey,moved:false};});
  canvas.addEventListener("pointermove",(event)=>{if(!scene.drag){if(!$("#coordinates-enabled").checked){$("#coordinate-hover").textContent="Activa la cuadrícula para inspeccionar referencias.";return;}const point={x:event.offsetX,y:event.offsetY};const hit=scene.coordinateHits.reduce((closest,item)=>!closest||Math.hypot(item.p.x-point.x,item.p.y-point.y)<Math.hypot(closest.p.x-point.x,closest.p.y-point.y)?item:closest,null);$("#coordinate-hover").textContent=hit&&Math.hypot(hit.p.x-point.x,hit.p.y-point.y)<30?hit.text:"Mueve el cursor sobre una marca de la retícula.";return;}const dx=event.clientX-scene.drag.x,dy=event.clientY-scene.drag.y;scene.drag.moved||=(Math.abs(dx)+Math.abs(dy)>3);if(scene.drag.shift){scene.panX=scene.drag.panX+dx;scene.panY=scene.drag.panY+dy;}else{scene.yaw=scene.drag.yaw+dx*.009;scene.pitch=clamp(scene.drag.pitch+dy*.008,-1.15,1.15);}drawScene();});
  canvas.addEventListener("pointerup",(event)=>{const drag=scene.drag;scene.drag=null;if(drag&&!drag.moved){const point={x:event.offsetX,y:event.offsetY};const hit=scene.hits.find((entry)=>Math.hypot(entry.p.x-point.x,entry.p.y-point.y)<16);if(hit)selectSensor(hit);}});
  canvas.addEventListener("wheel",(event)=>{event.preventDefault();scene.zoom=clamp(scene.zoom-event.deltaY*.0015,.8,4.5);drawScene();},{passive:false});
  $("#scene-layer").addEventListener("change",drawScene); ["#material-motion-enabled","#terrain-enabled","#materials-enabled","#overlay-enabled","#contrast-enabled","#coordinates-enabled"].forEach((selector)=>$(selector).addEventListener("change",drawScene));
  $("#camera-projection").disabled = true;
  $("#freecam-enabled").addEventListener("change",(event)=>{scene.freecam=event.target.checked; canvas.focus(); drawScene();});
  document.querySelectorAll("[data-viewpoint]").forEach((button)=>button.addEventListener("click",()=>{document.querySelectorAll("[data-viewpoint]").forEach((item)=>item.classList.toggle("active",item===button));goToViewpoint(button.dataset.viewpoint);}));
  window.addEventListener("keydown",(event)=>{if(!scene.freecam || ["INPUT","SELECT","TEXTAREA"].includes(document.activeElement.tagName))return;const speed=event.shiftKey?16:7;const forward={x:-Math.sin(scene.yaw),z:Math.cos(scene.yaw)},right={x:Math.cos(scene.yaw),z:Math.sin(scene.yaw)};let moved=true;switch(event.key.toLowerCase()){case"w":scene.camera.x+=forward.x*speed;scene.camera.z+=forward.z*speed;break;case"s":scene.camera.x-=forward.x*speed;scene.camera.z-=forward.z*speed;break;case"a":scene.camera.x-=right.x*speed;scene.camera.z-=right.z*speed;break;case"d":scene.camera.x+=right.x*speed;scene.camera.z+=right.z*speed;break;case"q":scene.camera.y-=speed;break;case"e":scene.camera.y+=speed;break;default:moved=false;}if(moved){event.preventDefault();drawScene();}});
  $("#reset-camera").addEventListener("click",()=>{fitScene();drawScene();});
  $("#fit-scene").addEventListener("click",()=>{fitScene();drawScene();});
}

function renderForecast(forecast, rows) {
  const level = forecast.risk.level;
  $("#risk-level").textContent = level; $("#risk-level").className = `risk-level ${level}`;
  $("#risk-description").textContent = riskMessage(level); $("#risk-bar").style.width = `${forecast.risk.score*100}%`; $("#risk-bar").style.background = riskColor(level);
  $("#risk-score").textContent = `Índice de riesgo: ${(forecast.risk.score*100).toFixed(1)} / 100`;
  $("#fs").textContent = forecast.femState.factorOfSafety.toFixed(3); $("#displacement").textContent = `${forecast.predictedDisplacementMm.toFixed(2)} mm`;
  $("#interval").textContent = `Intervalo: ${forecast.intervalMm.lower.toFixed(2)} – ${forecast.intervalMm.upper.toFixed(2)} mm`;
  $("#uncertainty").textContent = `${(forecast.risk.uncertainty*100).toFixed(1)}%`; $("#residual").textContent = `Residuo físico: ${forecast.modelDiagnostics.physicsResidual.toFixed(3)}`;
  $("#sensor").textContent = forecast.sensorId; $("#last-update").textContent = `Actualizado: ${new Date(forecast.generatedAt).toLocaleTimeString()}`;
  const statements = [
    `Índice de seguridad reducido: ${forecast.femState.factorOfSafety.toFixed(3)}; no equivale a un FoS FEM validado.`,
    `Velocidad derivada de la serie: ${forecast.femState.displacementRateMmH.toFixed(3)} mm/h; incremento exploratorio: ${forecast.predictedIncrementMm.toFixed(2)} mm.`,
    `Presión física de riesgo: ${(forecast.femState.physicsRisk*100).toFixed(0)}%; componente temporal: ${(forecast.modelDiagnostics.temporalRisk*100).toFixed(0)}%.`,
    `Incertidumbre del pronóstico: ${(forecast.risk.uncertainty*100).toFixed(1)}%.`
  ]; $("#explanations").innerHTML = statements.map((x)=>`<li>${x}</li>`).join(""); drawChart(rows, forecast);
  stopDisplacementPlayback(); scene.playback.progress = 0; scene.femRun = null; applySimulationParameters(forecast.simulationParameters); scene.forecast=forecast;scene.readings=rows;drawScene();
}

async function renderAlerts() {
  const { alerts } = await api("/api/alerts");
  const list = $("#alert-list");
  if (!alerts.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "Aún no hay alertas registradas.";
    list.replaceChildren(empty);
    return;
  }
  list.replaceChildren(...alerts.slice(0, 5).map((alert) => {
    const row = document.createElement("div");
    row.className = "alert-row";
    const level = document.createElement("span");
    level.className = `pill ${alert.level}`;
    level.textContent = alert.level;
    const sensor = document.createElement("span");
    sensor.textContent = alert.sensorId;
    const message = document.createElement("span");
    message.textContent = alert.message.replaceAll("FS=", "índice reducido=");
    row.append(level, sensor, message);
    return row;
  }));
}
async function loadPersistenceStatus() {
  try {
    const status = await api("/api/persistence/status");
    $("#connection-status").innerHTML = `<span class="dot"></span> Servicio activo · SQLite · ${status.counts.telemetry} variables`;
    $("#connection-status").title = "Persistencia local en modo WAL; prototipo no replicado ni cifrado.";
  } catch {
    $("#connection-status").innerHTML = '<span class="dot"></span> Servicio activo · memoria temporal';
  }
}
function renderSensorOptions(sensors) {
  const select = $("#active-sensor");
  const selected = select.value;
  select.replaceChildren(...sensors.map((sensor) => new Option(`${sensor.sensorId} · ${sensor.readingCount}`, sensor.sensorId)));
  if (sensors.some((sensor) => sensor.sensorId === selected)) select.value = selected;
}
async function refresh() {
  try {
    const horizon = $("#horizon").value;
    const sensorData = await api("/api/sensors");
    renderSensorOptions(sensorData.sensors);
    const sensorId = $("#active-sensor").value;
    const query = sensorId ? `&sensorId=${encodeURIComponent(sensorId)}` : "";
    const [telemetry, forecast, twin] = await Promise.all([
      api(`/api/telemetry?limit=72${query}`),
      api(`/api/forecast?horizon=${horizon}${query}`),
      api(`/api/twin?${sensorId ? `sensorId=${encodeURIComponent(sensorId)}` : ""}`)
    ]);
    renderForecast(forecast, telemetry.readings);
    renderTwinStatus(twin, forecast, telemetry.readings);
    await Promise.all([renderAlerts(), loadPersistenceStatus()]);
  } catch (error) { $("#risk-description").textContent = error.message; }
}
try {
  sceneRenderer = new SlopeScene3D($("#scene-3d"), selectSensor);
  scene.pendingFit = true;
} catch (error) {
  console.warn("WebGL no disponible; se mantiene el visor Canvas de compatibilidad.", error);
  $("#realism-enabled").checked = false;
  $("#realism-enabled").disabled = true;
}

$("#run").addEventListener("click", refresh);
$("#active-sensor").addEventListener("change", refresh);
$("#scenario").addEventListener("change", async (event) => {
  await api("/api/scenario", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({name:event.target.value}) });
  $("#active-sensor").value = "EXT-01";
  scene.weather = emptyWeather();
  refresh();
});
window.addEventListener("resize", () => { drawChart(scene.readings, scene.forecast); drawScene(); });
setupSceneControls();
setupPlaybackControls();
setupWeatherControls();
setupSceneWindowControls();
setupSimulationControls();
setupGeometryControls();
setupTelemetryControls();
setupRiskPolicyControls();
setupReportControls();
setupResearchControls();
setupFemControls();
loadTemporalBaseline();
loadScientificValidation();
loadPersistenceStatus();
refresh();
