# Caso de estudio TA-01 y conjunto FEM semisintético

## Alcance

**TA-01 — Talud Andino Experimental 01** es el primer caso computacional reproducible del proyecto. Combina lluvia diaria de reanálisis NASA POWER para Pasco con parámetros geotécnicos muestreados dentro de rangos declarados y una respuesta mecánica calculada mediante elementos finitos 2D.

No representa una mina concreta ni está calibrado contra instrumentación de campo. Su utilidad actual es construir y depurar el flujo de datos, probar el acoplamiento lluvia–presión de poros–respuesta mecánica y generar ejemplos para entrenar después el componente temporal.

## Procedencia de los datos

| Parte | Procedencia | Clasificación |
|---|---|---|
| Lluvia diaria | NASA POWER/MERRA-2, punto -10.68, -76.26, 2020–2025 | Reanálisis meteorológico |
| Perfil horario | Total diario distribuido en una ventana rectangular de 6, 12 o 24 horas | Estimado |
| Geometría | Talud bancado de 100 m de alto, 160 m de ancho y 5 bancos | Supuesto TA-01 |
| Propiedades geotécnicas | Muestreo Latin Hypercube dentro de los rangos TA-01 | Supuesto controlado |
| Desplazamiento y tensiones | Solver FEM 2D del proyecto | Simulado |
| Presión de poros | Carga hidrostática más infiltración retenida simplificada | Simulado |

Por ello, el conjunto completo se etiqueta `SEMI_SINTETICO_NO_CALIBRADO`.

## Formulación FEM implementada

- Malla no estructurada resultante de recortar una cuadrícula rectangular con el perfil bancado.
- Elementos triangulares CST de tres nodos.
- Elasticidad lineal isotrópica en deformación plana.
- Tres zonas: suelo superficial, material meteorizado y roca.
- Peso propio como carga de cuerpo.
- Presión de poros aplicada como tensión inicial de Biot.
- Base fija y borde izquierdo tipo rodillo.
- Resolución cuasiestática cada hora mediante gradiente conjugado con precondicionador de Jacobi.
- Índice Mohr–Coulomb calculado en posproceso sobre tensiones efectivas.

El índice de seguridad no es una reducción no lineal de resistencia (SRM). El modelo tampoco incorpora plasticidad, fracturas explícitas, flujo FEM transitorio ni calibración geotécnica.

## Parámetros muestreados

| Parámetro | Rango |
|---|---:|
| Cohesión | 60–240 kPa |
| Ángulo de fricción | 26–44° |
| Peso unitario | 18–26 kN/m³ |
| Módulo de Young | 400–3000 MPa |
| Permeabilidad | 1×10⁻¹⁰–3×10⁻⁶ m/s |
| Eficiencia de drenaje | 0–0.85 |
| Nivel freático relativo a la altura | 0.10–0.65 |
| Coeficiente de almacenamiento | 0.12–0.35 |

Los rangos son hipótesis de diseño experimental, no mediciones de Pasco.

## Generar el conjunto

El repositorio incluye una muestra reproducible de 24 escenarios y 576 filas en `data/generated/ta01-fem-dataset.csv`. Para regenerarla:

```bash
npm run generate:fem -- --scenarios=24
```

Para una primera corrida de entrenamiento más amplia:

```bash
npm run generate:fem -- --scenarios=500 --output=data/generated/ta01-fem-500.csv
```

Opciones disponibles: `--seed`, `--mesh-x`, `--mesh-y` y `--output`. Junto al CSV se genera un manifiesto JSON con procedencia, rangos, semilla, malla y resumen de cada escenario.

## Unidad de observación y partición

Cada fila representa una hora de un escenario. La clave lógica es `scenario_id + simulation_hour`; las columnas incluyen unidades en el nombre. El objetivo inicial recomendado para la LSTM es `rainfall_induced_max_displacement_mm`.

La separación entrenamiento/validación/prueba se hace por **fecha de lluvia**: todos los escenarios y horas de una misma fecha permanecen juntos. Esto impide reutilizar el mismo evento meteorológico al ajustar y evaluar. Se conserva una proporción 70/15/15 por número de escenarios y se reservan los eventos más extremos para validación y prueba. No es una partición cronológica por años; tampoco demuestra transferencia a otras geometrías o fuentes meteorológicas.

La división reproducible ya generada contiene 350 escenarios de entrenamiento, 75 de validación y 75 de prueba. El evento de 102.88 mm/día se reserva para prueba y el siguiente evento extremo de fecha distinta para validación. Para reconstruirla:

```bash
npm run split:fem
```

### Comprobación adicional fuera de tiempo

Existe una segunda partición estrictamente cronológica del **mismo** conjunto de 500 escenarios: 340 escenarios de 2020–2023 para entrenamiento, 82 de 2024 para validación y 78 de 2025 para prueba. Ninguna fecha de lluvia ni escenario cruza periodos. Los modelos se vuelven a entrenar para esta partición; los pesos del experimento anterior no se reutilizan. La tabla `data/validation/ta01-chronological-model-comparison.csv` compara las mismas ventanas de 2025 para los cuatro métodos.

| Horizonte | Ventanas | Persistencia MAE | Ridge MAE | LSTM MAE | Híbrido MAE |
|---|---:|---:|---:|---:|---:|
| 1 h | 1404 | 0.00002167 mm | 0.00002055 mm | 0.00000540 mm | 0.00000519 mm |
| 6 h | 1014 | 0.00014399 mm | 0.00015151 mm | 0.00005769 mm | 0.00005502 mm |

El híbrido reduce levemente el MAE *observado* de la LSTM en ambos horizontes (aprox. 3,9 % y 4,6 %). Sin embargo, el bootstrap pareado por **76 fechas de lluvia**, 5000 remuestreos y semilla registrada da intervalos del 95 % para `MAE(LSTM) − MAE(híbrido)` de `[−2,59×10⁻⁷, 6,88×10⁻⁷] mm` a 1 h y `[−3,83×10⁻⁷, 6,25×10⁻⁶] mm` a 6 h. **Ambos incluyen cero**: esta muestra no demuestra una ventaja estadísticamente concluyente del híbrido. El cálculo y su semilla están en `data/validation/ta01-chronological-bootstrap.json`; cuantifica variación entre fechas, no incertidumbre del FEM ni generalización a otra mina.

A 6 h, ridge **empeora** respecto de persistencia. La cobertura empírica de los intervalos nominales del 95 % es 94,02 % a 1 h y 92,11 % a 6 h: el intervalo de 6 h queda subcubierto. La prueba de 2025 alcanza 10,73 mm/día como máximo, mientras entrenamiento contiene un evento de 102,88 mm/día; por tanto, **no** prueba extrapolación a lluvias extremas futuras. Los desplazamientos objetivos siguen siendo salidas del FEM propio, no observaciones de una mina.

La tabla `data/validation/ta01-chronological-stratified.csv` separa los errores por lluvia diaria (0, 0–1, 1–5 y ≥5 mm) y por objetivo de desplazamiento nulo/positivo. En el subconjunto ≥5 mm hay **solo tres fechas** de prueba: a 6 h, el MAE híbrido sube de `0.00005502 mm` global a `0.00053952 mm`. Es un diagnóstico descriptivo con pocas fechas, no una estimación fiable del rendimiento bajo tormentas fuertes. En las ventanas cuyo desplazamiento objetivo es cero, persistencia es perfecta por definición; por eso el promedio global tampoco debe interpretarse sin examinar las ventanas con movimiento.

### Segundo origen temporal: prueba 2024

Para comprobar que el resultado no dependa de un único año, se añadió otro corte: entrenamiento 2020–2022 (258 escenarios), validación 2023 (82), prueba 2024 (82) y **exclusión íntegra de 2025** (78). Se entrenaron nuevos pesos para las cuatro alternativas. `data/validation/ta01-rolling-origin-model-comparison.csv` reúne ambos orígenes temporales y `data/validation/ta01-rolling-origin-bootstrap.json` registra los intervalos pareados por fecha.

| Prueba | Horizonte | MAE LSTM | MAE híbrido | Lectura |
|---|---:|---:|---:|---|
| 2024 | 1 h | 0.00000435 mm | 0.00000440 mm | LSTM ligeramente mejor |
| 2024 | 6 h | 0.00002909 mm | 0.00002964 mm | LSTM ligeramente mejor |
| 2025 | 1 h | 0.00000540 mm | 0.00000519 mm | Híbrido ligeramente mejor |
| 2025 | 6 h | 0.00005769 mm | 0.00005502 mm | Híbrido ligeramente mejor |

Los cuatro intervalos de confianza del 95 % para la diferencia de MAE incluyen cero. **No se sostiene que el corrector físico supere de forma robusta a la LSTM** en estos datos. Las restricciones físicas sí siguen verificándose como propiedades del modelo, pero eso es una conclusión distinta de la precisión predictiva. Estos dos cortes comparten el mismo generador FEM y una sola geometría, y 2024/2025 carecen de lluvias tan extremas como las del entrenamiento.

La selección entre LSTM e híbrido se simuló **sin usar la prueba para decidir**: se elige el menor MAE en el año de validación y recién después se observa el año de prueba. En tres de las cuatro combinaciones año–horizonte, esa elección no coincide con el menor MAE de prueba (`data/validation/ta01-rolling-model-selection.csv`). Las diferencias son pequeñas y sus intervalos incluyen cero; esto es una señal de selección inestable en el banco disponible, no una tasa de fallo extrapolable a minas. El visor por ello presenta ambos pronósticos como experimentales y no declara un ganador operacional.

Para generar el corte adicional antes de entrenar sus modelos:

```bash
npm run split:fem:chronological -- --validation-from=2023-01-01 --test-from=2024-01-01 --test-before=2025-01-01 --output-prefix=data/generated/ta01-fem-500-backtest-2024
```

Se usan los comandos de entrenamiento detallados a continuación, sustituyendo `ta01-fem-500-chronological` por `ta01-fem-500-backtest-2024`, `ta01-chronological` por `ta01-backtest-2024` y manteniendo los horizontes 1 y 6 h. Finalmente, `npm run report:research` regenera ambas tablas e intervalos.

Para reproducir los artefactos cronológicos después de generar el conjunto de 500 escenarios:

```bash
npm run split:fem:chronological
npm run train:baseline -- --horizon=1 --input-prefix=data/generated/ta01-fem-500-chronological --output=data/generated/ta01-chronological-baseline-1h.json
npm run train:baseline -- --horizon=6 --input-prefix=data/generated/ta01-fem-500-chronological --output=data/generated/ta01-chronological-baseline-6h.json
npm run train:lstm -- --horizon=1 --input-prefix=data/generated/ta01-fem-500-chronological --output=data/models/ta01-chronological-lstm-1h.json --predictions=data/generated/ta01-chronological-lstm-1h-test-predictions.csv --ridge-predictions=data/generated/ta01-chronological-baseline-1h-test-predictions.csv
npm run train:lstm -- --horizon=6 --input-prefix=data/generated/ta01-fem-500-chronological --output=data/models/ta01-chronological-lstm-6h.json --predictions=data/generated/ta01-chronological-lstm-6h-test-predictions.csv --ridge-predictions=data/generated/ta01-chronological-baseline-6h-test-predictions.csv
npm run train:physics -- --horizon=1 --input-prefix=data/generated/ta01-fem-500-chronological --lstm-model=data/models/ta01-chronological-lstm-1h.json --ridge-predictions=data/generated/ta01-chronological-baseline-1h-test-predictions.csv --output=data/models/ta01-chronological-physics-guided-1h.json --predictions=data/generated/ta01-chronological-physics-guided-1h-test-predictions.csv
npm run train:physics -- --horizon=6 --input-prefix=data/generated/ta01-fem-500-chronological --lstm-model=data/models/ta01-chronological-lstm-6h.json --ridge-predictions=data/generated/ta01-chronological-baseline-6h-test-predictions.csv --output=data/models/ta01-chronological-physics-guided-6h.json --predictions=data/generated/ta01-chronological-physics-guided-6h-test-predictions.csv
npm run report:research
```

## Línea base temporal

La primera referencia entrenada es una regresión ridge autorregresiva. Usa el desplazamiento inducido actual, lluvia, presión de poros, índice de seguridad y parámetros geotécnicos. La lluvia dentro del horizonte se trata como un pronóstico meteorológico exógeno conocido. El hiperparámetro se selecciona únicamente con validación.

La salida final aplica una restricción auditable: el desplazamiento inducido acumulado no puede ser menor que el valor presente. El JSON conserva las métricas de ridge sin restricción y el número de predicciones corregidas.

```bash
npm run train:baseline -- --horizon=1
npm run train:baseline -- --horizon=6
```

En la prueba aislada, la línea base restringida reduce el MAE frente a persistencia aproximadamente 33,6 % a una hora y 22,2 % a seis horas. Estos resultados describen el conjunto FEM semisintético dividido por fecha de lluvia y no demuestran desempeño sobre un talud real.

## LSTM entrenada

El proyecto incluye una LSTM many-to-one implementada con NumPy. Usa puertas de entrada, olvido, candidato y salida, retropropagación a través del tiempo, optimizador Adam, recorte de gradiente y parada temprana. Cada ejemplo contiene seis horas de historia y predice el incremento a una o seis horas.

```bash
npm run train:lstm -- --horizon=1
npm run train:lstm -- --horizon=6
npm run test:lstm
```

La prueba del núcleo compara la retropropagación con una derivada numérica. Con la semilla registrada, el error relativo observado es inferior a 1×10⁻⁸.

Sobre las mismas ventanas de prueba, la LSTM obtiene un MAE de `0.00000858 mm` y RMSE de `0.00005466 mm` a una hora, frente a `0.00001181 mm` y `0.00006266 mm` de ridge. A seis horas obtiene MAE `0.00006332 mm` y RMSE `0.00042635 mm`, frente a `0.00008855 mm` y `0.00044652 mm` de ridge. En esta partición disjunta por fecha, la LSTM mejora ambas métricas en los dos horizontes; esto sigue siendo una evaluación semisintética.

### Inferencia integrada

Al ejecutar TA-01 desde la aplicación, el servidor carga los pesos exportados y calcula automáticamente los horizontes de 1 h y 6 h. Cada pronóstico usa seis estados FEM previos, la lluvia conocida dentro del horizonte y los parámetros del escenario. La interfaz presenta la predicción junto con la respuesta FEM de la hora objetivo y su error. También se puede solicitar otra hora de origen mediante `POST /api/fem/lstm-forecast`.

Esta comparación es una validación embebida semisintética. La LSTM no se aplica directamente a la telemetría general porque sus unidades, objetivo y dominio aún no se han calibrado contra inclinómetros o radar de una mina real.

## Corrector neuronal guiado por física

`scripts/train-physics-guided.py` entrena un MLP residual sobre la salida LSTM. La pérdida combina consistencia supervisada con FEM, desplazamiento acumulado no decreciente, sensibilidad a lluvia, sensibilidad al índice de seguridad, condición seca y regularización. La arquitectura separa las contribuciones de lluvia y seguridad para imponer sus signos de forma monótona. El conjunto de prueba registra cero violaciones condicionales para ambas variables.

A una hora, el corrector obtiene MAE `0.00000798 mm` y RMSE `0.00005093 mm`, frente a `0.00000858 mm` y `0.00005466 mm` de la LSTM. A seis horas obtiene MAE `0.00006176 mm` y RMSE `0.00041181 mm`, frente a `0.00006332 mm` y `0.00042635 mm` de la LSTM. Mejora las dos métricas en esta partición, aunque ello no prueba superioridad fuera del banco semisintético.

El intervalo conformal se calcula con el conjunto de validación a cobertura nominal de 95 %. En prueba alcanza 96,07 % a una hora y 96,31 % a seis horas. La desviación se informa como error de calibración y no se oculta ajustando el cuantil con el conjunto de prueba.

```bash
npm run train:physics -- --horizon=1
npm run train:physics -- --horizon=6
npm run test:physics
```

Este corrector opera sobre variables FEM agregadas. No evalúa residuos de equilibrio espacial ni condiciones de frontera nodo a nodo; por ello se etiqueta como red guiada por física y no como PINN PDE completa.

## Sensibilidad de malla

`npm run validate:fem` reproduce un refinamiento desde 8×6 hasta 48×32 con el mismo evento de 48 mm. La malla predeterminada se elevó a 30×20 porque su máximo desplazamiento inducido difiere aproximadamente 2,1 % de la referencia interna 48×32; presión de poros e índice de seguridad también quedan dentro de aproximadamente 3 %. El máximo nodal no converge monótonamente porque el punto crítico puede cambiar de nodo entre mallas. Este ejercicio verifica sensibilidad interna, no exactitud frente a una solución analítica, un benchmark publicado o software certificado.

El mismo artefacto ejecuta una prueba analítica de parche: dos elementos CST sometidos a un campo de desplazamiento afín deben reproducir una deformación constante exacta. El error máximo calculado es inferior a `1e-12`. Esta prueba verifica la matriz cinemática del elemento, no la calibración geotécnica del caso TA-01.

También ejecuta una prueba global de elasticidad lineal sobre una malla rectangular de 12×8 celdas. Para el campo exacto `u_x=0, u_y=εy`, las tensiones son constantes y `div(σ)=0`; las tracciones se integran directamente sobre los bordes superior y derecho, mientras el empotramiento inferior y el rodillo izquierdo coinciden con los del solver. Al resolver la malla completa, el error nodal máximo es `1,62×10⁻¹¹ m` y el residuo relativo del solver `8,54×10⁻⁹`. A diferencia de la prueba local de parche, esto ejercita ensamblaje, cargas de contorno, restricciones y PCG. Sigue siendo un caso analítico de elasticidad homogénea: no valida el modelo de presión de poros, la geometría TA-01 ni el índice de seguridad, y no reemplaza un benchmark geotécnico publicado.

Se añadió una segunda prueba global con presión de poros **uniforme** de `120 kPa` y coeficiente de Biot `0,85`. Para el mismo desplazamiento afín conocido, las tracciones externas se reducen en `αp` y el vector de carga de Biot debe compensar exactamente esa diferencia. El error nodal máximo es `1,60×10⁻¹¹ m` y el residuo del solver `8,58×10⁻⁹`. Esto verifica el ensamblaje y el signo de la carga mecánica de presión de poros; **no valida** infiltración transitoria, distribución real de presión, parámetros TA-01 ni estabilidad de una mina.

## Aproximación espacial informada por el FEM

`npm run export:ta01-spatial-benchmark` genera un problema incremental de equilibrio `K Δu = Δf` para la malla TA-01 de 30×20 y la lluvia diaria NASA POWER del 14 de enero de 2021 (102,88 mm). `npm run train:ta01-spatial-pinn` ajusta una red PIELM con 320 funciones de base radial, pérdida de equilibrio sobre 650 grados de libertad y 12 desplazamientos nodales semisintéticos. El contorno empotrado inferior y el rodillo izquierdo se imponen exactamente por construcción. `npm run test:ta01-spatial-pinn` recalcula inferencia, errores y residuo a partir del artefacto guardado, y comprueba el SHA-256 del benchmark.

En los 354 nodos que no aportan datos de sensor, el error L2 relativo es 12,57 % (MAE 0,000827 mm); el residuo relativo `||KΔû−Δf||₂ / ||Δf||₂` es 14,39 %. La referencia alcanza 0,0620 mm de desplazamiento máximo. Los nodos reservados solo se excluyen de la supervisión por desplazamiento: sus ecuaciones de equilibrio sí participan en el entrenamiento. El FEM de referencia y la pérdida física comparten la misma rigidez y carga, por lo que esto verifica una aproximación interna, no valida el solver de manera independiente ni demuestra generalización a otros eventos. Tampoco incorpora plasticidad, presión de poros transitoria, calibración de campo o una pérdida PDE continua.

`GET /api/research/ta01-spatial-prediction?rainfallMm=48` devuelve el campo nodal para una lluvia acumulada entre 0 y 500 mm. El operador de rigidez y los materiales permanecen fijos, y la carga adicional del modelo actual es lineal en la lluvia acumulada; por ello se escala la salida del evento base de 102,88 mm. Se comprobó frente al FEM de 12,5, 48 y 200 mm que el error relativo en nodos sin datos se mantiene dentro de `1e-5` de la verificación base. Es una propiedad de esta formulación simplificada, no evidencia de generalización hidrológica ni una predicción para otra mina.

### Benchmark geotécnico publicado: referencia externa

El ejemplo 1 de [Griffiths y Lane (1999)](https://inside.mines.edu/~vgriffit/pubs/All_J_Pubs/41.pdf) proporciona un objetivo externo reproducible: talud homogéneo seco 2:1, `φ'=20°`, `c'/(γH)=0,05`, base empotrada y rodillo lateral, con factor de seguridad por reducción de resistencia cercano a 1,4. Su criterio es el incremento brusco del desplazamiento y la pérdida de convergencia de un análisis elastoplástico al reducir cohesión y fricción. El solver TA-01 actual es elástico lineal y su índice Mohr–Coulomb se posprocesa: **no debe compararse numéricamente con ese 1,4**. Para superar este benchmark faltan geometría y material homogéneos configurables, plasticidad con historia, reducción de resistencia, prueba de convergencia y estudio de malla con el mismo criterio de falla.

Se reprodujo el ejemplo con **XSLOPE 0.5.2**, usando su [muestra oficial](https://xslope.org/en/latest/verification/ssrm/) y malla cuadrática de 1503 nodos y 466 elementos. El FoS externo es `1,371875`, con intervalo final `[1,36875, 1,375]`; queda entre el último ensayo convergente `1,35` y el primero fallido `1,40` del artículo. El reporte `data/validation/external-ssrm-griffiths-lane.json` registra versión, unidades, parámetros, SHA-256 de la muestra y el resultado. **Valida la reproducción con XSLOPE, no el código FEM propio ni TA-01.**

Para repetir la corrida en un entorno temporal, descarga el paquete `.xslz` de la muestra oficial, extráelo conservando juntos `xslope_griffiths1.xlsx` y `xslope_griffiths1_mesh.json`, instala `xslope[fem]==0.5.2` y ejecuta:

```bash
python3 scripts/validate-external-ssrm.py --input /ruta/al/ejemplo/xslope_griffiths1.xlsx
```

El script rechaza cambios de unidades, geometría, material o elementos lineales y falla si el FoS queda fuera del intervalo de ensayos publicado. El tiempo observado fue del orden de un minuto; depende del equipo.

### Primera sección TA-01 con SSRM externo (seca)

`npm run export:ta01-ssrm-input` deriva la superficie escalonada y las propiedades SOIL/WEATHERED/ROCK de los valores por defecto del FEM propio. `scripts/validate-ta01-external-ssrm.py` crea tres polígonos de material, los malla con triángulos cuadráticos y aplica un SSRM Mohr–Coulomb con XSLOPE 0.5.2. La sección se extiende 60 m detrás de la cresta, 60 m después del pie y 40 m bajo el pie para evitar restricciones directamente en la zona de falla. La base está fija, los laterales tienen rodillo horizontal y no hay agua ni lluvia.

```bash
npm run export:ta01-ssrm-input
python3 scripts/validate-ta01-external-ssrm.py
```

El insumo `data/validation/ta01-external-ssrm-input.json` y el reporte `data/validation/ta01-external-ssrm.json` dejan trazadas la geometría, las tres zonas, el tamaño de elemento, la versión del solver y el SHA-256 del insumo. El FoS obtenido **no** es el índice lineal del visor ni lo valida: el dominio, el tipo de elemento y la ley constitutiva son distintos. Tampoco representa el estado bajo lluvia, que requerirá una presión de poros transitoria y contrastes de malla y contornos antes de usarse como referencia técnica.

Se repitió la misma entrada con tamaños de elemento 10, 8 y 6 m. Los factores fueron 1,4082, 1,4082 y 1,4277; la dispersión es 0,0195, aproximadamente el ancho de un intervalo final SSRM. `data/validation/ta01-external-ssrm-mesh-sensitivity.json` conserva los recuentos de malla y los intervalos. Esto es una **sensibilidad preliminar**, no una prueba de convergencia rigurosa ni de independencia del tamaño de dominio. Para reproducirla, ejecuta el validador con `--mesh-size 10`, `8` y `6`, usando un `--output` diferente para cada corrida, y pasa esos tres JSON a `scripts/summarize-ta01-ssrm-mesh.py`.

### Filtración transitoria: puerta de balance de masa

`scripts/validate-ta01-transient-seep.py` arma una lluvia rectangular de 102,88 mm en 24 h sobre la sección extendida y un problema de filtración de 48 h con conductividades, almacenamiento, niveles laterales y curva no saturada **supuestos**. Exige convergencia del solver y cierre de masa mejor que 5 % tanto con el diagnóstico interno como al comparar directamente ingreso neto y cambio de almacenamiento. En los ensayos iniciales con curva de frente lineal y flujo igual a la conductividad saturada, las mallas nominales de 20 y 12 m arrojaron cierres de masa de 42,85 y 26,75 veces la escala de referencia: **se rechazaron**.

La corrida aceptada **solo por balance de masa** usa una curva continua van Genuchten (`α=0,05 m⁻¹`, `n=1,5`) y limita el flujo aplicado a `0,01 Ksat` bajo la condición inicial seca asumida. En la malla nominal de 6 m, el cierre interno es menor de 0,2 % y la comparación directa de agua ingresada y almacenada difiere alrededor de 2,8 %. **Solo 0,0864 mm de los 102,88 mm se aplicaron como infiltración**; los 102,7936 mm restantes son lluvia no aplicada por el límite elegido, no escorrentía simulada. El reporte `data/validation/ta01-transient-seep.json` guarda procedencia y serie temporal.

La sensibilidad de malla se midió en el **mismo punto físico (4,96) m** para tamaños 12, 8, 6 y 4 m. A 48 h, los incrementos de carga fueron 0,01892, 0,000511, 0,000112 y 0,000139 m, respectivamente. La malla de 12 m sobrestima fuertemente la respuesta local; 8, 6 y 4 m difieren menos de 0,001 m en valor absoluto, pero solo se contrastó un punto. `data/validation/ta01-transient-seep-mesh-sensitivity.json` conserva recuentos y diferencias adyacentes. **No se ha demostrado convergencia del campo completo de presión de poros**, condiciones de contorno ni paso temporal; el experimento no acredita una estimación calibrada de infiltración real o estabilidad. Solo se usó en el SSRM externo exploratorio descrito abajo; no se conecta al FEM propio, el movimiento del visor 3D ni las redes entrenadas.

Se amplió el contraste a 6 395 puntos interiores de una cuadrícula física común de 2 m. `data/validation/ta01-transient-seep-field-sensitivity.json` calcula diferencias de cambio de carga a 24 y 48 h interpolando cada solución con sus **triángulos reales**. A 48 h, entre las mallas de 6 y 4 m el RMS es 0,00346 m y el máximo 0,03996 m; no disminuye monótonamente con refinamiento. La presión de poros *positiva* inducida por este flujo muy limitado es casi nula en las cuatro mallas, pero la distribución de carga/succión sí cambia. Esta evidencia **impide usar el campo completo como validación operacional**. Para repetir el contraste, genera los reportes de las cuatro mallas con `--include-fields` y pásalos a `scripts/compare-ta01-transient-fields.py`.

Se hizo además un **acoplamiento experimental condicionado** a 24 h: `scripts/couple-ta01-seep-ssrm.py` interpola el cambio de carga de la malla hidráulica tri3 de 6 m sobre una malla mecánica tri6 de 8 m. Los 23 nodos especiales se interpolaron sobre aristas de contorno con residuo geométrico máximo `7,1×10⁻¹⁵ m`; no se usó vecino cercano. El cambio máximo de presión de poros positiva fue `1,95×10⁻¹¹ kPa`. XSLOPE dio FoS `1,4082` tanto para el estado inicial con nivel supuesto a `−20 m` como a las 24 h, con el mismo intervalo SSRM `[1,3984, 1,4180]`. **La diferencia no es resoluble** con tolerancia de FoS `0,02`; no se afirma un efecto nulo en la realidad. `data/validation/ta01-rainfall-external-ssrm.json` conserva los resultados y la huella del campo fuente `data/validation/ta01-transient-seep-field-6m.json`. La comparación usa solo este escenario de infiltración mínima y no acredita sensibilidad a una tormenta real, calibración de campo ni alertas.

Para comprobar si la cadena puede transmitir una señal hidráulica no trivial, se agregó un **escenario húmedo hipotético**, sin pretensión de representar una mina: `Ksat` del suelo `1×10⁻⁵ m/s` y carga lateral inicial `−2 m`, manteniendo la lluvia supuesta de `102,88 mm/24 h` y el límite de flujo de `0,01 Ksat`. Así se aplican `8,64 mm` como infiltración; `94,24 mm` quedan fuera del modelo, **no** calculados como escorrentía. En la malla hidráulica de 6 m el cierre de masa es `0,91 %` y en la proyección a la malla SSRM el incremento máximo de presión de poros a 24 h es aproximadamente `2,0 kPa`. La comparación de mallas hidráulicas de 8, 6 y 4 m en `6 395` puntos indica, sin embargo, una diferencia RMS de cambio de carga a 24 h de `0,190 m` y una diferencia máxima de `2,459 m` entre 6 y 4 m. Por tanto, **ni siquiera este escenario con respuesta visible valida espacialmente el campo**, mucho menos las condiciones hidráulicas reales. El campo de 6 m y la comparación reproducible se conservan en `data/validation/ta01-transient-seep-wet-scenario-6m.json` y `data/validation/ta01-transient-seep-wet-scenario-field-sensitivity.json`.

Se reproduce con `--soil-conductivity-m-s 1e-5 --lateral-head-m -2 --include-fields` en `scripts/validate-ta01-transient-seep.py`, variando `--mesh-size` entre `8`, `6` y `4`; luego se pasan las tres salidas a `scripts/compare-ta01-transient-fields.py`. Estos parámetros son controles de sensibilidad, no estimaciones observadas de permeabilidad o nivel freático.

Al pasar el campo de 6 m por el mismo SSRM de 8 m, el FoS fue `1,4082` tanto al inicio como a 24 h, con intervalos finales idénticos `[1,3984, 1,4180]`. El cambio de FoS **no es resoluble a tolerancia 0,02**, aunque el campo sí contiene mayor presión de poros. Puede deberse a que el incremento está fuera de la zona mecánicamente crítica o a la resolución del cálculo; estos datos no permiten separar las causas. El reporte `data/validation/ta01-rainfall-wet-scenario-external-ssrm.json` se enlaza por SHA-256 al campo hidráulico fuente y se comprueba con `npm run test:ta01-wet-scenario`. No extrapolar este FoS a la realidad ni interpretarlo como ausencia de efecto de la lluvia.

Se añadió una sensibilidad **temporal** independiente sobre la misma malla tri3 de 6 m y los mismos supuestos hidráulicos. `scripts/validate-ta01-transient-seep.py` acepta `--dt-max-hours`; el valor canónico es `12 h`, aunque el paso adaptativo aceptado más largo fue `3,79 h`. Se repitió con límites `3`, `1,5`, `0,75`, `0,375`, `0,1875` y `0,1 h`, todos con cierre de masa menor de `1 %`. Al comparar los dos límites más finos, la diferencia RMS de carga a 24 h es `0,00054 m`, la máxima `0,00767 m` y la diferencia máxima de presión de poros positiva `0,00097 kPa`. Es una tendencia de refinamiento temporal, **no** una prueba formal de convergencia conjunta: al cambiar la malla de 6 a 4 m, el máximo de diferencia de carga a 24 h fue `2,459 m` bajo el esquema temporal canónico. Ambos errores pueden interactuar. `data/validation/ta01-transient-seep-wet-scenario-time-sensitivity.json` guarda las siete corridas, huellas de los campos y diferencias nodales; se regenera pasando sus siete salidas con `--include-fields` a `scripts/compare-ta01-transient-time.py`. Para uso físico todavía faltan contraste espacial más exigente, parámetros y contornos observados.

Para separar parcialmente la interacción espacio-tiempo, se repitieron las mallas de `8`, `6` y `4 m` con el mismo límite temporal de `0,1 h`. A las 24 h, entre `6` y `4 m` persiste una diferencia máxima de **`2,502 m` de carga** y RMS `0,194 m`; por tanto, refinar solo el tiempo no elimina la dependencia espacial. La diferencia máxima de **presión de poros positiva** en la cuadrícula común es menor, `0,0473 kPa` (RMS `0,00320 kPa`), frente a un incremento inducido de aproximadamente `2,02 kPa`. El campo de succión/carga no está espacialmente convergido, mientras que la presión positiva parece menos sensible en este rango; esa observación no demuestra convergencia de FoS ni estabilidad real. La comparación y las huellas de los tres campos están en `data/validation/ta01-transient-seep-wet-scenario-fine-time-mesh-sensitivity.json`; se reproduce con `--dt-max-hours 0.1 --include-fields` para cada malla y `scripts/compare-ta01-transient-fields.py`.

La mayor diferencia de carga entre `6` y `4 m` ocurre en `(−7, 97) m`, a `3 m` de la superficie: ambas soluciones tienen allí **carga de presión negativa** (aprox. `−95` y `−98 m`), por lo que esa discrepancia de `2,502 m` no se convierte en presión positiva para el SSRM. En los `2 660` puntos de la cuadrícula con presión positiva en alguna de las dos soluciones, la diferencia máxima de carga es `0,00482 m`. Se interpolaron además los tres campos hidráulicos de paso `0,1 h` sobre **la misma malla SSRM tri6 de 8 m**: entre las mallas hidráulicas `6` y `4 m`, la diferencia máxima de presión de poros aplicada a un nodo mecánico fue `0,0459 kPa` (RMS `0,00333 kPa`). `data/validation/ta01-wet-scenario-ssrm-pressure-mesh-sensitivity.json` guarda las huellas de los campos y errores de proyección. Esto aísla la incertidumbre nodal de entrada al SSRM, pero **no** prueba independencia del FoS respecto de la malla mecánica, geometría o condiciones de contorno.

Se comprobó la malla **mecánica** por separado: el mismo campo hidráulico canónico de 6 m y 24 h se acopló a SSRM tri6 de tamaños `10`, `8` y `6 m`. Los FoS iniciales y a 24 h fueron, respectivamente, `1,4082`, `1,4082` y `1,4277`; dentro de cada malla la lluvia supuesta no produjo un cambio resoluble con tolerancia `0,02`. La dispersión de FoS entre mallas fue `0,0195`, equivalente al ancho de sus intervalos finales, por lo que el **valor absoluto tampoco está independizado de la malla**. `data/validation/ta01-rainfall-wet-scenario-ssrm-mesh-sensitivity.json` resume las tres corridas y las enlaza al mismo campo fuente. Esta prueba mantiene fija una sola malla hidráulica: no demuestra convergencia acoplada ni justifica alertas reales.

### Ablación de componentes entrenados

El JSON de cada horizonte incluye una ablación evaluada sobre el mismo conjunto de prueba reservado. Los grupos retirados se reemplazan por sus medias de entrenamiento para evitar usar estadísticas de prueba. El híbrido completo obtiene el menor MAE en ambos horizontes: `0.00000798 mm` a 1 h y `0.00006176 mm` a 6 h. Retirar hidrología produce la mayor degradación (`0.00002571 mm` y `0.00016214 mm`); retirar variables de estado FEM también degrada el MAE (`0.00000936 mm` y `0.00007204 mm`). La sustitución puede formar combinaciones fuera de la distribución conjunta original, por lo que debe interpretarse como evidencia interna del banco semisintético.

### Robustez de las entradas

`npm run validate:robustness` genera `data/validation/ta01-model-robustness.json`. El ruido de 5 % de la desviación de entrenamiento incrementa el MAE híbrido 53,88 % a 1 h y 46,10 % a 6 h. La pérdida aleatoria de 30 % de entradas, imputada con medias de entrenamiento, lo incrementa 133,96 % y 70,77 %. Esta prueba es interna y MCAR; justifica mantener reglas de calidad de sensores antes de cualquier despliegue.

Un retraso de tres horas simulado mediante arrastre de la última observación cambia el MAE −14,29 % a 1 h y −7,22 % a 6 h en este conjunto; **no** significa que retrasar sensores mejore un sistema real. La partición estacional simplificada muestra mayor error en noviembre–abril que en mayo–octubre; no debe interpretarse como climatología local calibrada, sino como un control de estabilidad por época de la fuente de lluvia.

## Material suplementario reproducible

`npm run report:research` consolida los artefactos entrenados en tablas CSV dentro de `data/validation/`: comparación de modelos, ablación, robustez, sensibilidad de malla, detección de episodios de desplazamiento alto y verificación PINN espacial. `ta01-replication-manifest.json` registra el conjunto, la partición y el SHA-256 de cada entrada.

La tabla de detección define como clase positiva un desplazamiento inducido igual o superior al percentil 95 calculado solo con entrenamiento. Reporta precisión, recall, F1, tasa de falsa alarma y anticipación media en test. Es una prueba de discriminación semisintética, no un umbral de seguridad ni evidencia de detección de fallas reales.

## Uso en el visor

`POST /api/fem/run` ejecuta las 24 soluciones horarias y devuelve el campo nodal de cada estado. El visor Three.js muestra el corte triangular FEM delante del talud:

- con **Movimiento del terreno** activo, deforma los nodos según el desplazamiento incremental por lluvia;
- con esa opción desactivada, mantiene la malla fija y muestra vectores;
- el color verde–amarillo–rojo representa la magnitud relativa del movimiento dentro de la corrida;
- la geometría usa autoescala visual para hacer legibles desplazamientos submilimétricos; los valores del panel permanecen en magnitud física real.

## Adaptador para resultados FEM externos

`POST /api/fem/import` acepta un JSON con una malla triangular producida por otro solver. El contrato mínimo contiene `nodes`, `elements` y `units`; puede incluir `timeSeries`, lluvia, procedencia y una declaración de convergencia. Se admiten longitudes en m o mm, desplazamientos en mm o m y presión de poros en Pa, kPa o MPa. El archivo `public/samples/external-fem-example.json` es un ejemplo ejecutable.

El adaptador remapea identificadores de nodos, normaliza unidades y valida que cada elemento refiera tres nodos existentes. En series temporales también conserva una topología canónica aunque el solver cambie el orden de salida y rechaza identificadores o coordenadas inconsistentes. No verifica la formulación, las condiciones de borde, la convergencia ni la calibración del software de origen. Por eso toda corrida importada se etiqueta `FEM_EXTERNO_IMPORTADO_NO_VERIFICADO` y no recibe pronósticos LSTM/híbridos entrenados en TA-01.

## Siguiente validación científica

1. Contrastar el solver con un benchmark geotécnico publicado.
2. Ejecutar un análisis de sensibilidad de malla y condiciones de borde.
3. Sustituir los rangos supuestos por parámetros de un caso abierto documentado.
4. Incorporar observaciones públicas de deformación o construir un experimento físico a escala.
5. Extender la aproximación espacial TA-01 a pérdidas PDE continuas, múltiples eventos/geometrías y contraste independiente; la red discreta de un solo evento no cubre aún ese objetivo.

Si no se dispone de instrumentación de una mina, [Fuentes públicas para Pasco](FUENTES_PUBLICAS_PASCO.md) distingue lo que sí puede obtenerse (lluvia, cartografía, topografía regional y posible InSAR) de las variables que requieren medición o un caso geotécnico abierto con parámetros y deformación independientes. Ninguna fuente pública listada autoriza activar decisiones operacionales.
