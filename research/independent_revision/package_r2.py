"""Prepare separate private review and public scientific-release archives."""
import argparse
from hashlib import sha256
import json
from pathlib import Path
import shutil
from zipfile import ZipFile,ZIP_DEFLATED

ROOT=Path(__file__).resolve().parents[2]


def assemble(base,staging,public):
    if staging.exists():raise SystemExit('Use a new staging directory')
    staging.mkdir(parents=True)
    def copy(source,target):
        target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(source,target)
    files=[ROOT/'LICENSE',ROOT/'package.json',ROOT/'package-lock.json',ROOT/'data/LICENSE.md']
    for directory,patterns in {
       'research/independent_revision':['*.py','*.json'],
       'src/core':['*.js'],
       'research-app/backend':['*.py','requirements*.txt'],
       'research-app/crisp':['*.py'],
       'data/generated':['ta01-fem-500*.csv','ta01-fem-500*.json'],
       'data/rainfall':['*.csv','README.md'],
       'data/external/century-mine':['Data.zip','README.md'],
       'research-app/data/century':['Data.zip'],
       'data/models':['ta01-chronological-lstm-6h.json']}.items():
        for pattern in patterns:files.extend((ROOT/directory).glob(pattern))
    old=['run_west_wall.py','west_wall_engine.py','west-wall-protocol.json','southwest_study.py','southwest-protocol.json','test_southwest_study.py','ta01_oof_study.py','ta01-protocol.json','summarize_ta01.py','ta01_robustness.py','verify_field_evidence.py','verify_ta01_evidence.py','verify_mechanics.mjs','requirements-science-lock.txt','requirements-authoring.txt','reproduce.py','build_manuscript.py','manuscript_content.py']
    if public:
        # Authoring modules contain the unpublished prose as Python literals.
        # Keep those in the private review bundle, not in the public release.
        private_authoring={'build_r2.py','content_r2.py','build_manuscript.py','manuscript_content.py'}
        files=[p for p in files if p.name not in private_authoring]
        old=[n for n in old if n not in private_authoring]
    files.extend(ROOT/'research/article_revision'/n for n in old)
    files.extend(ROOT/'scripts'/n for n in ['generate-fem-dataset.js','split-fem-dataset.js','split-fem-chronological.js','train-temporal-baseline.js','train-lstm.py','train-physics-guided.py','test-lstm-core.py','test-physics-guided-core.py'])
    for path in sorted(set(files)):copy(path,staging/'sslope'/path.relative_to(ROOT))
    for name in ['ta01-oof','ta01-tables','ta01-robustness','southwest-full','west-wall-full-resumable','field-sensitivity','increment-and-version-audit']:
        for path in sorted((base/'evidence'/name).rglob('*')):
            if path.is_file() and path.suffix!='.zip':copy(path,staging/'evidence'/path.relative_to(base/'evidence'))
    for pattern in ['ta01-regenerat*','ta01-mechanics-check.json','science-environment.json','sensitivity-verification.log','clean-install-check.log','clean-environment-audit.json','clean-audit.log']:
        for path in (base/'evidence').glob(pattern):
            if path.is_file():copy(path,staging/'evidence'/path.name)
    # Bibliographical metadata suffice for identity checks; do not republish
    # downloaded journal HTML/PDFs or publisher abstracts inside the release.
    old_registry=json.loads((base/'evidence/reference-registry-audit.json').read_text())
    def remove_abstract(value):
        if isinstance(value,dict):return {k:remove_abstract(v) for k,v in value.items() if k.lower() not in {'abstract','description','descriptions'}}
        if isinstance(value,list):return [remove_abstract(v) for v in value]
        return value
    (staging/'evidence/reference-registry-audit.json').write_text(json.dumps(remove_abstract(old_registry),indent=2)+'\n')
    for name in ['method-reference-audit.json','public-access-audit.json','primary-source-files.json']:
        target=staging/'evidence/primary-sources'/name;target.parent.mkdir(parents=True,exist_ok=True)
        payload=json.loads((base/'evidence/primary-sources'/name).read_text());target.write_text(json.dumps(remove_abstract(payload),indent=2)+'\n')
    for path in (base/'figures').glob('*.jpg'):copy(path,staging/'figures'/path.name)
    if not public:
        for name in ['Articulo_G25_revision_independiente.docx','Suplemento_G25_revision_independiente.docx','RESPUESTA_REVISOR_INDEPENDIENTE.md','SOLICITUD_REEVALUACION.md','manuscrito-recibido.docx','revision-recibida.pdf','manuscript.md','DECLARACIONES_CONFIRMADAS.md','CONSULTA_EDITORIAL_PREPARADA.md','DEPOSITO_PROPUESTO.md','METADATOS_DEPOSITO_PROPUESTOS.json']:
            copy(base/name,staging/name)
        for name in ['DICTAMEN_INDEPENDIENTE_R2.md','CORRECCIONES_TRAS_DICTAMEN_R2.md','VIABILIDAD_TA01_SIN_TRABAJO_DE_CAMPO.md']:
            if (base/name).exists():copy(base/name,staging/name)
        copy(ROOT/'research/independent_revision/ta01_mesh_feasibility.mjs',staging/'sslope/research/independent_revision/ta01_mesh_feasibility.mjs')
        for path in (base/'evidence/ta01-mesh-feasibility').glob('*.json'):
            copy(path,staging/'evidence/ta01-mesh-feasibility'/path.name)
        combined=base/'Lectura_completa_G25_revision_independiente.pdf'
        if combined.exists():copy(combined,staging/combined.name)
        for name in ['manuscript-r2-build.json','supplement-r2-build.json','final-r2-qa.json']:
            if (base/'evidence'/name).exists():copy(base/'evidence'/name,staging/'evidence'/name)
    (staging/'README.md').write_text('''# SSLOPE forecast audit scientific reproduction release

Version: g25-r2-2026-11-04. This is a prepared archive, not proof of a public DOI
deposit. Public source project: https://github.com/RobertoA1/sslope. The current
public main commit and its distinction from this revision are recorded in
evidence/primary-sources/public-access-audit.json.

## Scope

The original TA-01 and two Century comparisons are retained, including negative
results. Revision 2 adds a 24-candidate training-only LSTM search (72 fold models),
four input variants with five seeds each, source-key reconciliation, incremental
target and level-error identity checks, a version ledger and a separately labelled
post-hoc output-floor diagnostic. These historical tests were already known;
none is a new prospective trial or validation of an operational warning system.
The non-negative floor test is not a field validation of the full TA-01 residual
corrector or unmeasured mechanics.

## Environment and audit

Validated platform: Linux x86_64 CPU. Python 3.11.15; Node.js 24.16.0.
Main scientific packages: NumPy 2.4.6,
pandas 2.3.3, SciPy 1.17.1, scikit-learn 1.9.1, TensorFlow CPU 2.21.0,
Keras 3.15.1, Optuna 5.0.0. The complete Python lock is included. The science
audit requires neither an API key nor a live language model. Node scripts used
for the generator and ridge baseline use the included core modules.

```sh
sha256sum -c SHA256SUMS
cd sslope
python3.11 -m venv .venv-reproduction
.venv-reproduction/bin/python -m pip install -r research/article_revision/requirements-science-lock.txt
.venv-reproduction/bin/python -m pip check
.venv-reproduction/bin/python research/independent_revision/reproduce_r2.py audit --evidence ../evidence --output ../audit-rebuilt
```

Audit writes verification records into the copied evidence folders, so check
the manifest before running it. It reloads the original studies, all 72 added
fold models and 20 final seed models, checks source windows/scales and rebuilds
metrics and tables. Float32 inference uses an explicit absolute tolerance of
0.0001 mm; exact cross-platform bytes are not promised.

Full training preserves the supplied results by using a new directory:

```sh
.venv-reproduction/bin/python research/independent_revision/reproduce_r2.py train --evidence ../evidence --output ../new-training --node node
node scripts/generate-fem-dataset.js --scenarios=500 --seed=20260915 --mesh-x=30 --mesh-y=20 --output=../regenerated/ta01.csv
node research/article_revision/verify_mechanics.mjs ../regenerated/mechanics.json
```

The full training mode can take much longer than reloading saved models. All
candidate scores, early-stopping curves, seed forecasts, ordinary and adjusted
temporal intervals remain available. The version ledger compares draft entries
with source-verified results; its archived historical network reproduces the
2025 six-hour value near 57.687 nm, not the earlier manuscript's 42.062 nm.

## Licences attribution and publication boundaries

Code: MIT, see sslope/LICENSE. Original generated research data, weights and
results retain the CC BY 4.0 attribution in sslope/data/LICENSE.md. Century
observations: Tjaart de Wit (2025), DOI 10.5281/zenodo.15003054, CC BY 4.0.
NASA POWER inputs retain sslope/data/rainfall/README.md attribution. Code and
third-party data are not silently relicensed under one blanket licence.

The prepared public scientific archive excludes unpublished manuscripts,
received peer-review text and downloaded journal-policy pages. The separate
private review bundle includes the final article, standalone supplement and
review response. Word rebuilding requires the supplied reference manuscript in
that private bundle and the optional authoring dependencies; it is separate
from the source/model/metric science audit. Codex assistance is disclosed in the
article. Human authors retain responsibility for approving publication.
''')
    manifest=[]
    for path in sorted(staging.rglob('*')):
        if path.is_file():
            rel=path.relative_to(staging)
            assert not any(s in {'.git','.env','.venv','node_modules','__pycache__'} for s in rel.parts)
            manifest.append(f'{sha256(path.read_bytes()).hexdigest()}  {rel.as_posix()}')
    (staging/'SHA256SUMS').write_text('\n'.join(manifest)+'\n')
    name='SSLOPE_G25_r2_codigo_datos.zip' if public else 'G25_r2_paquete_revision.zip'
    output=base/name
    with ZipFile(output,'w',ZIP_DEFLATED,compresslevel=6) as z:
        for path in sorted(staging.rglob('*')):
            if path.is_file():z.write(path,path.relative_to(staging).as_posix())
    (base/(name+'.sha256')).write_text(sha256(output.read_bytes()).hexdigest()+'  '+name+'\n')
    print(json.dumps({'archive':str(output),'public_release_preparation':public,'files':len(manifest)+1,'bytes':output.stat().st_size,'sha256':sha256(output.read_bytes()).hexdigest()}))


if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('--base',type=Path,required=True);ap.add_argument('--staging',type=Path,required=True);ap.add_argument('--public',action='store_true')
    a=ap.parse_args();assemble(a.base,a.staging,a.public)
