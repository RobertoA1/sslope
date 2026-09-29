import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { createUIMessageStreamResponse } from "ai";
import { setupProjectChat } from "../public/chat-panel.js";

test("el panel integra Markdown en respuestas del transporte y conserva preguntas literales", { timeout: 10000 }, async (t) => {
  const dom = new JSDOM(await readFile(new URL("../public/index.html", import.meta.url), "utf8"), { url: "http://127.0.0.1:3000/" });
  const previous = { window: globalThis.window, document: globalThis.document, fetch: globalThis.fetch };
  Object.assign(globalThis, { window: dom.window, document: dom.window.document });
  t.after(() => { Object.assign(globalThis, previous); dom.window.close(); });
  const answer = "## Resultado\n\n**Lluvia** y `FEM`.\n\n- Presión de poros\n- Desplazamiento\n\n| Modelo | MAE |\n| --- | --- |\n| LSTM | 0.03 |\n\n```js\nconst rain = 7;\n```\n\n<script>alert(1)</script>";
  let submitted;
  globalThis.fetch = async (url, options) => {
    if (url === "/api/chat/status") return Response.json({ configured: true, model: "test-model" });
    assert.equal(url, "/api/chat");
    submitted = JSON.parse(options.body);
    const stream = new ReadableStream({ start(controller) {
      controller.enqueue({ type: "start", messageId: "reply" });
      controller.enqueue({ type: "text-start", id: "text" });
      controller.enqueue({ type: "text-delta", id: "text", delta: answer.slice(0, 20) });
      controller.enqueue({ type: "text-delta", id: "text", delta: answer.slice(20) });
      controller.enqueue({ type: "text-end", id: "text" });
      controller.enqueue({ type: "finish" });
      controller.close();
    } });
    return createUIMessageStreamResponse({ stream });
  };
  const document = dom.window.document;
  setupProjectChat(() => ({ forecast: { sensorId: "EXT-01", horizonHours: 24 }, readings: [], amplification: 1 }));
  document.getElementById("chat-launcher").click();
  // Espera el cambio de estado, no una llamada al proveedor real.
  const waitForStatus = (text) => new Promise((resolve) => {
    const status = document.getElementById("chat-status");
    if (status.textContent.includes(text)) return resolve();
    const observer = new dom.window.MutationObserver(() => { if (status.textContent.includes(text)) { observer.disconnect(); resolve(); } });
    observer.observe(status, { childList: true, subtree: true, characterData: true });
  });
  await waitForStatus("listo");
  const consent = document.getElementById("chat-consent");
  consent.checked = true;
  consent.dispatchEvent(new dom.window.Event("change"));
  const question = "Explica **mi resultado**";
  document.getElementById("chat-input").value = question;
  const completed = waitForStatus("Respuesta completada");
  document.getElementById("chat-form").dispatchEvent(new dom.window.Event("submit", { cancelable: true }));
  await completed;
  const reply = document.querySelector(".chat-assistant .chat-message-text");
  assert.ok(reply.classList.contains("chat-markdown"));
  assert.equal(reply.querySelector("h2").textContent, "Resultado");
  assert.equal(reply.querySelector("strong").textContent, "Lluvia");
  assert.equal(reply.querySelectorAll("ul li").length, 2);
  assert.ok(reply.querySelector("table"));
  assert.ok(reply.querySelector("pre code"));
  assert.equal(reply.querySelector("script"), null);
  assert.equal(document.querySelector(".chat-user .chat-message-text").textContent, question);
  assert.equal(submitted.messages[0].parts[0].text, question);
  assert.equal(submitted.context.forecast.sensorId, "EXT-01");
  assert.equal(document.getElementById("chat-stop").hidden, true);
  assert.equal(document.getElementById("chat-send").disabled, false);
});
