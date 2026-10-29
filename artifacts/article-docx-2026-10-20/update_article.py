"""Apply the relevant TA-01 software outputs to the existing DOCX package."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
from copy import deepcopy
from decimal import Decimal
import csv
import hashlib
import json
import re
from lxml import etree as E
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent
SOURCE = ROOT.parent / 'sslope-articulo/GRUPO25_QuezadaRodriguezRobertoEnrique_TelloFuentesMelanieCeleste_ES.docx'
FINAL = OUT / SOURCE.name
W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
PR = 'http://schemas.openxmlformats.org/package/2006/relationships'
CT = 'http://schemas.openxmlformats.org/package/2006/content-types'
NS = {'w': W, 'r': R, 'wp': 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing', 'a': 'http://schemas.openxmlformats.org/drawingml/2006/main'}
def w(tag): return '{' + W + '}' + tag
def xml(root): return E.tostring(root, encoding='UTF-8', xml_declaration=True, standalone=True)
def text(node): return ''.join(node.xpath('.//w:t/text()', namespaces=NS))
def sha(data): return hashlib.sha256(data).hexdigest()
def rows(name):
    with (ROOT / 'data/validation' / name).open() as f: return list(csv.DictReader(f))
def decimal(value, places=8): return f'{Decimal(value):.{places}f}'

with ZipFile(SOURCE) as z:
    parts = {name: z.read(name) for name in z.namelist()}
original_parts = dict(parts)
document = E.fromstring(parts['word/document.xml'])
body = document.find('w:body', NS)
paragraphs = body.findall('w:p', NS)
tables = body.findall('w:tbl', NS)
section = xml(body.find('w:sectPr', NS))
changes = []

def replace(index, before, after):
    paragraph = paragraphs[index]
    assert before in text(paragraph), (index, before)
    # Preserve rich runs and the original content controls.
    for node in paragraph.xpath('.//w:t', namespaces=NS):
        if before in (node.text or ''):
            node.text = node.text.replace(before, after)
            changes.append({'paragraph': index, 'before': before, 'after': after})
            return
    raise ValueError(f'Replacement crosses runs at paragraph {index}')

def set_text(paragraph, value):
    existing = paragraph.xpath('.//w:t', namespaces=NS)
    assert existing
    existing[0].text = value
    for node in existing[1:]: node.text = ''

def pprop(paragraph, name, value):
    pr = paragraph.find('w:pPr', NS)
    if pr is None: pr = E.Element(w('pPr')); paragraph.insert(0, pr)
    el = pr.find('w:' + name, NS)
    if el is None: el = E.SubElement(pr, w(name))
    el.set(w('val'), value)

# Retain only the three principal result figures, without changing the study.
for index in [31, 32, 67, 68, 95, 96]:
    changes.append({'paragraph': index, 'removed': text(paragraphs[index]) or 'Figure image'})
    body.remove(paragraphs[index])
replace(30, ' La figura 1 resume el flujo de trabajo.', '')
replace(26, 'figura 3', 'figura 1')
replace(26, 'figura 5', 'figura 3')
replace(26, ' y la figura 2', '')
replace(58, 'figura 4', 'figura 2')
replace(66, ' La figura 2 muestra esta sensibilidad a la malla.', '')
replace(75, 'figura 3', 'figura 1')
replace(79, 'Figura 3.', 'Figura 1.')
replace(81, 'figura 4', 'figura 2')
replace(83, 'Figura 4.', 'Figura 2.')
replace(89, 'figura 5', 'figura 3')
replace(93, 'Figura 5.', 'Figura 3.')
replace(94, 'La figura 6 compara variantes en las que las entradas hidrológicas o mecánicas se reemplazaron por sus medias de entrenamiento durante la inferencia.', 'Las pruebas complementarias de enmascaramiento reemplazaron las entradas hidrológicas o mecánicas por sus medias de entrenamiento durante la inferencia.')

caption3 = 'Tabla 3. Desempeño en la prueba con fechas de lluvia separadas. MAE y RMSE en mm; R² adimensional. Los cuatro métodos utilizan las mismas ventanas por horizonte. Fuente: data/validation/ta01-model-comparison.csv.'
caption4 = 'Tabla 4. MAE de los cuatro modelos en las pruebas cronológicas, en mm. Los métodos comparten las ventanas de prueba de cada año y horizonte. Fuente: data/validation/ta01-rolling-origin-model-comparison.csv.'
set_text(paragraphs[71], caption3)
set_text(paragraphs[76], caption4)
set_text(paragraphs[80], 'La LSTM y el modelo híbrido superaron la persistencia y ridge en las cuatro combinaciones de año y horizonte (tabla 4), aunque su orden relativo cambió. Esta comparación es retrospectiva y describe el banco de pruebas semisintético, sin demostrar transferencia a una mina real.')

models = {'PERSISTENCE': 'Persistencia', 'RIDGE': 'Ridge', 'LSTM': 'LSTM', 'HYBRID_PHYSICS_GUIDED': 'Híbrido'}
comparison = rows('ta01-model-comparison.csv')
table3 = [['Horizonte (h)', 'Modelo', 'Ventanas', 'MAE (mm)', 'RMSE (mm)', 'R²']]
table3 += [[r['horizon_hours'], models[r['model']], r['sample_count'], decimal(r['mae_mm']), decimal(r['rmse_mm']), decimal(r['r2'], 6)] for r in comparison]
chronological = rows('ta01-rolling-origin-model-comparison.csv')
table4 = [['Año de prueba', 'Horizonte (h)', 'Ventanas', 'Persistencia', 'Ridge', 'LSTM', 'Híbrido']]
for year in ['2024', '2025']:
    for horizon in ['1', '6']:
        group = {r['model']: r for r in chronological if r['test_year'] == year and r['horizon_hours'] == horizon}
        table4.append([year, horizon, group['LSTM']['sample_count'], *[decimal(group[m]['mae_mm']) for m in models]])
robustness = rows('ta01-robustness-summary.csv')
table6 = [['Horizonte (h)', 'Condición', 'Ventanas', 'LSTM MAE (mm)', 'Híbrido MAE (mm)']]
for horizon in ['1', '6']:
    for condition, label in [('CLEAN', 'Limpias'), ('NOISE_5PCT_STD', 'Ruido 5 %'), ('MISSING_30PCT', 'Faltantes 30 %')]:
        group = {r['model']: r for r in robustness if r['horizon_hours'] == horizon and r['condition'] == condition and r['segment'] == 'PERTURBATION'}
        table6.append([horizon, label, group['LSTM']['sample_count'], decimal(group['LSTM']['mae_mm']), decimal(group['HYBRID']['mae_mm'])])

def rebuild_table(original, values, widths):
    table = deepcopy(original)
    old_rows = table.findall('w:tr', NS)
    header_template, body_template = old_rows[:2]
    for row in old_rows: table.remove(row)
    grid = table.find('w:tblGrid', NS)
    for node in list(grid): grid.remove(node)
    for width in widths: E.SubElement(grid, w('gridCol')).set(w('w'), str(width))
    properties = table.find('w:tblPr', NS)
    layout = properties.find('w:tblLayout', NS)
    if layout is None: layout = E.SubElement(properties, w('tblLayout'))
    layout.set(w('type'), 'fixed')
    for index, values_row in enumerate(values):
        row = deepcopy(header_template if index == 0 else body_template)
        template_cells = row.findall('w:tc', NS)
        for cell in template_cells: row.remove(cell)
        rowpr = row.find('w:trPr', NS)
        if rowpr is None: rowpr = E.Element(w('trPr')); row.insert(0, rowpr)
        for height in rowpr.findall('w:trHeight', NS): rowpr.remove(height)
        if index == 0 and rowpr.find('w:tblHeader', NS) is None: E.SubElement(rowpr, w('tblHeader'))
        if rowpr.find('w:cantSplit', NS) is None: E.SubElement(rowpr, w('cantSplit'))
        for col, value in enumerate(values_row):
            cell = deepcopy(template_cells[min(col, len(template_cells)-1)])
            cellpr = cell.find('w:tcPr', NS)
            if cellpr is None: cellpr = E.Element(w('tcPr')); cell.insert(0,cellpr)
            cell_width = cellpr.find('w:tcW', NS)
            if cell_width is None: cell_width = E.SubElement(cellpr,w('tcW'))
            cell_width.set(w('w'), str(widths[col])); cell_width.set(w('type'),'dxa')
            for child in list(cell):
                if child is not cellpr: cell.remove(child)
            paragraph = E.SubElement(cell, w('p'))
            pr = E.SubElement(paragraph, w('pPr'))
            E.SubElement(pr, w('jc')).set(w('val'), 'left' if (len(widths)==6 and col==1) or (len(widths)==5 and col==1) else 'center')
            spacing = E.SubElement(pr, w('spacing')); spacing.set(w('before'), '50'); spacing.set(w('after'), '50'); spacing.set(w('line'), '240'); spacing.set(w('lineRule'), 'auto')
            run = E.SubElement(paragraph, w('r')); rp = E.SubElement(run, w('rPr'))
            fonts = E.SubElement(rp, w('rFonts'))
            for key in ['ascii', 'hAnsi', 'eastAsia', 'cs']: fonts.set(w(key), 'Times New Roman')
            E.SubElement(rp, w('sz')).set(w('val'), '19')
            if index == 0: E.SubElement(rp, w('b'))
            E.SubElement(run, w('t')).text = value
            row.append(cell)
        table.append(row)
    original.getparent().replace(original, table)

rebuild_table(tables[2], table3, [1100, 1700, 1050, 2100, 2100, 1588])
rebuild_table(tables[3], table4, [1050, 1000, 950, 1650, 1650, 1650, 1688])
rebuild_table(tables[5], table6, [1200, 2350, 1300, 2400, 2388])
for number, values, source in [(3, table3, 'ta01-model-comparison.csv'), (4, table4, 'ta01-rolling-origin-model-comparison.csv'), (6, table6, 'ta01-robustness-summary.csv')]:
    with (OUT / f'Tabla_{number}.csv').open('w', newline='', encoding='utf-8-sig') as f: csv.writer(f).writerows(values)
    changes.append({'table': number, 'source': source, 'rows': len(values)-1, 'action': 'Rebuilt as native editable Word cells from archived software output; no retraining'})
for index in [71, 76, 90]: pprop(paragraphs[index], 'keepNext', '1')

rels = E.fromstring(parts['word/_rels/document.xml.rels'])
relation_by_id = {rel.get('Id'): rel for rel in rels}
figure_manifest = []
archive_figures = ROOT / 'artifacts/manuscript-review-2026-09-29'
provenance = json.loads((archive_figures / 'figure-provenance.json').read_text())
for old, new, rid, pindex in [(3, 1, 'rId11', 78), (4, 2, 'rId12', 82), (5, 3, 'rId13', 92)]:
    evidence = provenance[f'Figura_{old}']
    for source, digest in evidence['sha256'].items(): assert sha((ROOT/source).read_bytes()) == digest
    image_path = archive_figures / 'figuras' / f'Figura_{old}.png'
    payload = image_path.read_bytes()
    image = Image.open(image_path)
    target = f'media/ta01-figura-{new}.png'
    old_target = relation_by_id[rid].get('Target')
    relation_by_id[rid].set('Target', target)
    parts['word/'+target] = payload
    (OUT/f'Figura_{new}.png').write_bytes(payload)
    (OUT/f'Figura_{new}.svg').write_bytes((image_path.with_suffix('.svg')).read_bytes())
    # The publication PNGs are 400 dpi, generated from the same archived records.
    assert min(image.info['dpi']) > 399
    width = 6119500; height = round(width * image.height / image.width)
    paragraph = paragraphs[pindex]
    for extent in paragraph.xpath('.//wp:extent|.//a:xfrm/a:ext', namespaces=NS): extent.set('cx', str(width)); extent.set('cy', str(height))
    pprop(paragraph, 'keepNext', '1')
    for tag in paragraph.xpath('.//wp:docPr', namespaces=NS): tag.set('descr', f'Figura {new}. Resultado TA-01 semisintético; '+evidence['source_files'][0])
    figure_manifest.append({'number': new, 'previous_number': old, 'image_sha256': sha(payload), 'pixels': list(image.size), 'dpi': image.info['dpi'], **evidence})
    parts.pop('word/'+old_target)
for rid in ['rId9', 'rId10', 'rId14']:
    relation = relation_by_id[rid]
    parts.pop('word/'+relation.get('Target'))
    rels.remove(relation)

# Local editorial notes are Word comments; they do not replace article prose.
comments = E.Element(w('comments'), nsmap={'w': W})
notes = [
    (30, 'Se retiró el esquema anterior: este párrafo conserva el método. Se mantienen únicamente tres figuras de resultados pertinentes al experimento TA-01.'),
    (71, 'Tabla reconstruida a partir de ta01-model-comparison.csv. Se incorporan RMSE y R² del mismo archivo, con las mismas ventanas de prueba; no se ejecutó un entrenamiento nuevo.'),
    (76, 'Tabla reconstruida a partir de ta01-rolling-origin-model-comparison.csv. Se incorporan persistencia y ridge para comparar los cuatro modelos bajo el mismo protocolo cronológico.'),
    (79, 'Antes figura 3; ahora figura 1. Se incorpora la salida PNG de publicación a 400 dpi, contrastada con el SHA-256 de los datos archivados. Las antiguas figuras 4 y 5 pasan a 2 y 3.'),
    (94, 'Se retiró la figura complementaria de enmascaramiento para evitar una salida gráfica redundante. Se conserva su limitación metodológica; el resultado sigue disponible en el software y sus archivos.')
]
for number, (index, note) in enumerate(notes):
    paragraph = paragraphs[index]
    start = E.Element(w('commentRangeStart')); start.set(w('id'), str(number)); paragraph.insert(1 if paragraph.find('w:pPr',NS) is not None else 0, start)
    end = E.SubElement(paragraph, w('commentRangeEnd')); end.set(w('id'), str(number))
    run = E.SubElement(paragraph, w('r')); reference = E.SubElement(run, w('commentReference')); reference.set(w('id'), str(number))
    comment = E.SubElement(comments, w('comment')); comment.set(w('id'), str(number)); comment.set(w('author'), 'Revisión editorial'); comment.set(w('date'), '2026-10-20T15:00:00Z')
    E.SubElement(E.SubElement(E.SubElement(comment, w('p')), w('r')), w('t')).text = note
E.SubElement(rels, '{'+PR+'}Relationship', Id='rIdArticleComments', Type=R+'/comments', Target='comments.xml')
types = E.fromstring(parts['[Content_Types].xml'])
E.SubElement(types, '{'+CT+'}Override', PartName='/word/comments.xml', ContentType='application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml')
assert any(n.get('Extension')=='png' for n in types)
parts['word/comments.xml'] = xml(comments)
parts['word/_rels/document.xml.rels'] = xml(rels)
parts['[Content_Types].xml'] = xml(types)
parts['word/document.xml'] = xml(document)

# Preserve all four native equations, content controls, sections and page furniture.
assert len(document.xpath('//*[local-name()="oMath"]')) == 4
assert len(document.xpath('//w:sdt', namespaces=NS)) == 5
assert xml(body.find('w:sectPr',NS)) == section
assert len(document.xpath('//w:drawing',namespaces=NS)) == 3
assert len(body.findall('w:tbl',NS)) == 7
changed_parts = sorted(name for name in parts if parts[name] != original_parts.get(name))
allowed_changes = {'word/document.xml', 'word/_rels/document.xml.rels', '[Content_Types].xml', 'word/comments.xml', *[f'word/media/ta01-figura-{n}.png' for n in [1,2,3]]}
assert set(changed_parts) <= allowed_changes
with ZipFile(FINAL, 'w', ZIP_DEFLATED) as z:
    for name, payload in parts.items(): z.writestr(name,payload)
manifest = {'source': str(SOURCE), 'source_sha256': sha(SOURCE.read_bytes()), 'output_sha256': sha(FINAL.read_bytes()), 'figures': figure_manifest, 'changes': changes, 'changed_package_parts': changed_parts, 'removed_package_parts': sorted(set(original_parts)-set(parts)), 'excluded_outputs': ['Century Mine and its EDA/model tables: different case and target', 'Interactive viewer safety indicators, alerts and scenario snapshots: not the archived experiment', 'External SSRM/transient-seepage extensions: separate protocols', 'Runtime experiment history/configuration controls: interface metadata, not results'], 'preserved': ['Original journal page geometry, styles, headers, footers and references', 'Four native Word equations', 'Five original content controls', 'Methodological tables 1 and 2, numerical verification table 5 and bibliographic appendix A1']}
(OUT/'revision-provenance.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
print(FINAL)
print(json.dumps({'figures':3,'tables':7,'comments':len(notes),'equations':4,'changed_package_parts':changed_parts},ensure_ascii=False))
