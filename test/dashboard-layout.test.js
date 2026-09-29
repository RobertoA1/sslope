import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { setupDashboardTabs } from "../public/dashboard-layout.js";
import { collectDashboardContext } from "../public/chat-context.js";

async function fixture(t) {
  const dom = new JSDOM(await readFile(new URL("../public/index.html", import.meta.url), "utf8"));
  t.after(() => dom.window.close());
  dom.window.document.body.dataset.mineCase = "LAB";
  setupDashboardTabs(dom.window.document);
  return dom;
}

test("tablero: pestañas muestran un único grupo sin perder ajustes", async (t) => {
  const { window } = await fixture(t);
  const document = window.document;
  const panel = (id) => document.getElementById(`controls-${id}`);
  assert.equal(panel("view").hidden, false);
  assert.equal(panel("simulation").hidden, true);
  assert.equal(panel("data").hidden, true);
  const layer = document.getElementById("scene-layer");
  layer.value = "pore";
  document.getElementById("material-motion-enabled").checked = false;
  document.getElementById("tab-simulation").click();
  assert.equal(panel("view").hidden, true);
  assert.equal(panel("simulation").hidden, false);
  document.getElementById("tab-data").click();
  assert.equal(panel("data").hidden, false);
  document.getElementById("tab-view").click();
  assert.equal(layer.value, "pore");
  assert.equal(document.getElementById("material-motion-enabled").checked, false);
  assert.equal(document.querySelectorAll('[role="tab"][aria-selected="true"]').length, 1);
  assert.equal(document.querySelectorAll('[role="tabpanel"]:not([hidden])').length, 1);
  const ids = [...document.querySelectorAll("[id]")].map((node) => node.id);
  assert.equal(new Set(ids).size, ids.length, "No debe haber controles duplicados");
});

test("tablero: navegación accesible con flechas, Inicio y Fin", async (t) => {
  const { window } = await fixture(t);
  const document = window.document;
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  const press = (tab, key) => tab.dispatchEvent(new window.KeyboardEvent("keydown", { key, cancelable: true }));
  press(tabs[0], "ArrowLeft");
  assert.equal(document.activeElement, tabs[2]);
  assert.equal(tabs[2].tabIndex, 0);
  assert.equal(tabs[0].tabIndex, -1);
  press(tabs[2], "ArrowRight");
  assert.equal(document.activeElement, tabs[0]);
  press(tabs[0], "End");
  assert.equal(document.activeElement, tabs[2]);
  press(tabs[2], "Home");
  assert.equal(document.activeElement, tabs[0]);
});

test("chat: conserva los datos de pestañas ocultas y detecta la pestaña activa", async (t) => {
  const { window } = await fixture(t);
  const document = window.document;
  document.getElementById("controls-simulation").append(" EVIDENCIA_SIMULACION ");
  document.getElementById("controls-data").append(" EVIDENCIA_DATOS ");
  const context = collectDashboardContext(document, {});
  assert.equal(context.activeControlTab, "Vista");
  assert.match(context.dashboardText, /EVIDENCIA_SIMULACION/);
  assert.match(context.dashboardText, /EVIDENCIA_DATOS/);
  assert.ok(context.controls.some((control) => control.id === "scene-layer"));
  assert.equal(document.getElementById("controls-data").hidden, true);
});

test("tablero: puede inicializarse en vistas sin controles", () => {
  const dom = new JSDOM("<main></main>");
  assert.doesNotThrow(() => setupDashboardTabs(dom.window.document));
  dom.window.close();
});
