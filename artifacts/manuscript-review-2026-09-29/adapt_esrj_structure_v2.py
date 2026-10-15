"""Run ESRJ adaptation with paragraph-local style objects from the source."""

from pathlib import Path

script = Path(__file__).with_name("adapt_esrj_structure.py")
code = script.read_text(encoding="utf-8")
code = code.replace('doc.styles["Heading 1"]', 'p[43].style')
code = code.replace('doc.styles["Normal"]', 'p[22].style')
exec(compile(code, str(script), "exec"), {"__file__": str(script)})
