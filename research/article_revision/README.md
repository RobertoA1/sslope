# Article revision experiments

This snapshot audits SSLOPE using the controlled TA-01 generator and two distinct
observed Century targets. It retains negative comparisons. It is a CLI research
workflow and does not change the historical application demonstrations.

## Reproduce from the supplied archive

The package root has `sslope/` and `evidence/` directories. With Python 3.11 and
Node.js 24 installed, run inside `sslope/`:

```sh
python3.11 -m venv .venv-reproduction
.venv-reproduction/bin/python -m pip install -r research/article_revision/requirements-science-lock.txt
.venv-reproduction/bin/python research/article_revision/reproduce.py audit --evidence ../evidence --output ../audit-rebuilt
```

Audit reloads all saved networks/rules, reconciles source-keyed forecasts and
metrics, checks OOF coverage and West Wall outer-CV ordering, and rebuilds the
TA-01 tables and their 100000-draw date-cluster analysis. It uses local sources
and requires no API key. Installation is separate; numerical reload agreement
uses the recorded floating-point tolerances, not cross-platform byte identity.

For new training, always use a new output directory:

```sh
.venv-reproduction/bin/python research/article_revision/reproduce.py train --evidence ../evidence --output ../new-training --node node
```

Training includes all 18 TA-01 OOF tasks (three partitions, two horizons, three
seed pairs), South West (train-only tuning, four families, five seeds, 73 test
dates), West Wall (eight families, six inner tuning trials per learned family,
100 maximum neural epochs, three outer temporal folds, five seeds), and the
paired observation-error analyses. Early stopping may select fewer epochs.

Protocols and source hashes are recorded before fitting. Runners reject
non-empty experiment folders; explicit resume requires the same frozen sources
and protocol. The first interrupted West Wall attempt is execution history,
not reported evidence. All reported methods and seed outputs are retained,
including those worse than persistence. Seeds and sensors are not independent
mine sites. All tests are retrospective; this is not operational validation.

See `Supplementary_material.md` at the package root for source regeneration,
36 mechanical solves, uncertainty assumptions, and remaining limits. Exact
source data and dependency versions are included. The public Century dataset
is DOI 10.5281/zenodo.15003054, by Tjaart de Wit, CC BY 4.0. This research
package itself has no DOI-backed public deposit yet.
