"""One explanation contract for Streamlit and self-contained HTML reports."""
from html import escape
from datetime import datetime, timezone
import json
import numpy as np
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
from plotly.offline import get_plotlyjs
from backend.data import observations, describe_dataset, SOURCE, WARNINGS
from backend.training import LABELS

PHASES = ["1. Comprensión del negocio", "2. Comprensión de los datos · EDA",
          "3. Preparación de los datos", "4. Modelado · entrenamiento",
          "5. Evaluación · selección y estadísticas", "6. Despliegue · reportes"]
PALETTE = ["#2563eb", "#0d9488", "#e87923", "#7c3aed", "#db2777", "#64748b", "#16a34a", "#ca8a04"]


def section(phase, title, method, interpretation, limits, figure=None, table=None):
    if not all((title, method, interpretation, limits)):
        raise ValueError("Todo gráfico/tabla debe explicar método, lectura y límites")
    if figure is not None:
        figure.update_layout(template="plotly_white", height=380, margin=dict(l=35, r=25, t=35, b=40),
                              font=dict(family="Arial", size=13), colorway=PALETTE,
                              legend=dict(orientation="h", y=-.2), hovermode="closest")
    return dict(phase=phase, title=title, method=method, interpretation=interpretation,
                limits=limits, figure=figure, table=table)


def eda_sections(sensors=None, sensor=None, start=None, end=None, lag=2):
    source, audit = observations()
    frame = source[source.sensor.isin(sensors)] if sensors else source
    if frame.empty:
        raise ValueError("No hay prismas en la selección")
    sensor = sensor or frame.groupby("sensor").size().idxmax()
    detail = describe_dataset(sensor, start, end, lag)
    series = pd.DataFrame(detail["series"])
    series["date"] = pd.to_datetime(series.date)
    # Keep calendar holes as holes, rather than drawing through missing observations.
    series = series.set_index("date").reindex(pd.date_range(series.date.min(), series.date.max())).rename_axis("date").reset_index()
    chosen = source[source.sensor == sensor]
    quality = pd.DataFrame([{"Indicador": "Lecturas crudas de la fuente completa", "Valor": audit["raw_readings"]},
                            {"Indicador": "Lecturas diarias de la selección", "Valor": len(frame)},
                            {"Indicador": "Prismas seleccionados", "Valor": frame.sensor.nunique()},
                            {"Indicador": "Lluvia ausente en filas seleccionadas", "Valor": int(frame.rain.isna().sum())},
                            {"Indicador": "Lluvia cero real en filas seleccionadas", "Valor": int((frame.rain == 0).sum())},
                            {"Indicador": "Duplicados idénticos de la fuente", "Valor": audit["identical_duplicates"]},
                            {"Indicador": "Conflictos de tiempo de la fuente", "Valor": audit["conflicting_timestamps"]}])
    items = [section(2, "Calidad y procedencia de las observaciones", "Archivo público auditado por SHA-256; última observación de cada prisma/día.",
                     f"Se seleccionan {frame.sensor.nunique()} prismas con {len(frame)} observaciones diarias. Hay {int(frame.rain.isna().sum())} filas sin lluvia, distintas de {int((frame.rain == 0).sum())} ceros registrados.",
                     "Los conteos crudos y de duplicados corresponden a la fuente completa; la lluvia se repite entre prismas y no equivale a estaciones independientes. La calidad BOM N no certifica el sensor.", table=quality)]
    coverage = frame.groupby("sensor").date.agg(["min", "max", "size"]).reset_index()
    coverage["ausentes"] = (coverage["max"]-coverage["min"]).dt.days+1-coverage["size"]
    fig = px.bar(coverage, x="sensor", y=["size", "ausentes"], barmode="stack", labels={"value": "Días", "sensor": "Prisma", "variable": "Cobertura"})
    items.append(section(2, "Cobertura por prisma", "Días observados y ausentes dentro del período activo de cada prisma.",
                         f"La selección tiene {int(coverage.ausentes.sum())} días-prisma ausentes; no se interpolan desplazamientos.",
                         "No cuenta días anteriores a la instalación ni posteriores al último registro; cobertura no significa precisión instrumental.", figure=fig))
    summary = pd.DataFrame(detail["summary"])
    items.append(section(2, f"Resumen descriptivo · {sensor}", "Estadísticos de pandas sobre registros disponibles del prisma y filtro elegido; unidades: mm y horas.",
                         f"El resumen utiliza {len(pd.DataFrame(detail['series']))} fechas observadas. La columna count puede variar según los datos faltantes.",
                         "Son descripciones retrospectivas, no parámetros para normalizar entrenamiento ni umbrales de alarma.", table=summary))
    displacement = px.line(series, x="date", y="movement", markers=True, labels={"date": "Fecha", "movement": "Movimiento 3D publicado (mm)"})
    items.append(section(2, f"Movimiento observado · {sensor}", "Magnitud 3D publicada respecto al 20/11/2013, última lectura diaria; los huecos se conservan.",
                         f"El prisma cubre {chosen.date.min().date()} a {chosen.date.max().date()}. La curva muestra niveles acumulados, no velocidad ni factor de seguridad.",
                         "No representa deformación FEM ni radar LOS; cambiar el filtro no crea nuevas observaciones.", figure=displacement))
    increments = px.line(series, x="date", y="increment", markers=True, labels={"date": "Fecha", "increment": "Incremento entre días consecutivos (mm)"})
    items.append(section(2, "Incrementos diarios y variabilidad", "Diferencia entre observaciones consecutivas del mismo prisma; intervalos reales pueden diferir de 24 horas.",
                         f"Hay {int(series.increment.notna().sum())} incrementos utilizables en el filtro. Los picos señalan cambios que deben revisar sensor y contexto.",
                         "Un extremo no se considera error automáticamente; se preserva para evaluar episodios de movimiento.", figure=increments))
    rain = px.bar(series, x="date", y="rain", labels={"date": "Fecha de uso", "rain": "Lluvia disponible con desfase 2 (mm)"})
    items.append(section(2, "Lluvia disponible para pronóstico", "BOM 029167, acumulación de un día; solo lluvia con desfase conservador de dos fechas.",
                         "La gráfica conserva lluvia cero como valor real y ausencia como dato faltante. Se evita usar lluvia futura en las variables.",
                         "La estación no mide presión de poros ni lluvia exacta sobre cada prisma; desfase de disponibilidad no demuestra respuesta hidrológica.", figure=rain))
    scatter = px.scatter(series, x="rain_at_lag", y="increment", hover_data=["date"], labels={"rain_at_lag": f"Lluvia con desfase {lag} fechas (mm)", "increment": "Incremento (mm)"})
    items.append(section(2, f"Análisis cruzado lluvia–movimiento · desfase {lag}", "Se emparejan fechas exactas del mismo prisma; no se desplazan filas a través de huecos.",
                         f"Se muestran {len(series[['rain_at_lag', 'increment']].dropna())} pares completos. Una nube dispersa indica que lluvia sola no explica toda la variabilidad.",
                         "Asociación no implica causalidad; probar varios desfases después de mirar datos es exploratorio.", figure=scatter))
    matrix = pd.DataFrame(detail["correlations"]).pivot(index="y", columns="x", values="rho")
    heatmap = px.imshow(matrix, zmin=-1, zmax=1, color_continuous_scale="RdBu_r", text_auto=".2f", labels={"color": "ρ Spearman"})
    items.append(section(2, "Matriz de asociaciones Spearman", "Correlación de rangos con pares disponibles por variable del mismo prisma.",
                         "Valores próximos a ±1 indican asociación monotónica; cerca de cero, asociación monotónica débil. Los pares pueden tener distintos tamaños.",
                         "Niveles acumulados pueden compartir tendencia; correlaciones no son pruebas de superioridad ni mecanismos causales.", figure=heatmap))
    lagged = pd.DataFrame(detail["lagged"])
    items.append(section(2, "Asociación por desfase de lluvia", "Spearman entre lluvia pasada e incremento, desfases de 2 a 9 fechas calendario.",
                         "Permite comparar asociaciones temporales sin mezclar sensores. No se elige un desfase óptimo con el test final.",
                         "Sin ajuste por dependencia temporal: uso descriptivo, no confirmación estadística de hidrología.", table=lagged))
    normality = detail["normality"]
    if normality:
        text = "Se rechaza la forma normal bajo el supuesto de observaciones independientes." if normality["p"] < .05 else "No se rechaza la forma normal; no prueba normalidad."
        items.append(section(2, "Shapiro–Wilk de incrementos", "Prueba de forma de distribución de SciPy; se aplica al filtro actual.",
                             f"p = {normality['p']:.4g}. {text} Aquí el resultado es exploratorio por autocorrelación.",
                             "No decide qué algoritmo predice mejor ni acredita independencia; no se requiere normalidad de las variables para usar árboles o redes.", table=pd.DataFrame([normality])))
    return items


def build_sections(report):
    cfg, audit = report["config"], report["audit"]
    sections = [section(1, "Pregunta de investigación y criterio de éxito", "CRISP-DM: comprensión del negocio antes de explorar y modelar.",
                        cfg["business_goal"]+" Criterio: "+cfg["success_criterion"],
                        "Caso retrospectivo de una sola pared minera. El dataset termina antes de la falla y no valida alertas operacionales.",
                        table=pd.DataFrame([{"Campo": k, "Valor": str(v)} for k, v in report["source"].items()]))]
    sections += eda_sections(audit["selected_sensors"])
    preparation = pd.DataFrame([{"Partición original": k, "Ventanas": n, "Desde": audit["partition_dates"][k][0], "Hasta": audit["partition_dates"][k][1]} for k, n in audit["partitions"].items()])
    sections.append(section(3, "Datos preparados y separación temporal", "Ventanas consecutivas sin interpolación; filtros por prisma. Train y validación original forman desarrollo para CV anidada; test queda fuera.",
                            f"{report['final_train_n']} ventanas para el ajuste final y {report['test_n']} ventanas en {report['test_days']} fechas de prueba. Variables: {', '.join(audit['features'])}.",
                            "Ventanas se solapan y no son réplicas independientes. Lluvia faltante sigue la política configurada; IQR, si activo, se aprende dentro de cada entrenamiento.", table=preparation))
    policy = pd.DataFrame([{"Parámetro": key, "Valor": str(value)} for key, value in cfg.items()])
    sections.append(section(3, "Protocolo registrado", "Configuración persistida antes del entrenamiento, fuente y código identificados por hashes.",
                            f"Lluvia: {cfg['rain_policy']}; uso de lluvia: {cfg['use_rain']}; limpieza de extremos train: {cfg['remove_train_outliers']}. No se recortan objetivos de evaluación.",
                            "Los parámetros reflejan este experimento, no una recomendación geotécnica. Cambiar protocolo después de mirar resultados mantiene carácter exploratorio.", table=policy))
    folds = pd.DataFrame(report["folds"]).drop(columns=["bounds"])
    sections.append(section(4, "Validación cruzada temporal externa", "TimeSeriesSplit por fechas completas con gap de una fecha y purga de origen; ajuste Optuna en tres folds internos de cada train externo.",
                            f"{len(folds)} evaluaciones futuras con ventana de entrenamiento expansiva. Escaladores, selección de épocas e IQR no ven evaluación externa ni test final.",
                            "Los folds están relacionados por compartir historia; su desviación no es un intervalo de confianza. Los sensores son conocidos, no se evalúa transferencia a otra mina.", table=folds))
    timeline = []
    for f in report["folds"]:
        timeline += [{"Fold": str(f["fold"]), "Inicio": f["train_start"], "Fin": f["train_end"], "Rol": "Entrenamiento"},
                     {"Fold": str(f["fold"]), "Inicio": f["eval_start"], "Fin": f["eval_end"], "Rol": "Evaluación futura"}]
    fig = px.timeline(pd.DataFrame(timeline), x_start="Inicio", x_end="Fin", y="Fold", color="Rol")
    sections.append(section(4, "Calendario del backtesting", "Cada franja corresponde a un fold temporal externo, no una partición aleatoria.",
                            "Entrenar precede siempre a evaluar; los intervalos futuros no se usan para elegir hiperparámetros de ese fold.",
                            "Las ventanas de entrada pueden reutilizar pasado ya observado. La purga evita objetivos que cruzan límites, no elimina toda autocorrelación.", figure=fig))
    trials = pd.DataFrame(report["trials"])
    if not trials.empty:
        trials["params"] = trials.params.map(lambda v: json.dumps(v, ensure_ascii=False))
        trials["fold_mae"] = trials.fold_mae.map(str)
        sections.append(section(4, "Ajuste de hiperparámetros", "Optuna TPE minimiza media de MAE diario en tres folds internos; redes usan early stopping interno y reajuste posterior.",
                                f"Presupuesto por ajuste: {cfg['trials']} ensayos; máximo {cfg['epochs']} épocas para redes. Se conserva cada ensayo, no solo el elegido.",
                                "Un ensayo es una comprobación funcional, no búsqueda exhaustiva. Los mejores errores internos son optimistas y no sustituyen folds externos.", table=trials))
    scores = pd.DataFrame(report["outer_scores"])
    sections.append(section(4, "Repeticiones por semilla y fold", "Se reajusta cada algoritmo con las semillas registradas; los hiperparámetros del fold se eligen con la primera semilla.",
                            f"{cfg['repeats']} ejecuciones por algoritmo/fold. Las reglas y Ridge pueden no variar; las redes y árboles pueden variar.",
                            "Las semillas miden sensibilidad computacional, no aumentan el número de observaciones independientes. Estas filas no se usan como muestras de Wilcoxon.", table=scores))
    if report["learning"]:
        loss = pd.DataFrame(report["learning"])
        fig = px.line(loss, x="epoch", y="loss", color="model", line_dash="seed", labels={"epoch": "Época", "loss": "MSE del incremento normalizado"})
        sections.append(section(4, "Curvas de aprendizaje del ajuste final", "Keras: pérdida de entrenamiento, sin usar test para early stopping.",
                                "Una pérdida que disminuye indica ajuste a entrenamiento, no necesariamente mejor pronóstico futuro. Las épocas se eligieron en folds internos.",
                                "No hay curva de validación final: desarrollo completo se usa para reajustar. Las pérdidas normalizadas no son milímetros ni comparables directamente con MAE.", figure=fig))
    ranking = pd.DataFrame(report["ranking"])
    sections.append(section(5, "Selección del mejor algoritmo", report["selection_rule"],
                            f"Se eligió {LABELS[report['selected_model']]} con MAE diario externo {ranking.iloc[0].outer_daily_mae_mm:.3f} mm. Mejor red: {LABELS.get(report['best_neural_model'], 'no entrenada')}.",
                            "Ganador de este protocolo, no superioridad universal ni necesariamente estadística. El ensamble requiere todas sus semillas; no se obliga a que gane una red.", table=ranking))
    fig = px.bar(ranking, x="label", y="outer_daily_mae_mm", error_y="fold_std_mm", labels={"label": "Algoritmo", "outer_daily_mae_mm": "MAE diario externo (mm)"})
    sections.append(section(5, "Comparación de error externo", "Media de MAE diario entre folds externos; barras de dispersión = desviación estándar entre folds.",
                            "Menor altura es mejor. La dispersión muestra sensibilidad al período; no debe interpretarse como intervalo de confianza o significancia.",
                            "Se da igual peso a cada fold y fecha. Estos errores difieren del MAE que pondera cada ventana individual.", figure=fig))
    results = pd.DataFrame(report["test_results"])
    results["params"] = results.params.map(lambda v: json.dumps(v, ensure_ascii=False))
    results["exports"] = results.exports.map(lambda v: ', '.join(v))
    chosen = next(r for r in report["test_results"] if r["model"] == report["selected_model"])
    sections.append(section(5, "Resultados de prueba final", "Reajuste en desarrollo completo con parámetros elegidos por CV interna; pronóstico promedio de semillas. Test no selecciona modelos.",
                            f"El elegido tiene MAE por ventana {chosen['mae']:.3f} mm y MAE diario {chosen['daily_mae_mm']:.3f} mm. RMSE penaliza más los errores grandes; R² de incrementos mide dinámica.",
                            "R² alto de niveles puede deberse a persistencia de niveles acumulados. La prueba ya fue examinada históricamente: evaluación retrospectiva, no holdout virgen.", table=results))
    predictions = pd.DataFrame(report["test_predictions"])
    sensor = predictions[predictions.model == report["selected_model"]].groupby("sensor").size().idxmax()
    subset = predictions[predictions.sensor == sensor]
    actual = subset[subset.model == report["selected_model"]][["date", "actual"]].copy()
    chart = go.Figure()
    chart.add_trace(go.Scatter(x=actual.date, y=actual.actual, name="Observado", mode="lines+markers", line=dict(color="#111827", width=3)))
    for name, rows in subset.groupby("model"):
        chart.add_trace(go.Scatter(x=rows.date, y=rows.predicted, name=LABELS[name], mode="lines+markers"))
    chart.update_xaxes(title="Fecha objetivo")
    chart.update_yaxes(title="Movimiento 3D (mm)")
    sections.append(section(5, f"Pronósticos cruzados de prueba · {sensor}", "Todos los algoritmos sobre las mismas observaciones del prisma con mayor cobertura de prueba.",
                            "La distancia vertical respecto a Observado es el error. Coincidir con el nivel no implica anticipar aceleraciones; revise incrementos y residuos.",
                            "Este prisma ilustra el resultado, no resume toda la pared. No es una simulación física ni predicción de derrumbe.", figure=chart))
    daily = predictions.assign(error=lambda f: abs(f.actual-f.predicted)).groupby(["date", "model"], as_index=False).error.mean()
    fig = px.line(daily, x="date", y="error", color="model", markers=True, labels={"date": "Fecha", "error": "MAE diario (mm)"})
    sections.append(section(5, "Análisis cruzado de errores por fecha", "Media de error absoluto de los prismas disponibles por fecha y modelo.",
                            "Permite ver si varios modelos fallan en los mismos días o si una mejora depende de pocos episodios.",
                            "Las fechas tienen distinto número de prismas. Las condiciones compartidas y dependencia temporal impiden contar cada punto como independiente.", figure=fig))
    selected = predictions[predictions.model == report["selected_model"]]
    fig = px.scatter(selected, x="actual", y="predicted", hover_data=["sensor", "date"], labels={"actual": "Observado (mm)", "predicted": "Pronóstico (mm)"})
    low = float(min(selected.actual.min(), selected.predicted.min()))
    high = float(max(selected.actual.max(), selected.predicted.max()))
    fig.add_trace(go.Scatter(x=[low, high], y=[low, high], name="Ideal", mode="lines", line=dict(dash="dash", color="#111827")))
    sections.append(section(5, "Observado frente a pronóstico del elegido", "Dispersión de todas las ventanas de prueba; línea ideal y=x.",
                            f"Por encima de la diagonal sobreestima, por debajo subestima. Predicciones negativas sin recorte: {chosen['negative_predictions']}.",
                            "Muchas observaciones del mismo prisma se parecen; esta nube no demuestra independencia ni intervalos predictivos.", figure=fig))
    residual = selected.groupby("date", as_index=False).residual.mean()
    fig = px.line(residual, x="date", y="residual", markers=True, labels={"date": "Fecha", "residual": "Residuo medio observado−pronóstico (mm)"})
    fig.add_hline(y=0, line_dash="dash")
    sections.append(section(5, "Residuos del modelo elegido", "Residuo positivo indica subestimación; negativo, sobreestimación. Promedio por fecha.",
                            "Rachas del mismo signo sugieren sesgo temporal; revise los diagnósticos de dependencia antes de interpretar pruebas.",
                            "El promedio puede ocultar errores opuestos entre prismas. No se usa este gráfico para retocar el modelo con el test.", figure=fig))
    statistics = report["statistics"]
    diag = pd.DataFrame(statistics["diagnostics"]).drop(columns=["acf"])
    sections.append(section(5, "Diagnóstico de autocorrelación de residuos", "statsmodels ACF y Ljung–Box sobre el tramo diario consecutivo más largo; p Ljung–Box disponible desde 20 fechas.",
                            "Un p pequeño indica evidencia de dependencia bajo los supuestos de la prueba. Un p grande no acredita independencia. Con series cortas se declara no disponible.",
                            "El promedio por fecha controla pseudorreplicación espacial, pero no elimina dependencia temporal ni cambios de régimen.", table=diag))
    for diagnostic in statistics["diagnostics"]:
        if diagnostic["model"] == report["selected_model"] and diagnostic["acf"]:
            fig = px.bar(pd.DataFrame(diagnostic["acf"]), x="lag", y="rho", labels={"lag": "Retardo (días)", "rho": "Autocorrelación de residuo diario"})
            sections.append(section(5, "ACF del residuo del elegido", "Autocorrelación de statsmodels en fechas consecutivas; lag cero omitido.",
                                    "Barras grandes indican memoria de los errores. Sirve para revisar la elección de bloque, no para garantizar inferencia.",
                                    "Serie corta: coeficientes inestables. No incluye bandas de significancia ni justifica por sí sola un bloque óptimo.", figure=fig))
    comparisons = pd.DataFrame(statistics["comparisons"])
    if not comparisons.empty:
        shown = comparisons[["model_a", "model_b", "difference_mm", "days", "blocks", "bootstrap_ci", "hac_ci", "p_hac_holm", "p_wilcoxon_holm", "status", "interpretation"]].copy()
        for key in ("bootstrap_ci", "hac_ci"):
            shown[key] = shown[key].map(lambda x: str(x) if x else "No disponible")
        sections.append(section(5, "Pruebas estadísticas entre todas las parejas", statistics["method"],
                                f"{len(comparisons)} contrastes planificados. Δ negativo favorece A; positivo favorece B. α={statistics['alpha']}. Significancia no implica importancia práctica; umbral configurado {cfg['practical_mm']} mm.",
                                statistics["assumptions"]+" Mínimo preventivo: 30 días consecutivos y 10 bloques; no sustituye análisis de potencia. Sin datos suficientes no se inventan p-valores.", table=shown))
    for explanation in report["explanations"]:
        name = explanation["model"]
        if explanation["importance"]:
            table = pd.DataFrame(explanation["importance"]).sort_values("increase_mae_mm", ascending=False)
            fig = px.bar(table.head(12), x="increase_mae_mm", y="variable", orientation="h", labels={"increase_mae_mm": "Aumento de MAE al permutar (mm)", "variable": "Variable y retardo"})
            sections.append(section(5, f"Explicabilidad global · {LABELS[name]}", explanation["method"],
                                    f"Muestra las 12 mayores sensibilidades sobre {explanation['n']} ventanas externas. Un aumento positivo sugiere que el modelo utiliza esa entrada; negativo puede indicar ruido o redundancia.",
                                    explanation["limits"], figure=fig))
            sections.append(section(5, f"Importancias completas · {LABELS[name]}", explanation["method"],
                                    "Cada fila mide una variable en un retardo concreto. La desviación refleja variación entre permutaciones, no incertidumbre poblacional.",
                                    explanation["limits"], table=table))
            sections.append(section(5, f"Sensibilidad local · {LABELS[name]}", "Se reemplaza una trayectoria por medianas del entrenamiento y se recalcula el mismo pronóstico, con las otras entradas fijas.",
                                    f"Ejemplo: prisma {explanation['sensor']}, fecha {explanation['date']}. El signo del cambio indica hacia dónde se mueve la predicción al reemplazar esa entrada.",
                                    explanation["limits"]+" Una sustitución hipotética no describe una intervención física realizable.", table=pd.DataFrame(explanation["local"])))
        else:
            sections.append(section(5, f"Explicación de la regla · {LABELS[name]}", "Modelo determinista sin pesos entrenados.", explanation["rule"],
                                    "Una regla explicable también puede fallar durante aceleraciones; no necesita un archivo H5.", table=pd.DataFrame([{"Algoritmo": LABELS[name], "Regla": explanation["rule"]}])))
    sections.append(section(6, "Exportación reproducible y límites del caso", "ZIP con modelos, preprocesamiento, configuración, predicciones por semilla y ensamble, hashes, versiones y reporte HTML autosuficiente.",
                            f"Duración de cómputo antes de renderizar reporte: {report['duration_seconds']:.1f} s. {report['ensemble_rule']} Modelos H5 recargados y comparados numéricamente.",
                            "Despliegue CRISP-DM aquí significa entrega reproducible, no puesta en servicio en mina. Cargar modelos solo de fuentes confiables.",
                            table=pd.DataFrame([{"Límite": w} for w in WARNINGS])))
    return sections


def export_html(sections, report=None):
    body = []
    for item in sections:
        content = ""
        if item["figure"] is not None:
            content += item["figure"].to_html(full_html=False, include_plotlyjs=False, config={"responsive": True, "displaylogo": False})
        if item["table"] is not None:
            content += '<div class="table">'+item["table"].fillna("No disponible").to_html(index=False, escape=True, na_rep="No disponible", float_format=lambda x: f"{x:.5g}")+"</div>"
        body.append(f'<section><small>{escape(PHASES[item["phase"]-1])}</small><h2>{escape(item["title"])}</h2>{content}<p><b>Método:</b> {escape(item["method"])}</p><p><b>Interpretación:</b> {escape(item["interpretation"])}</p><p class="limits"><b>Límites:</b> {escape(item["limits"])}</p></section>')
    metadata = "" if report is None else f'<p>Experimento: {escape(report["config"]["name"])}. Elegido por CV externa: {escape(LABELS[report["selected_model"]])}.</p>'
    return '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Century CRISP-DM — reporte</title><style>body{font:16px Arial;background:#f4f6fa;color:#182338;max-width:1280px;margin:30px auto;padding:20px}section{background:white;border:1px solid #dde3ed;border-radius:12px;padding:24px;margin:20px 0}h1{font-size:32px}h2{font-size:22px}small{color:#2563eb}p{line-height:1.55}.limits{color:#68522d;background:#fff9ed;padding:12px}.table{overflow:auto}table{border-collapse:collapse;font-size:13px;width:100%}th,td{border-bottom:1px solid #dde3ed;padding:9px;text-align:left}th{background:#eef2fa}@media print{body{background:white;margin:0}section{break-inside:avoid}.table{overflow:visible}table{font-size:10px}}</style><script>'+get_plotlyjs()+'</script></head><body><h1>Century Lab · CRISP-DM</h1>'+metadata+f'<p>Fuente: <a href="{SOURCE["url"]}">{escape(SOURCE["doi"])}</a>, {escape(SOURCE["license"])}. Generado {datetime.now(timezone.utc).isoformat()}. Las explicaciones se comparten con la vista Streamlit.</p>'+"".join(body)+"</body></html>"


def export_markdown(sections, report):
    text = ["# Century Lab · CRISP-DM", f"Fuente: {SOURCE['url']} · {SOURCE['license']}",
            "Las figuras interactivas y todas sus explicaciones están en report.html (abre sin internet). Este resumen conserva tablas y narrativa."]
    for item in sections:
        text += [f"## {PHASES[item['phase']-1]} — {item['title']}", "Método: "+item["method"],
                 "Interpretación: "+item["interpretation"], "Límites: "+item["limits"]]
        if item["table"] is not None:
            text.append("```text\n"+item["table"].to_string(index=False, na_rep="No disponible")+"\n```")
    return "\n\n".join(text)

