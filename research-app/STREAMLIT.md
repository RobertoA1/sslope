# Century Lab en Python y Streamlit

Aplicación de investigación separada del gemelo digital y de la interfaz Next.js. Usa observaciones reales publicadas de West Wall, Century Mine (Australia), sin fabricar desplazamientos ni datos FEM. No necesita servidor FastAPI, Node.js ni clave OpenAI.

## Abrir

Desde `research-app/`, con Python 3.11:

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements-streamlit.txt
.venv/bin/python -m streamlit run streamlit_app.py
```

Si el entorno ya está instalado, basta el último comando. Abre http://127.0.0.1:8501. El servidor se limita a localhost. El historial, trabajadores y artefactos se guardan en `streamlit-runtime/`, independiente de `runtime/` del laboratorio anterior. No ejecutes dos servidores Streamlit contra el mismo historial.

## Recorrido CRISP-DM

1. **Comprensión del negocio:** registrar pregunta y criterio de éxito antes de modelar. El objetivo es pronosticar magnitud 3D del próximo día mediante su incremento, no clasificar derrumbes ni determinar factor de seguridad.
2. **Comprensión de datos / EDA:** calidad, cobertura, estadísticas, movimiento, incrementos, lluvia, análisis cruzado por fechas, Spearman y Shapiro descriptivo. Seleccionar prisma, período y desfase. Descargar el HTML de ese EDA.
3. **Preparación:** inspeccionar políticas de lluvia, datos seleccionados, ventanas consecutivas, particiones y límites IQR por fold. Originales intactos; lluvia cero no es ausencia. Descargar CSV preparado.
4. **Modelado:** seleccionar todos los prismas o un subconjunto, algoritmos, ventanas, fechas, ensayos, épocas y semillas. Revisar protocolo y entrenar. El entrenamiento va en un proceso independiente, con progreso y cancelación. El historial conserva fracasos y diagnóstico. Al terminar, pulsar **Actualizar resultados**.
5. **Evaluación:** consultar tres vistas: comparaciones, pruebas estadísticas y explicabilidad. El ganador se elige con CV externa, no con prueba final. La mejor red se identifica por separado: puede perder frente a una regla sencilla.
6. **Despliegue / reportes:** entregar HTML autosuficiente con gráficos interactivos, tablas, métodos, interpretación y límites; resumen Markdown; ZIP con todos los artefactos. Despliegue en este caso significa entregar un experimento reproducible, no activar alertas en mina.

En Modelado se pueden desplegar resultados históricos de entrenamiento y CV. Todas las visualizaciones utilizan un contrato compartido de explicación en `crisp/presentation.py`; el reporte HTML y Streamlit muestran la misma narrativa para esos elementos. El resumen Markdown remite al HTML para las figuras interactivas.

## Datos seleccionados

Fuente: Tjaart de Wit, Colorado School of Mines, DOI [10.5281/zenodo.15003054](https://zenodo.org/records/15003054), licencia CC-BY-4.0. Archivo propio `data/century/Data.zip`, validado por SHA-256:

```text
b0d3eca632c5c7831d391f6f90b4d88b1a7384b3eb596c19ddaaf64147a24d22
```

Se selecciona `radar-deformation-data/West Wall Prism Movements - 3 months to 20-Feb-14.csv`: 7.178 lecturas crudas, 3.163 observaciones diarias y 49 prismas. No se mezclan South West y West Wall: referencias y contratos diferentes.

Movimiento en mm desde 20/11/2013; no es radar LOS. Se usa la última lectura disponible por prisma/día, con intervalo observado en horas. Pronóstico al próximo día calendario, no exactamente 24 horas. Zona horaria del registro no confirmada. Lluvia BOM 029167 solo con acumulaciones diarias válidas y desfase conservador de dos fechas. Calidad N no es certificado de precisión. No hay presión de poros real.

## Protocolo temporal anidado

- Cortes por defecto: train original hasta 31/01/2014; validación original hasta 10/02; prueba final hasta 20/02. Train + validación original forman **desarrollo** para este nuevo motor. Cohorte original: 783/198/231 ventanas, con historia de seis fechas y cuatro variables. Cambiar selección/limpieza puede cambiar cobertura.
- CV externa: `TimeSeriesSplit` sobre fechas objetivo completas, gap de una fecha y purga de orígenes que cruzan el límite. Se conserva suficiente historia inicial para CV interna; tamaño externo máximo diez fechas objetivo, calculado antes de evaluar. La vista previa rechaza selecciones inviables. Fechas ausentes no se rellenan.
- Dentro de cada train externo: Optuna TPE sobre tres folds internos, con igual presupuesto por algoritmo. Normalización e IQR se aprenden exclusivamente en el train que corresponde. Early stopping de redes solo interno; se reajusta con las épocas elegidas antes de evaluar fuera.
- Repeticiones por semilla con hiperparámetros del fold fijos. No se consideran muestras independientes. Se promedian sus pronósticos para formar un ensamble por algoritmo.
- Selección: menor **media entre folds externos del MAE diario del ensamble**, con igual peso para cada fold y fecha. No es el MAE agrupado por ventanas; ambos se muestran con nombres distintos.
- Se guarda `selection.json` antes del ajuste final. Reajuste final en todo desarrollo, con otro ajuste interno. El test final no decide hiperparámetros, épocas, limpieza ni ganador.
- Los reportes de explicabilidad corresponden a la primera semilla del último fold externo, no al ensamble final. Esto se identifica expresamente.

Los folds y ventanas comparten historia; su desviación estándar **no es un intervalo de confianza**. El test ya fue examinado en trabajos previos: no es un holdout virgen. Se puede presentar como evaluación retrospectiva/exploratoria, no como verificación confirmatoria independiente.

## Pruebas estadísticas y sus supuestos

Se comparan **todas las parejas** de algoritmos sobre la intersección de las mismas filas prisma/fecha. Errores absolutos se promedian por fecha. La unidad temporal no se multiplica por cantidad de sensores o semillas.

- Efecto: Δ = MAE diario(A) − MAE diario(B), en mm; negativo favorece A. Se distingue significancia estadística del umbral de interés práctico configurado.
- Inferencia sobre el tramo consecutivo más largo, sin unir huecos: media de diferencias con covarianza **HAC Newey–West** de statsmodels, retardo = tamaño del bloque − 1; intervalo y p condicionales a supuestos de dependencia corta y estabilidad suficiente.
- **Holm** ajusta todos los contrastes planificados en esa familia; comparaciones no disponibles cuentan conservadoramente como p=1. Wilcoxon de medias de bloques no solapados se informa como sensibilidad, con su propia corrección Holm. No se selecciona el p más favorable entre métodos ni se combinan p-valores.
- **Bootstrap móvil** de bloques consecutivos, semilla y réplicas persistidas; intervalo etiquetado exploratorio, especialmente en períodos cortos.
- **ACF y Ljung–Box** de residuos diarios para diagnóstico. Ljung–Box disponible desde veinte fechas; un p grande no certifica independencia. No determina automáticamente un bloque óptimo.
- Umbral preventivo para p-valores: al menos treinta fechas consecutivas y diez bloques completos. **No es análisis de potencia ni garantía de validez**; tamaño de bloque y supuestos deben justificarse para el paper. Diferencias constantes/varianza degenerada se dejan sin inferencia.

La prueba por defecto tiene nueve fechas: los p-valores de comparación se dejan **no disponibles**. No se inventa significancia. Shapiro–Wilk y Spearman son descriptivos por dependencia de datos; Shapiro no sirve para elegir modelos. No se aplica ANOVA/Friedman sobre ventanas o semillas tratadas artificialmente como independientes.

## Interpretabilidad y explicabilidad

Cada gráfico/tabla se acompaña de **método**, **interpretación** y **límites**, tanto en pantalla como en HTML. Las narrativas se construyen a partir de los resultados, sin requerir un LLM ni enviar datos a un proveedor.

- Reglas de persistencia y tendencia explicadas algebraicamente.
- `sklearn.inspection.permutation_importance` sobre incrementos de evaluación externa: aumento de MAE por variable y retardo, tres repeticiones. La variación entre permutaciones no es intervalo estadístico.
- Sensibilidad local: sustituir una trayectoria de entrada por medianas del entrenamiento, manteniendo la referencia actual fija. Se observa el cambio del pronóstico del mismo ejemplo.

No es SHAP ni causalidad. Permutar puede romper relaciones temporales/físicas; entradas correlacionadas comparten importancia. La sustitución por medianas puede ser irreal. Los gráficos se explican sin afirmar mecanismos geotécnicos que el dataset no mide.

## Reportes y modelos

`streamlit-runtime/<uuid>/` contiene:

- `config.json`, `data-audit.json`, `selection.json`, `report.json`, `explanations.json`.
- `cleaned-daily.csv`, `ensemble-predictions.csv`, `predictions-by-seed.csv`.
- `report.html` autosuficiente (Plotly incluido, no CDN), `report.md`, `experiment.zip`.
- Redes `<modelo>-seed<semilla>.h5` y `.keras`, con `<modelo>-seed<semilla>-preprocessing.json`.
- Modelos clásicos `.joblib`; baselines sin pesos entrenados.
- `ensemble.json` con la regla y todos los miembros. **Un H5 individual no representa el ensamble**. Deben promediarse pronósticos de todos los miembros tras aplicar su preprocesamiento.
- Versiones de librerías y hashes SHA-256 del código y datos para reconstrucción.

Los H5 se recargan y sus pronósticos se comparan numéricamente antes de completar un experimento. No cargar joblib/H5 de fuentes no confiables. El ZIP no contiene el dataset bruto: conservar la fuente original y verificar su hash.

## Archivos de implementación

- `streamlit_app.py`: seis fases, controles, visualizaciones, historial, cancelación y descargas.
- `crisp/config.py`: configuración validada, selección y particiones temporales locales.
- `crisp/engine.py`: Optuna, CV anidada, repeticiones, selección, exportación y explicabilidad.
- `crisp/statistics.py`: emparejamiento, HAC/Holm, Wilcoxon por bloques, bootstrap, ACF/Ljung–Box.
- `crisp/presentation.py`: figuras y narrativas compartidas, HTML y Markdown.
- `crisp/worker.py`: proceso CPU con progreso y cancelación.
- `crisp/test_crisp.py`: contratos de datos, prevención de fuga temporal, supuestos y reportes.
- `backend/data.py`, `backend/training.py`: carga y bibliotecas de entrenamiento reutilizadas.
- `backend/jobs.py`: SQLite y gestor de trabajos reutilizado con trabajador alternativo; el valor por defecto conserva comportamiento del laboratorio Next.js.

Verificación:

```bash
.venv/bin/python -m pytest crisp/test_crisp.py backend/test_lab.py -q
.venv/bin/python -m pip check
```

Las pruebas de software no equivalen a validación científica en mina. Una demostración con un ensayo y dos épocas valida el flujo, no la superioridad de una técnica.

## Referencias metodológicas y de bibliotecas

- [CRISP-DM, IBM](https://www.ibm.com/docs/en/spss-modeler/saas?topic=dm-crisp-help-overview).
- [CV anidada, scikit-learn](https://scikit-learn.org/stable/auto_examples/model_selection/plot_nested_cross_validation_iris.html).
- [TimeSeriesSplit](https://scikit-learn.org/stable/modules/generated/sklearn.model_selection.TimeSeriesSplit.html).
- [Importancia por permutación](https://scikit-learn.org/stable/modules/permutation_importance.html).
- [Covarianza robusta HAC, statsmodels](https://www.statsmodels.org/stable/generated/statsmodels.regression.linear_model.OLSResults.get_robustcov_results.html).
- [Ljung–Box](https://www.statsmodels.org/stable/generated/statsmodels.stats.diagnostic.acorr_ljungbox.html).
- [Holm y multipletests](https://www.statsmodels.org/stable/generated/statsmodels.stats.multitest.multipletests.html).
- [Wilcoxon, SciPy](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.wilcoxon.html).
- [Streamlit](https://docs.streamlit.io/) y [Plotly](https://plotly.com/python/).

## Antes de escribir conclusiones fuertes

Predefinir hipótesis, objetivo, presupuesto y bloque; evaluar estabilidad temporal y práctica; ampliar datos independientes si es posible. Más épocas o sensores correlacionados no reemplazan más períodos independientes. El archivo termina el 20/02/2014, antes de la falla del 23/02: no permite medir detección de falla ni alertas operacionales.
