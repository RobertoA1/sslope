"""Publica todas las tablas nativas del DOCX, incluidos textos dentro de w:sdt."""
import argparse
import hashlib
import json
from pathlib import Path
import re
from xml.etree import ElementTree as ET
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]
W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'


def text(element):
    return ' '.join(
        ' '.join(''.join(t.text or '' for t in p.iter(W + 't')) for p in element.iter(W + 'p')).split()
    )


def extract(source):
    with ZipFile(source) as archive:
        body = ET.fromstring(archive.read('word/document.xml')).find(W + 'body')
    tables, caption = [], ''
    for element in body:
        if element.tag == W + 'p':
            paragraph = text(element)
            if re.match(r'^Tabla\s+(?:\d+|A\d+)\.', paragraph):
                caption = paragraph
        elif element.tag == W + 'tbl':
            match = re.match(r'^Tabla\s+(\d+|A\d+)\.\s*(.*)', caption)
            if not match:
                raise ValueError('Tabla sin leyenda: revisa el DOCX antes de publicar.')
            rows = [[text(cell) for cell in row.findall(W + 'tc')] for row in element.findall(W + 'tr')]
            if not rows or any(len(row) != len(rows[0]) for row in rows):
                raise ValueError(f'Tabla {match[1]} sin filas o con celdas combinadas: requiere revisión.')
            tables.append({'id': match[1], 'caption': caption, 'headers': rows[0], 'rows': rows[1:]})
            caption = ''
    if not tables or len({table['id'] for table in tables}) != len(tables):
        raise ValueError('No se encontraron tablas o sus identificadores no son únicos.')
    return {'source': source.name, 'sourceSha256': hashlib.sha256(source.read_bytes()).hexdigest(), 'tables': tables}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', nargs='?', type=Path, default=ROOT.parent / 'sslope-articulo' / 'GRUPO25_QuezadaRodriguezRobertoEnrique_TelloFuentesMelanieCeleste_ES.docx')
    args = parser.parse_args()
    result = extract(args.source)
    target = ROOT / 'public/article/tables.json'
    target.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(f'{len(result["tables"])} tablas publicadas en {target}')
