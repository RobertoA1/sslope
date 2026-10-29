import { tableWorkbook } from './table-workbook.js';

const NS = "http://www.w3.org/2000/svg";
const exporters = new WeakMap();
let analysisQueue = Promise.resolve();
const paths = {
  expand: 'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M3 3l6 6m12-6-6 6M3 21l6-6m12 6-6-6',
  download: 'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',
  close: 'm6 6 12 12M6 18 18 6',
  ai: 'm12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z'
};
const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const filename = title => title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100) || 'resultado';
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]);

export function registerCanvasExporter(canvas, exporter) { exporters.set(canvas, exporter); }

export function readTable(table) {
  const text = cell => {
    const copy = cell.cloneNode(true);
    copy.querySelectorAll('button,svg,input,select,[aria-hidden="true"]').forEach(node => node.remove());
    copy.querySelectorAll('.tag').forEach(node => node.replaceWith(copy.ownerDocument.createTextNode(` · ${node.textContent} `)));
    return clean(copy.textContent);
  };
  const lines = Array.from(table.rows, row => Array.from(row.cells, text));
  const headers = lines.shift() || [];
  return { headers, rows: lines.filter(row => row.length).map(row => headers.map((_, index) => row[index] || '')) };
}

export function tableCsv(table) {
  const { headers, rows } = readTable(table);
  const quote = value => {
    // Conserva los negativos numéricos; neutraliza fórmulas de celdas importadas.
    if (/^[\s]*[=+@\t\r\n]/.test(value) || (/^\s*-/.test(value) && !/^\s*-\d+(?:[.,]\d+)?(?:e[+-]?\d+)?\s*$/i.test(value))) value = `'${value}`;
    return `"${value.replaceAll('"', '""')}"`;
  };
  return '\uFEFF' + [headers, ...rows].map(row => row.map(quote).join(',')).join('\r\n');
}

function wrap(text, length) {
  const lines = [];
  for (const token of String(text).split(/\s+/)) {
    for (let start = 0; start < Math.max(1, token.length); start += length) {
      const word = token.slice(start, start + length);
      if (!lines.length || lines.at(-1).length + word.length + 1 > length) lines.push(word);
      else lines[lines.length - 1] += ` ${word}`;
    }
  }
  return lines.length ? lines : [''];
}

export function tableSvg(table, title = 'Tabla', context = '') {
  const { headers, rows } = readTable(table);
  const columns = headers.map((header, index) => Math.min(420, Math.max(105, ...[header, ...rows.map(row => row[index])].map(value => Math.max(...String(value).split(/\s+/).map(word => word.length), 12) * 8 + 24))));
  const width = Math.max(640, columns.reduce((sum, value) => sum + value, 0));
  const note = wrap(context, Math.floor((width - 32) / 7));
  let y = 64 + note.length * 18;
  const parts = [`<text x="16" y="28" font-size="19" font-weight="700">${escape(title)}</text>`, ...note.map((line, i) => `<text x="16" y="${52 + i * 18}" font-size="12" fill="#475569">${escape(line)}</text>`)];
  [headers, ...rows].forEach((row, index) => {
    const lines = row.map((cell, col) => wrap(cell, Math.max(8, Math.floor((columns[col] - 24) / 8))));
    const height = Math.max(44, ...lines.map(value => value.length * 20 + 20));
    parts.push(`<rect x="0" y="${y}" width="${width}" height="${height}" fill="${index === 0 ? '#e2e8f0' : index % 2 ? '#ffffff' : '#f8fafc'}"/>`);
    let x = 0;
    lines.forEach((cell, col) => {
      const source = table.rows[index]?.cells[col];
      if (source?.style.backgroundColor) parts.push(`<rect x="${x}" y="${y}" width="${columns[col]}" height="${height}" fill="${escape(source.style.backgroundColor)}"/>`);
      cell.forEach((line, number) => parts.push(`<text x="${x + 12}" y="${y + 27 + number * 20}" font-size="14"${source?.style.color ? ` fill="${escape(source.style.color)}"` : ''}${index === 0 ? ' font-weight="700"' : ''}>${escape(line)}</text>`));
      x += columns[col];
    });
    y += height;
    parts.push(`<path d="M0 ${y}H${width}" stroke="#cbd5e1"/>`);
  });
  return `<svg xmlns="${NS}" viewBox="0 0 ${width} ${y + 16}" width="${width}" height="${y + 16}" font-family="Arial, sans-serif" fill="#172f47"><title>${escape(title)}</title><rect width="100%" height="100%" fill="white"/>${parts.join('')}</svg>`;
}

const styleProperties = ['color', 'fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-dasharray', 'font-family', 'font-size', 'font-weight', 'font-style', 'text-anchor', 'dominant-baseline', 'opacity', 'visibility', 'display'];
function styledClone(element) {
  const copy = element.cloneNode(true), view = element.ownerDocument.defaultView;
  const originals = [element, ...element.querySelectorAll('*')];
  [copy, ...copy.querySelectorAll('*')].forEach((node, index) => {
    const style = view.getComputedStyle(originals[index]);
    for (const name of styleProperties) if (style.getPropertyValue(name)) node.style.setProperty(name, style.getPropertyValue(name));
    for (const attr of [...node.attributes]) if (/^on/i.test(attr.name)) node.removeAttribute(attr.name);
  });
  copy.querySelectorAll('script,foreignObject').forEach(node => node.remove());
  return copy;
}

function background(element) {
  const view = element.ownerDocument.defaultView;
  for (let current = element; current; current = current.parentElement) {
    const value = view.getComputedStyle(current).backgroundColor;
    if (value && value !== 'transparent' && value !== 'rgba(0, 0, 0, 0)') return value;
  }
  return '#ffffff';
}

export function figureSvg(content, title = 'Figura', context = '', focus = false) {
  // Las pequeñas muestras de la leyenda también usan recharts-surface.
  const svg = content.matches('svg') ? content : content.querySelector('.recharts-wrapper > svg.recharts-surface') || content.querySelector('svg[role="img"],svg[role="application"]') || content.querySelector('svg');
  if (!svg) throw new Error('La figura aún no está lista para descargar.');
  const copy = styledClone(svg), document = svg.ownerDocument;
  const box = svg.getAttribute('viewBox')?.split(/[ ,]+/).map(Number);
  const width = box?.[2] || Number(svg.getAttribute('width')) || svg.getBoundingClientRect().width || 900;
  const height = box?.[3] || Number(svg.getAttribute('height')) || svg.getBoundingClientRect().height || 300;
  copy.setAttribute('viewBox', box?.length === 4 ? box.join(' ') : `0 0 ${width} ${height}`);
  const titleLines = focus ? [] : wrap(title, Math.max(12, Math.floor((width - 32) / 9)));
  const top = focus ? 0 : 26 + titleLines.length * 23;
  copy.setAttribute('x', '0'); copy.setAttribute('y', String(top)); copy.setAttribute('width', String(width)); copy.setAttribute('height', String(height));
  const legend = Array.from(content.querySelectorAll('.recharts-legend-item-text'), node => ({ text: clean(node.textContent), color: document.defaultView.getComputedStyle(node).color }));
  const notes = focus ? [] : wrap(context, Math.max(30, Math.floor((width - 32) / 7)));
  const outer = document.createElementNS(NS, 'svg');
  const fullHeight = height + top + 30 + notes.length * 20 + legend.length * 20;
  copy.removeAttribute('xmlns');
  outer.setAttribute('viewBox', `0 0 ${width} ${fullHeight}`);
  outer.setAttribute('width', String(width)); outer.setAttribute('height', String(fullHeight));
  outer.innerHTML = `<rect width="100%" height="100%" fill="${escape(background(content))}"/>` + titleLines.map((line, index) => `<text x="16" y="${25 + index * 23}" fill="${escape(document.defaultView.getComputedStyle(content).color)}" font-family="Arial, sans-serif" font-size="17">${escape(line)}</text>`).join('');
  outer.append(copy);
  [...legend.map(item => item.text), ...notes].forEach((text, index) => {
    const label = document.createElementNS(NS, 'text');
    label.setAttribute('x', index < legend.length ? '42' : '16'); label.setAttribute('y', String(height + top + 22 + index * 20));
    label.setAttribute('fill', document.defaultView.getComputedStyle(content).color);
    label.setAttribute('font-family', 'Arial, sans-serif'); label.setAttribute('font-size', '12');
    label.textContent = text; outer.append(label);
    if (index < legend.length) {
      const sample = document.createElementNS(NS, 'path');
      sample.setAttribute('d', `M16 ${height + top + 18 + index * 20}h18`);
      sample.setAttribute('stroke', legend[index].color); sample.setAttribute('stroke-width', '3'); outer.append(sample);
    }
  });
  return new document.defaultView.XMLSerializer().serializeToString(outer);
}

export async function pngAt600Dpi(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer()), view = new DataView(bytes.buffer);
  if (![137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)) throw new Error('No se pudo preparar un PNG válido.');
  const chunk = new Uint8Array(21), metadata = new DataView(chunk.buffer);
  metadata.setUint32(0, 9); chunk.set([112, 72, 89, 115], 4);
  metadata.setUint32(8, Math.round(600 / 0.0254)); metadata.setUint32(12, Math.round(600 / 0.0254)); chunk[16] = 1;
  let crc = 0xffffffff;
  for (const byte of chunk.subarray(4, 17)) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  metadata.setUint32(17, (crc ^ 0xffffffff) >>> 0);
  const parts = [bytes.subarray(0, 8)]; let inserted = false;
  for (let offset = 8; offset < bytes.length;) {
    if (offset + 12 > bytes.length) throw new Error('El PNG está incompleto.');
    const length = view.getUint32(offset), end = offset + length + 12;
    if (end > bytes.length) throw new Error('El PNG está incompleto.');
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    if (type !== 'pHYs') parts.push(bytes.subarray(offset, end));
    if (type === 'IHDR') { parts.push(chunk); inserted = true; }
    offset = end;
  }
  if (!inserted) throw new Error('El PNG no contiene una cabecera válida.');
  return new Blob(parts, { type: 'image/png' });
}

async function canvasBlob(canvas) {
  const exporter = exporters.get(canvas);
  if (exporter) {
    const result = await exporter();
    if (typeof result !== 'string') return pngAt600Dpi(result);
    const bytes = Uint8Array.from(atob(result.split(',')[1]), char => char.charCodeAt(0));
    return pngAt600Dpi(new Blob([bytes], { type: 'image/png' }));
  }
  const blob = await new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('No se pudo exportar la figura.')), 'image/png'));
  return pngAt600Dpi(blob);
}

async function svgPng(document, source) {
  const view = document.defaultView, image = new view.Image();
  const url = URL.createObjectURL(new Blob([source], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error('No se pudo preparar la figura en PNG.')); image.src = url; });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(Math.max(4096, image.naturalWidth * 600 / 96));
    canvas.height = Math.ceil(canvas.width * image.naturalHeight / image.naturalWidth);
    if (canvas.width * canvas.height > 64000000 || canvas.height > 32767) throw new Error('El resultado es demasiado grande para PNG. Usa SVG o CSV para conservarlo completo.');
    const context = canvas.getContext('2d'); context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await canvasBlob(canvas);
  } finally { URL.revokeObjectURL(url); }
}

function download(document, blob, name) {
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = name; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function iconButton(document, icon, label, action) {
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'artifact-icon'; button.title = label; button.setAttribute('aria-label', label);
  button.innerHTML = `<svg xmlns="${NS}" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[icon]}"/></svg>`;
  button.addEventListener('click', action); return button;
}

function contextFor(owner) {
  const panel = owner.closest('.card,.mine-summary,.history-details,.chat-message') || owner;
  const heading = panel.querySelector('h3,h2')?.textContent || 'Resultado';
  const note = owner.getAttribute('data-artifact-context') || panel.querySelector('.card-heading p,.section-title + p')?.textContent || '';
  const filters = Array.from(owner.ownerDocument.querySelectorAll('.dataset-filters input,.dataset-filters select,.result-filters select,#mine-case,#research-horizon,#baseline-protocol,#baseline-horizon'), field => `${field.getAttribute('aria-label') || field.id || field.name}: ${field.value}`).join('; ');
  return { title: owner.getAttribute('data-artifact-title') || clean(heading), context: clean(`${note} ${owner.ownerDocument.querySelector('.section-intro')?.textContent || ''} ${filters}`) };
}

export function mountArtifact(owner, { content = owner.querySelector('[data-artifact-content]'), toolsHost = owner.querySelector('[data-artifact-tools]'), explanationHost = owner.querySelector('[data-artifact-explanation]'), endpoint = '/api/tables/explain' } = {}) {
  const document = owner.ownerDocument, view = document.defaultView;
  if (!content || !toolsHost) return () => {};
  let controller, timer, lastKey = '', visible = !view.IntersectionObserver, stopped = false, dialog;
  const tools = document.createElement('div'); tools.className = 'artifact-tools'; tools.setAttribute('data-artifact-ignore', '');
  const status = document.createElement('span'); status.className = 'artifact-status'; status.setAttribute('role', 'status');
  const table = () => content.matches('table') ? content : content.querySelector('table');
  const canvas = () => content.matches('canvas') ? content : content.querySelector('canvas');
  const originalImage = () => content.matches('img[data-artifact-image]') ? content : content.querySelector('img[data-artifact-image]');
  const imageSources = originalImage() ? {
    svg: originalImage().getAttribute('data-artifact-svg'), png: originalImage().getAttribute('data-artifact-png')
  } : null;
  const formats = imageSources ? Object.keys(imageSources).filter(format => imageSources[format]) : canvas() ? ['png'] : ['svg', 'png'];
  let selectedFormat = formats[0];
  const formatSelects = new Set();
  function formatSelector() {
    if (formats.length < 2) return null;
    const select = document.createElement('select'); select.className = 'artifact-format'; select.setAttribute('aria-label', 'Formato de descarga');
    for (const format of formats) {
      const option = document.createElement('option'); option.value = format; option.textContent = format === 'svg' ? 'SVG · vectorial' : 'PNG · 600 dpi'; select.append(option);
    }
    select.value = selectedFormat; formatSelects.add(select);
    select.addEventListener('change', () => { selectedFormat = select.value; for (const other of formatSelects) other.value = selectedFormat; status.textContent = ''; });
    return select;
  }
  const error = value => { status.textContent = value?.message || 'No se pudo completar la acción.'; };
  const snapshot = () => {
    const result = { ...contextFor(owner), ...readTable(table()) };
    const notes = Array.from(table().querySelectorAll('td[title],th[title]'), cell => `${clean(cell.textContent)}: ${cell.title}`).join('; ');
    if (notes) result.context += ` Notas de las celdas: ${notes}`;
    return result;
  };
  async function exportFile(dataFormat = '') {
    const { title, context } = contextFor(owner);
    if (dataFormat === 'csv') return download(document, new Blob([tableCsv(table())], { type: 'text/csv;charset=utf-8' }), `${filename(title)}.csv`);
    if (dataFormat === 'xlsx') return download(document, tableWorkbook(readTable(table()), title, context), `${filename(title)}.xlsx`);
    if (originalImage()) {
      const source = imageSources[selectedFormat] ? new URL(imageSources[selectedFormat], document.baseURI).href : originalImage().currentSrc || originalImage().src;
      const response = await view.fetch(source);
      if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) throw new Error('No se pudo descargar la imagen original.');
      const extension = new URL(source).pathname.split('.').at(-1);
      return download(document, await response.blob(), `${filename(title)}.${extension}`);
    }
    const bitmap = canvas();
    const source = bitmap ? null : table() ? tableSvg(table(), title, context) : figureSvg(content, title, context);
    const blob = bitmap ? await canvasBlob(bitmap) : selectedFormat === 'png' ? await svgPng(document, source) : new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
    download(document, blob, `${filename(title)}.${selectedFormat || (bitmap ? 'png' : 'svg')}`);
  }
  function tableDownloads(host) {
    if (!table()) return;
    for (const [format, name, label] of [['xlsx', 'Excel', 'Excel'], ['csv', 'CSV', 'CSV']]) {
      const button = iconButton(document, 'download', `Descargar tabla completa en ${name}`, () => exportFile(format).catch(error));
      const text = document.createElement('span'); text.textContent = label; text.setAttribute('aria-hidden', 'true'); button.append(text); host.append(button);
    }
  }
  async function focus() {
    try {
      const { title, context } = contextFor(owner);
      dialog?.close(); dialog = document.createElement('dialog'); dialog.className = 'artifact-dialog'; dialog.setAttribute('aria-label', title); dialog.setAttribute('data-artifact-ignore', '');
      dialog.dataset.kind = table() ? 'table' : 'figure';
      const header = document.createElement('header'), heading = document.createElement('h2'), body = document.createElement('div');
      heading.textContent = title; header.append(heading);
      const focusedFormat = formatSelector();
      if (focusedFormat) header.append(focusedFormat);
      tableDownloads(header);
      header.append(iconButton(document, 'download', 'Descargar sin pérdida de calidad', () => exportFile().catch(error)), iconButton(document, 'close', 'Cerrar ampliación', () => dialog.close()));
      body.className = 'artifact-focus-content';
      if (originalImage()) {
        const image = document.createElement('img');
        image.src = originalImage().currentSrc || originalImage().src; image.alt = originalImage().alt || title; body.append(image);
      } else if (canvas()) {
        const image = document.createElement('img'), url = URL.createObjectURL(await canvasBlob(canvas()));
        image.src = url; image.alt = title; body.append(image);
        dialog.addEventListener('close', () => URL.revokeObjectURL(url), { once: true });
      } else {
        const image = document.createElement('img');
        const source = table() ? tableSvg(table(), title, context) : figureSvg(content, title, context, true);
        const url = URL.createObjectURL(new Blob([source], { type: 'image/svg+xml' }));
        image.src = url; image.alt = title; body.append(image);
        dialog.addEventListener('close', () => URL.revokeObjectURL(url), { once: true });
      }
      dialog.append(header, body); document.body.append(dialog);
      const opened = dialog;
      opened.addEventListener('close', () => { if (focusedFormat) formatSelects.delete(focusedFormat); opened.remove(); expand.focus(); }, { once: true });
      opened.addEventListener('click', event => { if (event.target === opened) opened.close(); });
      opened.showModal();
    } catch (value) { error(value); }
  }
  const expand = iconButton(document, 'expand', 'Ampliar figura o tabla', focus);
  tools.append(expand);
  const toolbarFormat = formatSelector(); if (toolbarFormat) tools.append(toolbarFormat);
  tools.append(iconButton(document, 'download', originalImage() ? 'Descargar imagen original' : 'Descargar SVG vectorial o PNG original', () => exportFile().catch(error)));
  tableDownloads(tools);
  tools.append(status); toolsHost.append(tools);
  let explanation, answer, model, retry;
  if (table() && explanationHost) {
    explanation = document.createElement('section'); explanation.className = 'artifact-analysis'; explanation.setAttribute('data-artifact-ignore', '');
    const heading = document.createElement('div'); model = document.createElement('strong'); model.textContent = 'Explicación e interpretación · IA';
    retry = iconButton(document, 'ai', 'Volver a generar la explicación de la tabla', () => { lastKey = ''; schedule(); });
    heading.append(model, retry); answer = document.createElement('p'); answer.setAttribute('aria-live', 'polite');
    answer.textContent = 'La explicación se genera automáticamente al mostrar la tabla.';
    const info = document.createElement('small'); info.textContent = 'Se envían esta tabla y su contexto a OpenAI. Usa el mismo modelo del chat.';
    explanation.append(heading, answer, info); explanationHost.append(explanation);
  }
  async function interpret() {
    if (!answer || !visible || stopped || !table()) return;
    if (table().closest('.chat-message') && document.getElementById('chat-form')?.getAttribute('aria-busy') === 'true') return;
    const current = snapshot();
    if (!current.rows.length) return;
    const key = JSON.stringify(current);
    if (key === lastKey) return;
    lastKey = key; controller?.abort(); controller = new AbortController();
    const request = controller;
    answer.textContent = 'Explicando las columnas e interpretando los resultados…'; retry.disabled = true;
    try {
      const run = () => {
        request.signal.throwIfAborted();
        return view.fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: key, signal: request.signal });
      };
      const pending = analysisQueue.then(run, run);
      analysisQueue = pending.then(() => {}, () => {});
      const response = await pending;
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || result.detail || 'No se pudo generar la explicación.');
      if (request.signal.aborted || stopped) return;
      if (JSON.stringify(snapshot()) !== key) { lastKey = ''; schedule(); return; }
      answer.textContent = result.text; model.textContent = `Explicación e interpretación · ${result.model}`;
    } catch (value) { if (!request.signal.aborted && !stopped) answer.textContent = value.message; }
    finally { if (!request.signal.aborted && !stopped) retry.disabled = false; }
  }
  function schedule() {
    if (!answer) return;
    // Invalida inmediatamente una respuesta que ya no corresponde a los datos.
    if (lastKey && JSON.stringify(snapshot()) !== lastKey) {
      lastKey = ''; controller?.abort(); answer.textContent = 'Los datos cambiaron. Preparando una nueva interpretación…'; retry.disabled = false;
    }
    view.clearTimeout(timer); timer = view.setTimeout(interpret, 650);
  }
  const observer = new view.MutationObserver(schedule);
  observer.observe(owner.closest('.card,.history-details,.mine-summary') || owner, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['data-artifact-context', 'data-artifact-title'] });
  document.addEventListener('change', schedule);
  document.addEventListener('artifacts:changed', schedule);
  const visibility = view.IntersectionObserver ? new view.IntersectionObserver(entries => { visible = entries.some(entry => entry.isIntersecting); if (visible) schedule(); }) : null;
  visibility?.observe(content); schedule();
  return () => { stopped = true; controller?.abort(); view.clearTimeout(timer); observer.disconnect(); document.removeEventListener('change', schedule); document.removeEventListener('artifacts:changed', schedule); visibility?.disconnect(); dialog?.close(); tools.remove(); explanation?.remove(); };
}

export function setupArtifactTools(document) {
  const records = new Map(); let queued = false, scanTimer, stopped = false;
  const scan = () => {
    if (stopped) return;
    queued = false;
    for (const [target, record] of records) if (!target.isConnected) { record.dispose(); record.tools.remove(); record.explanation.remove(); records.delete(target); }
    for (const target of document.querySelectorAll('table,canvas,svg,img[data-artifact-image]')) {
      if (records.has(target) || target.closest('[data-artifact-ignore],button,.chat-launcher') || (target.matches('svg') && target.parentElement.closest('svg'))) continue;
      const anchor = target.closest('.scene-viewport,.research-table-wrap,#century-chart,#mine-timeseries') || target;
      const tools = document.createElement('div'), explanation = document.createElement('div');
      anchor.before(tools); anchor.after(explanation);
      const dispose = mountArtifact(anchor, { content: target, toolsHost: tools, explanationHost: explanation });
      records.set(target, { dispose, tools, explanation });
    }
  };
  const observer = new document.defaultView.MutationObserver(() => { if (!queued) { queued = true; scanTimer = document.defaultView.setTimeout(scan, 100); } });
  observer.observe(document.body, { childList: true, subtree: true }); scan();
  return () => { stopped = true; document.defaultView.clearTimeout(scanTimer); observer.disconnect(); for (const record of records.values()) { record.dispose(); record.tools.remove(); record.explanation.remove(); } };
}
