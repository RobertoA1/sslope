import { Marked } from "marked";
import createDOMPurify from "dompurify";

// Instancia aislada: no se cambia la configuración global de Marked.
const markdown = new Marked({ gfm: true, breaks: true, async: false });
const purifiers = new WeakMap();
const allowedTags = ["p", "br", "strong", "em", "del", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "blockquote", "pre", "code", "hr", "a", "table", "thead", "tbody", "tr", "th", "td"];

export function renderChatMarkdown(element, text) {
  const source = String(text ?? "");
  const window = element.ownerDocument.defaultView;
  if (!window) { element.textContent = source; return; }
  let purifier = purifiers.get(window);
  if (!purifier) { purifier = createDOMPurify(window); purifiers.set(window, purifier); }
  if (!purifier.isSupported) { element.textContent = source; return; }
  try {
    const fragment = purifier.sanitize(markdown.parse(source), {
      ALLOWED_TAGS: allowedTags,
      ALLOWED_ATTR: ["href", "title", "start", "align"],
      ALLOW_DATA_ATTR: false, ALLOW_ARIA_ATTR: false,
      RETURN_DOM_FRAGMENT: true,
    });
    // Sin imágenes, iframes, estilos ni formularios: no hay descargas automáticas
    // o elementos que suplanten los controles del tablero.
    for (const link of fragment.querySelectorAll("a")) {
      const href = link.getAttribute("href");
      if (!href) continue;
      try {
        const url = new URL(href, window.location.href);
        if (!["http:", "https:", "mailto:"].includes(url.protocol)) { link.removeAttribute("href"); continue; }
        // Atributos fijos, no procedentes del HTML del modelo.
        link.setAttribute("target", "_blank");
        link.setAttribute("rel", "noopener noreferrer");
      } catch { link.removeAttribute("href"); }
    }
    element.replaceChildren(fragment);
  } catch {
    // Un fragmento incompleto durante streaming no debe romper la conversación.
    element.textContent = source;
  }
}

// Agrupa tokens para evitar parsear repetidamente y competir con el visor 3D.
export function createMarkdownUpdater(element, { delay = 80, setTimer = setTimeout, clearTimer = clearTimeout, onRender = (render) => render() } = {}) {
  let pending = null, timer = null;
  const flush = () => {
    if (timer !== null) { clearTimer(timer); timer = null; }
    if (pending === null) return;
    const text = pending;
    pending = null;
    onRender(() => renderChatMarkdown(element, text));
  };
  return {
    queue(text) { pending = text; if (timer === null) timer = setTimer(flush, delay); },
    flush,
  };
}
