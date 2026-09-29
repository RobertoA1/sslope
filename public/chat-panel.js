import { DefaultChatTransport, readUIMessageStream } from "ai";
import { collectDashboardContext } from "./chat-context.js";
import { renderChatMarkdown, createMarkdownUpdater } from "./chat-markdown.js";

export function setupProjectChat(getState) {
  const panel = document.querySelector("#project-chat");
  if (!panel) return;
  const $ = (selector) => panel.querySelector(selector);
  const launcher = document.querySelector("#chat-launcher");
  const input = $("#chat-input"), log = $("#chat-messages"), status = $("#chat-status");
  const consent = $("#chat-consent"), send = $("#chat-send"), stop = $("#chat-stop"), retry = $("#chat-retry");
  const chatId = crypto.randomUUID();
  let history = [], controller = null, failedQuestion = null;
  let configuration = null;
  const transport = new DefaultChatTransport({ api: "/api/chat", fetch: async (...args) => {
    const response = await fetch(...args);
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || "El servicio de chat no está disponible.");
    }
    return response;
  } });

  function updateControls() {
    send.disabled = Boolean(controller) || !consent.checked || configuration?.configured === false;
    stop.hidden = !controller;
    retry.hidden = !failedQuestion || Boolean(controller);
    retry.disabled = !consent.checked || configuration?.configured === false;
    $("#chat-clear").disabled = Boolean(controller);
    input.disabled = Boolean(controller);
    $("#chat-form").setAttribute("aria-busy", String(Boolean(controller)));
  }
  async function loadConfiguration() {
    try {
      const response = await fetch("/api/chat/status", { cache: "no-store" });
      if (!response.ok) throw new Error();
      configuration = await response.json();
      status.textContent = configuration.configured ? `OpenAI · ${configuration.model} · listo` : "Falta OPENAI_API_KEY en .env. Configúrala y reinicia el servidor.";
    } catch { configuration = null; status.textContent = "No se pudo consultar el servicio de chat."; }
    updateControls();
  }
  function open() {
    panel.hidden = false;
    launcher.setAttribute("aria-expanded", "true");
    if (!controller) loadConfiguration();
    input.focus();
  }
  function close() { panel.hidden = true; launcher.setAttribute("aria-expanded", "false"); launcher.focus(); }
  function appendMessage(role, text) {
    const article = document.createElement("article");
    article.className = `chat-message chat-${role}`;
    const label = document.createElement("strong"), content = document.createElement("div");
    label.textContent = role === "user" ? "Tú" : "Asistente M-1";
    content.className = `chat-message-text${role === "assistant" ? " chat-markdown" : ""}`;
    if (role === "assistant") renderChatMarkdown(content, text);
    else content.textContent = text; // Las preguntas conservan su texto literal.
    article.append(label, content);
    log.append(article);
    log.scrollTop = log.scrollHeight;
    const updater = createMarkdownUpdater(content, { onRender: (render) => {
      const nearBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 100;
      render();
      if (nearBottom) log.scrollTop = log.scrollHeight;
    } });
    return { article, content, updater };
  }
  async function submit(question) {
    if (controller || !consent.checked || !question.trim()) return;
    if (question.length > 4000) { status.textContent = "La pregunta admite hasta 4000 caracteres."; return; }
    failedQuestion = null;
    controller = new AbortController();
    updateControls();
    input.value = "";
    appendMessage("user", question);
    const reply = appendMessage("assistant", "Consultando el tablero…");
    let responseText = "";
    try {
      const context = collectDashboardContext(document, getState());
      if (new TextEncoder().encode(JSON.stringify(context)).length > 400000) throw new Error("Este modelo tiene demasiados datos para enviarlos al chat. Reduce la malla o consulta con una geometría más pequeña.");
      const sensor = context.forecast?.sensorId || "sin sensor";
      $("#chat-context-note").textContent = `Instantánea ${new Date(context.capturedAt).toLocaleTimeString()} · ${sensor} · ${context.forecast?.horizonHours || "—"} h · ${context.visualization.amplification}×`;
      status.textContent = "Respondiendo con los datos actuales…";
      const user = { id: crypto.randomUUID(), role: "user", parts: [{ type: "text", text: question }] };
      const recent = history.slice(-18);
      while (JSON.stringify(recent).length + question.length > 30000 && recent.length) recent.splice(0, 2);
      const stream = await transport.sendMessages({ trigger: "submit-message", chatId, messages: [...recent, user], abortSignal: controller.signal, body: { context } });
      for await (const message of readUIMessageStream({ stream, terminateOnError: true })) {
        responseText = message.parts.filter((part) => part.type === "text").map((part) => part.text).join("");
        reply.updater.queue(responseText || "Consultando el tablero…");
      }
      reply.updater.flush();
      if (!responseText.trim()) throw new Error("El modelo no devolvió texto. Puedes reintentar.");
      history = [...recent, user, { id: crypto.randomUUID(), role: "assistant", parts: [{ type: "text", text: responseText }] }];
      status.textContent = "Respuesta completada. La próxima pregunta usará una nueva instantánea.";
    } catch (error) {
      reply.updater.flush();
      const message = controller.signal.aborted ? "Respuesta detenida. Puedes reintentar." : error.message;
      if (!responseText) reply.content.textContent = message;
      else { const note = document.createElement("small"); note.textContent = message; reply.article.append(note); }
      status.textContent = message;
      failedQuestion = question;
    } finally { controller = null; updateControls(); if (!panel.hidden) input.focus(); }
  }
  launcher.addEventListener("click", () => panel.hidden ? open() : close());
  $("#chat-close").addEventListener("click", close);
  panel.addEventListener("keydown", (event) => { if (event.key === "Escape") close(); });
  consent.addEventListener("change", updateControls);
  $("#chat-form").addEventListener("submit", (event) => { event.preventDefault(); submit(input.value.trim()); });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) { event.preventDefault(); if (!send.disabled) submit(input.value.trim()); }
  });
  stop.addEventListener("click", () => controller?.abort());
  retry.addEventListener("click", () => { if (failedQuestion) submit(failedQuestion); });
  $("#chat-clear").addEventListener("click", () => { history = []; failedQuestion = null; log.replaceChildren(); $("#chat-context-note").textContent = "El contexto se actualiza al enviar cada pregunta."; loadConfiguration(); });
  $("#chat-refresh-status").addEventListener("click", () => { if (!controller) loadConfiguration(); });
  panel.querySelectorAll("[data-chat-question]").forEach((button) => button.addEventListener("click", () => { input.value = button.dataset.chatQuestion; input.focus(); }));
  window.addEventListener("pagehide", () => controller?.abort());
  updateControls();
}
