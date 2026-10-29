"""Import the revised article's three PNGs and matching true vector sources."""
import hashlib
import json
from pathlib import Path
import sys
import subprocess
from xml.etree import ElementTree as ET
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT.parent / 'sslope-articulo' / 'GRUPO25_QuezadaRodriguezRobertoEnrique_TelloFuentesMelanieCeleste_ES.docx'
ARCHIVE = ROOT / 'artifacts/manuscript-review-2026-09-29'
SELECTED = {1: 3, 2: 4, 3: 5}
NS = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'a': 'http://schemas.openxmlformats.org/drawingml/2006/main'}


def sha(payload):
    return hashlib.sha256(payload).hexdigest()


def main():
    output = ROOT / 'public' / 'article'
    subprocess.run(['node', str(ROOT / 'scripts/render-article-png.mjs')], check=True)
    figures, assets = [], {}
    provenance = json.loads((ARCHIVE / 'figure-provenance.json').read_text())
    with ZipFile(SOURCE) as archive:
        rels = {r.get('Id'): r.get('Target') for r in ET.fromstring(archive.read('word/_rels/document.xml.rels'))}
        previous_images = []
        for paragraph in ET.fromstring(archive.read('word/document.xml')).findall('.//w:body/w:p', NS):
            caption = ''.join(t.text or '' for t in paragraph.findall('.//w:t', NS)).strip()
            images = [rels[b.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}embed')] for b in paragraph.findall('.//a:blip', NS)]
            if images:
                previous_images = images
            for number, archived_number in SELECTED.items():
                if not caption.startswith(f'Figura {number}.'):
                    continue
                if len(previous_images) != 1 or not previous_images[0].startswith('media/'):
                    raise ValueError(f'No se pudo identificar la imagen de la figura {number}')
                original = 'word/' + previous_images[0]
                png = archive.read(original)
                # Never attach a vector file to a different figure or stale data.
                archived_png = ARCHIVE / 'figuras' / f'Figura_{archived_number}.png'
                rendered_png = output / f'figura-{number}.png'
                if png not in [archived_png.read_bytes(), rendered_png.read_bytes()]:
                    raise ValueError(f'La figura {number} no coincide con el PNG que acompaña al SVG archivado')
                evidence = provenance[f'Figura_{archived_number}']
                for source, digest in evidence['sha256'].items():
                    if sha((ROOT / source).read_bytes()) != digest:
                        raise ValueError(f'Cambió la fuente de datos {source}; regenera las figuras')
                formats = {}
                for extension in ['png', 'svg']:
                    payload = (output / f'figura-{number}.{extension}').read_bytes()
                    filename = f'figura-{number}.{extension}'
                    assets[filename] = payload
                    formats[extension] = {'file': filename, 'bytes': len(payload), 'sha256': sha(payload)}
                figures.append({'number': number, 'file': formats['png']['file'], 'embedded': original, 'caption': caption, 'embedded_sha256': sha(png), 'bytes': formats['png']['bytes'], 'sha256': formats['png']['sha256'], 'formats': formats, 'dpi': 600, 'data_sources': evidence})
    if {figure['number'] for figure in figures} != set(SELECTED) or len(figures) != len(SELECTED):
        raise ValueError('El artículo debe contener exactamente las tres figuras seleccionadas y renumeradas')
    output.mkdir(parents=True, exist_ok=True)
    for filename, payload in assets.items():
        (output / filename).write_bytes(payload)
    result = {'source': SOURCE.name, 'source_sha256': sha(SOURCE.read_bytes()), 'case': 'TA-01 semisintético', 'extraction': 'True vector SVG and PNG rendered directly from those vectors at 600 dpi; no raster upscaling', 'figures': figures}
    (output / 'provenance.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(f'{len(figures)} figuras con SVG vectorial y PNG originales importadas en {output}')


if __name__ == '__main__':
    main()
