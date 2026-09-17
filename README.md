# M-1 Slope Stability Digital Twin

MVP académico de un gemelo digital para pronóstico de estabilidad de taludes de mina a cielo abierto. Integra un estado físico reducido tipo FEM, una celda recurrente temporal y una corrección informada por física; incluye API REST, telemetría sintética, alertas y dashboard.

> Estado: prototipo de investigación. No es un sistema certificado para decisiones de seguridad minera.

## Ejecutar

Se requiere Node.js 24 o superior, porque la persistencia usa el módulo SQLite incorporado en Node.

```powershell
npm install
npm start
```

Abre `http://localhost:3000`. Para ejecutar las pruebas:

```powershell
npm test
```

También se puede ejecutar con una imagen reproducible de Node 24 y un volumen SQLite persistente:

```bash
docker compose up --build
```

El contenedor publica el puerto `3000`, incluye un `HEALTHCHECK` sobre `/api/health` y conserva `data/local` en el volumen `sslope-local`.
Tanto `npm start` como Docker Compose solo exponen el servicio a `127.0.0.1` del equipo anfitrión. Si se instala en una red, se necesita una capa de autenticación, TLS y autorización antes de admitir telemetría real.

## Funcionalidades actuales

- Dos escenarios sintéticos reproducibles: normal y crítico.
- Pronóstico a 1, 6, 24 o 72 horas, con intervalo de incertidumbre.
- Factor de seguridad reducido, presión de poros, velocidad de desplazamiento y diagnóstico de consistencia física.
- Alertas por niveles: NORMAL, VIGILANCIA, ALERTA y CRÍTICO.
- Historial de alertas demostrativas deduplicado por sensor, horizonte y nivel durante ventanas de 15 minutos; una serie desactualizada más de 3 h no genera una alerta nueva.
- Simulador WebGL 3D de bancos y bermas con perfiles recto, circular/cóncavo y semicircular/de anfiteatro; incluye dimensiones configurables, estratos de suelo/roca, sensores seleccionables, sombras, textura procedural del terreno y capas de riesgo, desplazamiento, presión de poros, factor de seguridad e incertidumbre.
- Evento de lluvia manual por intensidad y duración, y reproducción de precipitación diaria histórica NASA POWER para Pasco (2020–2025). El total diario histórico se conserva y su distribución uniforme en 24 horas queda identificada como estimación; ambos modos generan una respuesta hidrológica demostrativa y visible en el talud.
- Desplazamiento visible en vivo mediante deformación amplificada del suelo, roca y sedimentos, fragmentos superficiales y malla de referencia sin deformar. Este modo viene activado; al desactivar **Movimiento del terreno**, el modelo queda fijo y muestra flechas vectoriales.
- Tablero de control rectangular en cuadrícula, con parámetros avanzados plegables, vista 3D a pantalla completa y visor sincronizado en una ventana adicional.
- Controles de simulación para ángulo, cohesión, fricción, agua, lluvia, meteorización, sismo/voladura, sobrecarga, drenaje y refuerzo; modifican el cálculo y las alertas en tiempo real.
- Fuente de geometría integrada al Digital Twin: talud paramétrico, aproximación visual desde una foto, cuadrícula topográfica CSV XYZ, perfil DXF, superficies GeoJSON 3D y carga local de OBJ, STL ASCII/binario y glTF/GLB mediante Three.js.
- Cámara intercambiable entre perspectiva 3D y proyección ortográfica técnica; la elección se sincroniza con la ventana externa.
- Flujo visible de estado actual → predicción → riesgo y trazabilidad de la fuente geométrica.
- API para incorporar lecturas reales y desacoplar instrumentación, modelos científicos y frontend.
- Importación masiva CSV/JSON desde el tablero, con validación completa antes de escribir, transacción SQLite atómica, límite de 5000 lecturas y plantilla descargable.
- Puerta de calidad que revisa completitud, brechas temporales, duplicados y procedencia declarada. Incluso cuando la telemetría pasa estos controles estructurales, el modelo no calibrado continúa bloqueado para decisiones operacionales.
- Persistencia SQLite local en modo WAL para telemetría normalizada, versiones de geometría/modelo, corridas FEM resumidas, pronósticos, alertas y eventos; el estado se recupera tras reiniciar el servidor.
- Módulo de investigación alineado con el artículo: procedencia de FEM/LSTM/PINN, calidad de datos y ablación temporal con MAE, RMSE, sesgo y R² exportable.
- Caso computacional **TA-01** con un solver FEM 2D real de elementos triangulares CST, 24 estados horarios y visualización nodal animada. La sección FEM se deforma con autoescala cuando está activo **Movimiento del terreno** y cambia a vectores al desactivarlo.
- Generador reproducible de datos semisintéticos: lluvia NASA POWER, muestreo Latin Hypercube de parámetros geotécnicos, respuesta FEM y manifiesto de procedencia.
- Corrector neuronal físico agregado entrenado sobre la LSTM, monótono por construcción frente a lluvia futura e índice de seguridad, con intervalos conformales y latencia medida. Se identifica explícitamente que todavía no es una PINN espacial de equilibrio PDE.
- Benchmark PINN espacial tipo PIELM sobre elasticidad lineal 2D: impone residuos de Navier y condiciones de Dirichlet en una solución manufacturada. Verifica el mecanismo PDE de forma reproducible, pero no constituye validación de TA-01.
- Modelo espacial PIELM/RBF TA-01 para un evento de lluvia NASA POWER: ajusta el incremento de desplazamiento bajo el equilibrio FEM discreto y 12 desplazamientos nodales semisintéticos. En 354 nodos sin datos de sensor obtiene 12,57 % de error L2 relativo y 14,39 % de residuo de equilibrio relativo. Usa la misma rigidez y carga que el FEM de referencia: no es una validación independiente, una PINN PDE continua ni un modelo operacional.
- Consulta nodal espacial para otras cantidades de lluvia en el mismo escenario TA-01: aprovecha que la carga incremental del FEM lineal es proporcional a la lluvia acumulada. No representa infiltración transitoria ni transferencia a otra geometría o materiales.
- Reproducción separada del benchmark publicado de Griffiths y Lane con XSLOPE 0.5.2: FoS externo 1,371875, dentro de los ensayos 1,35 estable / 1,40 fallido. Es una referencia elastoplástica independiente, **no** una validación del FEM lineal propio.

## Usar el visor 3D

El visor se encuentra debajo de los indicadores principales. Usa **Encuadrar modelo** o **Vista completa** para recuperar rápidamente la vista general, y los puntos **Cresta**, **Banco medio** o **Pie del talud** para acercarte a esas zonas. Arrastra para rotar, usa el botón derecho para desplazar y la rueda para acercar o alejar. Selecciona una capa en el tablero y haz clic en un sensor para consultar su detalle. Activa **Vuelo libre** para usar `W`, `A`, `S`, `D` (avance lateral), `Q`/`E` (bajar/subir) y `Shift` (mayor velocidad). **Terreno realista** controla conjuntamente la iluminación solar, sombras suaves, niebla de profundidad y marcas procedurales de suelo/roca; puede deshabilitarse para una vista técnica de alto contraste.

En **Fuente de lluvia** puedes usar una intensidad manual o seleccionar un día del histórico NASA POWER de Pasco. **Simular lluvia** o **Reproducir día** aplica el evento al historial del gemelo, cambia automáticamente a presión de poros e inicia la animación del desplazamiento. El CSV original se conserva en `data/rainfall/pasco-nasa-power-2020-2025.csv`; procede de MERRA-2, está expresado en mm/día y no contiene observaciones horarias. **Restablecer** recupera el escenario base seleccionado. **Ampliar** ocupa la pantalla disponible y **Otra ventana** abre un visor 3D sincronizado, útil para moverlo a otra pantalla. Mientras ese visor está activo, la pantalla principal pausa su renderizado 3D, muestra el aviso correspondiente y permite cerrarlo con **Cerrar ventana y volver aquí**.

## Importar telemetría

En **Telemetría de campo**, descarga [telemetry-import-template.csv](public/samples/telemetry-import-template.csv), conserva las siete columnas y reemplaza sus filas de ejemplo con tus mediciones. `timestamp_utc` debe contener una fecha válida, `sensor_id` identifica la estación y las magnitudes se expresan en milímetros, kPa y mm/h. Cambia `source` por el origen real del sensor y usa una `quality_flag` trazable; la fuente `template-example` se considera simulada. El selector **Sensor activo** consulta series separadas para cada estación. La fuente es una declaración aportada por el archivo, no una prueba de autenticidad de campo.

El tablero acepta CSV con coma o punto y coma, cabeceras equivalentes en español y JSON como una lista o como `{ "readings": [...] }`. Todo el archivo se valida antes de escribir. Si falla una fila, el sistema indica su posición y no guarda ninguna lectura del lote. Internamente, las filas anchas se normalizan a una fila por variable en SQLite.

La representación tridimensional actual es una geometría de demostración con resultados 2D interpolados; no afirma ser un cálculo FEM 3D. Esta distinción permite una presentación visual útil y rigurosa mientras se integra un solver FEM 3D validado en una fase posterior.

Al ejecutar **Solver FEM 2D** en el panel científico, aparece delante del talud una sección triangular calculada nodo a nodo. Su deformación animada corresponde al incremento FEM causado por la lluvia, no al campo interpolado del pronóstico reducido. Como los movimientos son submilimétricos, la sección se autoescala hasta una amplitud visible y lo indica en pantalla; las métricas y el JSON descargable conservan las magnitudes físicas.

La malla de análisis predeterminada es 30×20. `npm run validate:fem` genera `data/validation/ta01-fem-mesh-sensitivity.json`, compara refinamientos hasta 48×32 y verifica el ensamblaje global contra una solución analítica afín de elasticidad lineal. El error máximo de esa prueba es 1,62×10⁻¹¹ m; no valida la hidrología ni los parámetros geotécnicos TA-01 y aún falta un benchmark externo publicado.

También se puede importar una malla triangular procedente de otro solver mediante **Importar FEM JSON**. El archivo debe declarar nodos, elementos, unidades y, opcionalmente, una serie temporal y datos de convergencia. El ejemplo [external-fem-example.json](public/samples/external-fem-example.json) documenta el contrato mínimo. El adaptador normaliza las unidades y verifica conectividad, pero etiqueta el resultado como externo no verificado y no le aplica los modelos TA-01.

## Generar datos FEM para TA-01

La muestra incluida contiene 24 escenarios × 24 horas. Para regenerarla o crear una corrida mayor:

```bash
npm run generate:fem -- --scenarios=24
npm run generate:fem -- --scenarios=500 --output=data/generated/ta01-fem-500.csv
npm run split:fem
npm run train:baseline -- --horizon=1
npm run train:baseline -- --horizon=6
npm run train:lstm -- --horizon=1
npm run train:lstm -- --horizon=6
npm run test:lstm
npm run train:physics -- --horizon=1
npm run train:physics -- --horizon=6
npm run test:physics
npm run train:spatial-pinn
npm run test:spatial-pinn
npm run export:ta01-spatial-benchmark
npm run train:ta01-spatial-pinn
npm run test:ta01-spatial-pinn
npm run validate:robustness
npm run validate:fem
npm run report:research
```

El CSV usa una fila por escenario-hora y el manifiesto JSON registra semilla, procedencia y parámetros. La especificación científica y las reglas para separar entrenamiento, validación y prueba están en [CASO_TA01_FEM.md](docs/CASO_TA01_FEM.md).

`npm run report:research` consolida tablas CSV de comparación de modelos, ablación, robustez, sensibilidad de malla y detección de episodios de desplazamiento alto. El umbral de esta última tabla es el percentil 95 calculado únicamente en entrenamiento; no debe confundirse con un umbral operativo de mina. Un manifiesto SHA-256 registra exactamente los artefactos fuente.

## Probar geometría con coordenadas

En **Geometría del Digital Twin**, selecciona **Modelo / datos topográficos** y carga uno de los ejemplos incluidos:

- [Talud circular CSV XYZ](public/samples/talud-circular-xyz.csv): cuadrícula regular con coordenadas Este, Norte y cota en metros; el importador la triangula en una malla 3D.
- [Perfil bancado DXF](public/samples/perfil-talud-bancado.dxf): polilínea 2D de un perfil; el importador la extruye para previsualizarla en 3D.

El CSV actual requiere una cuadrícula regular y una cabecera `X,Y,Z` o `east_m,north_m,elevation_m`. Para levantamientos irregulares, nubes LiDAR, GeoTIFF o fotogrametría se deberá incorporar una triangulación TIN y un módulo de georreferenciación validado.

Los archivos glTF deben contener sus buffers e imágenes embebidos; si emplean recursos externos, conviértelos a GLB antes de cargarlos. Los modelos se procesan localmente en el navegador y no se sube su contenido al servidor.

## API

| Método | Ruta | Uso |
|---|---|---|
| GET | `/api/health` | estado del servicio |
| GET | `/api/telemetry?limit=72` | lecturas recientes |
| GET | `/api/sensors` | sensores registrados, cobertura temporal y cantidad de lecturas |
| POST | `/api/telemetry` | registrar lectura |
| POST | `/api/telemetry/bulk` | validar y registrar atómicamente hasta 5000 lecturas mediante `{ readings: [...] }` |
| GET | `/api/forecast?horizon=24&sensorId=EXT-01` | crear un pronóstico sin mezclar series de sensores |
| GET | `/api/alerts` | alertas generadas |
| POST | `/api/scenario` | cargar escenario `normal` o `critical` |
| POST | `/api/weather-event` | simular lluvia por intensidad (`intensityMmH`) y duración (`durationHours`) y generar telemetría de respuesta |
| GET | `/api/rainfall-history` | consultar metadatos, resumen y registros diarios NASA POWER de Pasco |
| POST | `/api/weather-event/historical` | reproducir un día histórico por `date`; conserva el total diario y estima un perfil uniforme de 24 h |
| GET/POST | `/api/simulation` | consultar o ajustar factores geotécnicos simulables |
| GET | `/api/twin` | estado integrado: geometría, monitoreo y madurez de componentes científicos |
| GET | `/api/persistence/status` | motor y conteos de las tablas operativas SQLite locales |
| POST | `/api/geometry` | registrar una fuente/version de geometría |
| POST | `/api/risk-policy` | configurar la política de umbrales; requiere validación geotécnica |
| GET | `/api/research` | consultar protocolo, madurez de componentes y último experimento |
| GET | `/api/research/baseline?horizon=6` | consultar la evaluación ridge frente a persistencia sobre escenarios de prueba aislados |
| GET | `/api/research/lstm?horizon=6` | consultar arquitectura, entrenamiento y métricas comparables de la LSTM sin transferir todos los pesos |
| GET | `/api/research/physics-guided?horizon=6` | consultar métricas, restricciones, incertidumbre y latencia del corrector neuronal físico |
| GET | `/api/research/robustness` | consultar degradación por ruido y datos faltantes en test semisintético |
| GET | `/api/research/fem-validation` | consultar el estudio interno de sensibilidad de malla FEM |
| GET | `/api/research/spatial-pinn-validation` | consultar el benchmark PDE espacial con solución manufacturada |
| GET | `/api/research/ta01-spatial-pinn-validation` | consultar la aproximación espacial TA-01 de equilibrio FEM discreto y sus límites |
| GET | `/api/research/ta01-spatial-prediction?rainfallMm=48` | consultar el campo nodal semisintético escalado para 0–500 mm de lluvia acumulada, solo en el escenario fijo TA-01 |
| GET | `/api/research/external-ssrm-validation` | consultar la reproducción externa de Griffiths–Lane con XSLOPE y su procedencia; no acredita el FEM propio |
| GET | `/api/research/ta01-external-ssrm` | consultar la variante TA-01 extendida y seca calculada con SSRM externo; no representa lluvia ni una predicción calibrada |
| GET | `/api/research/ta01-external-ssrm-mesh` | consultar la sensibilidad preliminar del SSRM seco en tres tamaños de malla |
| GET | `/api/research/ta01-transient-seep` | consultar el ensayo de filtración transitoria con balance de masa aceptado y flujo limitado; solo alimenta el SSRM externo condicional |
| GET | `/api/research/ta01-transient-seep-mesh` | consultar la sensibilidad de carga hidráulica en un punto fijo para cuatro mallas; no valida el campo completo |
| GET | `/api/research/ta01-transient-seep-field` | consultar la diferencia espacial del cambio hidráulico en 6395 puntos interiores entre cuatro mallas |
| GET | `/api/research/ta01-rainfall-external-ssrm` | comparar SSRM externo con presión hidráulica inicial y a 24 h; diferencia no resuelta y parámetros no calibrados |
| GET | `/api/research/ta01-wet-scenario` | consultar el escenario húmedo hipotético, su sensibilidad de malla y el SSRM condicional sin exponer el campo nodal pesado |

| POST | `/api/research/ablation` | ejecutar la comparación histórica del modelo reducido del MVP (compatibilidad) |
| GET | `/api/fem/status` | consultar método FEM 2D, disponibilidad de lluvia y última corrida |
| POST | `/api/fem/run` | ejecutar TA-01 para una `date` y un `concentrationHours` de 6, 12 o 24; devuelve malla y campos nodales horarios |
| POST | `/api/fem/import` | validar y adaptar un resultado FEM JSON externo al contrato del visor, sin certificarlo ni aplicar modelos TA-01 |
| POST | `/api/fem/lstm-forecast` | pronosticar una corrida TA-01 con `runId`, `horizonHours` de 1 o 6 y `originHour` opcional |
| POST | `/api/fem/physics-guided-forecast` | ejecutar la cadena LSTM + corrector físico sobre una corrida TA-01 |

También se conserva un [escenario hidráulico húmedo hipotético](docs/CASO_TA01_FEM.md): con una permeabilidad y un nivel inicial supuestos distintos, el cambio de presión de poros llega a ~2 kPa a 24 h. Se contrastaron siete límites de paso temporal, pero el campo de carga aún no converge espacialmente entre mallas. Es una prueba de sensibilidad del acoplamiento, no una predicción para Pasco ni una validación de campo. [Fuentes públicas para Pasco](docs/FUENTES_PUBLICAS_PASCO.md) separa lluvia, geología, topografía y posible movimiento InSAR de las mediciones que aún faltan para calibrar el talud.

La respuesta de `GET /api/research/physics-guided?horizon=1|6` incluye además una ablación entrenada sobre el conjunto de prueba aislado: persistencia, ridge, LSTM, híbrido sin hidrología, híbrido sin estado FEM e híbrido completo. El tablero consume directamente este artefacto reproducible.

La base operativa se crea en `data/local/sslope.sqlite` y está excluida de Git. Es adecuada para demostración en una sola máquina; antes de usar datos reales necesita cifrado, copias de seguridad, control de acceso y una política de retención.

Ejemplo de ingesta:

```json
{
  "sensorId": "EXT-01",
  "timestamp": "2026-09-07T12:00:00Z",
  "displacementMm": 14.2,
  "porePressureKpa": 125.3,
  "rainfallMmH": 7.4,
  "qualityFlag": "VALID",
  "source": "inclinometer"
}
```

## Evolución científica requerida

El proyecto ya incluye un FEM 2D lineal, una LSTM entrenada, un corrector neuronal físico agregado y una primera aproximación espacial de equilibrio FEM discreto para TA-01. El pronóstico general basado en telemetría todavía usa el estado físico reducido porque los modelos entrenados no deben trasladarse a sensores reales sin calibración. Para sustentar las afirmaciones completas del artículo aún se debe validar el FEM con benchmarks externos y datos de campo, ampliar la PINN espacial a residuos PDE continuos y múltiples escenarios TA-01, y seguir el diseño experimental descrito en [PLAN_IMPLEMENTACION.md](PLAN_IMPLEMENTACION.md).

La correspondencia entre el manuscrito, los módulos implementados y los criterios para avanzar a resultados publicables se documenta en [INTEGRACION_ARTICULO.md](docs/INTEGRACION_ARTICULO.md).
