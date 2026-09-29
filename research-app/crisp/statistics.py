"""Paired calendar losses, dependence diagnostics and explicitly conditional inference."""
from itertools import combinations
import numpy as np
import pandas as pd
from scipy import stats
import statsmodels.api as sm
from statsmodels.stats.diagnostic import acorr_ljungbox
from statsmodels.stats.multitest import multipletests
from statsmodels.tsa.stattools import acf


def longest_run(series):
    series = series.sort_index()
    if series.empty:
        return series
    dates = pd.to_datetime(series.index)
    groups = pd.Series(dates, index=series.index).diff().dt.days.ne(1).cumsum()
    return max((part for _, part in series.groupby(groups)), key=len)


def dependence(series):
    run = longest_run(series)
    values = run.to_numpy(float)
    n = len(values)
    result = {"days": n, "all_days": len(series), "acf": [], "ljung_box_p": None,
              "lag": min(3, max(1, n//5)), "status": "serie corta o constante"}
    if n >= 6 and np.std(values) > 1e-12:
        result["acf"] = [{"lag": i, "rho": float(v)} for i, v in enumerate(acf(values, nlags=min(10, n//3), fft=False)) if i]
        if n >= 20:
            result["ljung_box_p"] = float(acorr_ljungbox(values, lags=[result["lag"]], return_df=True).lb_pvalue.iloc[0])
            result["status"] = "diagnóstico exploratorio; no acredita independencia"
    return result


def moving_interval(values, length, reps, rng, alpha):
    if len(values) < max(6, 2*length):
        return None
    blocks = np.lib.stride_tricks.sliding_window_view(values, length)
    draws = np.empty(reps)
    for i in range(reps):
        sample = blocks[rng.integers(0, len(blocks), size=int(np.ceil(len(values)/length)))].ravel()[:len(values)]
        draws[i] = sample.mean()
    return np.quantile(draws, [alpha/2, 1-alpha/2]).tolist()


def evaluate_statistics(predictions, config):
    frame = pd.DataFrame(predictions)
    if frame.duplicated(["model", "sensor", "date"]).any():
        raise ValueError("Las repeticiones deben agregarse antes de la inferencia; no son muestras independientes")
    truth = frame.groupby(["sensor", "date"]).actual.nunique()
    if (truth > 1).any():
        raise ValueError("Objetivos incompatibles en comparaciones emparejadas")
    frame["loss"] = abs(frame.actual-frame.predicted)
    wide = frame.pivot(index=["sensor", "date"], columns="model", values="loss").dropna()
    daily = wide.groupby(level="date").mean()
    rng = np.random.default_rng(config.seed)
    comparisons, diagnostics = [], []
    for name, rows in frame.groupby("model"):
        residual = rows.assign(residual=rows.actual-rows.predicted).groupby("date").residual.mean()
        diagnostics.append({"model": name, **dependence(residual)})
    for a, b in combinations(sorted(daily.columns), 2):
        series = longest_run(daily[a]-daily[b])
        values = series.to_numpy(float)
        n = len(values)
        block = config.block_days
        blocks = values[:n//block*block].reshape(-1, block).mean(axis=1) if n >= block else np.array([])
        diag = dependence(series)
        adequate = n >= 30 and len(blocks) >= 10
        hac_p = wilcoxon_p = None
        hac_ci = None
        status = "insuficiente: exige ≥30 días consecutivos y ≥10 bloques; umbral preventivo, no análisis de potencia"
        if adequate and np.std(values) > 1e-12:
            # Newey–West covariance for intercept = mean paired loss difference.
            fitted = sm.OLS(values, np.ones((n, 1))).fit(cov_type="HAC", cov_kwds={"maxlags": block-1, "use_correction": True}, use_t=True)
            hac_p = float(fitted.pvalues[0])
            hac_ci = fitted.conf_int(alpha=config.alpha)[0].tolist()
            if np.any(blocks != 0):
                wilcoxon_p = float(stats.wilcoxon(blocks, alternative="two-sided").pvalue)
            status = "inferencia condicional: requiere estacionariedad y dependencia de alcance limitado"
        elif adequate:
            status = "diferencia constante: varianza degenerada, inferencia no disponible"
        effect = float(values.mean()) if n else None
        comparisons.append({"model_a": a, "model_b": b, "difference_mm": effect, "days": n,
                            "all_common_days": len(daily), "blocks": len(blocks), "block_days": block,
                            "bootstrap_ci": moving_interval(values, block, config.bootstrap_reps, rng, config.alpha),
                            "hac_ci": hac_ci, "p_hac": hac_p, "p_hac_holm": None,
                            "p_wilcoxon": wilcoxon_p, "p_wilcoxon_holm": None,
                            "difference_ljung_box_p": diag["ljung_box_p"], "status": status,
                            "practical_threshold_mm": config.practical_mm, "interpretation": ""})
    for key in ("p_hac", "p_wilcoxon"):
        eligible = [r for r in comparisons if r[key] is not None and np.isfinite(r[key])]
        # Count unavailable planned contrasts conservatively as p=1 for the correction family.
        if eligible:
            all_p = [r[key] if r[key] is not None else 1. for r in comparisons]
            adjusted = multipletests(all_p, alpha=config.alpha, method="holm")[1]
            for row, p in zip(comparisons, adjusted):
                if row[key] is not None:
                    row[key+"_holm"] = float(p)
    for row in comparisons:
        direction = "A tiene menor error" if row["difference_mm"] is not None and row["difference_mm"] < 0 else "B tiene menor error"
        if row["difference_mm"] == 0:
            direction = "errores medios iguales"
        row["interpretation"] = f"{direction} en este tramo; Δ = MAE(A) − MAE(B). "
        if row["p_hac_holm"] is None:
            row["interpretation"] += "No se puede concluir significancia. El intervalo bootstrap es exploratorio."
        else:
            significant = row["p_hac_holm"] < config.alpha
            row["interpretation"] += ("Diferencia estadística bajo los supuestos HAC; no prueba causalidad ni validación minera." if significant else "No se rechaza igualdad de error; eso no demuestra equivalencia.")
            if abs(row["difference_mm"]) < config.practical_mm:
                row["interpretation"] += " Magnitud inferior al umbral práctico configurado."
    return {"comparisons": comparisons, "diagnostics": diagnostics,
            "common_rows": len(wide), "common_days": len(daily), "alpha": config.alpha,
            "method": "Todas las parejas, mismas filas prisma/fecha; MAE diario con igual peso por fecha. Tramo consecutivo más largo. HAC Newey–West (lag bloque−1), Holm por familia; Wilcoxon de bloques como sensibilidad. Bootstrap móvil exploratorio. No se combinan p-valores de los dos métodos.",
            "assumptions": "No se cuentan sensores ni semillas como réplicas independientes. HAC requiere comportamiento suficientemente estacionario y dependencia corta; el bloque elegido no garantiza independencia. ACF/Ljung–Box son diagnósticos, no certificados. El test ya fue explorado: conclusiones retrospectivas."}
