import { makeMineFrame, mineChatSnapshot } from "./mine-twin-frame.js";

export class MineTwinController {
  constructor({ document, renderer, redraw, onCaseChange, viewer = false }) {
    Object.assign(this, { document, renderer, redraw, onCaseChange, viewer });
    this.caseId = viewer ? "WAITING" : "CENTURY";
    this.asset = null; this.frame = null; this.index = 0; this.amplification = 1; this.selectedId = null;
    this.playing = false; this.raf = null; this.request = 0; this.cache = new Map(); this.settings = new Map(); this.chartKey = "";
    const $ = (id) => document.getElementById(id); this.$ = $;
    $("mine-case").addEventListener("change", () => this.selectCase($("mine-case").value));
    $("mine-date").addEventListener("change", () => { this.pause(); this.setIndex(this.asset.frames.findIndex((f) => f.date === $("mine-date").value)); });
    $("mine-seek").addEventListener("input", () => { this.pause(); this.setIndex(Number($("mine-seek").value)); });
    $("mine-prism").addEventListener("change", () => { this.selectedId = $("mine-prism").value; this.redraw(); });
    $("mine-amplification").addEventListener("input", () => { this.amplification = Number($("mine-amplification").value); this.setIndex(this.index); });
    $("mine-scale-1x").addEventListener("click", () => { this.amplification = 1; $("mine-amplification").value = "1"; this.setIndex(this.index); });
    $("mine-play").addEventListener("click", () => this.play());
    $("mine-pause").addEventListener("click", () => this.pause());
    $("mine-event-date").addEventListener("click", () => { this.pause(); this.setIndex(this.asset.frames.findIndex((f) => f.date === "2014-02-23")); });
    $("mine-show-rain").addEventListener("change", this.redraw);
    if (!viewer) this.selectCase("CENTURY");
  }
  async selectCase(id) {
    if (!["CENTURY", "PASCO", "LAB"].includes(id)) throw new Error("Selección de mina inválida");
    if (this.asset && this.frame) this.settings.set(this.caseId, { index:this.index, selectedId:this.selectedId, amplification:this.amplification });
    this.pause(); const request = ++this.request;
    this.caseId = id; this.asset = null; this.frame = null; this.chartKey = "";
    this.document.body.dataset.mineCase = id; this.$("mine-case").value = id;
    this.renderer?.clearMineView?.();
    this.$("tab-simulation").textContent = id === "LAB" ? "Simulación" : "Reproducción";
    this.$("tab-data").textContent = id === "LAB" ? "Datos" : "Fuentes";
    this.$("mine-scene-title").textContent = id === "CENTURY" ? "Century · sector instrumentado 3D" : id === "PASCO" ? "Pasco · perfil histórico 3D" : "Laboratorio · talud demostrativo 3D";
    this.document.querySelector(".material-motion-toggle small").textContent = id === "LAB" ? "Deforma suelo, roca y sedimentos en vivo" : "Mueve la superficie interpolada según prismas";
    this.$("mine-summary").hidden = id === "LAB"; this.$("mine-controls").hidden = id === "LAB";
    this.onCaseChange(id);
    if (id === "LAB") { this.$("mine-case-note").textContent = "Laboratorio demostrativo. No representa la geometría ni las mediciones de Pasco o Century."; this.redraw(); return; }
    for (const control of ["mine-date", "mine-seek", "mine-prism", "mine-play", "mine-event-date", "mine-amplification", "mine-scale-1x", "mine-show-rain", "mine-speed"]) this.$(control).disabled = true;
    this.$("scene-status").textContent = "CARGANDO MINA";
    this.$("layer-legend").textContent = "Esperando el modelo del caso seleccionado";
    this.$("scene-event-hud").hidden = true;
    this.$("mine-case-note").textContent = `Cargando ${id === "CENTURY" ? "Century" : "Cerro de Pasco"}…`;
    this.$("mine-status").textContent = "Cargando modelo y mediciones…";
    this.$("mine-name").textContent = "Preparando caso…";
    for (const field of ["mine-observed-count", "mine-movement", "mine-rain", "mine-selected-detail"]) this.$(field).textContent = "—";
    this.$("mine-timeseries").replaceChildren();
    try {
      if (!this.cache.has(id)) {
        const response = await fetch(`/api/mines/${id.toLowerCase()}`);
        const data = await response.json(); if (!response.ok) throw new Error(data.error || "No disponible");
        this.cache.set(id, data);
      }
      if (request !== this.request) return;
      this.asset = this.cache.get(id);
      const saved = this.settings.get(id);
      this.index = saved?.index || 0; this.selectedId = saved?.selectedId || this.asset.sensorIds[0]; this.amplification = saved?.amplification || 1;
      this.$("mine-amplification").value = String(this.amplification);
      this.$("mine-date").replaceChildren(...this.asset.frames.map((f) => { const option = this.document.createElement("option"); option.value = f.date; option.textContent = f.date; return option; }));
      this.$("mine-prism").replaceChildren(...this.asset.sensorIds.map((sensorId) => { const option = this.document.createElement("option"); option.value = sensorId; option.textContent = id === "PASCO" ? `Muestra ${sensorId.replace("SRTM-", "")}` : `Prisma ${sensorId}`; return option; }));
      this.$("mine-seek").max = String(this.asset.frames.length - 1);
      const staticCase = id === "PASCO";
      for (const control of ["mine-date", "mine-seek", "mine-play", "mine-event-date", "mine-amplification", "mine-scale-1x", "mine-show-rain", "mine-speed"]) this.$(control).disabled = staticCase;
      this.$("mine-prism").disabled = false;
      this.$("mine-download").href = `/api/mines/${id.toLowerCase()}?download=1`;
      this.$("mine-source").href = this.asset.source.url;
      this.$("mine-name").textContent = this.asset.name;
      this.$("mine-case-note").textContent = staticCase ? "Perfil SRTM histórico de 2000. No dispone de movimientos diarios observados." : "Gemelo retrospectivo parcial: prismas medidos de 2014 y superficie interpolada del sector sudoeste.";
      this.$("mine-limitations").replaceChildren(...this.asset.warnings.map((text) => { const li = this.document.createElement("li"); li.textContent = text; return li; }));
      this.renderer?.clearRoot(); this.renderer && (this.renderer.mineStructureKey = null);
      this.$("mine-prism").value = this.selectedId;
      this.setIndex(this.index); this.renderer?.fit();
    } catch (error) {
      if (request !== this.request) return;
      this.$("mine-status").textContent = `No se cargó la mina: ${error.message}`;
      this.renderer?.clearRoot(); this.redraw();
    }
  }
  setIndex(index) {
    if (!this.asset || index < 0 || index >= this.asset.frames.length) return;
    this.index = index; this.frame = makeMineFrame(this.asset, index, this.amplification);
    this.$("mine-date").value = this.frame.date; this.$("mine-seek").value = String(index);
    this.redraw();
  }
  selectPoint(point) {
    this.selectedId = point.id; this.$("mine-prism").value = point.id; this.redraw();
  }
  pause() {
    this.playing = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = null;
    this.$("mine-play").textContent = "▶ Reproducir mediciones"; this.$("mine-pause").disabled = true;
  }
  play() {
    if (!this.asset || this.asset.frames.length < 2) return;
    if (this.index >= this.asset.frames.length - 1) this.setIndex(0);
    this.pause(); this.playing = true; this.$("mine-play").textContent = "Reproduciendo…"; this.$("mine-pause").disabled = false;
    let last = 0;
    const tick = (time) => {
      if (!this.playing) return;
      const interval = 1000 / Number(this.$("mine-speed").value);
      if (!last) last = time;
      if (time - last >= interval) {
        last = time; this.setIndex(this.index + 1);
        if (this.index >= this.asset.frames.length - 1) { this.pause(); return; }
      }
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }
  render(options, suspendRenderer = false) {
    if (this.caseId === "LAB") return false;
    if (!this.asset || !this.frame) return true;
    const asset = this.asset, frame = this.frame;
    if (!suspendRenderer) this.renderer?.renderMine({ asset, frame, options, selectedId: this.selectedId, showRain: this.$("mine-show-rain").checked });
    const pasco = asset.id === "PASCO";
    this.$("mine-series-heading").textContent = pasco ? "PUNTO TOPOGRÁFICO · COTA HISTÓRICA" : "PUNTO SELECCIONADO · CURVA HISTÓRICA COMPLETA";
    this.$("mine-series-note").textContent = pasco ? "Las cotas pertenecen al perfil SRTM de febrero de 2000. El ancho transversal es esquemático; no corresponde a un levantamiento actual de bancos." : "Curva retrospectiva completa para explorar el registro; no es información disponible antes de cada fecha. La línea naranja marca el 23/02/2014 documentado en el artículo, no una detección del software.";
    this.$("mine-safety-note").textContent = pasco ? "Perfil topográfico histórico, sin serie de movimiento diario ni FEM calibrado. No genera FoS ni alertas de falla." : "Sin presión de poros medida, FEM calibrado o alertas de falla. La superficie entre prismas y las texturas son aproximaciones visuales.";
    this.$("mine-replay-note").textContent = pasco ? "Selecciona una muestra para consultar la cota histórica. Este perfil no contiene mediciones diarias de desplazamiento." : "Gris: referencia histórica o fondo esquemático, no desplazamiento cero. El movimiento y los colores analíticos solo se muestran donde hay cobertura suficiente de lecturas actuales. Al desactivar «Movimiento del terreno» aparecen vectores de cambio.";
    this.$("mine-status").textContent = `${frame.date} · ${asset.id === "CENTURY" ? `${frame.observedPointCount} prismas medidos; ${frame.missingPointCount} sin lectura hoy; ${frame.observedTriangleCount} triángulos con datos; ${frame.referenceOnlyTriangleCount} solo de referencia gris` : "25 muestras SRTM; ancho transversal esquemático"} · sin FoS/alertas`;
    this.$("mine-observed-count").textContent = `${frame.observedPointCount} / ${asset.sensorIds.length}`;
    this.$("mine-observed-label").textContent = asset.id === "CENTURY" ? "Prismas con lectura en la fecha" : "Muestras topográficas (no sensores)";
    this.$("mine-movement").textContent = asset.id === "CENTURY" && frame.maximumDisplacementMm !== null ? `${frame.maximumDisplacementMm.toFixed(2)} mm` : "Sin serie de movimiento";
    this.$("mine-rain").textContent = frame.rain?.rainfallMm !== null && frame.rain?.rainfallMm !== undefined ? `${frame.rain.rainfallMm} mm / ${frame.rain.periodDays ?? "?"} día(s)` : "Sin dato de lluvia para la fecha";
    this.$("mine-frame-date").textContent = frame.date; this.$("mine-amplification-value").textContent = `${frame.amplification}×`;
    const point = frame.points.find((p) => p.id === this.selectedId);
    this.$("selected-sensor").textContent = this.selectedId || "—";
    const detail = point ? `${point.id}: [${point.coordinate.map((v) => v.toFixed(4)).join(", ")}] m. ${asset.id === "CENTURY" ? `Cambio respecto de ${asset.referenceDate}: ${point.displacementMm === null ? "sin referencia" : `${point.displacementMm.toFixed(3)} mm`}. Hora local: ${point.timeLocal}.${point.qcJump ? " Salto >1 m: requiere revisión." : ""}` : "Cota histórica SRTM, no prisma."}` : "El punto seleccionado no tiene lectura en esta fecha. No se interpoló ni se arrastró el dato anterior.";
    this.$("mine-selected-detail").textContent = detail; this.$("sensor-detail").textContent = detail;
    this.$("layer-source").textContent = `${asset.geometry.method}. Movimiento por cambios de coordenadas medidos, no FEM. Gris: referencia histórica, no lectura actual. Textura solo ilustrativa; materiales geológicos no identificados.`;
    this.$("scene-status").textContent = `${asset.id} · ${asset.id === "CENTURY" ? "PRISMAS REALES + TIN" : "PERFIL SRTM 2000"}`; this.$("scene-status").className = "chip";
    this.$("layer-legend").textContent = asset.id === "CENTURY" ? `Cambio medido: 0–${(frame.maximumDisplacementMm || 0).toFixed(2)} mm · gris: solo referencia · no riesgo · escala ${frame.amplification}×` : "Perfil histórico + extrusión esquemática";
    this.$("coordinate-readout").textContent = asset.id === "CENTURY" ? `Sistema local Quikslope · origen E ${asset.origin[0].toFixed(2)}, N ${asset.origin[1].toFixed(2)}, H ${asset.origin[2].toFixed(2)} m` : "Transecto A–B · distancia m · SRTM EGM96";
    this.$("coordinate-system").textContent = asset.coordinateReference;
    for (const [i, id] of ["coordinate-east", "coordinate-north", "coordinate-elevation"].entries()) this.$(id).textContent = `${asset.bounds.min[i].toFixed(2)} → ${asset.bounds.max[i].toFixed(2)} m`;
    this.$("coordinate-hover").textContent = "Coordenadas originales en el inspector del prisma; el visor conserva metros sin normalizar.";
    this.$("scene-event-hud").hidden = false;
    this.$("scene-event-hud").textContent = `${frame.date} · ${frame.kind === "OBSERVED_COORDINATE_REPLAY" ? "MEDICIONES HISTÓRICAS" : "TOPOGRAFÍA HISTÓRICA"}${frame.qcJumpCount ? ` · ${frame.qcJumpCount} salto(s) por revisar` : ""}${frame.amplification > 1 ? ` · AMPLIFICADO ${frame.amplification}×` : " · ESCALA 1×"}`;
    this.$("scene-event-hud").className = "scene-event-hud displacement";
    this.drawSeries();
    return true;
  }
  drawSeries() {
    if (this.viewer || this.chartKey === `${this.asset.id}/${this.selectedId}`) return;
    this.chartKey = `${this.asset.id}/${this.selectedId}`;
    const container = this.$("mine-timeseries"); container.replaceChildren();
    if (this.asset.id !== "CENTURY") { container.textContent = "Pasco no tiene una serie diaria de desplazamiento observada integrada."; return; }
    const index = this.asset.sensorIds.indexOf(this.selectedId), reference = this.asset.baseline[index];
    if (!reference) { container.textContent = "Prisma sin lectura de referencia del 1 de enero. Se muestran coordenadas, sin inventar un desplazamiento inicial."; return; }
    const series = this.asset.frames.flatMap((f) => { const p = f.points.find((r) => r[0] === index); return p ? [{ date: f.date, mm: Math.hypot(p[1] - reference[0], p[2] - reference[1], p[3] - reference[2]) * 1000 }] : []; });
    const ns = "http://www.w3.org/2000/svg", svg = this.document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 600 150"); svg.setAttribute("role", "img"); svg.setAttribute("aria-label", `Cambio de coordenadas del prisma ${this.selectedId}; curva retrospectiva completa, no disponible para pronóstico previo.`);
    const time = (date) => Date.parse(`${date}T00:00:00Z`), first = time(this.asset.frames[0].date), last = time(this.asset.frames.at(-1).date), max = Math.max(1, ...series.map((p) => p.mm));
    const x = (date) => 45 + (time(date) - first) / (last - first) * 535, y = (mm) => 120 - mm / max * 100;
    const add = (tag, attrs, text) => { const e = this.document.createElementNS(ns, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v)); if (text) e.textContent = text; svg.append(e); };
    for (let i = 0; i < 3; i++) add("text", { x: 0, y: y(max * i / 2) + 4, fill: "#aac8bc", "font-size": 10 }, `${(max * i / 2).toFixed(0)} mm`);
    series.forEach((p, i) => { const prev = series[i - 1]; if (prev && time(p.date) - time(prev.date) === 86400000) add("line", { x1: x(prev.date), y1: y(prev.mm), x2: x(p.date), y2: y(p.mm), stroke: "#48e2c2", "stroke-width": 1.5 }); add("circle", { cx: x(p.date), cy: y(p.mm), r: 1.4, fill: "#48e2c2" }); });
    add("line", { x1: x("2014-02-23"), x2: x("2014-02-23"), y1: 15, y2: 120, stroke: "#ffbd77", "stroke-dasharray": "3 3" });
    add("text", { x: 45, y: 143, fill: "#aac8bc", "font-size": 10 }, "2014-01-01"); add("text", { x: 495, y: 143, fill: "#aac8bc", "font-size": 10 }, "2014-08-06");
    container.append(svg);
  }
  snapshot() { return mineChatSnapshot(this.asset, this.frame, this.selectedId); }
  viewerSnapshot() {
    if (this.caseId === "LAB") return { caseId: "LAB" };
    if (!this.asset || !this.frame) return { caseId: this.caseId, asset: null, frame: null };
    const { frames, ...asset } = this.asset;
    return { caseId: this.caseId, asset, frame: this.frame, selectedId: this.selectedId, showRain: this.$("mine-show-rain").checked };
  }
  receive(snapshot) {
    if (!this.viewer || !snapshot) return;
    if (this.caseId !== snapshot.caseId) this.renderer?.clearMineView?.();
    this.caseId = snapshot.caseId; this.document.body.dataset.mineCase = this.caseId;
    this.$("mine-scene-title").textContent = this.caseId === "CENTURY" ? "Century · sector instrumentado 3D" : this.caseId === "PASCO" ? "Pasco · perfil histórico 3D" : "Laboratorio · talud demostrativo 3D";
    this.asset = snapshot.asset; this.frame = snapshot.frame; this.selectedId = snapshot.selectedId;
    this.$("mine-show-rain").checked = Boolean(snapshot.showRain);
  }
}
