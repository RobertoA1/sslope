import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { crc32 } from 'node:zlib';
import { JSDOM } from 'jsdom';
import { tableWorkbook, EXCEL_MIME } from '../public/table-workbook.js';
import { mountArtifact, readTable, tableCsv, setupArtifactTools } from '../public/artifact-tools.js';
import { renderArticleTables } from '../public/article-tables.js';

const article = JSON.parse(await readFile(new URL('../public/article/tables.json', import.meta.url)));

async function unpack(blob) {
  assert.equal(blob.type, EXCEL_MIME);
  const bytes = Buffer.from(await blob.arrayBuffer()), files = new Map(); let offset = 0;
  while (bytes.readUInt32LE(offset) === 0x04034b50) {
    const crc = bytes.readUInt32LE(offset + 14), length = bytes.readUInt32LE(offset + 18), pathLength = bytes.readUInt16LE(offset + 26), extra = bytes.readUInt16LE(offset + 28);
    assert.equal(bytes.readUInt16LE(offset + 8), 0);
    const path = bytes.toString('utf8', offset + 30, offset + 30 + pathLength), start = offset + 30 + pathLength + extra;
    const data = bytes.subarray(start, start + length); assert.equal(crc32(data), crc, path);
    const dom = new JSDOM(data.toString(), { contentType: 'application/xml' });
    files.set(path, dom.window.document); offset = start + length;
  }
  assert.equal(bytes.readUInt32LE(offset), 0x02014b50);
  assert.equal(bytes.readUInt32LE(bytes.length - 22), 0x06054b50);
  assert.equal(bytes.readUInt16LE(bytes.length - 12), files.size);
  return files;
}

test('Excel es un XLSX real con números precisos, texto seguro, estilos y todas las filas', async () => {
  const data = { headers: ['ID', 'Medida', 'Texto'], rows: [
    ['00123', '0.00002081', '=SUM(1,2)'], ['1234567890123456789', '-0.000123456789', 'ñ < & >'],
    ['2025-01-02', '2.30', 'A1'], ['3', '0.12345678901234567890', '+cmd'], ['4', '1.25e-20', '@texto']
  ] };
  for (let i = 0; i < 200; i++) data.rows.push([`E-${i}`, `${i}`, 'Fila completa']);
  const files = await unpack(tableWorkbook(data, 'Tabla & prueba', 'Fuente: DOCX'));
  const sheet = files.get('xl/worksheets/sheet1.xml'), cells = new Map([...sheet.querySelectorAll('c')].map(cell => [cell.getAttribute('r'), cell]));
  assert.equal(sheet.querySelectorAll('row').length, 206);
  assert.equal(cells.get('A2').getAttribute('t'), 'inlineStr'); assert.equal(cells.get('A2').textContent, '00123');
  assert.equal(cells.get('A3').textContent, '1234567890123456789');
  assert.equal(Number(cells.get('B2').textContent), 0.00002081); assert.equal(Number(cells.get('B3').textContent), -0.000123456789);
  assert.equal(cells.get('B5').getAttribute('t'), 'inlineStr'); assert.equal(cells.get('B5').textContent, data.rows[3][1]);
  assert.equal(Number(cells.get('B6').textContent), 1.25e-20);
  assert.equal(cells.get('C2').textContent, '=SUM(1,2)'); assert.equal(cells.get('C3').textContent, 'ñ < & >');
  assert.equal(sheet.querySelector('f'), null); assert.equal(sheet.querySelector('pane').getAttribute('state'), 'frozen');
  assert.equal(sheet.querySelector('autoFilter').getAttribute('ref'), 'A1:C206');
  const styles = files.get('xl/styles.xml');
  const style = styles.querySelectorAll('cellXfs>xf')[Number(cells.get('B4').getAttribute('s'))];
  assert.equal(styles.querySelector(`numFmt[numFmtId="${style.getAttribute('numFmtId')}"]`).getAttribute('formatCode'), '0.00');
  assert.throws(() => tableWorkbook({ headers: ['Dato'], rows: [['x'.repeat(32768)]] }), /CSV/);
});

test('las siete tablas del DOCX se muestran completas y exportan Excel y CSV, incluida A1', async () => {
  assert.deepEqual(article.tables.map(table => [table.id, table.rows.length, table.headers.length]), [['1', 5, 5], ['2', 11, 3], ['3', 8, 6], ['4', 4, 7], ['5', 6, 4], ['6', 6, 5], ['A1', 40, 3]]);
  assert.match(article.sourceSha256, /^[a-f0-9]{64}$/);
  assert.match(article.tables[1].rows.at(-1)[1], /Node.js ≥24; NumPy ≥2/);
  const dom = new JSDOM('<div id="tables"></div>', { url: 'https://example.test/' });
  renderArticleTables(dom.window.document.getElementById('tables'), article);
  const tables = [...dom.window.document.querySelectorAll('table')];
  const dispose = setupArtifactTools(dom.window.document);
  try {
    assert.equal(tables.length, 7);
    assert.equal(dom.window.document.querySelectorAll('button[aria-label="Descargar tabla completa en Excel"]').length, 7);
    assert.equal(dom.window.document.querySelectorAll('button[aria-label="Descargar tabla completa en CSV"]').length, 7);
    for (const [index, table] of tables.entries()) {
      const { headers, rows } = article.tables[index]; assert.deepEqual(readTable(table), { headers, rows });
      const files = await unpack(tableWorkbook(readTable(table)));
      assert.equal(files.get('xl/worksheets/sheet1.xml').querySelectorAll('row').length, rows.length + 1);
      assert.equal(tableCsv(table).split('\r\n').length, rows.length + 1);
    }
    assert.match(tableCsv(tables[2]), /0\.00002081/); assert.match(tableCsv(tables[6]), /S-20/);
  } finally { dispose(); dom.window.close(); }
});

test('los controles Excel y CSV descargan la tabla actual y funcionan en la ampliación', async () => {
  const dom = new JSDOM('<section id="panel"><div data-artifact-tools></div><div data-artifact-content><table><tr><th>Medida</th></tr><tr><td>0.00002081</td></tr></table></div></section>');
  const document = dom.window.document, files = [], blobs = [], originalCreate = URL.createObjectURL, originalRevoke = URL.revokeObjectURL;
  URL.createObjectURL = blob => { blobs.push(blob); return 'blob:table'; }; URL.revokeObjectURL = () => {};
  dom.window.HTMLAnchorElement.prototype.click = function () { files.push(this.download); };
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new dom.window.Event('close')); };
  const dispose = mountArtifact(document.getElementById('panel'));
  try {
    document.querySelector('[aria-label="Descargar tabla completa en Excel"]').click();
    assert.match(files[0], /\.xlsx$/); await unpack(blobs[0]);
    document.querySelector('td').textContent = '0.00005502';
    document.querySelector('[aria-label="Ampliar figura o tabla"]').click();
    document.querySelector('dialog [aria-label="Descargar tabla completa en CSV"]').click();
    assert.match(files[1], /\.csv$/); assert.match(await blobs.at(-1).text(), /0\.00005502/);
    document.querySelector('dialog [aria-label="Descargar tabla completa en Excel"]').click();
    const updated = await unpack(blobs.at(-1));
    assert.equal(Number(updated.get('xl/worksheets/sheet1.xml').querySelector('c[r="A2"]').textContent), 0.00005502);
  } finally { dispose(); URL.createObjectURL = originalCreate; URL.revokeObjectURL = originalRevoke; dom.window.close(); }
});
