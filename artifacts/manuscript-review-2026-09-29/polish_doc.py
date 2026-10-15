"""Apply non-numeric journal typography to the clean article copy."""

from pathlib import Path
import re
import tempfile

from docx import Document
from docx.shared import Cm


path = Path(__file__).resolve().parent / "Articulo_TA01_corregido_BGM.docx"
doc = Document(path)


def paragraphs():
    yield from doc.paragraphs
    for table in doc.tables:
        for row in table.rows:
            for cell in row.cells:
                yield from cell.paragraphs


for paragraph in paragraphs():
    for label in ("Palabras clave: ", "Keywords: "):
        if paragraph.text.startswith(label):
            terms = paragraph.text.removeprefix(label).rstrip(".").split("; ")
            paragraph.text = label + "; ".join(t[:1].upper() + t[1:] for t in terms) + "."
    # Only decimal commas between digits are changed; numeric values are identical.
    for run in paragraph.runs:
        run.text = re.sub(r"(?<=\d),(?=\d)", ".", run.text)
    if (
        paragraph.style.name == "Normal"
        and paragraph.text
        and not paragraph.text.startswith(
            ("Figura ", "Figure ", "Tabla ", "Table ", "Nota.",
             "Palabras clave:", "Keywords:", "Título abreviado:", "• ")
        )
    ):
        paragraph.paragraph_format.first_line_indent = Cm(0.5)

with tempfile.TemporaryDirectory(prefix="sslope-polish-") as tmp:
    intermediate = Path(tmp) / "polished.docx"
    doc.save(intermediate)
    intermediate.replace(path)

print(path)
