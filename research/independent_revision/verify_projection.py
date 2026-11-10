"""Recompute the post-hoc floor results without replacing their dated protocol."""
import argparse
from contextlib import redirect_stdout
from hashlib import sha256
import io
import json
from pathlib import Path
import shutil
from tempfile import TemporaryDirectory

import numpy as np
import pandas as pd
from projection_audit import run


def verify(folder):
    protocol = folder / 'projection-protocol-before-analysis.json'
    original_protocol = protocol.read_bytes()
    stored = json.loads((folder / 'projection-report.json').read_text())
    assert sha256((folder / 'predictions.csv').read_bytes()).hexdigest() == stored['protocol']['prediction_sha256']
    assert json.loads(original_protocol) == stored['protocol']
    with TemporaryDirectory(prefix='g25-floor-recheck-') as directory:
        fresh = Path(directory)
        shutil.copy2(folder / 'predictions.csv', fresh / 'predictions.csv')
        with redirect_stdout(io.StringIO()):
            run(fresh)
        rebuilt = json.loads((fresh / 'projection-report.json').read_text())
        for key in ['metrics', 'strata', 'intervals']:
            assert rebuilt[key] == stored[key], key
        pd.testing.assert_frame_equal(pd.read_csv(fresh / 'projection-metrics.csv'), pd.read_csv(folder / 'projection-metrics.csv'))
    predictions = pd.read_csv(folder / 'predictions.csv', float_precision='round_trip')
    predictions = predictions[predictions.partition == 'test']
    grouped = predictions.groupby(['variant', 'sensor', 'date']).agg(
        forecast=('predicted_delta', 'mean'), truth=('actual_delta', 'first'))
    for variant, rows in grouped.groupby(level='variant'):
        floor = np.maximum(rows.forecast, 0)
        error = abs(floor - rows.truth)
        bound = np.maximum(-rows.truth, 0)
        assert (error >= bound - 1e-12).all()
        # Projection leaves nonnegative forecasts unchanged and is idempotent.
        unchanged = rows.forecast >= 0
        np.testing.assert_array_equal(floor[unchanged], rows.forecast[unchanged])
        np.testing.assert_array_equal(np.maximum(floor, 0), floor)
    assert protocol.read_bytes() == original_protocol
    result = {'status': 'verified', 'metrics_recomputed': len(stored['metrics']),
              'strata_recomputed': len(stored['strata']), 'intervals_recomputed': len(stored['intervals']),
              'bootstrap_replicates_per_block': stored['protocol']['bootstrap_reps'],
              'nonnegative_error_lower_bound_checked_per_window': True,
              'projection_fixed_points_and_idempotence_checked_per_window': True,
              'original_dated_posthoc_protocol_preserved': True,
              'scope': 'Numerical regeneration and algebraic checks; not new observations or external peer review.'}
    (folder / 'projection-verification.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--folder', type=Path, required=True)
    verify(parser.parse_args().folder)
