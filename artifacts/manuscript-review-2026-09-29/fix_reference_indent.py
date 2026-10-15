"""Restore hanging indents after the body-paragraph typography pass."""

from pathlib import Path
import tempfile

from docx import Document
from docx.shared import Cm

path = Path(__file__).resolve().parent / "Articulo_TA01_corregido_BGM.docx"
doc = Document(path)
active = False
for p in doc.paragraphs:
    if p.text == "Referencias":
        active = True
        continue
    if p.text == "Material suplementario A":
        active = False
    if active and p.text:
        p.paragraph_format.left_indent = Cm(0.75)
        p.paragraph_format.first_line_indent = -Cm(0.75)

with tempfile.TemporaryDirectory(prefix="sslope-ref-", dir=path.parent) as temp:
    intermediate = Path(temp) / "ref.docx"
    doc.save(intermediate)
    intermediate.replace(path)
print(path)
