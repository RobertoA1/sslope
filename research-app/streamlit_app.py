"""Run: .venv/bin/python -m streamlit run streamlit_app.py --server.port 8501"""
import os
from pathlib import Path
import json
import sys
import atexit
import pandas as pd
import streamlit as st

APP_ROOT = Path(__file__).resolve().parent
if str(APP_ROOT) not in sys.path:
    sys.path.insert(0, str(APP_ROOT))
# Separate process, database, jobs and results from Next.js and the article.
os.environ.setdefault("CENTURY_LAB_RUNTIME", str(APP_ROOT/"streamlit-runtime"))
from backend import jobs
from backend.data import observations, SOURCE, WARNINGS
from backend.training import LABELS
from crisp.config import CrispConfig, preview, selected_data
from crisp.presentation import PHASES, section, eda_sections, build_sections, export_html

st.set_page_config(page_title="Century Lab · CRISP-DM", page_icon="⛰️", layout="wide")
st.markdown("""<style>.block-container{padding-top:2rem;max-width:1500px}h1{letter-spacing:-.04em}h2{font-size:1.5rem}div[data-testid=stSidebar]{background:#eef2f9}div[data-testid=stVerticalBlockBorderWrapper]{border-radius:12px}button{border-radius:8px!important}</style>""", unsafe_allow_html=True)


@st.cache_resource
def initialize():
    jobs.initialize(recover=True)
    atexit.register(jobs.shutdown)
    return True


@st.cache_data
def load_report(job_id):
    report = json.loads((jobs.RUNTIME/job_id/"report.json").read_text(encoding="utf-8"))
    return report, build_sections(report)


def render(item):
    st.session_state.current_sections.append(item)
    with st.container(border=True):
        st.subheader(item["title"])
        if item["figure"] is not None:
            st.plotly_chart(item["figure"], width="stretch", config={"displaylogo": False})
        if item["table"] is not None:
            st.dataframe(item["table"], hide_index=True, width="stretch")
        st.markdown("**Método.** "+item["method"])
        st.markdown("**Interpretación.** "+item["interpretation"])
        st.caption("Límites. "+item["limits"])


@st.fragment(run_every="3s")
def history():
    jobs.refresh()
    all_jobs = jobs.list_jobs()
    active = next((j for j in all_jobs if j["status"] in {"running", "queued"}), None)
    if active:
        st.progress(min(float(active["progress"])/100, 1), text=active["message"])
        if st.button("Cancelar entrenamiento", key="cancel_active"):
            jobs.cancel(active["id"])
            st.rerun()
    else:
        st.caption("Sin entrenamiento activo. Los resultados previos se conservan.")
    if st.button("Actualizar resultados", key="refresh_results"):
        st.rerun()


initialize()
if "config" not in st.session_state:
    st.session_state.config = CrispConfig().model_dump()
cfg = CrispConfig(**st.session_state.config)
data, source_audit = observations()
sensors = sorted(data.sensor.unique())
with st.sidebar:
    st.title("Century Lab")
    st.caption("Python · Streamlit · CRISP-DM")
    phase = st.radio("Fase de la metodología", PHASES, key="phase")
    st.divider()
    st.caption("Datos reales: West Wall, Century Mine (Australia).")
    st.link_button("Fuente y licencia del dataset", SOURCE["url"])
    history()
    completed = [j for j in jobs.list_jobs() if j["status"] == "completed" and (jobs.RUNTIME/j["id"]/"report.json").exists()]
    chosen_id = st.selectbox("Experimento para consultar", [j["id"] for j in completed],
                             format_func=lambda value: next(j["name"] for j in completed if j["id"] == value),
                             key="chosen_report") if completed else None
    with st.expander("Historial y diagnósticos"):
        for job in jobs.list_jobs()[:12]:
            st.write(job["name"]+" · "+job["status"])
            st.caption(job["message"])

st.title("Laboratorio de pronóstico con datos reales")
st.caption("Century Mine / West Wall · pronóstico del movimiento 3D del próximo día calendario · evaluación retrospectiva")
st.warning("No es un sistema de alertas validado en mina. El período ya fue explorado: los resultados no constituyen una prueba confirmatoria independiente.")
st.header(phase)
st.session_state.current_sections = []

if phase == PHASES[0]:
    st.write("Pregunta: ¿qué técnica pronostica mejor el próximo movimiento diario de los prismas, con qué incertidumbre y qué información utiliza?")
    with st.form("business"):
        goal = st.text_area("Objetivo del estudio", cfg.business_goal)
        criterion = st.text_area("Criterio de éxito", cfg.success_criterion)
        if st.form_submit_button("Guardar objetivo y criterio"):
            st.session_state.config = cfg.model_copy(update={"business_goal": goal, "success_criterion": criterion}).model_dump()
            st.success("Se incluirán en el próximo experimento y su reporte.")
    render(section(1, "Correspondencia con CRISP-DM", "Seis fases oficiales; EDA, entrenamiento, selección, CV, estadísticas y reportes se distribuyen dentro de ellas.",
                   "Primero se fija la pregunta; luego se comprenden/preparan los datos, se modela, se evalúa y se entrega un paquete reproducible.",
                   "Despliegue es entrega de resultados, no uso operativo en una mina. El proceso es iterativo, no seis pasos irreversibles.",
                   table=pd.DataFrame({"Fase": PHASES, "Entregable": ["Objetivo, criterio y alcance", "EDA, calidad y análisis cruzado", "Limpieza, variables, particiones", "Optuna, redes y CV temporal anidada", "Ranking, prueba final, explicabilidad y estadísticas", "HTML, Markdown, ZIP, modelos y trazabilidad"]})))
    for warning in WARNINGS:
        st.caption(warning)

elif phase == PHASES[1]:
    with st.container(border=True):
        left, middle, right = st.columns(3)
        allowed = cfg.sensors or sensors
        default_sensor = data[data.sensor.isin(allowed)].groupby("sensor").size().idxmax()
        sensor = left.selectbox("Prisma para EDA", allowed, index=allowed.index(default_sensor))
        dates = middle.date_input("Período del gráfico", value=(data.date.min().date(), data.date.max().date()),
                                  min_value=data.date.min().date(), max_value=data.date.max().date())
        lag = right.slider("Desfase para análisis cruzado (fechas)", 2, 9, 2)
    if len(dates) == 2:
        try:
            items = eda_sections(allowed, sensor, dates[0].isoformat(), dates[1].isoformat(), lag)
            for item in items:
                render(item)
            st.download_button("Descargar este EDA con explicaciones (HTML)", export_html(items).encode(), "century-eda.html", "text/html")
        except ValueError as error:
            st.error(str(error))

elif phase == PHASES[2]:
    st.info("Los parámetros se cambian en Modelado. Esta vista permite auditar la selección y la limpieza antes de entrenar.")
    try:
        audit, fold_info = preview(cfg)
        _, _, cleaned = selected_data(cfg)
        counts = pd.DataFrame([{"Partición": k, "Ventanas": v, "Fechas": " → ".join(audit["partition_dates"][k])} for k, v in audit["partitions"].items()])
        render(section(3, "Particiones de las ventanas", "Solo secuencias de fechas consecutivas; variables disponibles hasta el origen. Prismas elegidos en Modelado.",
                       "Train y validación original forman desarrollo. Cada fold vuelve a ajustar normalización y limpieza; test no ajusta ni selecciona.",
                       "No son observaciones independientes. Al quitar lluvia cambia la cohorte de ventanas: comparar ablations exige emparejar filas.", table=counts))
        render(section(3, "Auditoría de preparación", "Conteos de exclusión de la preparación general y selección explícita de sensores.",
                       f"Variables: {', '.join(audit['features'])}. Filas con lluvia imputada en la preparación general: {audit['rain_imputed_rows']}.",
                       "Los conteos de exclusiones generales preceden al filtro de prismas. IQR, si habilitado, se recomputa por fold y nunca recorta objetivos de evaluación.",
                       table=pd.DataFrame([{"Regla general": k, "Exclusiones": v} for k, v in audit["exclusions"].items()])))
        render(section(3, "Plan de folds y límites IQR locales", "Entrenamiento externo limpio únicamente con sus propios objetivos; ajuste interno usa sus propios umbrales.",
                       "Los límites cambian entre folds si se activa limpieza. Esto impide aprender umbrales mirando el futuro.",
                       "Un extremo puede ser geotécnicamente importante; no se elimina de evaluación. Limpieza puede alterar cobertura de sensores.", table=pd.DataFrame(fold_info)))
        sample = cleaned[["sensor", "date", "movement", "increment", "interval", "rain", "rain_imputed"]].head(100)
        render(section(3, "Muestra de observaciones preparadas", "Primeras 100 filas de la selección; los valores originales de movimiento no se sobrescriben.",
                       "rain_imputed identifica arrastre de lluvia pasada cuando se elige esa política. Cero y faltante se mantienen distintos.",
                       "Es una muestra de inspección, no todo el dataset. No se interpola movimiento ni se inventan datos reales.", table=sample))
        st.download_button("Descargar observaciones preparadas (CSV)", cleaned.to_csv(index=False).encode(), "century-prepared.csv", "text/csv")
    except ValueError as error:
        st.error(str(error))

elif phase == PHASES[3]:
    st.write("Selecciona datos y técnicas. El entrenamiento corre en otro proceso; puedes consultar otras fases mientras avanza.")
    with st.form("training"):
        name = st.text_input("Nombre del experimento", cfg.name)
        all_sensors = st.checkbox("Usar todos los prismas disponibles", value=not bool(cfg.sensors))
        selected_sensors = st.multiselect("Prismas específicos (si no se usan todos)", sensors, default=cfg.sensors)
        models = st.multiselect("Técnicas a comparar (persistencia siempre incluida)", list(LABELS), default=cfg.models,
                               format_func=lambda value: LABELS[value])
        a, b, c = st.columns(3)
        train_end = a.date_input("Corte train original", pd.Timestamp(cfg.train_end).date())
        validation_end = b.date_input("Fin desarrollo / corte validación original", pd.Timestamp(cfg.validation_end).date())
        test_end = c.date_input("Fin de prueba final", pd.Timestamp(cfg.test_end).date())
        a, b, c = st.columns(3)
        lookback = a.slider("Ventana de historia (días)", 2, 14, cfg.lookback)
        trials = b.slider("Ensayos Optuna por ajuste", 1, 12, cfg.trials)
        epochs = c.slider("Máximo de épocas de redes", 2, 100, cfg.epochs)
        a, b, c = st.columns(3)
        outer = a.slider("Folds temporales externos", 3, 5, cfg.outer_folds)
        repeats = b.slider("Semillas / miembros del ensamble", 1, 5, cfg.repeats)
        seed = c.number_input("Semilla inicial", min_value=0, max_value=2**31-10, value=cfg.seed)
        a, b, c = st.columns(3)
        rain_policy = a.selectbox("Lluvia faltante", ["drop", "past_fill"], index=0 if cfg.rain_policy == "drop" else 1,
                                   format_func=lambda v: "Excluir ventana incompleta" if v == "drop" else "Arrastrar pasado máximo 2 fechas")
        use_rain = b.checkbox("Incluir lluvia disponible", cfg.use_rain)
        remove = c.checkbox("Excluir extremos de train (3×IQR)", cfg.remove_train_outliers)
        a, b, c = st.columns(3)
        block = a.slider("Bloque estadístico (días)", 2, 7, cfg.block_days)
        bootstrap = b.select_slider("Réplicas bootstrap exploratorio", [500, 1000, 2000, 5000], cfg.bootstrap_reps)
        practical = c.number_input("Mejora mínima de interés (mm)", min_value=0., max_value=100., value=cfg.practical_mm)
        st.caption("El bloque debe justificarse antes de interpretar inferencia. Se requieren ≥30 fechas consecutivas y ≥10 bloques para p-valores, pero eso no garantiza potencia ni validez.")
        review = st.form_submit_button("Revisar protocolo", width="stretch")
        launch = st.form_submit_button("Entrenar y comparar", type="primary", width="stretch")
    if review or launch:
        try:
            if not all_sensors and not selected_sensors:
                raise ValueError("Seleccione al menos un prisma")
            values = dict(cfg.model_dump(), name=name, models=models, sensors=[] if all_sensors else selected_sensors,
                          train_end=train_end.isoformat(), validation_end=validation_end.isoformat(), test_end=test_end.isoformat(),
                          lookback=lookback, trials=trials, epochs=epochs, outer_folds=outer, repeats=repeats, seed=seed,
                          rain_policy=rain_policy, use_rain=use_rain, remove_train_outliers=remove,
                          block_days=block, bootstrap_reps=bootstrap, practical_mm=practical)
            candidate = CrispConfig(**values)
            if len(candidate.models) < 2:
                raise ValueError("Seleccione al menos otra técnica además de persistencia")
            audit, folds = preview(candidate)
            st.session_state.config = candidate.model_dump()
            st.success(f"Protocolo viable: {candidate.outer_folds} folds externos y {sum(audit['partitions'].values())} ventanas seleccionadas.")
            render(section(4, "Folds del protocolo revisado", "Cortes cronológicos, purga de origen y ajuste interno anterior a cada evaluación.",
                           "La tabla permite comprobar que cada evaluación está en el futuro de su entrenamiento.",
                           "No usar KFold aleatorio en estas series; ampliar cómputo no amplía el período real observado.", table=pd.DataFrame(folds)))
            if launch:
                job = jobs.create(candidate, worker_module="crisp.worker")
                st.success("Entrenamiento iniciado: "+job["name"]+". Consulta el progreso en el panel izquierdo; al terminar pulsa Actualizar resultados.")
        except Exception as error:
            st.error(str(error))

    if chosen_id:
        saved_report, saved_items = load_report(chosen_id)
        with st.expander("Resultados de entrenamiento y CV del experimento seleccionado"):
            for item in saved_items:
                if item["phase"] == 4:
                    render(item)

elif phase == PHASES[4]:
    if not chosen_id:
        st.info("Todavía no hay resultados CRISP-DM. Ejecuta un experimento en Modelado; no se muestran cifras inventadas.")
    else:
        report, items = load_report(chosen_id)
        st.success("Elegido por validación externa: "+LABELS[report["selected_model"]])
        view = st.radio("Vista de evaluación", ["Comparaciones", "Pruebas estadísticas", "Explicabilidad"], horizontal=True)
        selected = [i for i in items if i["phase"] == 5]
        for item in selected:
            is_stats = any(word in item["title"] for word in ("estadísticas", "autocorrelación", "ACF"))
            is_explain = any(word in item["title"] for word in ("Explicabilidad", "Importancias", "Sensibilidad", "Explicación de la regla"))
            if (view == "Pruebas estadísticas" and is_stats) or (view == "Explicabilidad" and is_explain) or (view == "Comparaciones" and not is_stats and not is_explain):
                render(item)

else:
    if not chosen_id:
        st.info("Entrena primero para generar reportes y exportar modelos. En EDA también puedes descargar un informe del filtro actual.")
    else:
        report, items = load_report(chosen_id)
        folder = jobs.RUNTIME/chosen_id
        st.write("El HTML es autosuficiente: contiene todas las figuras interactivas, tablas, métodos, interpretaciones y límites. No necesita conexión a internet.")
        a, b, c = st.columns(3)
        a.download_button("Reporte completo HTML", (folder/"report.html").read_bytes(), "century-crisp-dm.html", "text/html", type="primary")
        b.download_button("Resumen Markdown", (folder/"report.md").read_bytes(), "century-crisp-dm.md", "text/markdown")
        c.download_button("Paquete reproducible ZIP", (folder/"experiment.zip").read_bytes(), "century-experiment.zip", "application/zip")
        for item in items:
            if item["phase"] == 6:
                render(item)
        exports = []
        for name, files in report["artifacts"].items():
            for file in files:
                exports.append({"Algoritmo": LABELS[name], "Archivo": file, "Elegido": name == report["selected_model"], "Mejor red": name == report["best_neural_model"]})
        render(section(6, "Archivos de modelos", "Redes en H5 y Keras; modelos clásicos en joblib; cada semilla conserva su preprocesamiento.",
                       report["ensemble_rule"], "La mejor red puede perder frente a persistencia. Un H5 solo no incluye todo el preprocesamiento ni representa el ensamble.", table=pd.DataFrame(exports)))
        for name, files in report["artifacts"].items():
            if files:
                with st.expander("Descargar "+LABELS[name]):
                    for file in files:
                        st.download_button(file, (folder/file).read_bytes(), file, "application/octet-stream", key=file)
        report_phase = st.selectbox("Previsualizar una fase del reporte", PHASES)
        for item in items:
            if item["phase"] == PHASES.index(report_phase)+1:
                render(item)



if st.session_state.current_sections:
    st.divider()
    st.download_button("Descargar vista actual con explicaciones (HTML)",
                       export_html(st.session_state.current_sections).encode("utf-8"),
                       "century-vista-explicada.html", "text/html", key="view_report")

