import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { setupCenturyPanel } from "../public/century-panel.js";
import { collectDashboardContext } from "../public/chat-context.js";
import { serveCenturyStudy } from "../src/century-study.js";

const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
async function until(predicate) {
  for (let i = 0; i < 200; i++) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail("El panel no terminó de actualizarse");
}

test("Century: el panel consulta modelos reales y el chat mantiene casos separados", async () => {
  const dom = new JSDOM(html, { url: "http://localhost/" });
  const previousDocument = globalThis.document, previousFetch = globalThis.fetch;
  let fail = false;
  globalThis.document = dom.window.document;
  globalThis.fetch = async (url) => {
    if (fail) return { ok: false, json: async () => ({ error: "No disponible en esta prueba" }) };
    const res = { writeHead(status) { this.status = status; }, end(content) { this.content = content; } };
    await serveCenturyStudy(res, new URL(url, "http://localhost"));
    return { ok: res.status === 200, json: async () => JSON.parse(res.content) };
  };
  try {
    const doc = dom.window.document, panel = doc.getElementById("century-study");
    setupCenturyPanel();
    await until(() => panel.dataset.chatContext);
    assert.equal(doc.querySelectorAll("#century-sensor option").length, 49);
    assert.equal(doc.querySelectorAll("#century-metrics tr").length, 4);
    assert.match(doc.getElementById("century-selection").textContent, /Menor MAE en prueba: Persistencia/);
    const sensor = doc.getElementById("century-sensor"), method = doc.getElementById("century-method");
    method.value = "RIDGE";
    method.dispatchEvent(new dom.window.Event("change"));
    sensor.value = "22-1918";
    sensor.dispatchEvent(new dom.window.Event("change"));
    assert.equal(panel.dataset.chatContext, undefined, "No enviar el caso anterior durante la carga");
    await until(() => panel.dataset.chatContext);
    assert.match(doc.querySelector("#century-chart svg").getAttribute("aria-label"), /22-1918.*Ridge/);
    assert.match(doc.getElementById("century-replay").textContent, /no pronóstico en vivo/);
    const state = { forecast: { caseId: "TA-01", displacementMm: 0.001 }, readings: [{ sensorId: "EXT-01" }] };
    const context = collectDashboardContext(doc, state);
    assert.equal(context.forecast.caseId, "TA-01");
    assert.equal(context.realDataStudy.source.id, "CENTURY-ZENODO-15003054");
    assert.equal(context.realDataStudy.selectedSensor, "22-1918");
    assert.equal(context.realDataStudy.displayedMethod, "RIDGE");
    assert.ok(context.realDataStudy.displayedSeries.every((r) => r.sensorId === "22-1918"));
    assert.equal(context.realDataStudy.retrospectiveForecast.operationalDecisionAllowed, false);
    fail = true;
    doc.getElementById("century-refresh").click();
    await until(() => doc.getElementById("century-status").textContent.includes("no disponible"));
    method.value = "LSTM";
    method.dispatchEvent(new dom.window.Event("change"));
    assert.equal(panel.dataset.chatContext, undefined);
    assert.equal(doc.querySelectorAll("#century-chart svg").length, 0);
    assert.equal(collectDashboardContext(doc, state).realDataStudy, null);
    assert.match(doc.getElementById("century-status").textContent, /no disponible/);
  } finally {
    if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument;
    globalThis.fetch = previousFetch;
    dom.window.close();
  }
});
