# Plan de implementación — M-1 Physics-Informed Neural Network Digital Twin

## 1. Propósito

Desarrollar un gemelo digital para pronosticar, en tiempo casi real, la estabilidad de taludes en minas a cielo abierto. El sistema combinará:

- **FEM (Finite Element Method):** modela el comportamiento físico del macizo rocoso y genera variables de referencia (esfuerzos, deformaciones, desplazamientos y factor de seguridad).
- **PINN (Physics-Informed Neural Network):** aprende de los datos respetando restricciones físicas y geotécnicas, disminuyendo predicciones no plausibles.
- **LSTM:** anticipa la evolución temporal de desplazamientos y del riesgo a partir de series de sensores, lluvia, nivel freático, voladura y operación.
- **Gemelo digital:** integra el modelo del talud, telemetría, predicciones, alertas y visualización operativa.

La primera versión (MVP) debe funcionar con datos históricos o sintéticos y ser extensible a una integración posterior con instrumentación real.

## Estado ejecutado del prototipo (16 de septiembre de 2026)

| Entregable | Estado verificable |
|---|---|
| Caso TA-01, lluvia Pasco y conjunto FEM de 500 escenarios | Implementado y versionado como semisintético no calibrado |
| FEM 2D CST y campos nodales horarios | Implementado; prueba de parche, solución analítica global de elasticidad y sensibilidad 30×20 frente a 48×32. Griffiths–Lane reproducido con XSLOPE externo; el FEM propio aún no supera ese benchmark SSRM |
| Filtración transitoria ligada a lluvia | Ensayo XSLOPE con retención van Genuchten y balance de masa <5 %. El caso inicial infiltra 0,0864 mm de 102,88 mm; un escenario húmedo **hipotético** infiltra 8,64 mm y produce hasta ~2,0 kPa adicionales de presión de poros a 24 h. En ambos acoplamientos tri3→tri6 SSRM el ΔFoS no se resuelve a tolerancia 0,02. La sensibilidad temporal en malla 6 m llega a 0,00767 m de diferencia máxima entre pasos 0,1875/0,1 h a 24 h. Incluso con paso máximo 0,1 h, las mallas 6/4 m difieren hasta 2,502 m en carga, pero ese máximo está en zona de succión; en los nodos de entrada al SSRM, la diferencia máxima de presión positiva es 0,0459 kPa. El FoS húmedo entre mallas mecánicas 10/8/6 m varía 0,0195. Falta demostrar convergencia acoplada y observar contornos y parámetros antes de uso físico/operacional |
| Persistencia, ridge, LSTM y corrector guiado por física | Entrenados y evaluados en particiones aisladas por escenario |
| Ablación, incertidumbre y robustez | Implementadas; tablas y manifiesto SHA-256 reproducibles |
| Visor Three.js, lluvia y desplazamiento en vivo | Implementado, con modo realista opcional, vectores alternativos, pantalla completa y ventana adicional |
| Geometría externa y resultados FEM externos | Importadores disponibles; los resultados externos quedan etiquetados como no verificados |
| Persistencia operacional | SQLite WAL local para telemetría, modelos, geometrías, corridas resumidas, pronósticos, alertas y eventos |
| Puerta de calidad de telemetría | Implementada por sensor; aun superada, la interpretación operacional permanece bloqueada porque el modelo no está validado |
| Ingesta masiva de telemetría | CSV/JSON desde el tablero y API; valida el lote completo y lo persiste en una transacción SQLite atómica |
| Despliegue | `npm start` verificado; Docker Compose definido y validado estáticamente |
| PINN espacial PDE | Benchmark PIELM verificado con solución manufacturada; TA-01 tiene además PIELM de equilibrio FEM discreto para un evento, con error reservado de 12,57 % y residuo de 14,39 %. Falta PDE continua acoplada, generalización y contraste externo |
| Validación de campo | No realizable sin datos/instrumentación y un benchmark externo; permanece como límite científico explícito |

Esta tabla no convierte el prototipo en un sistema de seguridad certificado. Separa lo completado dentro del repositorio de las actividades que exigen evidencia externa.

## 2. Alcance del MVP

### Entradas

| Grupo | Variables iniciales |
|---|---|
| Geometría | perfil 2D del talud, bancos, bermas, altura y ángulos |
| Geotecnia | densidad, cohesión, fricción, módulo de Young, Poisson, permeabilidad |
| Hidrología | precipitación, nivel piezométrico, presión de poros |
| Monitoreo | desplazamiento/inclinación, fecha, sensor y calidad de lectura |
| Operación | excavación, carga y eventos de voladura (si están disponibles) |

### Factores de resistencia y estabilidad que el simulador debe parametrizar

| Factor | Efecto representado en el MVP |
|---|---|
| Geometría: ángulo, altura, ancho, bancos y perfil | aumenta o reduce la componente de esfuerzo que impulsa el deslizamiento; el MVP debe permitir perfiles recto, circular/cóncavo y semicircular/de anfiteatro, con dimensiones independientes |
| Cohesión y ángulo de fricción | controlan la resistencia al corte del material mediante Mohr–Coulomb |
| Peso unitario y sobrecarga operativa | modifican los esfuerzos normales y de corte por peso propio, equipos, acopios o excavación |
| Presión de poros, nivel freático y drenaje | reducen o recuperan el esfuerzo normal efectivo; deben mostrarse como capa espacial |
| Lluvia e infiltración | elevan la contribución hidrológica y la probabilidad de aceleración temporal |
| Meteorización/degradación | reduce cohesión y fricción efectivas de manera progresiva |
| Sismo o voladura | incrementa temporalmente la fuerza movilizadora mediante un coeficiente pseudoestático |
| Refuerzos | añade capacidad resistente equivalente; posteriormente puede sustituirse por anclajes o pernos modelados explícitamente |
| Estratos y roca subyacente | representa cobertura de suelo, roca dura o roca fracturada a una profundidad configurable; las discontinuidades reducen la resistencia efectiva de la roca |

Los controles deben tener valores por defecto documentados, límites válidos y trazabilidad por pronóstico. No deben ser utilizados como valores de diseño sin su calibración y validación por un especialista geotécnico.

En el MVP, el efecto del perfil se representa mediante un coeficiente geométrico documentado sobre la demanda movilizadora. En la versión científica validada debe sustituirse por superficies de falla buscadas explícitamente —rotacionales/circulares, traslacionales o controladas por discontinuidades— usando FEM/LEM sobre la geometría y estratigrafía reales.

### Salidas

- Pronóstico de desplazamiento para horizontes de 1, 6, 24 y 72 horas.
- Clasificación de riesgo: normal, vigilancia, alerta y crítico.
- Factor de seguridad estimado y/o probabilidad de inestabilidad.
- Panel con estado actual, tendencias, mapa/perfil del talud y explicación de la alerta.
- Simulador visual 3D interactivo: rotación, zoom, desplazamiento de cámara, selección de zonas/sensores y superposición de resultados físicos y de pronóstico.

### Límites explícitos

- El MVP es una **herramienta de apoyo a decisiones e investigación**, no un reemplazo de un ingeniero geotécnico ni de los protocolos de seguridad de la mina.
- El cálculo físico inicial se realiza sobre una sección 2D y condiciones simplificadas. El visor 3D sí forma parte del MVP: representa la geometría del talud, bancos, bermas, sensores y campos de resultado interpolados. Un **FEM 3D completo** queda como una extensión posterior por su costo computacional y de calibración.
- El sistema debe declarar incertidumbre y no emitir predicciones cuando la calidad de los datos sea insuficiente.

## 3. Arquitectura propuesta

```text
Sensores / archivos históricos / simulador FEM
                 |
                 v
      Ingesta, validación y almacenamiento
                 |
       +---------+---------+
       |                   |
       v                   v
 Motor FEM             Pipeline temporal
 (estado físico)       (LSTM + variables exógenas)
       |                   |
       +--------+----------+
                v
       PINN / fusión física-datos
                |
                v
  Predicción, incertidumbre y motor de alertas
                |
                v
      API + panel de gemelo digital

      └─ Visor 3D: geometría + sensores + campos de riesgo
```

## 4. Stack tecnológico sugerido

| Capa | Tecnologías propuestas | Motivo |
|---|---|---|
| Ciencia de datos y ML | Python, PyTorch, NumPy, Pandas, Scikit-learn | madurez para PINN/LSTM y experimentación reproducible |
| FEM | FEniCSx o OpenSeesPy; primero un adaptador a resultados CSV | permite comenzar sin depender de una licencia comercial |
| API | FastAPI, Pydantic, SQLAlchemy | API tipada, rápida y documentada automáticamente |
| Datos | PostgreSQL + TimescaleDB; CSV/Parquet en el MVP | series temporales y trazabilidad de experimentos |
| Procesamiento | Prefect o APScheduler en la primera versión | tareas periódicas de ingesta, inferencia y alertas |
| Interfaz | React + TypeScript + Plotly + Three.js/React Three Fiber | panel claro, gráfico temporal y visor 3D interactivo en navegador |
| Calidad y entrega | Pytest, Ruff, GitHub Actions, Docker Compose, MLflow/DVC | repetibilidad, pruebas y trazabilidad científica |

## 5. Estructura de repositorio inicial

```text
PROYECTO-SOFTWARE/
├── README.md
├── PLAN_IMPLEMENTACION.md
├── docs/                 # arquitectura, API, protocolo de datos
├── data/
│   ├── raw/              # no versionar datos sensibles
│   ├── processed/
│   └── synthetic/
├── fem/
│   ├── models/           # geometría y materiales
│   └── adapters/         # importadores de FEniCSx/OpenSees/CSV
├── ml/
│   ├── datasets/
│   ├── pinn/
│   ├── lstm/
│   ├── fusion/
│   └── evaluation/
├── backend/
│   ├── app/
│   └── tests/
├── frontend/
│   ├── components/       # indicadores, gráficos y alertas
│   └── scene-3d/         # malla del talud, controles de cámara y capas de resultados
├── pipelines/
├── notebooks/            # exploración, no lógica de producción
├── infra/
└── experiments/          # configuraciones, métricas y modelos registrados
```

## 6. Plan por fases

### Fase 0 — Definición científica y datos (semanas 1–2)

1. Definir un caso de estudio: un perfil 2D, mecanismo de falla y resolución temporal.
2. Especificar el diccionario de datos, unidades, frecuencia, umbrales de calidad y fuentes.
3. Elegir la variable objetivo primaria: desplazamiento acumulado/velocidad de desplazamiento; usar el factor de seguridad como objetivo físico complementario.
4. Preparar datos sintéticos con escenarios estables, degradación gradual y falla acelerada si no hay datos de mina disponibles.
5. Establecer línea base: persistencia, regresión y LSTM sin física.

**Entregables:** protocolo de datos, conjunto sintético versionado, definición de métricas y matriz de escenarios.

### Fase 1 — Núcleo FEM y generación de estados (semanas 3–5)

1. Implementar o integrar un modelo FEM 2D de deformación plana.
2. Parametrizar geometría, materiales, gravedad, sobrecarga y presión de poros.
3. Ejecutar análisis para los escenarios definidos; almacenar campos y agregados por zona/sensor virtual.
4. Validar con casos analíticos o resultados de referencia publicados.
5. Crear el adaptador de resultados para que el sistema acepte tanto simulaciones como datos de software FEM externo.

**Criterios de aceptación:** resultados trazables, unidades consistentes y pruebas automáticas de lectura/validación.

### Fase 2 — Modelos de aprendizaje (semanas 6–9)

1. Construir ventanas temporales con telemetría y variables exógenas.
2. Entrenar LSTM base para cada horizonte de pronóstico.
3. Desarrollar la PINN con una pérdida compuesta:

   `L_total = L_datos + λ_física L_equilibrio + λ_contorno L_contorno + λ_FEM L_consistencia`

4. Diseñar la fusión: usar variables FEM como características de la LSTM y/o usar la PINN como capa de corrección físicamente restringida.
5. Comparar: persistencia vs. LSTM vs. FEM solo vs. FEM-LSTM vs. FEM-LSTM-PINN.
6. Añadir estimación de incertidumbre mediante ensambles, MC dropout o cuantiles.

**Criterios de aceptación:** mejora cuantificable contra la línea base y reporte de incertidumbre calibrada.

### Fase 3 — Gemelo digital y alertas (semanas 10–12)

1. Implementar la base de datos de telemetría, geometría, ejecuciones y predicciones.
2. Crear API para ingesta, consulta de estado, inferencia y alertas.
3. Definir alertas híbridas: nivel de desplazamiento, aceleración, pronóstico, incertidumbre y factor de seguridad.
4. Construir panel con tendencia temporal, perfil del talud, estado de sensores y registro de decisiones.
5. Implementar el simulador/visor 3D del talud con controles de órbita (rotar, zoom y desplazamiento), iluminación y leyenda de colores.
6. Representar bancos, bermas, zonas de material, sensores y la superficie o plano de falla configurado.
7. Superponer capas conmutables: desplazamiento, presión de poros, factor de seguridad, riesgo e incertidumbre. Cada capa debe mostrar sus unidades, escala y momento temporal.
8. Incorporar modo de reproducción histórica (*replay*) para animar los estados del visor y demostrar cómo habría reaccionado el gemelo digital.

**Criterios de aceptación:** un nuevo lote de datos pasa de ingesta a predicción visible, con historial y trazabilidad; el usuario puede rotar el talud, identificar sensores, cambiar capas de resultado y reproducir una secuencia temporal.

### Fase 4 — Validación, despliegue y artículo (semanas 13–16)

1. Separar entrenamiento y evaluación por bloques temporales, evitando fuga de información.
2. Evaluar robustez frente a ruido, sensores faltantes, retrasos de telemetría y cambios de estación.
3. Medir latencia de actualización y uso de recursos.
4. Desplegar con Docker Compose en entorno local o servidor de pruebas.
5. Generar figuras, tablas, bitácoras de experimento y material suplementario reproducible para el artículo.

## 7. Diseño de datos y contrato mínimo

Cada lectura debe incluir `timestamp_utc`, `sensor_id`, `variable`, `value`, `unit`, `quality_flag`, `source` y `ingested_at`.

Tablas principales: `sensors`, `telemetry`, `slope_profiles`, `material_zones`, `fem_runs`, `model_versions`, `forecasts`, `alerts` y `operational_events`.

Reglas mínimas:

- Convertir las unidades al sistema internacional al ingresar datos.
- Conservar el valor original y una bandera de calidad; no borrar lecturas anómalas sin trazabilidad.
- Registrar versión del modelo, configuración FEM y conjunto de datos por cada pronóstico.
- Cifrar y anonimizar cualquier dato sensible de una operación minera real.

## 8. Evaluación experimental

| Dimensión | Métricas |
|---|---|
| Pronóstico de desplazamiento | MAE, RMSE, MAPE/SMAPE y R² por horizonte |
| Detección de riesgo | precisión, recall, F1, PR-AUC, tasa de falsas alarmas y anticipación media |
| Coherencia física | residuo de equilibrio, violaciones de contorno y discrepancia con FEM |
| Incertidumbre | cobertura de intervalos, ancho de intervalo y error de calibración |
| Operación | latencia extremo a extremo, disponibilidad y porcentaje de datos rechazados |

Diseño de ablación obligatorio: quitar de forma controlada FEM, PINN y variables hidrológicas para demostrar qué aporta cada componente.

## 8.1. Especificación del simulador visual 3D

El simulador 3D es el componente de interacción y comunicación del gemelo digital. No debe presentarse como un análisis FEM 3D si los cálculos provienen inicialmente de una sección 2D. En esa etapa se debe nombrar con precisión como **"visor 3D con resultados del modelo 2D extruidos o interpolados"**.

### Capacidades mínimas

- Cargar una geometría de talud en formatos simples (`JSON`, `GeoJSON` o `glTF`) y mostrar bancos, bermas y zonas geotécnicas.
- Rotar, acercar/alejar, desplazar, restablecer la cámara y alternar proyección perspectiva/ortográfica.
- Mostrar sensores como objetos seleccionables; al seleccionar uno, abrir su última lectura, tendencia y pronóstico.
- Usar una escala de colores con leyenda para desplazamiento, presión de poros, factor de seguridad, nivel de riesgo e incertidumbre.
- Representar la forma escalonada del talud (bancos y bermas) y diferenciar visualmente roca competente, material meteorizado y suelo residual.
- Exponer controles conmutables —activos por defecto— para forma/textura del talud, color de materiales, capa analítica y alto contraste.
- Contar con selector temporal para reproducir telemetría y pronósticos históricos.
- Mostrar claramente si una capa es observada, calculada por FEM, interpolada o predicha por IA.
- Permitir geometrías recta, circular/cóncava y semicircular/de anfiteatro, con controles de altura, ancho y ángulo. La geometría seleccionada debe modificar tanto el volumen visual como el cálculo reducido de estabilidad.
- Ampliar los tipos seleccionables a corte recto, mina a cielo abierto con bancos, perfil circular/cóncavo, semicircular/de anfiteatro y botadero/terraplén. Incluir una vista completa que encuadre automáticamente toda la geometría, sin importar sus dimensiones.
- Mostrar estratos: suelo superficial, material meteorizado y roca subyacente; diferenciar roca dura de roca fracturada e incluir profundidad y discontinuidades como parámetros.
- Incluir un modo de cámara libre: rotación con ratón y desplazamiento espacial mediante teclado (`W`, `A`, `S`, `D`, `Q`, `E`), además de la cámara orbital.
- Incorporar puntos de observación predefinidos —cresta, banco medio y pie del talud— que coloquen al usuario directamente en el entorno 3D, además de la vista general; el giro vertical debe permitir mirar tanto hacia arriba como hacia abajo.
- Mantener buen rendimiento: objetivo de 30 FPS con una geometría de demostración y carga progresiva para mallas grandes.

### Camino de madurez

| Nivel | Qué se visualiza | Qué se puede afirmar en el artículo |
|---|---|---|
| MVP | Malla 3D del talud y resultados 2D extruidos/interpolados | El sistema ofrece un visor 3D para comunicar el estado y pronóstico del talud. |
| Validación avanzada | Campos provenientes de múltiples secciones 2D o un modelo geológico 3D | El visor integra espacialmente fuentes de monitoreo y simulación. |
| Investigación futura | Malla y campos calculados con FEM 3D transitorio | El gemelo digital incorpora un modelo físico FEM tridimensional. |

La recomendación es implementar el primer nivel para la sustentación. Es visualmente convincente, realizable y científicamente honesto. El FEM 3D completo solo debe entrar al alcance si se cuenta con geometría, parámetros geotécnicos, cómputo y tiempo para validarlo correctamente.

## 9. Riesgos y mitigación

| Riesgo | Mitigación |
|---|---|
| Pocos eventos de falla reales | simulación física, aprendizaje por escenarios, validación temporal y declarar la limitación |
| FEM demasiado lento | modelos reducidos, caché de escenarios y ejecución asíncrona |
| PINN difícil de entrenar | normalización, pesos adaptativos de pérdidas, entrenamiento por etapas y baselines claros |
| Sensores ruidosos o discontinuos | filtros auditables, indicadores de calidad e incertidumbre explícita |
| Sobreafirmar capacidad predictiva | separar demostración de laboratorio de validación operacional y usar revisión geotécnica |

## 10. Hitos demostrables

1. **H1:** conjunto de datos y simulador FEM reproducibles.
2. **H2:** LSTM base que pronostica desplazamiento con evaluación temporal.
3. **H3:** modelo híbrido FEM-LSTM-PINN comparado mediante ablación.
4. **H4:** panel que reproduce una secuencia histórica/sintética y activa alertas explicables.
5. **H5:** paquete de replicación: código, configuraciones, datos permitidos y resultados.

## 11. Criterio de "listo para sustentar"

El software estará listo para la sustentación cuando pueda ejecutarse con un solo comando, cargar un caso documentado, reproducir sus resultados, mostrar el pronóstico y su incertidumbre, explicar el nivel de alerta, y presentar una comparación estadística honesta contra baselines y ablaciones.
