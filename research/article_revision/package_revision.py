"""Assemble a review archive from an explicit allowlist; never package secrets."""
import argparse
from hashlib import sha256
from pathlib import Path
import shutil
from zipfile import ZIP_DEFLATED, ZipFile

ROOT = Path(__file__).resolve().parents[2]


def assemble(base, target):
    if target.exists():
        raise SystemExit("Use a new staging directory")
    target.mkdir(parents=True)

    def copy(source, destination):
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, destination)

    paths = [ROOT/"LICENSE", ROOT/"package.json", ROOT/"package-lock.json", ROOT/"data/LICENSE.md"]
    for directory, patterns in {
        "research/article_revision": ["*.py", "*.mjs", "*.json", "*.txt", "*.md"],
        "src/core": ["*.js"],
        "research-app/backend": ["*.py", "requirements*.txt"],
        "research-app/crisp": ["*.py"],
        "data/generated": ["ta01-fem-500*.csv", "ta01-fem-500*.json"],
        "data/rainfall": ["*.csv", "README.md"],
        "data/external/century-mine": ["Data.zip", "README.md"],
        "research-app/data/century": ["Data.zip"],
        "docs": ["CENTURY_DATASET.md", "MINE_TWINS.md"],
    }.items():
        for pattern in patterns:
            paths.extend(sorted((ROOT/directory).glob(pattern)))
    for name in ["generate-fem-dataset.js", "split-fem-dataset.js", "split-fem-chronological.js",
                 "train-temporal-baseline.js", "train-lstm.py", "train-physics-guided.py",
                 "test-lstm-core.py", "test-physics-guided-core.py"]:
        paths.append(ROOT/"scripts"/name)
    for path in sorted(set(paths)):
        assert path.is_file(), path
        copy(path, target/"sslope"/path.relative_to(ROOT))

    for name in ["ta01-oof", "ta01-tables", "ta01-robustness", "southwest-full", "west-wall-full-resumable"]:
        for path in sorted((base/"evidence"/name).rglob("*")):
            # The embedded West Wall ZIP is redundant with its expanded files.
            if path.is_file() and path.suffix != ".zip":
                copy(path, target/"evidence"/path.relative_to(base/"evidence"))
    for pattern in ["ta01-regenerat*", "ta01-mechanics-check.json", "reference-registry-audit.json",
                    "science-environment.json", "manuscript-build.json", "final-qa.json",
                    "cold-extraction-verification.json", "cold-extraction-audit.log"]:
        for path in sorted((base/"evidence").glob(pattern)):
            copy(path, target/"evidence"/path.name)
    for name in ["protocol-before-training.json", "progress.json", "environment.json"]:
        path = base/"evidence/west-wall-full"/name
        if path.exists():
            copy(path, target/"execution-history/interrupted-west-wall"/name)
    (target/"execution-history/README.md").write_text(
        "The first West Wall process stopped before completing its protocol. "
        "Its available protocol/progress/environment records are retained here. "
        "No result from that incomplete attempt enters the article. The reported "
        "run is evidence/west-wall-full-resumable, with all 24 outer stages and "
        "eight final methods complete. The redundant in-run ZIP is omitted.\n")
    for name in ["Articulo_G25_revisado_Century.docx", "manuscrito-recibido.docx", "Supplementary_material.md", "RESPUESTA_REVISION.md",
                 "REEVALUACION_INTERNA.md", "manuscript.md"]:
        copy(base/name, target/name)
    for path in sorted((base/"figures").glob("*.jpg")):
        copy(path, target/"figures"/path.name)
    (target/"README.md").write_text("""# SSLOPE article reproduction package

This archive accompanies the revised article. It preserves unfavourable results.
It is supplied for review and has no software-release DOI. The DOI of the
Century dataset does not identify this software release.

## Contents and attribution

- `sslope/`: the allowlisted scientific source, protocols, fixed dependencies
  and exact source inputs. This is a CLI research snapshot, not an app deployment.
- `evidence/`: all reported training runs, model weights, keyed forecasts,
  tuning histories, uncertainty analyses, source regeneration and verification.
- Article, figures, supplementary tables, review response and a clearly labelled
  internal rubric assessment. The received external review is unchanged locally.
- `SHA256SUMS`: every other file, including both copies of the public source ZIP.

Software: MIT, see `sslope/LICENSE`. Original project research data: CC BY 4.0,
see `sslope/data/LICENSE.md`. Century data: Tjaart de Wit (2025),
https://doi.org/10.5281/zenodo.15003054, CC BY 4.0; the mine is in Australia.
NASA POWER inputs retain the attribution in `sslope/data/rainfall/README.md`.
The human authors retain responsibility for approving the article and release.
Codex assistance is disclosed in the article.

## Reproduce the audit

Use Python 3.11 and Node.js 24. Install dependencies once; the subsequent audit
uses included local inputs and requires no API key or model service.

```sh
cd sslope
python3.11 -m venv .venv-reproduction
.venv-reproduction/bin/python -m pip install -r research/article_revision/requirements-science-lock.txt
.venv-reproduction/bin/python research/article_revision/reproduce.py audit --evidence ../evidence --output ../audit-rebuilt
```

Audit mode reloads every model and rebuilds metrics/tables; it writes verification
JSONs in the copied evidence folders. Check SHA256SUMS before running this audit.
Float32 inference is compared with an explicit 0.0001 mm absolute tolerance;
exact cross-platform bytes are not promised. Full training is computationally
expensive and preserves existing results by using a new output directory:

```sh
.venv-reproduction/bin/python research/article_revision/reproduce.py train --evidence ../evidence --output ../new-training --node node
```

Additional robustness analysis, the 500-scenario source regeneration and the
36 mechanical solves are documented in Supplementary_material.md. The saved
source regeneration was byte-identical; this verifies implementation, not field
calibration or a warning system. All field comparisons are retrospective.

```sh
cd ..
sha256sum -c SHA256SUMS
```
""")
    entries=[]
    for path in sorted(target.rglob("*")):
        if path.is_file():
            relative=path.relative_to(target)
            assert not any(part in {".git", ".env", ".venv", "node_modules", "__pycache__"} for part in relative.parts)
            entries.append(f"{sha256(path.read_bytes()).hexdigest()}  {relative.as_posix()}")
    (target/"SHA256SUMS").write_text("\n".join(entries)+"\n")
    output=base/"G25_paquete_reproducible.zip"
    with ZipFile(output,"w",ZIP_DEFLATED,compresslevel=6) as archive:
        for path in sorted(target.rglob("*")):
            if path.is_file():archive.write(path,path.relative_to(target).as_posix())
    print(f"{output}: {len(entries)+1} files, {output.stat().st_size} bytes")


if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base",type=Path,required=True)
    parser.add_argument("--staging",type=Path,required=True)
    args=parser.parse_args()
    assemble(args.base,args.staging)
