import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { renderChatMarkdown, createMarkdownUpdater } from "../public/chat-markdown.js";

function fixture(t) {
  const dom = new JSDOM("<!doctype html><div id='message'></div>", { url: "http://127.0.0.1:3000/" });
  t.after(() => dom.window.close());
  return dom.window.document.getElementById("message");
}

test("Markdown muestra títulos, énfasis, listas, citas y separadores", (t) => {
  const element = fixture(t);
  renderChatMarkdown(element, "## Talud\n\n**FEM** y *LSTM*, ~~obsoleto~~.\n\n- Lluvia\n- Presión\n\n1. Medir\n2. Comparar\n\n> No validado\n\n---");
  assert.equal(element.querySelector("h2").textContent, "Talud");
  assert.equal(element.querySelector("strong").textContent, "FEM");
  assert.equal(element.querySelector("em").textContent, "LSTM");
  assert.equal(element.querySelector("del").textContent, "obsoleto");
  assert.equal(element.querySelectorAll("ul li").length, 2);
  assert.equal(element.querySelectorAll("ol li").length, 2);
  assert.match(element.querySelector("blockquote").textContent, /No validado/);
  assert.ok(element.querySelector("hr"));
});

test("Markdown renderiza tablas GFM, saltos y bloques de código sin ejecutar HTML", (t) => {
  const element = fixture(t);
  renderChatMarkdown(element, "| Modelo | MAE |\n| --- | ---: |\n| LSTM | 0.03 |\n\nUsa `npm start`.\nOtra línea.\n\n```html\n<script>alert('no')</script>\n```");
  assert.equal(element.querySelectorAll("th").length, 2);
  assert.equal(element.querySelector("td").textContent, "LSTM");
  assert.equal(element.querySelector("pre code").textContent.trim(), "<script>alert('no')</script>");
  assert.ok(element.querySelector("br"));
  assert.equal(element.querySelector("script"), null);
});

test("enlaces seguros mantienen texto, protección de ventana y bloquean esquemas peligrosos", (t) => {
  const element = fixture(t);
  renderChatMarkdown(element, '[Docs](https://marked.js.org/)\n\n[Correo](mailto:test@example.org)\n\n[Malo](javascript:alert%281%29)\n\n[Archivo](file:///etc/passwd)\n\n[Datos](data:text/html;base64,PHNjcmlwdD4=)');
  const safe = element.querySelector('a[href="https://marked.js.org/"]');
  assert.equal(safe.target, "_blank");
  assert.equal(safe.rel, "noopener noreferrer");
  assert.ok(element.querySelector('a[href^="mailto:"]'));
  assert.equal(element.querySelectorAll('a[href^="javascript:"],a[href^="file:"],a[href^="data:"]').length, 0);
  assert.match(element.textContent, /Malo/);
});

test("elimina scripts, handlers, CSS, iframes, formularios y recursos remotos", (t) => {
  const element = fixture(t);
  renderChatMarkdown(element, '<script>alert(1)</script><p id="chat-send" style="position:fixed" onclick="alert(1)">Texto</p><img src="https://tracker.invalid/pixel" onerror="alert(1)"><iframe src="https://tracker.invalid/"></iframe><form><input name="secret"><button>Enviar</button></form><svg onload="alert(1)"></svg>\n\n![Seguimiento](https://tracker.invalid/image.png)');
  assert.equal(element.querySelectorAll("script,img,iframe,form,input,button,svg").length, 0);
  assert.equal(element.querySelectorAll("[id],[style],[onclick],[onerror],[onload],[src]").length, 0);
  assert.match(element.textContent, /Texto/);
});

test("fragments parciales de streaming se vuelven a analizar sin acumular HTML viejo", (t) => {
  const element = fixture(t);
  for (const fragment of ["**Ll", "**Lluvia**", "**Lluvia**\n\n```js\nconst rain = 7", "**Lluvia**\n\n```js\nconst rain = 7;\n```", "Respuesta nueva"]) {
    assert.doesNotThrow(() => renderChatMarkdown(element, fragment));
  }
  assert.equal(element.querySelector("pre"), null);
  assert.equal(element.textContent.trim(), "Respuesta nueva");
});

test("streaming agrupa tokens y flush garantiza el último fragmento sin temporizadores pendientes", (t) => {
  const element = fixture(t);
  let callback, scheduled = 0, cleared = 0;
  const updater = createMarkdownUpdater(element, { setTimer: (fn) => { callback = fn; scheduled++; return 1; }, clearTimer: () => cleared++, onRender: (render) => render() });
  updater.queue("**L"); updater.queue("**Lluvia**");
  assert.equal(scheduled, 1);
  assert.equal(element.textContent, "");
  callback();
  assert.equal(element.querySelector("strong").textContent, "Lluvia");
  updater.queue("## Final"); updater.flush(); updater.flush();
  assert.equal(element.querySelector("h2").textContent, "Final");
  assert.equal(scheduled, 2);
  assert.equal(cleared, 2);
});
