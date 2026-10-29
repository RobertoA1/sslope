import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { readTable, tableCsv, tableSvg, figureSvg, mountArtifact, setupArtifactTools, pngAt600Dpi } from '../public/artifact-tools.js';
import { articleFigures, renderArticleFigures } from '../public/article-figures.js';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { crc32 } from 'node:zlib';

const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
function fixture() {
  return new JSDOM(`<section class="card"><h3>Comparación de modelos</h3><div id="artifact" data-artifact-context="Prueba retrospectiva, mm"><div data-artifact-tools></div><div data-artifact-content><div style="max-height:30px;overflow:auto"><table><thead><tr><th>Modelo</th><th>MAE mm</th></tr></thead><tbody><tr><td>Ridge</td><td>2.30</td></tr><tr><td>Persistencia</td><td>4.50</td></tr></tbody></table></div></div><div data-artifact-explanation></div></div></section>`, { url: 'https://example.test/research' });
}

test('CSV y SVG conservan todas las filas, acentos, cifras y caracteres sin rasterizar', () => {
  const dom = fixture(), document = dom.window.document, table = document.querySelector('table');
  for (let index = 0; index < 150; index++) {
    const row = table.tBodies[0].insertRow(); row.insertCell().textContent = `Prisma ñ ${index}`; row.insertCell().textContent = '-0.000123456789';
  }
  const row = table.tBodies[0].insertRow(); row.insertCell().textContent = '<script>alert(1)</script>'; row.insertCell().textContent = '=SUM(1,2)';
  const csv = tableCsv(table);
  assert.ok(csv.startsWith('\uFEFF')); assert.match(csv, /Prisma ñ 149/); assert.match(csv, /"-0\.000123456789"/); assert.match(csv, /"'=SUM\(1,2\)"/);
  const svg = tableSvg(table, 'Resultados & precisión', 'Todas las filas, sin recortar la ventana de desplazamiento.');
  const parsed = new dom.window.DOMParser().parseFromString(svg, 'image/svg+xml');
  assert.equal(parsed.querySelector('parsererror'), null); assert.equal(parsed.querySelector('image'), null);
  assert.match(parsed.documentElement.textContent, /Prisma ñ 149/); assert.match(parsed.documentElement.textContent, /-0.000123456789/);
  assert.equal(parsed.querySelector('script'), null); assert.equal(readTable(table).rows.length, 153);
  dom.window.close();
});

test('la exportación SVG incluye estilos, puntos y leyenda externa de Recharts', () => {
  const dom = new JSDOM('<div id="plot" style="color:rgb(20, 30, 40);background:white"><div class="recharts-legend-item"><svg width="14" height="14" class="recharts-surface"></svg></div><div class="recharts-wrapper"><svg class="recharts-surface" viewBox="0 0 800 300"><circle cx="23" cy="42" r="2" style="fill:rgb(10, 100, 80)"/></svg></div><div class="recharts-legend-item-text">Observado (mm)</div></div>');
  const xml = figureSvg(dom.window.document.getElementById('plot'), 'Lluvia y movimiento', 'Prisma 22-1917');
  const svg = new dom.window.DOMParser().parseFromString(xml, 'image/svg+xml');
  assert.equal(svg.querySelector('parsererror'), null); assert.equal(svg.querySelector('circle').getAttribute('cx'), '23');
  assert.equal(svg.documentElement.getAttribute('width'), '800');
  assert.match(svg.documentElement.textContent, /Observado \(mm\)/); assert.match(svg.querySelector('circle').getAttribute('style'), /rgb\(10, 100, 80\)/);
  dom.window.close();
});

test('la tabla se interpreta automáticamente, no se repite sin cambios y se actualiza con nuevos datos', async () => {
  const dom = fixture(), { document } = dom.window, calls = [];
  dom.window.fetch = async (_url, options) => {
    calls.push(JSON.parse(options.body));
    return { ok: true, json: async () => ({ text: `<script>no se ejecuta</script> Ridge: ${calls.at(-1).rows[0][1]}`, model: 'mismo-modelo-del-chat' }) };
  };
  const dispose = mountArtifact(document.getElementById('artifact'));
  try {
    await wait(800);
    assert.equal(calls.length, 1); assert.equal(calls[0].rows[0][1], '2.30');
    assert.match(document.querySelector('.artifact-analysis').textContent, /mismo-modelo-del-chat/);
    assert.equal(document.querySelector('.artifact-analysis script'), null);
    document.dispatchEvent(new dom.window.Event('change'));
    await wait(750); assert.equal(calls.length, 1);
    document.querySelector('tbody td:last-child').textContent = '1.1234567';
    await wait(800); assert.equal(calls.length, 2); assert.match(document.querySelector('.artifact-analysis p').textContent, /1.1234567/);
    assert.equal(document.querySelectorAll('[data-artifact-tools] button').length, 4);
  } finally { dispose(); dom.window.close(); }
});

test('las respuestas antiguas se descartan y desmontar aborta las consultas', async () => {
  const dom = fixture(), document = dom.window.document, requests = [];
  dom.window.fetch = (_url, options) => new Promise(resolve => { requests.push({ options, resolve }); });
  const dispose = mountArtifact(document.getElementById('artifact'));
  await wait(750);
  document.querySelector('tbody td:last-child').textContent = '8.5';
  await wait(30);
  assert.equal(requests[0].options.signal.aborted, true);
  requests[0].resolve({ ok: true, json: async () => ({ text: 'RESPUESTA ANTIGUA', model: 'chat' }) });
  await wait(750);
  assert.ok(!document.querySelector('.artifact-analysis p').textContent.includes('RESPUESTA ANTIGUA'));
  assert.equal(requests.length, 2);
  dispose(); assert.equal(requests[1].options.signal.aborted, true);
  requests[1].resolve({ ok: true, json: async () => ({ text: 'cancelada', model: 'chat' }) });
  dom.window.close();
});

test('el tablero añade controles a figuras dinámicas sin confundir los íconos con gráficos', async () => {
  const dom = new JSDOM('<section class="card"><h2>Figura</h2><div id="chart"></div></section>');
  const dispose = setupArtifactTools(dom.window.document);
  try {
    dom.window.document.getElementById('chart').innerHTML = '<svg role="img" viewBox="0 0 900 300"><path d="M0 0L10 10"/></svg>';
    await wait(250);
    assert.equal(dom.window.document.querySelectorAll('.artifact-tools').length, 1);
    assert.equal(dom.window.document.querySelectorAll('.artifact-tools button').length, 2);
  } finally { dispose(); dom.window.close(); }
});

test('las tres figuras conservan el PNG del artículo y su fuente SVG vectorial verificable', async () => {
  const provenance = JSON.parse(await readFile(new URL('../public/article/provenance.json', import.meta.url)));
  assert.deepEqual(articleFigures.map(figure => figure.number), [1, 2, 3]);
  assert.equal(provenance.figures.length, 3);
  for (const figure of articleFigures) {
    const source = provenance.figures.find(item => item.number === figure.number);
    const bytes = await readFile(new URL(`../public${figure.src}`, import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), source.sha256);
    assert.equal(bytes.length, source.bytes);
    assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', 'La imagen es PNG real');
    assert.ok(source.caption.startsWith(`Figura ${figure.number}.`));
    for (const format of ['svg', 'png']) {
      const asset = await readFile(new URL(`../public${figure[format]}`, import.meta.url));
      assert.equal(createHash('sha256').update(asset).digest('hex'), source.formats[format].sha256);
      if (format === 'svg') {
        const dom = new JSDOM(asset.toString(), { contentType: 'image/svg+xml' });
        assert.equal(dom.window.document.querySelector('image'), null, 'El SVG contiene vectores, no un PNG incrustado');
        assert.ok(dom.window.document.querySelectorAll('path').length > 0);
        dom.window.close();
      } else {
        assert.ok(asset.readUInt32BE(16) >= 4000);
        const offset = asset.indexOf(Buffer.from('pHYs'));
        assert.ok(offset > 0); assert.equal(asset.readUInt32BE(offset + 4), Math.round(600 / 0.0254));
        assert.equal(asset.readUInt32BE(offset + 8), Math.round(600 / 0.0254)); assert.equal(asset[offset + 12], 1);
      }
    }
  }
});

test('PNG a 600 dpi sustituye la densidad anterior, conserva los píxeles y mantiene CRC válidos', async () => {
  const input = Buffer.from(await readFile(new URL('../public/article/figura-1.png', import.meta.url)));
  const old = input.indexOf(Buffer.from('pHYs'));
  input.writeUInt32BE(3780, old + 4); input.writeUInt32BE(3780, old + 8);
  input.writeUInt32BE(crc32(input.subarray(old, old + 13)), old + 13);
  const output = Buffer.from(await (await pngAt600Dpi(new Blob([input], { type: 'image/png' }))).arrayBuffer());
  const chunks = bytes => {
    const result = [];
    for (let offset = 8; offset < bytes.length;) {
      const length = bytes.readUInt32BE(offset), type = bytes.toString('ascii', offset + 4, offset + 8);
      const data = bytes.subarray(offset + 8, offset + 8 + length);
      assert.equal(bytes.readUInt32BE(offset + 8 + length), crc32(bytes.subarray(offset + 4, offset + 8 + length)), type);
      result.push({ type, data }); offset += length + 12;
    }
    return result;
  };
  const before = chunks(input), after = chunks(output), density = after.filter(chunk => chunk.type === 'pHYs');
  assert.equal(density.length, 1); assert.equal(density[0].data.readUInt32BE(0), 23622); assert.equal(density[0].data.readUInt32BE(4), 23622); assert.equal(density[0].data[8], 1);
  assert.deepEqual(after.filter(chunk => chunk.type !== 'pHYs'), before.filter(chunk => chunk.type !== 'pHYs'));
  await assert.rejects(pngAt600Dpi(new Blob(['not png'])), /PNG válido/);
});

test('se elige SVG o PNG sin recodificar y el formato se comparte con la ampliación', async () => {
  const dom = new JSDOM('<section id="figures"></section>', { url: 'https://slopes.example/' });
  const { document } = dom.window;
  renderArticleFigures(document.getElementById('figures'));
  const dispose = setupArtifactTools(document);
  const created = [], files = [], requests = [], originalCreate = URL.createObjectURL, originalRevoke = URL.revokeObjectURL;
  const png = new Uint8Array([137, 80, 78, 71, 1, 2, 3]), svg = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M1 2L3 4"/></svg>';
  dom.window.fetch = async source => {
    requests.push(source);
    return new Response(source.endsWith('.svg') ? svg : png, { headers: { 'Content-Type': source.endsWith('.svg') ? 'image/svg+xml' : 'image/png' } });
  };
  URL.createObjectURL = blob => { created.push(blob); return 'blob:original'; };
  URL.revokeObjectURL = () => {};
  dom.window.HTMLAnchorElement.prototype.click = function () { files.push(this.download); };
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new dom.window.Event('close')); };
  try {
    assert.equal(document.querySelectorAll('.artifact-tools').length, 3);
    assert.equal(document.querySelectorAll('img[alt][data-artifact-image]').length, 3);
    const selector = document.querySelector('select[aria-label="Formato de descarga"]');
    assert.equal(selector.value, 'svg');
    document.querySelector('button[aria-label="Descargar imagen original"]').click();
    await wait(30);
    assert.equal(await created[0].text(), svg); assert.ok(files[0].endsWith('.svg'));
    selector.value = 'png'; selector.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    document.querySelector('button[aria-label="Descargar imagen original"]').click();
    await wait(30);
    assert.deepEqual(new Uint8Array(await created[1].arrayBuffer()), png); assert.ok(files[1].endsWith('.png'));
    assert.deepEqual(requests, ['https://slopes.example/article/figura-1.svg', 'https://slopes.example/article/figura-1.png']);
    document.querySelector('button[aria-label="Ampliar figura o tabla"]').click();
    await wait(30);
    assert.equal(document.querySelector('dialog img').src, 'https://slopes.example/article/figura-1.png');
    assert.equal(document.querySelector('dialog canvas'), null);
    const focusedSelector = document.querySelector('dialog select'); assert.equal(focusedSelector.value, 'png');
    focusedSelector.value = 'svg'; focusedSelector.dispatchEvent(new dom.window.Event('change'));
    assert.equal(selector.value, 'svg');
  } finally { dispose(); URL.createObjectURL = originalCreate; URL.revokeObjectURL = originalRevoke; dom.window.close(); }
});
