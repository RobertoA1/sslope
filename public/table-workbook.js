// XLSX sin dependencias de servidor: un paquete OOXML con una hoja de datos.
// ZIP almacenado (sin compresión) permite descargar también sin conexión.
const encoder = new TextEncoder();
const xml = value => String(value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]);
const main = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const declaration = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
export const EXCEL_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function columnName(index) {
  let result = '';
  for (index++; index; index = Math.floor((index - 1) / 26)) result = String.fromCharCode(65 + (index - 1) % 26) + result;
  return result;
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zip(files) {
  const parts = [], directory = []; let offset = 0, size = 0;
  for (const [name, source] of Object.entries(files)) {
    const path = encoder.encode(name), bytes = encoder.encode(declaration + source), crc = crc32(bytes);
    const header = new Uint8Array(30 + path.length), h = new DataView(header.buffer);
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x800, true); h.setUint16(12, 33, true);
    h.setUint32(14, crc, true); h.setUint32(18, bytes.length, true); h.setUint32(22, bytes.length, true); h.setUint16(26, path.length, true); header.set(path, 30);
    const central = new Uint8Array(46 + path.length), c = new DataView(central.buffer);
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x800, true); c.setUint16(14, 33, true);
    c.setUint32(16, crc, true); c.setUint32(20, bytes.length, true); c.setUint32(24, bytes.length, true); c.setUint16(28, path.length, true); c.setUint32(42, offset, true); central.set(path, 46);
    parts.push(header, bytes); directory.push(central); offset += header.length + bytes.length; size += central.length;
  }
  const end = new Uint8Array(22), e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, directory.length, true); e.setUint16(10, directory.length, true); e.setUint32(12, size, true); e.setUint32(16, offset, true);
  return new Blob([...parts, ...directory, end], { type: EXCEL_MIME });
}

export function tableWorkbook({ headers, rows }, title = 'Tabla', context = '') {
  if (!headers.length || headers.length > 16384 || rows.length >= 1048576) throw new Error('La tabla supera los límites de Excel. Descárgala en CSV.');
  const formats = new Map();
  function cell(value, col, row) {
    const text = String(value ?? ''), ref = `${columnName(col)}${row + 1}`;
    if (text.length > 32767) throw new Error('Una celda supera el límite de Excel. Descarga la tabla completa en CSV.');
    // Excel admite 15 cifras significativas. Identificadores y valores de mayor
    // precisión se guardan como texto; nunca se crean fórmulas con datos importados.
    const numeric = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(text);
    const significant = text.replace(/e.*$/i, '').replace(/[^0-9]/g, '').replace(/^0+/, '');
    const number = Number(text);
    if (row && numeric && significant.length <= 15 && Number.isFinite(number) && !(number === 0 && /[1-9]/.test(significant))) {
      const decimals = text.split(/e/i)[0].split('.')[1]?.length || 0;
      const format = /e/i.test(text) ? `0${decimals ? '.' + '0'.repeat(decimals) : ''}E+00` : decimals ? '0.' + '0'.repeat(decimals) : '0';
      if (!formats.has(format)) formats.set(format, formats.size + 2);
      return `<c r="${ref}" s="${formats.get(format)}"><v>${number}</v></c>`;
    }
    return `<c r="${ref}" s="${row ? 0 : 1}" t="inlineStr"><is><t xml:space="preserve">${xml(text)}</t></is></c>`;
  }
  const data = [headers, ...rows].map((row, index) => `<row r="${index + 1}">${headers.map((_, col) => cell(row[col], col, index)).join('')}</row>`).join('');
  const range = `A1:${columnName(headers.length - 1)}${rows.length + 1}`;
  const cols = headers.map((header, col) => {
    const width = rows.reduce((size, row) => Math.min(60, Math.max(size, String(row[col] ?? '').length + 2)), Math.min(60, Math.max(12, String(header).length + 2)));
    return `<col min="${col + 1}" max="${col + 1}" width="${width}" customWidth="1"/>`;
  }).join('');
  const alignment = '<alignment vertical="top" wrapText="1"/>';
  const styles = `<styleSheet xmlns="${main}"><numFmts count="${formats.size}">${[...formats].map(([format, style]) => `<numFmt numFmtId="${164 + style - 2}" formatCode="${xml(format)}"/>`).join('')}</numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF166B68"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${formats.size + 2}"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1">${alignment}</xf><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyAlignment="1">${alignment}</xf>${[...formats.values()].map(style => `<xf numFmtId="${164 + style - 2}" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1">${alignment}</xf>`).join('')}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  const relationship = 'http://schemas.openxmlformats.org/package/2006/relationships';
  const documentRelationship = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  return zip({
    '[Content_Types].xml': '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>',
    '_rels/.rels': `<Relationships xmlns="${relationship}"><Relationship Id="rId1" Type="${documentRelationship}/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`,
    'docProps/core.xml': `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${xml(title)}</dc:title><dc:description>${xml(context)}</dc:description><dc:creator>SSLOPE</dc:creator></cp:coreProperties>`,
    'xl/workbook.xml': `<workbook xmlns="${main}" xmlns:r="${documentRelationship}"><sheets><sheet name="Resultados" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `<Relationships xmlns="${relationship}"><Relationship Id="rId1" Type="${documentRelationship}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${documentRelationship}/styles" Target="styles.xml"/></Relationships>`,
    'xl/styles.xml': styles,
    'xl/worksheets/sheet1.xml': `<worksheet xmlns="${main}"><dimension ref="${range}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols>${cols}</cols><sheetData>${data}</sheetData><autoFilter ref="${range}"/></worksheet>`
  });
}
