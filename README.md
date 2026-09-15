# M-1 Slope Stability Digital Twin

MVP académico de un gemelo digital para pronóstico de estabilidad de taludes de mina a cielo abierto. Integra un estado físico reducido tipo FEM, una celda recurrente temporal y una corrección informada por física; incluye API REST, telemetría sintética, alertas y dashboard.

> Estado: prototipo de investigación. No es un sistema certificado para decisiones de seguridad minera.

## Ejecutar

Se requiere Node.js 20 o superior.

```powershell
npm install
npm start
```

Abre `http://localhost:3000`. Para ejecutar las pruebas:

```powershell
npm test
```

## Funcionalidades actuales

- Dos escenarios sintéticos reproducibles: normal y crítico.
- Pronóstico a 1, 6, 24 o 72 horas, con intervalo de incertidumbre.
- Factor de seguridad reducido, presión de poros, velocidad de desplazamiento y diagnóstico de consistencia física.
- Alertas por niveles: NORMAL, VIGILANCIA, ALERTA y CRÍTICO.
- Simulador WebGL 3D de bancos y bermas con perfiles recto, circular/cóncavo y semicircular/de anfiteatro; incluye dimensiones configurables, estratos de suelo/roca, sensores seleccionables, sombras, textura procedural del terreno y capas de riesgo, desplazamiento, presión de poros, factor de seguridad e incertidumbre.
- Evento de lluvia manual por intensidad y duración, y reproducción de precipitación diaria histórica NASA POWER para Pasco (2020–2025). El total diario histórico se conserva y su distribución uniforme en 24 horas queda identificada como estimación; ambos modos generan una respuesta hidrológica demostrativa y visible en el talud.
- Desplazamiento visible en vivo mediante deformación amplificada del suelo, roca y sedimentos, fragmentos superficiales y malla de referencia sin deformar. Este modo viene activado; al desactivar **Movimiento del terreno**, el modelo queda fijo y muestra flechas vectoriales.
- Tablero de control rectangular en cuadrícula, con parámetros avanzados plegables, vista 3D a pantalla completa y visor sincronizado en una ventana adicional.
- Controles de simulación para ángulo, cohesión, fricción, agua, lluvia, meteorización, sismo/voladura, sobrecarga, drenaje y refuerzo; modifican el cálculo y las alertas en tiempo real.
- Fuente de geometría integrada al Digital Twin: talud paramétrico, aproximación visual desde una foto, cuadrícula topográfica CSV XYZ, perfil DXF y carga local de OBJ, STL ASCII/binario y glTF/GLB mediante Three.js.
- Flujo visible de estado actual → predicción → riesgo y trazabilidad de la fuente geométrica.
- API para incorporar lecturas reales y desacoplar instrumentación, modelos científicos y frontend.
- Módulo de investigación alineado con el artículo: procedencia de FEM/LSTM/PINN, calidad de datos y ablación temporal con MAE, RMSE, sesgo y R² exportable.
- Caso computacional **TA-01** con un solver FEM 2D real de elementos triangulares CST, 24 estados horarios y visualización nodal animada. La sección FEM se deforma con autoescala cuando está activo **Movimiento del terreno** y cambia a vectores al desactivarlo.
- Generador reproducible de datos semisintéticos: lluvia NASA POWER, muestreo Latin Hypercube de parámetros geotécnicos, respuesta FEM y manifiesto de procedencia.

## Usar el visor 3D

El visor se encuentra debajo de los indicadores principales. Usa **Encuadrar modelo** o **Vista completa** para recuperar rápidamente la vista general, y los puntos **Cresta**, **Banco medio** o **Pie del talud** para acercarte a esas zonas. Arrastra para rotar, usa el botón derecho para desplazar y la rueda para acercar o alejar. Selecciona una capa en el tablero y haz clic en un sensor para consultar su detalle. Activa **Vuelo libre** para usar `W`, `A`, `S`, `D` (avance lateral), `Q`/`E` (bajar/subir) y `Shift` (mayor velocidad). **Terreno realista** controla conjuntamente la iluminación solar, sombras suaves, niebla de profundidad y marcas procedurales de suelo/roca; puede deshabilitarse para una vista técnica de alto contraste.

En **Fuente de lluvia** puedes usar una intensidad manual o seleccionar un día del histórico NASA POWER de Pasco. **Simular lluvia** o **Reproducir día** aplica el evento al historial del gemelo, cambia automáticamente a presión de poros e inicia la animación del desplazamiento. El CSV original se conserva en `data/rainfall/pasco-nasa-power-2020-2025.csv`; procede de MERRA-2, está expresado en mm/día y no contiene observaciones horarias. **Restablecer** recupera el escenario base seleccionado. **Ampliar** ocupa la pantalla disponible y **Otra ventana** abre un visor 3D sincronizado, útil para moverlo a otra pantalla. Mientras ese visor está activo, la pantalla principal pausa su renderizado 3D, muestra el aviso correspondiente y permite cerrarlo con **Cerrar ventana y volver aquí**.

La representación tridimensional actual es una geometría de demostración con resultados 2D interpolados; no afirma ser un cálculo FEM 3D. Esta distinción permite una presentación visual útil y rigurosa mientras se integra un solver FEM 3D validado en una fase posterior.

Al ejecutar **Solver FEM 2D** en el panel científico, aparece delante del talud una sección triangular calculada nodo a nodo. Su deformación animada corresponde al incremento FEM causado por la lluvia, no al campo interpolado del pronóstico reducido. Como los movimientos son submilimétricos, la sección se autoescala hasta una amplitud visible y lo indica en pantalla; las métricas y el JSON descargable conservan las magnitudes físicas.

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
```

El CSV usa una fila por escenario-hora y el manifiesto JSON registra semilla, procedencia y parámetros. La especificación científica y las reglas para separar entrenamiento, validación y prueba están en [CASO_TA01_FEM.md](docs/CASO_TA01_FEM.md).

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
| POST | `/api/telemetry` | registrar lectura |
| GET | `/api/forecast?horizon=24` | crear pronóstico |
| GET | `/api/alerts` | alertas generadas |
| POST | `/api/scenario` | cargar escenario `normal` o `critical` |
| POST | `/api/weather-event` | simular lluvia por intensidad (`intensityMmH`) y duración (`durationHours`) y generar telemetría de respuesta |
| GET | `/api/rainfall-history` | consultar metadatos, resumen y registros diarios NASA POWER de Pasco |
| POST | `/api/weather-event/historical` | reproducir un día histórico por `date`; conserva el total diario y estima un perfil uniforme de 24 h |
| GET/POST | `/api/simulation` | consultar o ajustar factores geotécnicos simulables |
| GET | `/api/twin` | estado integrado: geometría, monitoreo y madurez de componentes científicos |
| POST | `/api/geometry` | registrar una fuente/version de geometría |
| POST | `/api/risk-policy` | configurar la política de umbrales; requiere validación geotécnica |
| GET | `/api/research` | consultar protocolo, madurez de componentes y último experimento |
| GET | `/api/research/baseline?horizon=6` | consultar la evaluación ridge frente a persistencia sobre escenarios de prueba aislados |
| GET | `/api/research/lstm?horizon=6` | consultar arquitectura, entrenamiento y métricas comparables de la LSTM sin transferir todos los pesos |
| POST | `/api/research/ablation` | ejecutar comparación demostrativa de persistencia, temporal, físico reducido, híbrido y ablación hidrológica |
| GET | `/api/fem/status` | consultar método FEM 2D, disponibilidad de lluvia y última corrida |
| POST | `/api/fem/run` | ejecutar TA-01 para una `date` y un `concentrationHours` de 6, 12 o 24; devuelve malla y campos nodales horarios |

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

El proyecto ya incluye un FEM 2D lineal propio para TA-01, pero el pronóstico principal todavía usa el estado físico reducido. Para sustentar las afirmaciones del artículo se debe validar el FEM con benchmarks y datos, sustituir la celda recurrente determinista por una LSTM entrenada y el corrector por una PINN entrenada, y seguir el diseño experimental descrito en [PLAN_IMPLEMENTACION.md](PLAN_IMPLEMENTACION.md).

La correspondencia entre el manuscrito, los módulos implementados y los criterios para avanzar a resultados publicables se documenta en [INTEGRACION_ARTICULO.md](docs/INTEGRACION_ARTICULO.md).
