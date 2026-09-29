import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { JSDOM } from "jsdom";
import { parseCenturySpatial, prepareCenturySpatial, CENTURY_SPATIAL_FILE } from "../src/core/century-spatial.js";
import { parseCenturyRain } from "../src/core/century-dataset.js";
import { loadMineTwin, serveMineTwin, mineServerSnapshot } from "../src/mine-twins.js";
import { makeMineFrame, mineChatSnapshot } from "../public/mine-twin-frame.js";
import { MineTwinController } from "../public/mine-twin-controller.js";
import { collectDashboardContext } from "../public/chat-context.js";
import { SlopeScene3D } from "../public/slope-scene-3d.js";
import { Scene, Group, Color, Fog, PerspectiveCamera, Vector3 } from "three";

test("mina Century: geometría y fotogramas reproducen el original con trazabilidad", async () => {
  const asset = await loadMineTwin("century");
  const extract = (name) => execFileSync("unzip", ["-p", new URL("../data/external/century-mine/Data.zip", import.meta.url).pathname, name], { maxBuffer: 20000000 });
  const raw = extract(CENTURY_SPATIAL_FILE);
  assert.equal(createHash("sha256").update(raw).digest("hex"), asset.source.deformationSha256);
  const rain = ["weather-data/IDCJAC0009_029167_2013_Data.csv", "weather-data/IDCJAC0009_029167_2014_Data.csv"].flatMap((name) => parseCenturyRain(extract(name).toString()));
  const rebuilt = prepareCenturySpatial(parseCenturySpatial(raw.toString()), rain);
  assert.deepEqual(rebuilt.geometry, asset.geometry);
  assert.deepEqual(rebuilt.baseline, asset.baseline);
  assert.deepEqual(rebuilt.frames, asset.frames);
  assert.equal(asset.audit.rawReadingCount, 82401);
  assert.equal(asset.audit.sensorCount, 160);
  assert.equal(asset.audit.referenceSensorCount, 146);
  assert.equal(asset.frames.length, 215);
  assert.equal(asset.audit.identicalDuplicates, 1);
  assert.equal(asset.audit.conflictingTimestampCount, 0);
  assert.equal(asset.operationalDecisionAllowed, false);
  for (const face of asset.geometry.faces) for (let i = 0; i < 3; i++) {
    const a = asset.baseline[face[i]], b = asset.baseline[face[(i + 1) % 3]];
    assert.ok(a && b);
    assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1]) <= asset.geometry.maxEdgeM);
  }
});

test("mina Century: 1× conserva metros y la amplificación solo cambia la pantalla", async () => {
  const asset = await loadMineTwin("century"), index = asset.frames.findIndex((f) => f.date === "2014-02-23");
  const real = makeMineFrame(asset, index, 1), amplified = makeMineFrame(asset, index, 50);
  assert.equal(real.observedPointCount, 47);
  assert.equal(real.kind, "OBSERVED_COORDINATE_REPLAY");
  assert.equal(real.operationalDecisionAllowed, false);
  assert.equal(real.maximumDisplacementMm, amplified.maximumDisplacementMm);
  real.points.forEach((p, i) => {
    assert.deepEqual(p.display, p.observed);
    assert.deepEqual(p.coordinate, amplified.points[i].coordinate);
    if (p.delta) {
      assert.equal(p.displacementMm, Math.hypot(...p.delta) * 1000);
      assert.ok(Math.abs((amplified.points[i].display.x - p.base.x) - p.delta[0] * 50) < 1e-9);
    }
  });
  assert.equal(real.visibleTriangleCount, asset.geometry.referenceFaces.length, "La referencia permanece completa");
  assert.equal(real.observedTriangleCount, 36);
  assert.equal(real.missingObservationTriangleCount, 228);
  assert.equal(real.referenceContextTriangleCount, 16);
  assert.equal(real.referenceOnlyTriangleCount, 244);
  assert.deepEqual(real.referenceSurface, amplified.referenceSurface, "La base no se amplifica");
  assert.ok(real.faces.every((f) => f.every((i) => real.vertices[i])));
  assert.throws(() => makeMineFrame(asset, -1));
  assert.throws(() => makeMineFrame(asset, index, 0));
  const snapshot = mineChatSnapshot(asset, real, real.points[0].id);
  assert.equal(snapshot.activeMine, "CENTURY");
  assert.equal(snapshot.selectedPoint.id, real.points[0].id);
  assert.equal(snapshot.source.eventReference.kind, "ARTICLE_REFERENCE_NOT_MODEL_DETECTION");
  assert.equal(snapshot.frames, undefined);
});

test("mina Pasco: perfil histórico independiente sin inventar sensores ni movimiento", async () => {
  const asset = await loadMineTwin("pasco"), frame = makeMineFrame(asset, 0);
  assert.equal(asset.audit.sampleCount, 25);
  assert.equal(asset.audit.sensorCount, 0);
  assert.equal(asset.frames.length, 1);
  assert.equal(asset.referenceDate, "2000-02");
  assert.equal(frame.kind, "HISTORICAL_DEM_PROFILE");
  assert.equal(asset.geometry.type, "EXTRUDED_PROFILE");
  assert.equal(frame.rain, null);
  assert.equal(asset.operationalDecisionAllowed, false);
  assert.notEqual(asset.source.profileSha256, (await loadMineTwin("century")).source.deformationSha256);
});

test("minas: API de solo lectura resuelve casos exactos y descargas", async () => {
  const call = async (path) => { const res = { writeHead(status, headers) { this.status = status; this.headers = headers; }, end(content) { this.content = content; } }; await serveMineTwin(res, new URL(path, "http://localhost")); return res; };
  const res = await call("/api/mines/century?download=1");
  assert.equal(res.status, 200);
  assert.match(res.headers["Content-Disposition"], /mine-twin-century/);
  assert.equal(JSON.parse(res.content).id, "CENTURY");
  assert.equal((await call("/api/mines/pasco")).status, 200);
  assert.equal((await call("/api/mines/../../env")).status, 404);
  assert.equal((await call("/api/mines/TA-01")).status, 404);
});

test("minas: selector, fechas, 1× y chat no mezclan Century, Pasco y laboratorio", async () => {
  const dom = new JSDOM(await readFile(new URL("../public/index.html", import.meta.url), "utf8"));
  const doc = dom.window.document, previousFetch = globalThis.fetch;
  const previousDocument = globalThis.document;
  globalThis.document = doc;
  const calls = [], renders = []; let controller;
  globalThis.fetch = async (url) => { calls.push(url); const data = await loadMineTwin(url.split("/").at(-1)); return { ok: true, json: async () => data }; };
  const renderer = { clearRoot() {}, fit() {}, renderMine(data) { renders.push(data); } };
  const options = { terrain: true, materialMotion: true };
  const until = async (predicate) => { for (let i = 0; i < 100; i++) { if (predicate()) return; await new Promise((resolve) => setTimeout(resolve, 10)); } assert.fail("Carga del caso incompleta"); };
  try {
    controller = new MineTwinController({ document: doc, renderer, redraw: () => controller?.render(options), onCaseChange() {} });
    await until(() => controller.frame);
    assert.equal(controller.caseId, "CENTURY");
    assert.equal(controller.frame.amplification, 1);
    assert.equal(doc.getElementById("mine-date").options.length, 215);
    assert.equal(doc.getElementById("mine-prism").options.length, 160);
    doc.getElementById("mine-event-date").click();
    assert.equal(controller.frame.date, "2014-02-23");
    assert.equal(controller.frame.observedPointCount, 47);
    const scale = doc.getElementById("mine-amplification"); scale.value = "20"; scale.dispatchEvent(new dom.window.Event("input"));
    const magnitude = controller.frame.maximumDisplacementMm;
    assert.equal(controller.frame.amplification, 20);
    doc.getElementById("mine-scale-1x").click();
    assert.equal(controller.frame.amplification, 1);
    assert.equal(controller.frame.maximumDisplacementMm, magnitude);
    const context = collectDashboardContext(doc, { mineTwinSnapshot: controller.snapshot() });
    assert.equal(context.activeMine, "CENTURY");
    assert.equal(context.mineTwin.displayedDate, "2014-02-23");
    assert.equal(context.controls.some((c) => c.id === "scene-layer"), false);
    assert.doesNotMatch(context.dashboardText, /Riesgo orientativo/);
    const transfer = controller.viewerSnapshot();
    assert.equal(transfer.asset.frames, undefined, "No retransmitir toda la serie al visor adicional");
    assert.equal(transfer.frame.date, "2014-02-23");
    assert.equal(transfer.frame.referenceSurface.faces.length, 280);
    assert.match(doc.getElementById("layer-legend").textContent, /gris: solo referencia/);
    assert.equal(context.mineTwin.referenceOnlyTriangleCount, 244);
    assert.match(context.mineTwin.surfaceDisplay, /no medición actual/);
    await controller.selectCase("PASCO");
    assert.equal(controller.asset.id, "PASCO");
    assert.equal(doc.getElementById("mine-play").disabled, true);
    assert.equal(doc.getElementById("mine-show-rain").disabled, true);
    assert.equal(controller.frame.rain, null);
    assert.equal(controller.snapshot().activeMine, "PASCO");
    assert.equal(collectDashboardContext(doc, {}).realDataStudy, null);
    await controller.selectCase("CENTURY");
    assert.equal(controller.frame.date, "2014-02-23", "Recupera la fecha del caso sin mezclar Pasco");
    assert.equal(controller.frame.amplification, 1);
    const viewerDom = new JSDOM(await readFile(new URL("../public/index.html", import.meta.url), "utf8"));
    const viewer = new MineTwinController({ document:viewerDom.window.document, renderer, redraw() {}, onCaseChange() {}, viewer:true });
    viewer.receive(transfer);
    assert.equal(viewer.render(options), true);
    assert.equal(viewer.frame.date, "2014-02-23");
    assert.equal(viewer.document.getElementById("mine-scene-title").textContent, "Century · sector instrumentado 3D");
    viewer.receive({caseId:"LAB"});
    assert.equal(viewer.render(options), false);
    viewerDom.window.close();
    await controller.selectCase("LAB");
    assert.equal(controller.asset, null);
    assert.equal(controller.frame, null);
    assert.equal(doc.getElementById("mine-controls").hidden, true);
    assert.equal(controller.render(options), false);
    assert.equal(collectDashboardContext(doc, {}).activeMine, "LAB");
    assert.ok(calls.every((url) => url.startsWith("/api/mines/")), "Solo lecturas, sin mutaciones de telemetría");
    assert.ok(renders.length > 0);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument;
    dom.window.close();
  }
});


test("minas: el contexto del servidor contrasta el fotograma sin confiar en magnitudes del cliente", async () => {
  const snapshot = await mineServerSnapshot({ activeMine:"CENTURY", mineTwin:{ displayedDate:"2014-02-23", amplification:25, maximumDisplacementMm:999999999, selectedPoint:{id:"24-1113", displacementMm:999999999} } });
  assert.equal(snapshot.activeMine, "CENTURY");
  assert.equal(snapshot.displayedDate, "2014-02-23");
  assert.equal(snapshot.amplification, 25);
  assert.equal(snapshot.requestedDateAvailable, true);
  assert.notEqual(snapshot.maximumDisplacementMm, 999999999);
  assert.equal(snapshot.operationalDecisionAllowed, false);
  const wrong = await mineServerSnapshot({ activeMine:"PASCO", mineTwin:{ displayedDate:"2014-02-23", amplification:99999 } });
  assert.equal(wrong.activeMine, "PASCO");
  assert.equal(wrong.displayedDate, "2000-02");
  assert.equal(wrong.requestedDateAvailable, false);
  assert.equal(wrong.amplification, 1);
  assert.equal(await mineServerSnapshot({activeMine:"LAB"}), null);
});



test("Century: referencia fija en todas las fechas sin fabricar lecturas ausentes", async () => {
  const asset = await loadMineTwin("century"), reference = makeMineFrame(asset,0).referenceSurface;
  const original = JSON.stringify(asset);
  asset.frames.forEach((source,index) => {
    const frame = makeMineFrame(asset,index,100);
    assert.deepEqual(frame.referenceSurface,reference);
    assert.equal(frame.observedPointCount,source.points.length);
    assert.equal(frame.visibleTriangleCount,280);
    assert.equal(frame.observedTriangleCount+frame.referenceOnlyTriangleCount,280);
    assert.equal(frame.referenceContextTriangleCount,16);
    const referenceOnlyKeys=new Set(frame.referenceOnlyFaces.map((face)=>face.join(",")));
    assert.ok(asset.geometry.referenceFaces.filter((face)=>!asset.geometry.faces.some((allowed)=>allowed.join(",")===face.join(","))).every((face)=>referenceOnlyKeys.has(face.join(","))),"Los puentes largos permanecen grises aunque haya lecturas");
    assert.ok(frame.faces.every((face)=>face.every((i)=>frame.vertices[i])));
    const absent = new Set(asset.sensorIds);
    source.points.forEach((row)=>absent.delete(asset.sensorIds[row[0]]));
    assert.ok(frame.points.every((point)=>!absent.has(point.id)));
  });
  const empty = makeMineFrame({...asset,frames:[{date:"2014-02-23",points:[],rain:null}]},0);
  assert.deepEqual(empty.referenceSurface,reference);
  assert.equal(empty.points.length,0);
  assert.equal(empty.faces.length,0);
  assert.equal(empty.observedTriangleCount,0);
  assert.equal(empty.referenceOnlyTriangleCount,280);
  assert.equal(empty.maximumDisplacementMm,null);
  assert.equal(JSON.stringify(asset),original,"No se modifican coordenadas ni series originales");
});

test("visor Century: gris completo, capa medida separada y buffers reutilizados", async () => {
  const asset = await loadMineTwin("century"), index=asset.frames.findIndex((f)=>f.date==="2014-02-23");
  const dom = new JSDOM("<!doctype html><html><body></body></html>");
  const previousDocument=globalThis.document, previousWindow=globalThis.window;
  dom.window.HTMLCanvasElement.prototype.getContext=()=>({roundRect(){},fill(){},stroke(){},fillText(){}});
  globalThis.document=dom.window.document;globalThis.window=dom.window;
  const view=Object.create(SlopeScene3D.prototype);
  Object.assign(view,{scene:new Scene(),root:new Group(),camera:new PerspectiveCamera(),preservedTextures:new Set(),
    earthTexture:null,renderer:{shadowMap:{},setPixelRatio(){},render(){}},controls:{target:new Vector3(),update(){}},resize(){}});
  view.scene.background=new Color("#9fb9b2");view.scene.fog=new Fog("#9fb9b2",380,950);view.scene.add(view.root);view.setupLights();
  const options={realistic:true,coordinates:false,terrain:true,overlay:true,materials:true,materialMotion:true};
  const draw=(frame,opts=options)=>view.renderMine({asset,frame,options:opts,selectedId:"24-1113",showRain:false});
  try {
    draw(makeMineFrame(asset,index));
    const base=view.mineReferenceTerrain, geometry=base.geometry;
    const positions=Array.from(geometry.getAttribute("position").array);
    assert.equal(base.material[0].color.getHexString(),"939ba4");
    assert.equal(base.material[0].map,null,"El gris no recibe textura terrestre");
    assert.equal(geometry.index.count,280*3);
    assert.equal(view.terrain.geometry.index.count,36*3);
    assert.equal(base.visible,true);
    assert.deepEqual(geometry.groups.map(({count,materialIndex})=>({count,materialIndex})),[{count:244*3,materialIndex:0},{count:36*3,materialIndex:1}]);
    assert.equal(base.material[1].transparent,true,"La referencia medida no oculta el movimiento");
    assert.equal(base.material[1].depthWrite,false);
    draw(makeMineFrame(asset,index,100));
    assert.equal(view.mineReferenceTerrain,base,"No reconstruye el fondo al cambiar de fecha o escala");
    assert.deepEqual(Array.from(geometry.getAttribute("position").array),positions);
    const empty=makeMineFrame({...asset,frames:[{date:"2014-02-23",points:[],rain:null}]},0);
    draw(empty);
    assert.equal(view.mineReferenceTerrain,base);
    assert.equal(view.terrain.geometry.index.count,0);
    assert.equal(base.geometry.index.count,280*3);
    assert.deepEqual(base.geometry.groups.map(({count,materialIndex})=>({count,materialIndex})),[{count:280*3,materialIndex:0}]);
    assert.equal(base.visible,true);
    assert.equal(view.mineMarkers.filter((marker)=>marker.visible).length,0);
    draw(makeMineFrame(asset,index,50),{...options,materialMotion:false});
    assert.deepEqual(Array.from(view.mineReferenceTerrain.geometry.getAttribute("position").array),positions);
    assert.ok(view.mineArrows.some((arrow)=>arrow.visible),"El modo vectorial conserva referencia y flechas");
    draw(makeMineFrame(asset,index),{...options,terrain:false});
    assert.equal(view.mineReferenceTerrain.visible,false);
    assert.equal(view.terrain.visible,false);
    view.clearMineView();
    assert.equal(view.mineReferenceTerrain,null,"La referencia no se arrastra a otra mina o al laboratorio");
  } finally {
    view.clearRoot();dom.window.close();
    if(previousDocument===undefined)delete globalThis.document;else globalThis.document=previousDocument;
    if(previousWindow===undefined)delete globalThis.window;else globalThis.window=previousWindow;
  }
});
