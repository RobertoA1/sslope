const $ = (selector) => document.querySelector(selector);
const api = async (path, options) => {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Error de servicio");
  return data;
};
const scene = { yaw: -0.62, pitch: 0.52, zoom: 2.25, panX: 0, panY: 5, drag: null, hits: [], forecast: null, readings: [], freecam: false, camera: { x: 0, y: 0, z: 0 } };
const terrainHeight = (x, parameters = {}) => {
  const width = parameters.slopeWidthM || 160, height = parameters.slopeHeightM || 90, type = parameters.geometryType || "LINEAR";
  const progress = clamp((x + width / 2) / width);
  const profile = type === "LINEAR" || type === "BENCHED" ? 1 - progress : type === "WASTE_DUMP" ? (1 - progress) ** .72 : Math.sqrt(Math.max(0, 1 - progress ** 2));
  const elevation = height * profile;
  return type === "BENCHED" ? Math.round(elevation / 12) * 12 : elevation;
};
const clamp = (v, min = 0, max = 1) => Math.min(Math.max(v, min), max);

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
    risk: { label: "Riesgo bajo → alto", source: "Capa pronosticada por el modelo híbrido FEM–temporal–físico.", base: forecast.risk.score, unit: "índice" },
    displacement: { label: "Desplazamiento bajo → alto", source: "Desplazamiento previsto por el modelo temporal corregido por física.", base: clamp(forecast.predictedIncrementMm / 40), unit: "mm" },
    pore: { label: "Presión baja → alta", source: "Presión de poros de la última telemetría, interpolada sobre el talud.", base: clamp(last.porePressureKpa / 210), unit: "kPa" },
    safety: { label: "Seguro → inestable", source: "Campo de criticidad derivado del factor de seguridad reducido (FEM).", base: clamp((1.5 - forecast.femState.factorOfSafety) / 0.6), unit: "FS" },
    uncertainty: { label: "Certeza alta → baja", source: "Incertidumbre del pronóstico combinada con variación espacial demostrativa.", base: forecast.risk.uncertainty, unit: "%" }
  };
  return values[layer];
}

function drawScene() {
  const canvas = $("#scene-3d"); if (!canvas || !scene.forecast) return;
  const ctx = canvas.getContext("2d"), dpr = window.devicePixelRatio || 1, w = canvas.clientWidth, h = canvas.clientHeight;
  canvas.width = Math.max(1, Math.floor(w * dpr)); canvas.height = Math.max(1, Math.floor(h * dpr)); ctx.scale(dpr, dpr); ctx.clearRect(0, 0, w, h);
  const forecast = scene.forecast, readings = scene.readings, layer = $("#scene-layer").value, meta = layerMeta(layer, forecast, readings);
  const terrainEnabled = $("#terrain-enabled").checked, materialsEnabled = $("#materials-enabled").checked, overlayEnabled = $("#overlay-enabled").checked, highContrast = $("#contrast-enabled").checked;
  const parameters = forecast.simulationParameters || {};
  const heightAt = (x) => terrainEnabled ? terrainHeight(x, parameters) : 12;
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
  const xs=Array.from({length:13},(_,i)=>-halfWidth+i*(slopeWidth/12)), zs=Array.from({length:9},(_,i)=>-halfDepth+i*((halfDepth*2)/8));
  for(let xi=0;xi<xs.length-1;xi++) for(let zi=0;zi<zs.length-1;zi++) {
    const x=xs[xi], z=zs[zi], x2=xs[xi+1], z2=zs[zi+1], y=heightAt((x+x2)/2);
    const midX=(x+x2)/2, midZ=(z+z2)/2;
    if (parameters.geometryType === "SEMICIRCULAR" && Math.abs(midZ) > halfDepth * Math.sqrt(Math.max(0, 1 - (midX / halfWidth) ** 2))) continue;
    const spatial=clamp(((x+120)/240)*.17+((z+80)/160)*.06); const value=clamp(meta.base+spatial);
    const material = materialFor(Math.max(0, (parameters.slopeHeightM || 90) - y), parameters), base = materialsEnabled ? materialColor(material,x,z,highContrast) : "hsl(159 31% 22%)";
    faces.push({ points:[{x,y,z},{x:x2,y,z},{x:x2,y,z:z2},{x,y,z:z2}], base, overlay:colorFor(value,highContrast), depth:project({x:(x+x2)/2,y,z:(z+z2)/2}).depth });
    const nextY=heightAt(x2); if(y>nextY) faces.push({points:[{x:x2,y,z},{x:x2,y,z:z2},{x:x2,y:nextY,z:z2},{x:x2,y:nextY,z}],base:materialsEnabled?materialColor(material,x2,z,highContrast):"hsl(159 31% 18%)",overlay:colorFor(value*.72,highContrast),depth:project({x:x2,y:(y+nextY)/2,z:(z+z2)/2}).depth});
    const nextZ=heightAt(x); if(y>nextZ && zi===zs.length-2) faces.push({points:[{x,y,z:z2},{x:x2,y,z:z2},{x:x2,y:nextZ,z:z2},{x,y:nextZ,z:z2}],base:materialsEnabled?materialColor(material,x,z2,highContrast):"hsl(159 31% 16%)",overlay:colorFor(value*.61,highContrast),depth:project({x:(x+x2)/2,y:(y+nextZ)/2,z:z2}).depth});
  }
  faces.sort((a,b)=>b.depth-a.depth); faces.forEach(face=>{polygon(face.points,face.base);if(overlayEnabled)polygon(face.points,face.overlay,null,highContrast ? .67 : .28);});
  // Bank labels make the engineering geometry legible without claiming an FEM 3D mesh.
  if(terrainEnabled){ctx.fillStyle="#d3d1bc";ctx.font="10px DM Mono";[0,24,48,72].filter((e)=>e<=(parameters.slopeHeightM||90)).forEach((e)=>{const p=project({x:-halfWidth*.95,y:e,z:-halfDepth*1.04});ctx.fillText(`Banco ${e} m`,p.x,p.y);});}
  const sensorDefinitions=[{id:"EXT-01",name:"Extensómetro principal",x:-slopeWidth*.06,z:-halfDepth*.06,detail:`Desplazamiento actual: ${forecast.currentDisplacementMm.toFixed(2)} mm; previsto: ${forecast.predictedDisplacementMm.toFixed(2)} mm.`},{id:"PZ-02",name:"Piezómetro",x:slopeWidth*.30,z:halfDepth*.35,detail:`Presión de poros interpolada: ${(readings.at(-1)?.porePressureKpa || 0).toFixed(1)} kPa.`},{id:"INC-03",name:"Inclinómetro",x:-slopeWidth*.45,z:halfDepth*.4,detail:`Velocidad derivada: ${forecast.femState.displacementRateMmH.toFixed(3)} mm/h.`}];
  scene.hits=[];sensorDefinitions.forEach(sensor=>{const y=heightAt(sensor.x)+5,p=project({x:sensor.x,y,z:sensor.z});scene.hits.push({...sensor,p});ctx.beginPath();ctx.arc(p.x,p.y,6,0,Math.PI*2);ctx.fillStyle=sensor.id===$("#selected-sensor").textContent?"#ffffff":"#071411";ctx.fill();ctx.lineWidth=2;ctx.strokeStyle="#51ead0";ctx.stroke();ctx.fillStyle="#ddfff5";ctx.font="10px DM Mono";ctx.fillText(sensor.id,p.x+9,p.y-8);});
  $("#layer-legend").innerHTML=overlayEnabled?`<span class="legend-gradient"></span>${meta.label} · ${meta.unit}`:"Capa analítica desactivada · solo materiales"; $("#layer-source").textContent=overlayEnabled?meta.source:"Se visualiza la geometría y materiales del talud sin superposición analítica."; $("#scene-status").textContent=`${forecast.risk.level} · ${overlayEnabled?layer.toUpperCase():"MATERIALES"}`; $("#scene-status").className=`chip ${forecast.risk.level}`; $("#camera-mode").textContent=scene.freecam?"Vuelo libre · WASD mueve · Q/E sube/baja":"Cámara orbital · arrastra para rotar";
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
  const width = parameters.slopeWidthM || 160, height = parameters.slopeHeightM || 90;
  scene.freecam = false; scene.camera = { x: 0, y: 0, z: 0 }; scene.yaw = -.62; scene.pitch = .48; scene.panX = 0; scene.panY = 5;
  scene.zoom = clamp(2.25 * 160 / Math.max(width, height * 1.65), .55, 2.25);
  const freecam = $("#freecam-enabled"); if (freecam) freecam.checked = false;
}
function goToViewpoint(name) {
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
        const result = await api("/api/simulation", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ [input.dataset.param]: Number(input.value) }) });
        applySimulationParameters(result.parameters); if (["geometryType","slopeHeightM","slopeWidthM"].includes(input.dataset.param)) fitScene(result.parameters); await refresh();
      } catch (error) { $("#risk-description").textContent = error.message; }
    });
  });
}
function selectSensor(hit) { $("#selected-sensor").textContent=hit.id; $("#sensor-detail").textContent=hit.name+". "+hit.detail; drawScene(); }
function setupSceneControls() {
  const canvas=$("#scene-3d");
  canvas.addEventListener("pointerdown",(event)=>{canvas.setPointerCapture(event.pointerId);scene.drag={x:event.clientX,y:event.clientY,yaw:scene.yaw,pitch:scene.pitch,panX:scene.panX,panY:scene.panY,shift:event.shiftKey,moved:false};});
  canvas.addEventListener("pointermove",(event)=>{if(!scene.drag)return;const dx=event.clientX-scene.drag.x,dy=event.clientY-scene.drag.y;scene.drag.moved||=(Math.abs(dx)+Math.abs(dy)>3);if(scene.drag.shift){scene.panX=scene.drag.panX+dx;scene.panY=scene.drag.panY+dy;}else{scene.yaw=scene.drag.yaw+dx*.009;scene.pitch=clamp(scene.drag.pitch+dy*.008,-1.15,1.15);}drawScene();});
  canvas.addEventListener("pointerup",(event)=>{const drag=scene.drag;scene.drag=null;if(drag&&!drag.moved){const point={x:event.offsetX,y:event.offsetY};const hit=scene.hits.find((entry)=>Math.hypot(entry.p.x-point.x,entry.p.y-point.y)<16);if(hit)selectSensor(hit);}});
  canvas.addEventListener("wheel",(event)=>{event.preventDefault();scene.zoom=clamp(scene.zoom-event.deltaY*.0015,.8,4.5);drawScene();},{passive:false});
  $("#scene-layer").addEventListener("change",drawScene); ["#terrain-enabled","#materials-enabled","#overlay-enabled","#contrast-enabled"].forEach((selector)=>$(selector).addEventListener("change",drawScene));
  $("#freecam-enabled").addEventListener("change",(event)=>{scene.freecam=event.target.checked; canvas.focus(); drawScene();});
  document.querySelectorAll("[data-viewpoint]").forEach((button)=>button.addEventListener("click",()=>{document.querySelectorAll("[data-viewpoint]").forEach((item)=>item.classList.toggle("active",item===button));goToViewpoint(button.dataset.viewpoint);}));
  window.addEventListener("keydown",(event)=>{if(!scene.freecam || ["INPUT","SELECT","TEXTAREA"].includes(document.activeElement.tagName))return;const speed=event.shiftKey?16:7;const forward={x:-Math.sin(scene.yaw),z:Math.cos(scene.yaw)},right={x:Math.cos(scene.yaw),z:Math.sin(scene.yaw)};let moved=true;switch(event.key.toLowerCase()){case"w":scene.camera.x+=forward.x*speed;scene.camera.z+=forward.z*speed;break;case"s":scene.camera.x-=forward.x*speed;scene.camera.z-=forward.z*speed;break;case"a":scene.camera.x-=right.x*speed;scene.camera.z-=right.z*speed;break;case"d":scene.camera.x+=right.x*speed;scene.camera.z+=right.z*speed;break;case"q":scene.camera.y-=speed;break;case"e":scene.camera.y+=speed;break;default:moved=false;}if(moved){event.preventDefault();drawScene();}});
  $("#reset-camera").addEventListener("click",()=>{fitScene();drawScene();});
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
    `Factor de seguridad estimado: ${forecast.femState.factorOfSafety.toFixed(3)}.`,
    `Velocidad observada: ${forecast.femState.displacementRateMmH.toFixed(3)} mm/h; incremento previsto: ${forecast.predictedIncrementMm.toFixed(2)} mm.`,
    `Presión física de riesgo: ${(forecast.femState.physicsRisk*100).toFixed(0)}%; componente temporal: ${(forecast.modelDiagnostics.temporalRisk*100).toFixed(0)}%.`,
    `Incertidumbre del pronóstico: ${(forecast.risk.uncertainty*100).toFixed(1)}%.`
  ]; $("#explanations").innerHTML = statements.map((x)=>`<li>${x}</li>`).join(""); drawChart(rows, forecast);
  applySimulationParameters(forecast.simulationParameters); scene.forecast=forecast;scene.readings=rows;drawScene();
}

async function renderAlerts() { const { alerts } = await api("/api/alerts"); $("#alert-list").innerHTML = alerts.length ? alerts.slice(0,5).map(a=>`<div class="alert-row"><span class="pill ${a.level}">${a.level}</span><span>${a.sensorId}</span><span>${a.message}</span></div>`).join("") : '<p class="muted">Aún no hay alertas registradas.</p>'; }
async function refresh() { try { const horizon=$("#horizon").value; const [telemetry, forecast] = await Promise.all([api("/api/telemetry?limit=72"),api(`/api/forecast?horizon=${horizon}`)]);renderForecast(forecast,telemetry.readings);await renderAlerts();}catch(error){$("#risk-description").textContent=error.message;} }
$("#run").addEventListener("click",refresh); $("#scenario").addEventListener("change",async(e)=>{await api("/api/scenario",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:e.target.value})});refresh();}); window.addEventListener("resize",()=>{drawChart(scene.readings,scene.forecast);drawScene();}); setupSceneControls(); setupSimulationControls(); refresh();
