# Integración del artículo con M-1

## Propósito

El proyecto implementa el flujo operativo propuesto por el manuscrito **“Gemelo digital basado en una red neuronal informada por la física para la predicción en tiempo real de la estabilidad de taludes en minas a cielo abierto”**. La integración permite desarrollar y evaluar los componentes de forma incremental, manteniendo explícita su madurez científica.

## Correspondencia implementada

| Artículo | Implementación actual | Estado |
|---|---|---|
| Estado mecánico FEM | Solver 2D CST lineal para TA-01; el pronóstico en vivo conserva además la aproximación reducida | Implementado, no calibrado |
| Benchmark SSRM publicado | Ejemplo 1 de Griffiths–Lane reproducido con XSLOPE 0.5.2, FoS externo 1,371875 | Referencia independiente del proyecto; todavía no superada por el FEM propio |
| Dependencia temporal LSTM | LSTM many-to-one entrenada con BPTT/Adam y línea base ridge comparable | Entrenada con FEM semisintético; sin validación real |
| Restricción PINN | Corrector residual sobre LSTM; benchmark PDE manufacturado; PIELM TA-01 con equilibrio FEM discreto y contorno exacto | TA-01 aproximado para un evento semisintético, sin PDE continua acoplada ni validación independiente/de campo |
| Telemetría | Desplazamiento, presión de poros, lluvia, calidad y fuente | API con persistencia SQLite local |
| Sensibilidad hidrológica | Eventos manuales y lluvia diaria NASA POWER de Pasco, con infiltración y drenaje | Semisintética; respuesta demostrativa |
| Alerta temprana | FoS, índice de riesgo, incertidumbre y niveles configurables | Política no validada |
| Representación espacial | Visor Three.js con geometría 3D y sección FEM 2D nodal animada | El corte es FEM 2D; el volumen no es FEM 3D |
| Evaluación experimental | Comparación por fechas de lluvia disjuntas y dos orígenes cronológicos (pruebas 2024 y 2025) con persistencia, ridge, LSTM e híbrido físico; MAE, RMSE, SMAPE, sesgo, R², cobertura y latencia | Todos los experimentos son semisintéticos; no son validación de campo |
| Persistencia operacional | SQLite WAL: telemetría por variable, geometrías, modelos, corridas FEM resumidas, pronósticos, alertas y eventos | Local, sin réplica ni cifrado; solo prototipo |

## Protocolo integrado

`GET /api/research` expone el objetivo, variables de interés, madurez de FEM/LSTM/PINN y último experimento. Cada pronóstico incorpora:

- versión y estado científico del modelo;
- identificación de los tres componentes;
- cantidad, completitud y procedencia de las lecturas;
- indicación explícita de si los datos permiten uso operacional.

`POST /api/research/ablation` ejecuta un backtest con separación temporal sobre las lecturas disponibles. Compara:

1. persistencia;
2. sustituto temporal;
3. modelo físico reducido;
4. híbrido sin variables hidrológicas;
5. híbrido completo del MVP.

El resultado puede descargarse como JSON desde el panel para conservar la configuración, el horizonte, el tamaño de muestra y las métricas.

## Caso de estudio TA-01

El primer caso usa precipitación diaria NASA POWER en las coordenadas -10.68, -76.26 para 2020–2025. El archivo original y su ficha de procedencia se conservan en `data/rainfall/`. El sistema permite seleccionar cualquier fecha disponible y reproducir su total diario.

Como el archivo no contiene horas, se usa un perfil rectangular estimado de 6, 12 o 24 horas que conserva el total diario. Únicamente el total diario de lluvia procede del conjunto externo; la presión de poros, el desplazamiento y el riesgo permanecen simulados. En consecuencia, los experimentos que usan esta fuente se etiquetan como `SEMI_SINTETICO_REANALISIS_LLUVIA`.

TA-01 dispone además de un solver FEM 2D con elementos triangulares CST, elasticidad lineal en deformación plana, peso propio y carga de presión de poros de Biot. La API devuelve los campos nodales de 24 estados cuasiestáticos y el visor reproduce esos nodos sobre un corte triangular. La formulación, los rangos asumidos y el generador del conjunto de entrenamiento se describen en [CASO_TA01_FEM.md](CASO_TA01_FEM.md).

El mismo visor acepta resultados triangulares JSON de un solver FEM externo. El adaptador valida unidades y conectividad y conserva la procedencia declarada, pero no certifica el modelo importado. Tampoco transfiere automáticamente las redes TA-01 a una geometría o material distintos.

Sobre la LSTM se entrenó un corrector residual neuronal. Su arquitectura impone que, manteniendo lo demás constante, más lluvia futura no reduzca la corrección y un índice de seguridad mayor no la incremente. El intervalo usa un cuantil de error absoluto calculado únicamente con validación. Este componente corresponde a una red guiada por física agregada y no debe describirse como solución PINN de las ecuaciones de equilibrio espacial.

De forma separada, `scripts/train-spatial-pinn.py` entrena una red PIELM espacial sobre una solución manufacturada de elasticidad lineal en deformación plana. La pérdida algebraica incluye el operador de Navier en puntos interiores y condiciones de Dirichlet en los cuatro bordes. Esta prueba demuestra que el pipeline puede calcular derivadas espaciales, residuos de equilibrio y contorno; no demuestra todavía que la red reproduzca TA-01, presión de poros, plasticidad o comportamiento observado de una mina.

`scripts/export-ta01-spatial-benchmark.js` y `scripts/train-ta01-spatial-pinn.py` añaden un paso distinto: para la lluvia diaria del 14 de enero de 2021 generan el sistema incremental FEM TA-01 `KΔu=Δf` y aproximan su campo nodal con una PIELM/RBF, 12 nodos semisintéticos y contornos exactos. El error L2 relativo es 12,57 % en nodos sin datos de sensor; el residuo de equilibrio discreto es 14,39 %. La pérdida usa las ecuaciones físicas de todos los nodos libres y comparte el operador con la referencia. Por ello no es una evaluación FEM independiente ni una PINN PDE continua, y no se conecta a alertas ni se extrapola a otros taludes.

La API puede escalar ese campo a otra cantidad de lluvia acumulada para el mismo escenario, porque en el FEM actual la carga incremental depende linealmente de esa cantidad. Las pruebas comprueban 12,5, 48 y 200 mm contra corridas FEM adicionales. Esto no cambia el carácter semisintético ni demuestra extrapolación a infiltración transitoria, nuevas geometrías o materiales.

La ablación entrenada usa exclusivamente fechas de lluvia reservadas para prueba y sustituye cada grupo retirado por medias aprendidas en entrenamiento. A 1 h, el MAE del híbrido completo es `0.00000798 mm`, frente a `0.00000936 mm` sin estado FEM y `0.00002571 mm` sin hidrología. A 6 h es `0.00006176 mm`, frente a `0.00007204 mm` sin FEM y `0.00016214 mm` sin hidrología. Esto evidencia que ambos grupos aportan señal en el banco semisintético; no demuestra todavía transferencia a una mina real.

Como comprobación complementaria, los cuatro métodos se reentrenaron con escenarios 2020–2023, se seleccionaron con 2024 y se evaluaron en 2025. En ventanas comparables, la LSTM y el híbrido lograron MAE `0.00000540` y `0.00000519 mm` a 1 h, y `0.00005769` y `0.00005502 mm` a 6 h. Las diferencias observadas favorecen al híbrido, pero los intervalos de bootstrap pareado por fecha incluyen cero en ambos horizontes: no se ha demostrado una ventaja estadísticamente concluyente. El experimento cronológico evita usar lluvia de 2025 durante el ajuste, pero los objetivos siguen siendo desplazamientos FEM semisintéticos. El año de prueba tampoco contiene lluvias tan extremas como el entrenamiento. Su protocolo y comandos figuran en [CASO_TA01_FEM.md](CASO_TA01_FEM.md).

Un segundo origen entrena en 2020–2022, valida en 2023 y prueba en 2024, excluyendo por completo 2025. Allí la LSTM tiene un MAE levemente menor que el híbrido a 1 y 6 h; los intervalos pareados también incluyen cero. El signo de la diferencia cambia entre años, por lo que el manuscrito no debe afirmar superioridad predictiva general del corrector guiado por física con la evidencia actual.

Una simulación de selección por MAE de validación tampoco identifica al modelo de menor MAE de prueba en tres de cuatro combinaciones año–horizonte. Las diferencias son pequeñas y no concluyentes, pero refuerzan que el prototipo no debe promocionar automáticamente al híbrido como modelo de producción.

La robustez también se evalúa sin reentrenamiento. Con ruido gaussiano equivalente al 5 % de la desviación de entrenamiento, el MAE híbrido aumenta 53,88 % a 1 h y 46,10 % a 6 h. Con 30 % de entradas faltantes MCAR e imputación por media, aumenta 133,96 % y 70,77 %, respectivamente. El prototipo debe por tanto bloquear o degradar explícitamente los pronósticos cuando la calidad de telemetría sea insuficiente.

La API materializa esa regla mediante `modelDiagnostics.dataQuality`: revisa al menos 24 lecturas, completitud mínima de 80 %, brechas máximas de 3 h, marcas temporales duplicadas, actualización dentro de 3 h y un mínimo de 80 % de lecturas cuya fuente se declara observada. `passesQualityGate` solo certifica estos controles estructurales, no la autenticidad de la fuente ni la validez científica del modelo. El cálculo demostrativo sigue visible para poder probar el sistema, pero `operationalDecisionAllowed` permanece en `false` incluso si los datos pasan la puerta de calidad: el modelo general continúa sin calibración y validación geotécnica independientes.

La ingesta CSV/JSON por lote y la API `/api/sensors` permiten separar las series por estación. SQLite escribe cada lote en una sola transacción; el pronóstico seleccionado consulta únicamente la estación activa y mantiene separadas las fuentes declaradas de campo respecto de las simuladas. Las lecturas antiguas pueden consultarse, pero no generan nuevas alertas.

También se simulan retrasos de 1 h y 3 h mediante arrastre de la última lectura, y se reportan métricas separadas para una estación húmeda simplificada (noviembre–abril) y seca (mayo–octubre). A tres horas de retraso, el MAE cambia −14,29 % a 1 h y −7,22 % a 6 h en esta partición. Que el error baje aquí no implica que retrasar sensores ayude en una red real; refleja la composición de los escenarios y este esquema de perturbación.

## Interpretación correcta

El experimento sirve para depurar el protocolo y detectar qué componente ayuda o perjudica en los datos actuales. Que una variante obtenga menor error no demuestra superioridad científica: los desplazamientos sintéticos provienen del FEM propio y los componentes aún no han sido calibrados ni evaluados con observaciones independientes de campo.

## Criterios antes de publicar resultados

- FEM 2D/3D calibrado y contrastado con un caso de referencia.
- División temporal documentada de datos reales, sin fuga de información.
- LSTM entrenada y comparada con persistencia y regresión.
- PINN entrenada con pérdidas de datos, equilibrio, contorno y consistencia FEM.
- Ablación repetida por estación, evento y horizonte.
- Métricas de error, alerta, incertidumbre y latencia con intervalos de confianza.
- Registro persistente de conjuntos de datos, parámetros, pesos y ejecuciones.

Hasta cumplir estos criterios, el sistema debe describirse como **prototipo de investigación y apoyo académico a la decisión**.
