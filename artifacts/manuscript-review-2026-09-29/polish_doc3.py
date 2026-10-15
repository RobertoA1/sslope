"""Journal typography without touching non-text runs or embedded figures."""

from pathlib import Path
import re
import tempfile

from docx import Document
from docx.shared import Cm

path = Path(__file__).resolve().parent / "Articulo_TA01_corregido_BGM.docx"
doc = Document(path)
main = list(doc.paragraphs)
all_paragraphs = list(main)
for table in doc.tables:
    for row in table.rows:
        for cell in row.cells:
            all_paragraphs.extend(cell.paragraphs)

reference_mode = False
for p in main:
    if p.text == "Referencias":
        reference_mode = True
    elif p.text == "Material suplementario A":
        reference_mode = False
    if reference_mode and p.text != "Referencias" and p.text:
        p.paragraph_format.left_indent = Cm(0.75)
        p.paragraph_format.first_line_indent = -Cm(0.75)

for p in all_paragraphs:
    for label in ("Palabras clave: ", "Keywords: "):
        if p.text.startswith(label):
            terms = p.text.removeprefix(label).rstrip(".").split("; ")
            p.text = label + "; ".join(t[:1].upper() + t[1:] for t in terms) + "."
    for run in p.runs:
        changed = re.sub(r"(?<=\d),(?=\d)", ".", run.text)
        if changed != run.text:
            run.text = changed
    if (
        p.style.name == "Normal" and p.text and p not in main[main.index(next(q for q in main if q.text == "Referencias")) + 1 : main.index(next(q for q in main if q.text == "Material suplementario A"))]
        and not p.text.startswith(("Figura ", "Figure ", "Tabla ", "Table ", "Nota.",
                                    "Palabras clave:", "Keywords:", "Título abreviado:", "• "))
    ):
        p.paragraph_format.first_line_indent = Cm(0.5)

with tempfile.TemporaryDirectory(prefix="sslope-polish-", dir=path.parent) as temp:
    intermediate = Path(temp) / "polished.docx"
    doc.save(intermediate)
    intermediate.replace(path)
print(path)
