# Century Lab

App de investigación **independiente** del software FEM–LSTM del artículo. Tiene su propia interfaz Next.js/React, API FastAPI, entorno Python, copia del dataset público y base SQLite. No usa la API, modelos, archivos generados ni base de datos del visor original.

Interfaz: **http://127.0.0.1:3001**. API técnica: http://127.0.0.1:8001/docs.

## Instalación y arranque

Node.js 20.9+ y Python 3.11. La instalación verificada utiliza Node 24 y CPU, sin GPU ni claves API.

Desde esta carpeta:

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r backend/requirements-lock.txt
npm ci
npm run build
npm run lab
```

Para desarrollo, `npm run lab:dev`. El comando inicia ambos servicios. Ctrl+C cierra solo sus procesos; si reutilizó una API existente, no la cierra. No inicia ni modifica el visor del artículo en el puerto 3000. No usar varios workers de Uvicorn ni `--reload` durante un entrenamiento.

También se pueden arrancar por separado en dos terminales:

```bash
.venv/bin/python -m uvicorn backend.main:app --host 127.0.0.1 --port 8001
```

```bash
npm start
```

Aplicación local de investigación: no está preparada para exposición pública. No tiene autenticación multiusuario. Se rechazan escrituras de otros orígenes de navegador y solo se descargan artefactos autorizados de un experimento. No abrir estos servicios a Internet.

## Cómo usarla

1. **Explorar datos:** selecciona prisma y fechas. Observa desplazamiento, incremento, distribución, ausencias, resumen numérico y cobertura. Los días sin lectura son huecos, no interpolaciones.
2. **Análisis cruzado:** las gráficas temporales comparten fecha al pasar el cursor. Compara lluvia e incremento en un diagrama de dispersión, cambia el desfase de 2–9 fechas y consulta Spearman y la matriz de asociaciones. Shapiro–Wilk examina la distribución de incrementos, con una advertencia sobre autocorrelación.
3. **Limpieza:** configura exclusión de lluvia ausente o arrastre de valores pasados durante un máximo de dos fechas. Puedes retirar lluvia de las variables y excluir extremos 3×IQR solo de train. Pulsa **Revisar limpieza y particiones**: verás las exclusiones, los folds y la lluvia antes/después con bandera de imputación. No se modifican las observaciones de origen.
4. **Entrenamiento:** elige modelos, ventana, cortes, semilla, ensayos Optuna y épocas. Revisa nuevamente las particiones si cambias algo. Pulsa **Entrenar y comparar**. Un trabajador CPU procesa un experimento a la vez. Puedes cambiar de sección mientras corre o cancelarlo.
5. **Comparar resultados:** selecciona un experimento del historial. Consulta ranking por validación, MAE, RMSE, R² de niveles e incrementos, curvas de pronóstico, errores cruzados por fecha, residuos, métricas por prisma, pruebas por bloques y ensayos de ajuste. Descarga el ZIP completo, las redes `.h5`/`.keras` o los modelos clásicos `.joblib`.

El resultado de demostración, si está en `runtime/`, se identifica como **Demostración real · 8 técnicas (1 ensayo)**. No es un ajuste exhaustivo. Los resultados nuevos se generan entrenando, no son cifras de ejemplo fijadas en la interfaz.

## Dataset real y unidades

Fuente: **Tjaart de Wit (Colorado School of Mines)**, *Data used for the study of time-lapse velocity variations during an open-pit mine slope failure using seismic noise interferometry*, DOI **10.5281/zenodo.15003054**, CC BY 4.0. [Registro público y descarga](https://zenodo.org/records/15003054).

El archivo local es `data/century/Data.zip`, copia idéntica del archivo público. SHA256 obligatorio:

```text
b0d3eca632c5c7831d391f6f90b4d88b1a7384b3eb596c19ddaaf64147a24d22
```

Si falta, descarga `Data.zip` del registro citado y colócalo en ese directorio. No hacen falta archivos del software original para ejecutar esta app.

- West Wall: 7.178 lecturas de 49 prismas, 20/11/2013–20/02/2014. Magnitud 3D **publicada en mm**, referencia desde el 20 de noviembre. No es radar LOS.
- Última lectura real de cada sensor/día: 3.163 registros. Los timestamps no se etiquetan UTC porque su zona no está confirmada.
- Lluvia BOM 029167: solo períodos diarios válidos. Se conserva calidad; `N` no se trata como prueba de verificación. Hay 43 registros diarios de prisma sin lluvia y 1.692 con lluvia cero.
- No se inventan propiedades geotécnicas, presión de poros, FEM o valores de Pasco. South West no se mezcla con West Wall: tiene un contrato y referencia diferentes.

El lector valida el hash, elimina duplicados idénticos y rechaza timestamps en conflicto. Los incrementos tras días sin lectura se marcan ausentes.

## Método de comparación

Objetivo: pronosticar el **incremento** y sumarlo a la lectura actual para estimar el valor del próximo día calendario. Los intervalos horarios reales no son necesariamente 24 h.

Ventana predeterminada: 6 días consecutivos. Variables: desplazamiento, incremento anterior, intervalo anterior en horas y lluvia conocida con desfase conservador de 2 fechas. No se usa lluvia observada del día objetivo.

Cortes predeterminados: train hasta 31/01/2014; validación hasta 10/02; prueba hasta 20/02. Se purgan orígenes que cruzan esos límites. Cohorte predeterminada: **783/198/231 ventanas**. Difiere del script antiguo, que descartaba también la lluvia de la observación auxiliar anterior a la ventana, aunque no entraba como variable. Esta app exige lluvia solo donde efectivamente la usa.

- Persistencia y tendencia son referencias deterministas.
- Ridge, Random Forest y HistGradientBoosting usan scikit-learn.
- Dense, LSTM y GRU usan TensorFlow/Keras. No se implementa una red propia.
- Optuna ajusta hiperparámetros en **tres folds cronológicos de train agrupados por fecha**, con un día de separación. No se hace split aleatorio de filas apiladas de sensores.
- Escaladores, normalización de objetivo y umbrales de limpieza se aprenden dentro de cada fold. La limpieza final usa solo train. Los objetivos de validación/prueba nunca se recortan por ser extremos.
- Para redes, early stopping determina épocas en el último fold interno de train; después se reentrena con todas las filas de train y esas épocas.
- El modelo ganador se selecciona por **MAE de validación externa**. El test describe generalización. “Mejor red” se informa aparte: puede perder frente a persistencia o árboles.
- El R² de niveles puede ser alto por diferencias de magnitud entre prismas. También se informa R² de incrementos y errores por prisma.

### Estadística

Los errores se emparejan por prisma/fecha, y se promedian por fecha para comparar modelos con persistencia. El bootstrap móvil usa bloques consecutivos de 3 días y 500 réplicas, **exploratorias**. Wilcoxon requiere al menos 8 bloques no solapados y aplica Holm entre comparaciones disponibles. Los nueve días de prueba predeterminados **no alcanzan**: p aparece no disponible, no se inventa significancia. Puede quedar dependencia temporal y espacial incluso tras agrupar.

Spearman y Shapiro son exploratorios. No identifican causalidad lluvia–movimiento, ni convierten el caso en una evaluación operacional.

## Exportación e inferencia

Cada experimento crea `runtime/<uuid>/` con configuración, auditoría, series limpias, secuencias, predicciones, ensayos, informe, modelos, hashes y ficha. SQLite preserva el historial; los trabajos interrumpidos por reinicio se identifican como tales. Los modelos incompletos no se muestran como resultados válidos.

Las redes se guardan como modelos Keras completos `.h5` y `.keras`. El HDF5 se recarga y sus pronósticos se verifican contra la red original antes de declarar completado el entrenamiento. `.h5` es un formato legado de Keras; `.keras` es la exportación moderna adicional. [Documentación de guardado Keras](https://keras.io/api/models/model_saving_apis/model_saving_and_loading/).

El archivo `<red>-preprocessing.json` contiene ventana, orden de variables, media/escala de entrada, normalización del incremento y fórmula para reconstruir el desplazamiento. No usar la red sola sin ese contrato.

```python
from backend.infer import forecast

# windows: [n, lookback, features], en las unidades originales y el orden de preprocessing.json.
# current_mm: última lectura de cada ventana.
prediction_mm = forecast("runtime/UUID", "lstm", windows, current_mm)
```

Los modelos clásicos se exportan como `.joblib` con su escalador. No se convierten artificialmente en HDF5. Carga únicamente artefactos locales de confianza, nunca modelos subidos por terceros.

## Qué permite concluir y qué no

Permite estudiar qué técnica pronostica mejor este conjunto de prismas bajo un protocolo declarado, cómo influyen la lluvia y la limpieza, y dónde falla cada técnica.

**No prueba que un modelo alertará una falla real.** West Wall acaba antes del inicio de falla del 23/02/2014. Además, el período de test ya se examinó en el proyecto anterior: no es un holdout virgen para nuevas decisiones del paper. Para conclusiones confirmatorias hace falta reservar otra evaluación independiente con su protocolo antes de ajustar. No valida Cerro de Pasco, el solver FEM ni un gemelo operacional.

## Archivos principales

```text
app/                  interfaz React: EDA, análisis cruzado, limpieza, entrenamiento y resultados
backend/data.py       fuente, auditoría, limpieza y secuencias temporales
backend/training.py   scikit-learn/Keras, Optuna, métricas, pruebas y exportación
backend/jobs.py        historial SQLite y procesos de entrenamiento
backend/main.py        API local FastAPI
backend/infer.py       inferencia de artefactos exportados con su preprocesamiento
backend/test_lab.py    pruebas aisladas del contrato científico y la API
scripts/start-lab.mjs  arranque conjunto sin tocar otros servidores
data/century/Data.zip  copia propia del dataset público
runtime/              resultados persistentes locales (ignorado por Git)
```

## Verificación

```bash
npm run typecheck
npm run build
.venv/bin/python -m pytest backend/test_lab.py -q
```

Las pruebas utilizan una base temporal aislada; no borran experimentos ni modifican el software del artículo. `package-lock.json` y `backend/requirements-lock.txt` fijan las dependencias verificadas.
