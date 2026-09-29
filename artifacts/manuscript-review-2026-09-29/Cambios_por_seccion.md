# Cambios editoriales por sección

Copia de revisión, 29 de septiembre de 2026. El manuscrito completo está en Articulo_TA01_revisado.docx. Cambios resaltados en amarillo y comentarios de Word. Se excluyen de este registro cambios puramente tipográficos de cada celda o estilo, ya descritos en el informe. Los párrafos sin cambio textual conservan el contenido del original.

## Portada y resúmenes

### Cambio 1 · ubicación original: 7

**Antes**

Introducción. La actualización frecuente de modelos de taludes exige relacionar lluvia, respuesta mecánica y series temporales sin confundir una demostración computacional con un sistema validado en campo. Objetivo. Evaluar un prototipo semisintético que combina un modelo de elementos finitos bidimensional (FEM), una red de memoria a corto y largo plazo (LSTM) y un corrector residual con restricciones de monotonía para pronosticar el incremento de desplazamiento inducido por lluvia. Métodos. El caso TA-01 empleó geometría supuesta, precipitación diaria de reanálisis NASA POWER de 2020 a 2025 y 500 escenarios horarios de 24 h. Persistencia, regresión ridge, LSTM e híbrido se compararon mediante una partición por fechas y dos cortes cronológicos; la incertidumbre se estimó con 5000 remuestreos por bloques de fecha. Resultados. En la partición por fecha, el error absoluto medio (MAE) del híbrido fue 0,00000798 mm a 1 h y 0,00006176 mm a 6 h, frente a 0,00000858 y 0,00006332 mm de la LSTM. La LSTM obtuvo menor MAE en 2024 y el híbrido en 2025. Los cuatro intervalos de confianza del 95 % de la diferencia incluyeron cero. Conclusiones. El flujo permite estudiar el acoplamiento FEM y aprendizaje temporal bajo condiciones controladas, pero la evidencia no demuestra superioridad general del corrector ni validez para alertas operacionales.

**Después**

Introducción. La actualización frecuente de modelos de taludes exige relacionar lluvia, respuesta mecánica y series temporales sin confundir una demostración computacional con un sistema validado en campo. Objetivo. Evaluar un prototipo semisintético que combina un modelo de elementos finitos bidimensional (FEM), una red de memoria a corto y largo plazo (LSTM) y un corrector residual con restricciones de monotonía para pronosticar el desplazamiento máximo inducido por lluvia respecto del estado inicial. Métodos. El caso TA-01 empleó geometría supuesta, precipitación diaria de reanálisis NASA POWER de 2020 a 2025 y 500 escenarios horarios de 24 h. Persistencia, regresión ridge, LSTM e híbrido se compararon mediante una partición por fechas y dos cortes cronológicos; la incertidumbre se estimó con 5000 remuestreos por conglomerados de fecha. Resultados. En la partición por fecha, el error absoluto medio (MAE) del híbrido fue 0,00000798 mm a 1 h y 0,00006176 mm a 6 h, frente a 0,00000858 y 0,00006332 mm de la LSTM. La LSTM obtuvo menor MAE en 2024 y el híbrido en 2025. Los cuatro intervalos de confianza del 95 % de la diferencia incluyeron cero. Conclusiones. El flujo permite estudiar el acoplamiento FEM y aprendizaje temporal bajo condiciones controladas, pero la evidencia no demuestra superioridad general del corrector ni validez para alertas operacionales.

**Justificación:** Distinguir magnitud inducida respecto del estado inicial del incremento temporal aprendido y nombrar correctamente el remuestreo.

### Cambio 2 · ubicación original: 10

**Antes**

Introduction. Frequent slope-model updates require rainfall, mechanical response, and time-series information to be related without confusing a computational demonstration with a field-validated system. Objective. To evaluate a semisynthetic prototype combining a two-dimensional finite element model (FEM), a long short-term memory network (LSTM), and a residual correction constrained by monotonicity for rainfall-induced displacement-increment forecasting. Methods. The TA-01 case used assumed geometry, daily NASA POWER reanalysis precipitation from 2020 to 2025, and 500 simulated 24-hour scenarios. Persistence, ridge regression, LSTM, and the hybrid were compared using a rainfall-date split and two chronological tests; uncertainty was estimated with 5,000 date-block resamples. Results. In the date-separated test, hybrid mean absolute error (MAE) was 0.00000798 mm at 1 h and 0.00006176 mm at 6 h, compared with 0.00000858 and 0.00006332 mm for LSTM. LSTM had lower MAE in 2024, whereas the hybrid had lower MAE in 2025. All four 95% confidence intervals for the difference included zero. Conclusions. The workflow supports controlled study of FEM and temporal learning, but the evidence does not establish a general advantage for the correction model or validity for operational alerts.

**Después**

Introduction. Frequent slope-model updates require rainfall, mechanical response, and time-series information to be related without confusing a computational demonstration with a field-validated system. Objective. To evaluate a semisynthetic prototype combining a two-dimensional finite element model (FEM), a long short-term memory network (LSTM), and a residual correction constrained by monotonicity for forecasting maximum rainfall-induced displacement relative to the initial state. Methods. The TA-01 case used assumed geometry, daily NASA POWER reanalysis precipitation from 2020 to 2025, and 500 simulated 24-hour scenarios. Persistence, ridge regression, LSTM, and the hybrid were compared using a rainfall-date split and two chronological tests; uncertainty was estimated with 5,000 rainfall-date cluster resamples. Results. In the date-separated test, hybrid mean absolute error (MAE) was 0.00000798 mm at 1 h and 0.00006176 mm at 6 h, compared with 0.00000858 and 0.00006332 mm for LSTM. LSTM had lower MAE in 2024, whereas the hybrid had lower MAE in 2025. All four 95% confidence intervals for the difference included zero. Conclusions. The workflow supports controlled study of FEM and temporal learning, but the evidence does not establish a general advantage for the correction model or validity for operational alerts.

**Justificación:** Alinear el resumen inglés con el objetivo y el estimador implementados.

## Siglas y abreviaturas

### Cambio 1 · ubicación original: 13

**Antes**

FEM: método de elementos finitos; FoS: factor de seguridad; LHS: muestreo Latin Hypercube; LSTM: red de memoria a corto y largo plazo; MAE: error absoluto medio; PIELM/RBF: modelo de aprendizaje extremo informado por física con funciones de base radial; PINN: red neuronal informada por la física.

**Después**

FEM: método de elementos finitos; FoS: factor de seguridad; IC: intervalo de confianza; IoT: internet de las cosas; LHS: muestreo por hipercubo latino; LSTM: red de memoria a corto y largo plazo; MAE: error absoluto medio; MLP: perceptrón multicapa; MSE: error cuadrático medio; PIELM: modelo de aprendizaje extremo informado por física; PINN: red neuronal informada por la física; RBF: función de base radial; RMSE: raíz del error cuadrático medio; RQ: pregunta de investigación.

**Justificación:** Completar siglas y separar PIELM de RBF.

## Introducción

### Cambio 1 · ubicación original: 15

**Antes**

La estabilidad de los taludes constituye una condición crítica para la continuidad y seguridad de las operaciones en minas a cielo abierto. La excavación modifica de manera progresiva la geometría del macizo rocoso, el estado tensional y los regímenes de infiltración y presión de poros. En consecuencia, una estimación aislada del factor de seguridad (FoS) resulta insuficiente cuando las condiciones geotécnicas y operacionales cambian a lo largo del tiempo. Wang et al. (2023) señalan que el aprendizaje profundo mejora la eficiencia de la predicción del factor de estabilidad y contribuye a la seguridad durante el desarrollo del proyecto. Por ello, una capacidad de previsión que anticipe la tendencia de desplazamientos, las variaciones de presión de poros y la reducción del FoS puede apoyar decisiones de alerta, evacuación, rediseño de bancos y control de producción.

**Después**

La estabilidad de los taludes constituye una condición crítica para la continuidad y seguridad de las operaciones en minas a cielo abierto. La excavación modifica de manera progresiva la geometría del macizo rocoso, el estado tensional y los regímenes de infiltración y presión de poros. En consecuencia, una estimación aislada del factor de seguridad (FoS) resulta insuficiente cuando las condiciones geotécnicas y operacionales cambian a lo largo del tiempo. Wang et al. (2023) señalan que el aprendizaje profundo puede facilitar la predicción del factor de estabilidad en el caso estudiado. Por ello, una capacidad de previsión que anticipe la tendencia de desplazamientos, las variaciones de presión de poros y la reducción del FoS podría apoyar decisiones de alerta, evacuación, rediseño de bancos y control de producción, siempre que su desempeño y sus umbrales se validen para el sitio.

**Justificación:** Evitar extrapolar resultados de una publicación a seguridad operacional del prototipo.

### Cambio 2 · ubicación original: 16

**Antes**

Los enfoques convencionales de análisis de estabilidad, incluidos los modelos de equilibrio límite y de elementos finitos (FEM), representan de forma explícita la geometría, la resistencia y las condiciones de frontera. Esta base física es indispensable para interpretar mecanismos de falla y evaluar escenarios de lluvia, excavación o cambios en las propiedades del material. Sin embargo, sus resultados suelen depender de parámetros que presentan incertidumbre y de actualizaciones que no siempre acompañan la velocidad del monitoreo en campo. En una aplicación de gemelo digital de talud, Liu et al. (2022, sección «Abstract», párr. 1) reportaron que “The predicted temporal variation of slope stability agrees well with the observed slope failure induced by an extreme rainstorm in June of 2008” [La variación temporal prevista de la estabilidad del talud concuerda bien con la falla observada, inducida por una tormenta extrema en junio de 2008; traducción propia]. Este antecedente muestra el valor de actualizar el modelo con registros de desempeño y observaciones, pero también plantea la necesidad de convertir esa actualización en pronósticos operativos de baja latencia.

**Después**

Los enfoques convencionales de análisis de estabilidad, incluidos los modelos de equilibrio límite y de elementos finitos (FEM), representan de forma explícita la geometría, la resistencia y las condiciones de frontera. Esta base física permite interpretar mecanismos de falla y evaluar escenarios de lluvia, excavación o cambios en las propiedades del material. Sin embargo, sus resultados dependen de parámetros inciertos y de actualizaciones que no siempre acompañan la velocidad del monitoreo en campo. Liu et al. (2022) contrastaron la evolución de la estabilidad de un gemelo digital de talud con una falla observada asociada a lluvia extrema. Este antecedente muestra la importancia de actualizar y contrastar el modelo con registros de desempeño y observaciones; TA-01 no dispone de ese contraste.

**Justificación:** Parafrasear la cita literal y mantener explícita la diferencia entre antecedente observado y caso semisintético.

### Cambio 3 · ubicación original: 17

**Antes**

El desarrollo de sensores geotécnicos, estaciones meteorológicas, sistemas IoT y fotogrametría ha ampliado la disponibilidad de series temporales para este propósito. No obstante, el uso exclusivo de aprendizaje automático puede producir predicciones difíciles de interpretar o físicamente inconsistentes, especialmente ante escenarios que no están bien representados en los datos históricos. Pei et al. (2023, sección «Abstract», párr. 1) encontraron que “The three proposed methods were found to outperform both domain knowledge–based models and pure data-driven models” [Se encontró que los tres métodos propuestos superan tanto a los modelos basados en conocimiento del dominio como a los modelos puramente basados en datos; traducción propia]. Esta conclusión respalda la integración explícita de conocimiento geotécnico en el entrenamiento de modelos predictivos, incluida su incorporación en la función de aprendizaje.

**Después**

El desarrollo de sensores geotécnicos, estaciones meteorológicas, sistemas IoT y fotogrametría ha ampliado la disponibilidad de series temporales para este propósito. No obstante, el uso exclusivo de aprendizaje automático puede producir predicciones difíciles de interpretar o físicamente inconsistentes, especialmente ante escenarios poco representados en los datos históricos. Pei et al. (2023) evaluaron métodos que incorporan conocimiento del dominio y documentaron ventajas predictivas en los conjuntos analizados. Ese resultado motiva examinar restricciones geotécnicas en el aprendizaje, pero no garantiza que cualquier corrector físico mejore cualquier predictor.

**Justificación:** Parafrasear y evitar inferir superioridad general a partir de un antecedente.

### Cambio 4 · ubicación original: 18

**Antes**

Los gemelos digitales ofrecen una estructura adecuada para dicha integración porque vinculan una representación computacional del talud con sus observaciones actuales y con mecanismos de actualización. Piciullo et al. (2025, p. 1) reportan que “The trained models proved to be effective and were employed to forecast slope stability for the rolling three days” [Los modelos entrenados demostraron ser eficaces y se emplearon para pronosticar la estabilidad del talud durante los tres días móviles siguientes; traducción propia]. Su resultado confirma la viabilidad de articular monitoreo hidrológico, información meteorológica, modelado numérico y predicción automática en una plataforma de alerta. Sin embargo, sigue siendo necesario desarrollar configuraciones específicas para minería a cielo abierto que preserven la respuesta mecánica representada por FEM, incorporen la dependencia temporal de las señales de monitoreo y puedan ejecutarse con la frecuencia requerida por la operación.

**Después**

Los gemelos digitales vinculan una representación computacional del talud con observaciones y mecanismos de actualización. Piciullo et al. (2025) integraron monitoreo hidrológico, meteorología, modelado numérico y aprendizaje automático para emitir pronósticos móviles de estabilidad. Su experiencia ofrece un antecedente operacional distinto de TA-01. En el presente estudio se examina una configuración semisintética que conserva una respuesta mecánica FEM e incorpora dependencia temporal; no se mide su frecuencia de actualización ni su utilidad para alertas en mina.

**Justificación:** Parafrasear y no transferir la validación operacional de otro estudio.

### Cambio 5 · ubicación original: 19

**Antes**

Los trabajos más cercanos cubren componentes parciales del problema. Liu et al. (2022) y Piciullo et al. (2025) actualizaron pronósticos con datos observados; Pei et al. (2023) incorporaron conocimiento del dominio en el aprendizaje; y Zhang, Z., et al. (2024) impusieron ecuaciones y condiciones de contorno en un marco tridimensional. Ninguno de esos antecedentes coincide con el alcance exacto de TA-01: un banco semisintético trazable que compara una LSTM con una corrección residual monótona y examina su estabilidad entre fechas de lluvia. La brecha evaluada aquí es, por tanto, metodológica y acotada: determinar qué aporta esa corrección dentro de un generador FEM controlado antes de atribuirle validez de campo.

**Después**

Los trabajos más cercanos cubren componentes parciales del problema. Liu et al. (2022) y Piciullo et al. (2025) actualizaron pronósticos con datos observados; Pei et al. (2023) incorporaron conocimiento del dominio en el aprendizaje; y Zhang, Z., et al. (2024) impusieron ecuaciones y condiciones de contorno en un marco tridimensional. La comparación de la Tabla 1 delimita el alcance específico de TA-01, sin establecer prioridad absoluta: un banco semisintético trazable que compara una LSTM con una corrección residual monótona y examina su estabilidad entre fechas de lluvia. La brecha evaluada aquí es, por tanto, metodológica y acotada: determinar qué aporta esa corrección dentro de un generador FEM controlado antes de atribuirle validez de campo.

**Justificación:** Delimitar novedad sin afirmar ausencia global de trabajos equivalentes.

## Preguntas de investigación y contribución

### Cambio 1 · ubicación original: 28

**Antes**

RQ1. ¿Cómo cambia el MAE de persistencia, ridge, LSTM e híbrido en horizontes de 1 y 6 h bajo fechas de lluvia disjuntas y cortes cronológicos?

**Después**

RQ1. ¿Cómo cambia el MAE de persistencia, ridge, LSTM e híbrido en horizontes de 1 y 6 h con fechas de lluvia disjuntas y cortes cronológicos?

**Justificación:** Mejorar precisión de la formulación sin cambiar la pregunta.

### Cambio 2 · ubicación original: 32

**Antes**

Cada pregunta se vincula con resultados específicos: RQ1 con las Tablas 2 y 3, RQ2 con los intervalos pareados por fecha, RQ3 con las pruebas de perturbación y RQ4 con las verificaciones del FEM y la aproximación espacial.

**Después**

Cada pregunta se vincula con métodos y resultados específicos: RQ1 con las Tablas 3 y 4; RQ2 con los intervalos pareados por fecha de la Figura 3; RQ3 con las perturbaciones de la Tabla 6 y la Figura 5; y RQ4 con la verificación del FEM y la aproximación espacial de la Tabla 5 y la Figura 2. Las conclusiones conservan estos límites de evaluación.

**Justificación:** Hacer trazables RQ, tablas, figuras y conclusiones tras ordenar la numeración.

## Arquitectura y trazabilidad del prototipo

### Cambio 1 · ubicación original: 35

**Antes**

El prototipo organiza la generación de escenarios, la simulación mecánica, la construcción de ventanas, el entrenamiento y la validación como etapas separadas. Cada predicción conserva la fecha de lluvia y el identificador del escenario, lo que permite formar particiones sin fuga entre ventanas de un mismo evento y rastrear las cifras hasta los archivos de validación. La Figura 1 resume el flujo evaluado.

**Después**

El prototipo organiza la generación de escenarios, la simulación mecánica, la construcción de ventanas, el entrenamiento y la validación como etapas separadas. Cada predicción conserva la fecha de lluvia y el identificador del escenario, lo que permite formar particiones sin compartir fechas ni escenarios entre conjuntos y rastrear las cifras hasta los archivos de validación. La Figura 1 resume el flujo evaluado.

**Justificación:** Acotar la afirmación de ausencia de fuga al control comprobado.

### Cambio 2 · ubicación original: 38

**Antes**

Nota. LHS: muestreo Latin Hypercube. La salida evaluada es el incremento simulado de desplazamiento, no una alerta de campo.

**Después**

Nota. LHS: muestreo por hipercubo latino; FEM: elementos finitos; LSTM: memoria a corto y largo plazo. Esquema del experimento semisintético, no de un sistema de alerta de campo.

**Justificación:** Definir abreviaturas y explicitar el carácter esquemático de la figura.

## Modelo mecánico y objetivo predictivo

### Cambio 1 · ubicación original: 43

**Antes**

El FEM propio usa elementos triangulares de deformación constante en deformación plana, elasticidad lineal isotrópica, peso propio y una carga de presión de poros formulada mediante el coeficiente de Biot. Se impuso base fija y restricción horizontal en el borde izquierdo. Cada hora se resolvió un estado cuasiestático. La respuesta hidrológica es una aproximación de infiltración y drenaje; no se resolvió un campo transitorio de flujo mediante el FEM. El objetivo de pronóstico fue el incremento del desplazamiento máximo inducido por lluvia, expresado en milímetros. No debe confundirse este incremento, de magnitud muy pequeña en TA-01, con el desplazamiento total de un talud real.

**Después**

El FEM propio usa elementos triangulares de deformación constante en deformación plana, elasticidad lineal isotrópica, peso propio y una carga de presión de poros formulada mediante el coeficiente de Biot. Se impuso base fija y restricción horizontal en el borde izquierdo. Cada hora se resolvió un estado cuasiestático. La respuesta hidrológica es una aproximación de infiltración y drenaje; no se resolvió un campo transitorio de flujo mediante el FEM. El valor evaluado fue el desplazamiento máximo inducido por lluvia respecto del estado inicial sin lluvia, expresado en milímetros y almacenado como rainfall_induced_max_displacement_mm. La red aprende su cambio entre la hora de origen y la hora objetivo; el pronóstico reconstruye el valor en la hora objetivo. No debe confundirse esta magnitud con el desplazamiento total de un talud real.

**Justificación:** Precisar la diferencia entre etiqueta evaluada y cambio temporal aprendido en el código.

## Formulación matemática del acoplamiento

### Cambio 1 · ubicación original: 46

**Antes**

Para cada hora t, el estado mecánico cuasiestático se representa mediante el sistema discreto siguiente, donde θ agrupa geometría y propiedades, uₜ es el vector de desplazamientos, f_g es la carga gravitatoria y f_p incorpora el efecto de presión de poros.

**Después**

Para cada hora t, el estado mecánico cuasiestático se representa mediante el sistema discreto siguiente, donde θ agrupa geometría y propiedades, uₜ es el vector de desplazamientos, f_g es la carga gravitatoria y f_p incorpora el efecto de presión de poros. K es la matriz global de rigidez y pₜ representa la presión de poros.

**Justificación:** Definir símbolos de la primera ecuación.

### Cambio 2 · ubicación original: 48

**Antes**

La LSTM recibe seis estados horarios y la lluvia futura conocida del experimento. El híbrido suma una corrección residual al pronóstico base. Las dos relaciones de monotonía expresan que la corrección no disminuye al aumentar la lluvia futura y no aumenta al crecer el índice de seguridad, manteniendo las demás entradas constantes.

**Después**

La LSTM recibe seis estados horarios y la lluvia futura conocida del experimento. El híbrido suma una corrección residual al pronóstico base. Las dos relaciones de monotonía expresan que la corrección no disminuye al aumentar la lluvia futura y no aumenta al crecer el índice de seguridad, manteniendo las demás entradas constantes. En las expresiones siguientes, y denota el valor objetivo, h el horizonte, x la historia de entradas, r la lluvia acumulada durante el horizonte, z las entradas del corrector, s el índice de seguridad y ψ y φ los parámetros entrenados. Las ecuaciones de pronóstico son esquemáticas: la normalización y la restricción final deben explicitarse antes del envío [VERIFICAR ecuaciones 2 y 3].

**Justificación:** Definir notación y señalar, sin sustituirlas unilateralmente, las ecuaciones que no coinciden completamente con la implementación.

## Modelos temporales y corrector

### Cambio 1 · ubicación original: 54

**Antes**

Se compararon cuatro alternativas sobre las mismas ventanas: persistencia del valor actual, regresión ridge autorregresiva, LSTM y un híbrido que añade a la LSTM una corrección residual. Cada entrada de la LSTM contiene seis horas de historia y produce un pronóstico a 1 o 6 h. La red se entrenó mediante retropropagación a través del tiempo y optimización Adam. La lluvia futura se trató como entrada exógena conocida en el experimento; esa condición sería distinta en una operación con pronósticos meteorológicos imperfectos.

**Después**

Se compararon cuatro alternativas sobre las mismas ventanas: persistencia del valor actual, regresión ridge autorregresiva, LSTM y un híbrido que añade a la LSTM una corrección residual. Cada entrada de la LSTM contiene seis horas de historia y produce un pronóstico a 1 o 6 h. La red se entrenó mediante retropropagación a través del tiempo y optimización Adam (Kingma & Ba, 2015). La lluvia futura se trató como entrada exógena conocida en el experimento; esa condición sería distinta en una operación con pronósticos meteorológicos imperfectos. La arquitectura LSTM sigue el principio de memoria recurrente de Hochreiter y Schmidhuber (1997). Ridge, LSTM e híbrido restringen la salida final para que no sea menor que el valor actual. Esa restricción compartida también debe considerarse al interpretar el aporte del corrector.

**Justificación:** Documentar fuentes metodológicas y la restricción común, no exclusiva del híbrido.

### Cambio 2 · ubicación original: 55

**Antes**

El corrector residual, implementado como un perceptrón multicapa, se entrenó sobre la salida de la LSTM. Sus restricciones fuerzan que, manteniendo las demás entradas constantes, un aumento de lluvia futura no reduzca su corrección y un índice de seguridad mayor no la aumente. Estas condiciones de monotonía representan conocimiento agregado del problema, pero no constituyen una pérdida de equilibrio espacial o una solución PINN de las ecuaciones de campo. El proyecto también desarrolló una aproximación espacial PIELM/RBF en un evento semisintético; se evaluó por separado para no atribuir sus resultados al pronóstico temporal.

**Después**

El corrector residual, implementado como un perceptrón multicapa, se entrenó sobre la salida de la LSTM. Sus restricciones fuerzan que, manteniendo las demás entradas constantes, un aumento de lluvia futura no reduzca su corrección y un índice de seguridad mayor no la aumente. Estas condiciones de monotonía representan conocimiento agregado del problema, pero no constituyen una pérdida de equilibrio espacial o una solución PINN de las ecuaciones de campo. El proyecto también desarrolló una aproximación espacial PIELM/RBF en un evento semisintético; se evaluó por separado para no atribuir sus resultados al pronóstico temporal. La monotonía se refiere a las entradas directas del corrector manteniendo fija la salida base de la LSTM; no prueba monotonía global del híbrido cuando cambian conjuntamente todas las variables. Esta distinción separa restricciones agregadas de las PINN de ecuaciones de campo (Raissi et al., 2019; Karniadakis et al., 2021).

**Justificación:** Acotar la garantía matemática del corrector y añadir referencias fundacionales verificadas.

## Configuración experimental reportada

### Cambio 1 · ubicación original: 57

**Antes**

La Tabla 4 reúne la configuración recuperada de los scripts y de los artefactos de modelos guardados en sslope. Los valores de épocas indicados son máximos solicitados; la detención temprana puede terminar antes el entrenamiento.

**Después**

La Tabla 2 reúne la configuración recuperada de los scripts y de los artefactos de modelos guardados en sslope. Los valores de épocas indicados son máximos solicitados; la detención temprana puede terminar antes el entrenamiento.

**Justificación:** Numerar tablas por orden de aparición.

### Cambio 2 · ubicación original: 58

**Antes**

Tabla 4
Configuración documentada del experimento

**Después**

Tabla 2
Configuración documentada del experimento

**Justificación:** Numerar tablas por orden de aparición.

## Validación y análisis estadístico

### Cambio 1 · ubicación original: 61

**Antes**

La primera comparación separó los 500 escenarios por fecha de lluvia en entrenamiento (350), validación (75) y prueba (75); ningún escenario de una misma fecha cruzó conjuntos. Esta división no es cronológica. Para examinar el cambio temporal se hicieron dos cortes adicionales con pesos reentrenados: entrenamiento 2020–2022, validación 2023 y prueba 2024; y entrenamiento 2020–2023, validación 2024 y prueba 2025. Se evaluaron errores absolutos medios (MAE) en ventanas comparables de 1 y 6 h.

**Después**

La primera comparación separó los 500 escenarios por fecha de lluvia en entrenamiento (350), validación (75) y prueba (75); ningún escenario de una misma fecha cruzó conjuntos. Esta división no es cronológica. Para examinar el cambio temporal se hicieron dos cortes adicionales con pesos reentrenados: entrenamiento 2020–2022, validación 2023 y prueba 2024; y entrenamiento 2020–2023, validación 2024 y prueba 2025. Se evaluaron errores absolutos medios (MAE) en ventanas comparables de 1 y 6 h. La partición no cronológica reserva las fechas de mayor lluvia para prueba y validación y usa una asignación balanceada por categorías del índice de seguridad simulado; no representa un muestreo aleatorio simple de fechas futuras.

**Justificación:** Describir la selección de eventos extremos y el balanceamiento existentes en temporal-baseline.js.

### Cambio 2 · ubicación original: 62

**Antes**

La diferencia pareada Δ = MAE(LSTM) − MAE(híbrido) se estimó mediante 5000 remuestreos por bloques de fecha de lluvia, con intervalos de confianza percentiles del 95 %. Para controlar las cuatro comparaciones año–horizonte se aplicó Holm a valores p exploratorios de una prueba bilateral de inversión aleatoria de signo por fecha (20 000 permutaciones, semillas fijas). Esta prueba supone simetría de las diferencias de error agregadas por fecha bajo la hipótesis nula; el análisis se considera exploratorio y no demuestra equivalencia cuando p > 0,05. Agrupar por fecha evita tratar las ventanas de un mismo evento como independientes. La prueba de robustez perturbó únicamente las entradas reservadas: ruido gaussiano del 5 % de la desviación de entrenamiento y pérdida aleatoria del 30 %, imputada con medias de entrenamiento. Las cifras proceden de predicciones guardadas del proyecto, no de observaciones de campo.

**Después**

La diferencia pareada Δ = MAE(LSTM) − MAE(híbrido) se estimó mediante 5000 remuestreos por conglomerados de fecha de lluvia, con intervalos de confianza percentiles del 95 %. Para controlar las cuatro comparaciones año–horizonte se describe la aplicación de Holm (1979) a valores p exploratorios [VERIFICAR archivo y script de origen] de una prueba bilateral de inversión aleatoria de signo por fecha (20 000 permutaciones, semillas fijas). Esta prueba supone simetría de las diferencias de error agregadas por fecha bajo la hipótesis nula; el análisis se considera exploratorio y no demuestra equivalencia cuando p > 0,05. Agrupar por fecha conserva la dependencia de las ventanas de un mismo evento (Field & Welsh, 2007), pero presupone que los conglomerados son suficientemente independientes entre fechas. No es un bootstrap de bloques de días consecutivos. La prueba de robustez perturbó únicamente las entradas reservadas: ruido gaussiano del 5 % de la desviación de entrenamiento y pérdida aleatoria del 30 %, imputada con medias de entrenamiento. Las cifras proceden de predicciones guardadas del proyecto, no de observaciones de campo.

**Justificación:** Precisar remuestreo e indicar la falta de trazabilidad del cálculo de valores p, sin cambiarlos.

## Procedimiento de reproducción

### Cambio 1 · ubicación original: 65

**Antes**

Las salidas citadas se encuentran en data/validation/ta01-model-comparison.csv, ta01-rolling-origin-model-comparison.csv y ta01-rolling-origin-bootstrap.json, junto con ta01-replication-manifest.json y las huellas SHA-256 de fuentes y resultados. El repositorio público de sslope contiene el README, los scripts npm y Docker Compose para el servicio web; este contenedor no constituye por sí solo un pipeline cerrado de entrenamiento y análisis. El código y la documentación tienen licencia MIT, y los aportes originales de los autores en los datos semisintéticos y resultados tienen licencia CC BY 4.0. La versión de Python no está fijada para todos los experimentos, lo que limita la réplica exacta.

**Después**

Las salidas citadas se encuentran en data/validation/ta01-model-comparison.csv, ta01-rolling-origin-model-comparison.csv y ta01-rolling-origin-bootstrap.json, junto con ta01-replication-manifest.json y las huellas SHA-256 de fuentes y resultados. El repositorio público de sslope contiene el README, los scripts npm y Docker Compose para el servicio web; este contenedor no constituye por sí solo un pipeline cerrado de entrenamiento y análisis. El código y la documentación tienen licencia MIT, y los aportes originales de los autores en los datos semisintéticos y resultados tienen licencia CC BY 4.0. La versión de Python no está fijada para todos los experimentos, lo que limita la réplica exacta. La coincidencia de las huellas permite comprobar la integridad de los artefactos archivados; no demuestra por sí sola que un entrenamiento nuevo produzca pesos idénticos.

**Justificación:** Distinguir integridad de archivos y réplica exacta del entrenamiento.

## RQ1 Comparación predictiva por fecha de lluvia

### Cambio 1 · ubicación original: 70

**Antes**

En la partición con fechas disjuntas, el híbrido presentó el menor MAE de las cuatro alternativas a ambos horizontes (Tabla 2). Frente a la LSTM, la reducción relativa fue 6,99 % a 1 h y 2,46 % a 6 h. Las magnitudes corresponden al incremento simulado de desplazamiento inducido por lluvia.

**Después**

En la partición con fechas disjuntas, el híbrido presentó el menor MAE de las cuatro alternativas a ambos horizontes (Tabla 3). Frente a la LSTM, la reducción relativa fue 6,99 % a 1 h y 2,46 % a 6 h. Las magnitudes corresponden al desplazamiento máximo simulado inducido por lluvia respecto del estado inicial.

**Justificación:** Actualizar referencias cruzadas de tablas.

### Cambio 2 · ubicación original: 71

**Antes**

Tabla 2
Error absoluto medio en la prueba separada por fecha de lluvia

**Después**

Tabla 3
Error absoluto medio en la prueba separada por fecha de lluvia

**Justificación:** Actualizar numeración por orden de aparición.

## RQ1 y RQ2 Pruebas cronológicas e incertidumbre

### Cambio 1 · ubicación original: 74

**Antes**

Tabla 3
MAE de LSTM e híbrido en pruebas cronológicas

**Después**

Tabla 4
MAE de LSTM e híbrido en pruebas cronológicas

**Justificación:** Actualizar numeración por orden de aparición.

### Cambio 2 · ubicación original: 76

**Antes**

Al mover el año de prueba, el orden entre LSTM e híbrido cambió (Tabla 3). En 2024, el MAE del híbrido fue 1,15 % mayor a 1 h y 1,89 % mayor a 6 h; en 2025 fue 3,89 % menor a 1 h y 4,63 % menor a 6 h. Los cuatro intervalos del 95 % incluyeron cero. Los valores p bilaterales ajustados por Holm fueron 0,535, 0,334, 0,535 y 0,383, respectivamente; ninguno alcanzó 0,05. Estos resultados no sustentan una mejora consistente del corrector y tampoco prueban equivalencia de los modelos.

**Después**

Al mover el año de prueba, el orden entre LSTM e híbrido cambió (Tabla 4). En 2024, el MAE del híbrido fue 1,15 % mayor a 1 h y 1,89 % mayor a 6 h; en 2025 fue 3,89 % menor a 1 h y 4,63 % menor a 6 h. Los cuatro intervalos del 95 % incluyeron cero. Los valores p bilaterales ajustados por Holm fueron 0,535, 0,334, 0,535 y 0,383, respectivamente [VERIFICAR cálculo reproducible]; ninguno alcanzó 0,05. Estos resultados no sustentan una mejora consistente del corrector y tampoco prueban equivalencia de los modelos.

**Justificación:** Conservar todos los valores p, marcando el origen no localizado.

### Cambio 3 · ubicación original: 77

**Antes**

Los intervalos del 95 % para Δ fueron [−1,44 × 10⁻⁷; 4,25 × 10⁻⁸] mm a 1 h y [−1,15 × 10⁻⁶; 6,64 × 10⁻⁸] mm a 6 h en 2024; en 2025 fueron [−2,59 × 10⁻⁷; 6,88 × 10⁻⁷] mm y [−3,83 × 10⁻⁷; 6,25 × 10⁻⁶] mm. Las 82 fechas de prueba de 2024 y las 76 de 2025 constituyeron las unidades de remuestreo y permutación. Los intervalos describen variación entre fechas semisintéticas y no cuantifican incertidumbre geotécnica real.

**Después**

Los intervalos del 95 % para Δ fueron [−1,44 × 10⁻⁷; 4,25 × 10⁻⁸] mm a 1 h y [−1,15 × 10⁻⁶; 6,64 × 10⁻⁸] mm a 6 h en 2024; en 2025 fueron [−2,59 × 10⁻⁷; 6,88 × 10⁻⁷] mm y [−3,83 × 10⁻⁷; 6,25 × 10⁻⁶] mm. Las 82 fechas de prueba de 2024 y las 76 de 2025 constituyeron las unidades de remuestreo y de la permutación descrita [VERIFICAR]. Los intervalos describen variación entre fechas semisintéticas y no cuantifican incertidumbre geotécnica real.

**Justificación:** Separar el bootstrap trazable de la permutación sin artefacto localizado.

## RQ4 Aproximación espacial del equilibrio discreto

### Cambio 1 · ubicación original: 81

**Antes**

En un evento semisintético, la aproximación espacial PIELM/RBF del sistema incremental FEM obtuvo un error L2 relativo de desplazamiento de 12,57 % en 354 nodos sin supervisión de desplazamiento y un residuo relativo de equilibrio discreto de 14,39 %. El entrenamiento y la referencia compartieron la misma matriz de rigidez y carga; esos porcentajes miden concordancia interna, no validación independiente ni capacidad de transferirse a otra geometría.

**Después**

En un evento semisintético, la aproximación espacial PIELM/RBF del sistema incremental FEM obtuvo un error L2 relativo de desplazamiento de 12,57 % en 354 nodos sin supervisión de desplazamiento y un residuo relativo de equilibrio discreto de 14,39 %. El entrenamiento y la referencia compartieron la misma matriz de rigidez y carga; esos porcentajes miden concordancia interna, no validación independiente ni capacidad de transferirse a otra geometría. Los sensores empleados en esa aproximación también son sintéticos; no constituyen instrumentación de TA-01.

**Justificación:** Explicitar el carácter sintético de la supervisión espacial.

### Cambio 2 · ubicación original: 81

**Antes**

En un evento semisintético, la aproximación espacial PIELM/RBF del sistema incremental FEM obtuvo un error L2 relativo de desplazamiento de 12,57 % en 354 nodos sin supervisión de desplazamiento y un residuo relativo de equilibrio discreto de 14,39 %. El entrenamiento y la referencia compartieron la misma matriz de rigidez y carga; esos porcentajes miden concordancia interna, no validación independiente ni capacidad de transferirse a otra geometría. Los sensores empleados en esa aproximación también son sintéticos; no constituyen instrumentación de TA-01.

**Después**

En un evento semisintético, la aproximación espacial PIELM/RBF del sistema incremental FEM obtuvo un error L2 relativo de desplazamiento de 12,57 % en 354 nodos sin supervisión de desplazamiento y un residuo relativo de equilibrio discreto de 14,39 %. El entrenamiento y la referencia compartieron la misma matriz de rigidez y carga; esos porcentajes miden concordancia interna, no validación independiente ni capacidad de transferirse a otra geometría. Los sensores empleados en esa aproximación también son sintéticos; no constituyen instrumentación de TA-01. La Tabla 5 distingue las comprobaciones analíticas de la concordancia con el operador compartido.

**Justificación:** Agrupar verificaciones distintas sin confundirlas con validación externa.

## Discusión

### Cambio 1 · ubicación original: 87

**Antes**

No se registraron medidas comparables de tiempo de entrenamiento, inferencia, consumo energético o latencia de extremo a extremo. Por ello, el experimento evalúa precisión y robustez interna, pero no eficiencia operacional. La mejora de MAE en la partición por fechas es pequeña en valor absoluto y no compensa por sí sola la degradación del corrector con entradas perturbadas.

**Después**

No se registró un benchmark comparable de tiempo de entrenamiento, inferencia, consumo energético o latencia de extremo a extremo. Algunos artefactos sí contienen medidas parciales de inferencia, insuficientes para sustentar eficiencia operacional. Por ello, el experimento evalúa precisión y robustez interna, pero no eficiencia operacional. La mejora de MAE en la partición por fechas es pequeña en valor absoluto y no compensa por sí sola la degradación del corrector con entradas perturbadas.

**Justificación:** Reconocer la latencia parcial almacenada sin convertirla en validación de tiempo real.

### Cambio 2 · ubicación original: 88

**Antes**

El FEM supone deformación plana y elasticidad lineal, mientras que la inestabilidad real puede involucrar plasticidad, discontinuidades, heterogeneidad y flujo transitorio. La comparación con una malla interna más fina no muestra convergencia monótona y la reproducción externa de un benchmark de reducción de resistencia no valida el FEM lineal propio. El índice mostrado por el visor tampoco sustituye un factor de seguridad obtenido por reducción de resistencia. Para avanzar hacia el objetivo original de M-1 harían falta parámetros y series de sensores observados, verificación geotécnica independiente, comparación con eventos no utilizados en el ajuste, análisis de incertidumbre y criterios de alerta contrastados. Un estudio de sensibilidad a excavaciones requeriría representar esos cambios geométricos en la simulación y evaluarlos con datos pertinentes.

**Después**

El FEM supone deformación plana y elasticidad lineal, mientras que la inestabilidad real puede involucrar plasticidad, discontinuidades, heterogeneidad y flujo transitorio. La comparación con una malla interna más fina no muestra convergencia monótona y la reproducción externa de un benchmark de reducción de resistencia no valida el FEM lineal propio. El índice mostrado por el visor tampoco sustituye un factor de seguridad obtenido por reducción de resistencia. Para avanzar hacia la validación de un talud real harían falta parámetros y series de sensores observados, verificación geotécnica independiente, comparación con eventos no utilizados en el ajuste, análisis de incertidumbre y criterios de alerta contrastados. Un estudio de sensibilidad a excavaciones requeriría representar esos cambios geométricos en la simulación y evaluarlos con datos pertinentes.

**Justificación:** Eliminar identificador interno no definido.

## Amenazas a la validez

### Cambio 1 · ubicación original: 90

**Antes**

Validez interna. El generador y los modelos comparten variables derivadas del mismo FEM, lo que puede favorecer la concordancia. La separación por fecha, los cortes cronológicos y la perturbación exclusiva de entradas reservadas reducen la fuga temporal, pero no eliminan la dependencia respecto del generador.

**Después**

Validez interna. El generador y los modelos comparten variables derivadas del mismo FEM, lo que puede favorecer la concordancia. La separación por fecha, los cortes cronológicos y la perturbación exclusiva de entradas reservadas reducen la fuga temporal, pero no eliminan la dependencia respecto del generador. La lluvia futura conocida constituye una condición idealizada, no una entrada disponible sin error en campo. Además, la sustitución de variables por medias puede crear combinaciones fuera de la distribución conjunta del generador.

**Justificación:** Añadir amenazas de información futura idealizada y enmascaramiento fuera de distribución.

### Cambio 2 · ubicación original: 91

**Antes**

Validez de constructo. El resultado pronosticado es un incremento de desplazamiento, no el desplazamiento total ni un FoS por reducción de resistencia. La corrección monótona representa conocimiento físico agregado y no una PINN completa. Las conclusiones se formulan con esas definiciones.

**Después**

Validez de constructo. El resultado pronosticado es el desplazamiento máximo inducido por lluvia respecto del estado inicial, no el desplazamiento total ni un FoS por reducción de resistencia. La corrección monótona representa conocimiento físico agregado y no una PINN completa. Las conclusiones se formulan con esas definiciones.

**Justificación:** Mantener consistente la definición del observable en las amenazas de constructo.

### Cambio 3 · ubicación original: 93

**Antes**

Validez de conclusión. Las fechas, no las ventanas horarias, fueron las unidades de remuestreo y permutación. Se corrigieron cuatro valores p mediante Holm, pero el ensayo de inversión de signo requiere simetría de las diferencias por fecha; no se registró un cálculo de potencia ni un umbral de equivalencia antes del análisis. La inclusión de cero y los valores p ajustados mayores que 0,05 indican evidencia insuficiente de mejora, no equivalencia. Los subconjuntos de lluvia ≥5 mm/día incluyen solo dos fechas en 2024 y tres en 2025; sus estimaciones de cobertura son inestables.

**Después**

Validez de conclusión. Las fechas, no las ventanas horarias, fueron las unidades de remuestreo y permutación. Se describe la corrección de cuatro valores p mediante Holm [VERIFICAR trazabilidad], pero el ensayo de inversión de signo requiere simetría de las diferencias por fecha; no se registró un cálculo de potencia ni un umbral de equivalencia antes del análisis. La inclusión de cero y los valores p ajustados mayores que 0,05 indican evidencia insuficiente de mejora, no equivalencia. Los subconjuntos de lluvia ≥5 mm/día incluyen solo dos fechas en 2024 y tres en 2025; sus estimaciones de cobertura son inestables. La precisión de almacenamiento del FEM y la variación entre semillas de entrenamiento no se evaluaron como factores de sensibilidad.

**Justificación:** No ratificar un cálculo no trazable e incluir límites numéricos y de repetición.

## Conclusiones

### Cambio 1 · ubicación original: 98

**Antes**

RQ2 no encontró una ventaja consistente de la corrección residual: la LSTM fue mejor en 2024, el híbrido en 2025 y los cuatro valores p ajustados fueron mayores que 0,05. RQ3 mostró que ambos modelos se degradaron con ruido y faltantes, pero el híbrido perdió más MAE relativo y absoluto en las condiciones evaluadas. La calidad de entrada es, por tanto, una condición crítica del prototipo.

**Después**

RQ2 no encontró una ventaja consistente de la corrección residual: la LSTM fue mejor en 2024, el híbrido en 2025 y los cuatro valores p ajustados reportados fueron mayores que 0,05 [VERIFICAR]. RQ3 mostró que ambos modelos se degradaron con ruido y faltantes, pero el híbrido perdió más MAE relativo y absoluto en las condiciones evaluadas. La calidad de entrada es, por tanto, una condición crítica del prototipo.

**Justificación:** Mantener cifras y conclusión prudente sin dar por verificada la inferencia.

### Cambio 2 · ubicación original: 99

**Antes**

RQ4 confirmó la implementación del FEM mediante pruebas internas y obtuvo concordancia parcial de la aproximación espacial con el mismo operador. Estas verificaciones no constituyen validación geotécnica independiente. En conjunto, TA-01 es una prueba de concepto semisintética para estudiar el flujo FEM LSTM; no valida alertas, tiempo real, FoS operacional ni una PINN de ecuaciones gobernantes.

**Después**

RQ4 verificó aspectos de la implementación del FEM mediante pruebas internas y obtuvo concordancia parcial de la aproximación espacial con el mismo operador. Estas verificaciones no constituyen validación geotécnica independiente. En conjunto, TA-01 es una prueba de concepto semisintética para estudiar el flujo FEM LSTM; no valida alertas, tiempo real, FoS operacional ni una PINN de ecuaciones gobernantes.

**Justificación:** No convertir comprobaciones parciales en confirmación total.

## Declaraciones

### Cambio 1 · ubicación original: 103

**Antes**

Ética. El estudio utiliza precipitación pública y datos geotécnicos simulados; no involucra participantes humanos, animales ni información personal. Por ese alcance no requirió revisión de un comité de ética.

**Después**

Ética. El estudio utiliza precipitación pública y datos geotécnicos simulados; no involucra participantes humanos, animales ni información personal. La necesidad de revisión o exención ética debe confirmarse según la política institucional y de la revista [CONFIRMAR].

**Justificación:** No declarar una exención institucional que no ha sido documentada.

### Cambio 2 · ubicación original: 106

**Antes**

Uso de inteligencia artificial generativa. OpenAI Codex se utilizó para contrastar esta versión con el código y los artefactos de sslope, revisar redacción y formato, y apoyar el cálculo exploratorio de pruebas pareadas por fecha a partir de predicciones guardadas. No generó los datos originales ni entrenó los modelos. La verificación y aprobación final de cifras, método, referencias y declaraciones de autoría corresponde a los autores antes del envío.

**Después**

Uso de inteligencia artificial generativa. OpenAI Codex se utilizó para contrastar esta versión con el código y los artefactos de sslope, revisar redacción y formato, y [CONFIRMAR POR LOS AUTORES: alcance de la asistencia en cálculos estadísticos]. Los datos geotécnicos se generan mediante el simulador y los modelos se entrenan mediante los scripts documentados. El alcance de la asistencia de IA en el desarrollo de código y en la ejecución de esos procesos debe declararse expresamente [CONFIRMAR POR LOS AUTORES]. La verificación y aprobación final de cifras, método, referencias y declaraciones de autoría corresponde a los autores antes del envío.

**Justificación:** Evitar una negación no sustentada sobre el uso de IA en el desarrollo y entrenamiento.

## Los escaladores y la normalización del cambio objetivo se estimaron exclusi

### Cambio 1 · ubicación original: nuevo

**Antes**

No existía

**Después**

Los escaladores y la normalización del cambio objetivo se estimaron exclusivamente con entrenamiento. Ridge seleccionó su regularización en validación; las redes usaron detención temprana con los criterios registrados en sus artefactos. No se documentó una búsqueda sistemática comparable de arquitecturas ni repeticiones independientes por semilla. El corrector se ajustó sobre la LSTM ya entrenada y sus predicciones en entrenamiento, sin predicciones fuera de muestra para esa segunda etapa.

**Justificación:** Completar definición, método, evidencia o declaración requerida sin alterar resultados originales.

## Los intervalos predictivos del híbrido se construyeron con un cuantil del e

### Cambio 1 · ubicación original: nuevo

**Antes**

No existía

**Después**

Los intervalos predictivos del híbrido se construyeron con un cuantil del error absoluto de validación. Ese mismo conjunto participó en la selección del modelo y la detención temprana. Por ello se presentan como intervalos empíricos con diagnóstico retrospectivo de cobertura, no como una garantía conformal independiente. La Figura 4 contrasta cobertura global y cobertura bajo lluvia ≥5 mm/día; el número de fechas de esta última categoría es reducido.

**Justificación:** Completar definición, método, evidencia o declaración requerida sin alterar resultados originales.

## El comando de generación transcrito no fija la malla de los artefactos cita

### Cambio 1 · ubicación original: nuevo

**Antes**

No existía

**Después**

El comando de generación transcrito no fija la malla de los artefactos citados: el script usa otra malla por defecto [VERIFICAR reproducción]. La receta completa debe declarar explícitamente malla, prefijos de salida, horizontes y pesos de referencia antes de ejecutar de nuevo el experimento.

**Justificación:** Completar definición, método, evidencia o declaración requerida sin alterar resultados originales.

## La escala numérica requiere cautela adicional. El posprocesamiento FEM guar

### Cambio 1 · ubicación original: nuevo

**Antes**

No existía

**Después**

La escala numérica requiere cautela adicional. El posprocesamiento FEM guarda las magnitudes nodales con un paso de redondeo de 10⁻⁵ mm (10⁻⁸ m), anterior a la construcción de las ventanas. Un MAE promedio inferior a ese paso es matemáticamente posible, pero no acredita resolución física ni precisión instrumental. Las pequeñas diferencias de error deben contrastarse con la sensibilidad al almacenamiento y a la tolerancia del solver antes de atribuirles relevancia geotécnica.

**Justificación:** Completar definición, método, evidencia o declaración requerida sin alterar resultados originales.

## La Figura 6 presenta las variantes con entradas hidrológicas o mecánicas su

### Cambio 1 · ubicación original: nuevo

**Antes**

No existía

**Después**

La Figura 6 presenta las variantes con entradas hidrológicas o mecánicas sustituidas por sus medias de entrenamiento. Son ensayos de enmascaramiento en inferencia, sin reentrenamiento: no equivalen a quitar esas variables de una arquitectura entrenada de nuevo. Tampoco aíslan el aporte causal de cada término de la pérdida del corrector; esa ablación permanece pendiente.

**Justificación:** Completar definición, método, evidencia o declaración requerida sin alterar resultados originales.

## Contribuciones de autoría según CRediT. Roberto Enrique Quezada-Rodríguez: 

### Cambio 1 · ubicación original: nuevo

**Antes**

No existía

**Después**

Contribuciones de autoría según CRediT. Roberto Enrique Quezada-Rodríguez: [CONFIRMAR ROLES]. Melanie Celeste Tello Fuentes: [CONFIRMAR ROLES]. La asignación debe describir contribuciones efectivas y ser aprobada por ambos autores; no se infiere a partir del orden de firma.

**Justificación:** Completar definición, método, evidencia o declaración requerida sin alterar resultados originales.

## Referencias

### Cambio 1 · ubicación original: 113

**Antes**

Briceño, J., Guillén, M., Belandria, N., & León, F. (2023). Análisis de estabilidad de taludes de secciones típicas en la construcción de carreteras a través de modelos numéricos. Tekhné, 26(3), 62–72. https://doi.org/10.62876/tekhn.v26i3.6137

**Después**

Briceño, J., Guillén, M., Belandria, N., & León, F. (2023). Análisis de estabilidad de taludes de secciones típicas en la construcción de carreteras a través de modelos numéricos. Tekhné, 26(3), 62–72. https://doi.org/10.62876/tekhn.v26i3.6137 [VERIFICAR en fuente editorial]

**Justificación:** No se obtuvo confirmación primaria suficiente de la referencia.

### Cambio 2 · ubicación original: 126

**Antes**

Guevara-Sánchez, D. F., Gómez-Intriago, E. C., & Ortiz-Hernández, E. (2024). Diseño de estabilidad de talud del sector de la Simbocal, vía Margarita-San Vicente, provincia de Manabí. Polo del Conocimiento, 9(3), 1905–1917. https://doi.org/10.23857/pc.v9i3.6761

**Después**

Guevara-Sánchez, D. F., Gómez-Intriago, E. C., & Ortiz-Hernández, E. (2024). Diseño de estabilidad de talud del sector de la Simbocal, vía Margarita-San Vicente, provincia de Manabí. Polo del Conocimiento, 9(3), 1905–1917. https://doi.org/10.23857/pc.v9i3.6761 [VERIFICAR orden de autoría]

**Justificación:** El orden del manuscrito difiere de la ficha editorial; no se cambia sin comprobación adicional.

### Cambio 3 · ubicación original: 139

**Antes**

Sequeira-Arguedas, J. M. (2023). Contexto de inestabilidad de laderas en la Ruta Nacional 613 en 2020, Coto Brus, Costa Rica. Infraestructura Vial, 25(44), 1–14. https://doi.org/10.15517/iv.v25i44.54752

**Después**

Sequeira-Arguedas, J. M. (2023). Contexto de inestabilidad de laderas en la Ruta Nacional 613 en 2020, Coto Brus, Costa Rica. Infraestructura Vial, 25(44), 1–14. https://doi.org/10.15517/iv.v25i44.54752 [VERIFICAR paginación]

**Justificación:** La ficha editorial y SciELO presentan paginaciones distintas; se conservan los números originales.

### Cambio 4 · ubicación original: nuevo

**Antes**

No existía

**Después**

Field, C. A., & Welsh, A. H. (2007). Bootstrapping clustered data. Journal of the Royal Statistical Society: Series B (Statistical Methodology), 69(3), 369–390. https://doi.org/10.1111/j.1467-9868.2007.00593.x

**Justificación:** Respaldar un método ya usado; referencia real verificada.

### Cambio 5 · ubicación original: nuevo

**Antes**

No existía

**Después**

Hochreiter, S., & Schmidhuber, J. (1997). Long short-term memory. Neural Computation, 9(8), 1735–1780. https://doi.org/10.1162/neco.1997.9.8.1735

**Justificación:** Respaldar un método ya usado; referencia real verificada.

### Cambio 6 · ubicación original: nuevo

**Antes**

No existía

**Después**

Holm, S. (1979). A simple sequentially rejective multiple test procedure. Scandinavian Journal of Statistics, 6(2), 65–70. https://www.jstor.org/stable/4615733

**Justificación:** Respaldar un método ya usado; referencia real verificada.

### Cambio 7 · ubicación original: nuevo

**Antes**

No existía

**Después**

Karniadakis, G. E., Kevrekidis, I. G., Lu, L., Perdikaris, P., Wang, S., & Yang, L. (2021). Physics-informed machine learning. Nature Reviews Physics, 3, 422–440. https://doi.org/10.1038/s42254-021-00314-5

**Justificación:** Respaldar un método ya usado; referencia real verificada.

### Cambio 8 · ubicación original: nuevo

**Antes**

No existía

**Después**

Kingma, D. P., & Ba, J. (2015). Adam: A method for stochastic optimization. International Conference on Learning Representations. https://arxiv.org/abs/1412.6980

**Justificación:** Respaldar un método ya usado; referencia real verificada.

### Cambio 9 · ubicación original: nuevo

**Antes**

No existía

**Después**

Raissi, M., Perdikaris, P., & Karniadakis, G. E. (2019). Physics-informed neural networks: A deep learning framework for solving forward and inverse problems involving nonlinear partial differential equations. Journal of Computational Physics, 378, 686–707. https://doi.org/10.1016/j.jcp.2018.10.045

**Justificación:** Respaldar un método ya usado; referencia real verificada.

## Material suplementario A

### Cambio 1 · ubicación original: 151

**Antes**

Este material suplementario reúne la matriz de 40 antecedentes y los fragmentos clave utilizados para la síntesis. Se mantiene fuera del cuerpo principal para preservar el cierre IMRD del artículo.

**Después**

Este material suplementario reúne la matriz de 40 antecedentes y los fragmentos clave utilizados para la síntesis. Se mantiene fuera del cuerpo principal para preservar el cierre IMRD del artículo. Las citas literales de la Tabla A2 requieren cotejo de texto completo y localizador exacto [VERIFICAR]; la confirmación de un DOI no autentica una cita literal.

**Justificación:** Evitar presentar como cotejados cuarenta fragmentos no verificados íntegramente.

## La Figura 2 muestra la respuesta al refinamiento de malla y su diferencia f

### Cambio 1 · ubicación original: nuevo

**Antes**

No existía

**Después**

La Figura 2 muestra la respuesta al refinamiento de malla y su diferencia frente a la referencia interna.

**Justificación:** Completar definición, método, evidencia o declaración requerida sin alterar resultados originales.

## Figura 2
Sensibilidad del desplazamiento inducido a la discretización FEM

### Cambio 1 · ubicación original: nuevo

**Antes**

No existía

**Después**

Figura 2
Sensibilidad del desplazamiento inducido a la discretización FEM

**Justificación:** Completar definición, método, evidencia o declaración requerida sin alterar resultados originales.

## Figure 2. FEM mesh sensitivity of rainfall-induced displacement.

### Cambio 1 · ubicación original: nuevo

**Antes**

No existía

**Después**

Figure 2. FEM mesh sensitivity of rainfall-induced displacement.

**Justificación:** Completar definición, método, evidencia o declaración requerida sin alterar resultados originales.

## 

### Cambio 1 · ubicación original: nuevo

**Antes**

No existía

**Después**

(Párrafo vacío)

**Justificación:** Completar definición, método, evidencia o declaración requerida sin alterar resultados originales.

### Cambio 2 · ubicación original: nuevo

**Antes**

No existía

**Después**

(Párrafo vacío)

**Justificación:** Completar definición, método, evidencia o declaración requerida sin alterar resultados originales.

### Cambio 3 · ubicación original: nuevo

**Antes**

No existía

**Después**

(Párrafo vacío)

**Justificación:** Completar definición, método, evidencia o declaración requerida sin alterar resultados originales.

### Cambio 4 · ubicación original: nuevo

**Antes**

No existía

**Después**

(Párrafo vacío)

**Justificación:** Completar definición, método, evidencia o declaración requerida sin alterar resultados originales.

### Cambio 5 · ubicación original: nuevo

**Antes**

No existía

**Después**

(Párrafo vacío)

**Justificación:** Completar definición, método, evidencia o declaración requerida sin alterar resultados originales.

## Nota. Número de nodos, desplazamiento máximo y diferencia respecto de la ma

### Cambio 1 · ubicación original: nuevo

**Antes**

No existía

**Después**

Nota. Número de nodos, desplazamiento máximo y diferencia respecto de la malla 48 × 32. Referencia interna, no convergencia demostrada. Caso semisintético. Fuente: data/validation/ta01-fem-mesh-summary.csv.

**Justificación:** Completar definición, método, evidencia o declaración requerida sin alterar resultados originales.

## La Figura 3 presenta los tamaños de diferencia y sus intervalos; el signo p

### Cambio 1 · ubicación original: nuevo

**Antes**

No existía

**Después**

La Figura 3 presenta los tamaños de diferencia y sus intervalos; el signo positivo favorece al híbrido.

**Justificación:** Completar definición, método, evidencia o declaración requerida sin alterar resultados originales.

## Figura 3
Diferencia pareada de MAE entre LSTM e híbrido

### Cambio 1 · ubicación original: nuevo

**Antes**

No existía

**Después**

Figura 3
Diferencia pareada de MAE entre LSTM e híbrido

**Justificación:** Completar definición, método, evidencia o declaración requerida sin alterar resultados originales.

## Figure 3. Paired MAE difference between LSTM and the hybrid.

### Cambio 1 · ubicación original: nuevo

**Antes**

No existía

**Después**

Figure 3. Paired MAE difference between LSTM and the hybrid.

**Justificación:** Completar definición, método, evidencia o declaración requerida sin alterar resultados originales.

## Nota. Puntos: Δ = MAE(LSTM) − MAE(híbrido); barras: IC percentiles del 95 %

### Cambio 1 · ubicación original: nuevo

**Antes**

No existía

**Después**

Nota. Puntos: Δ = MAE(LSTM) − MAE(híbrido); barras: IC percentiles del 95 % por conglomerados de fecha. Las dos escalas del eje horizontal son distintas. No se representan valores p. Caso semisintético. Fuente: data/validation/ta01-rolling-origin-bootstrap.json.

**Justificación:** Completar definición, método, evidencia o declaración requerida sin alterar resultados originales.

## La Figura 4 muestra que la cobertura global no asegura cobertura bajo lluvi

### Cambio 1 · ubicación original: nuevo

**Antes**

No existía

**Después**

La Figura 4 muestra que la cobertura global no asegura cobertura bajo lluvia más intensa.

**Justificación:** Completar definición, método, evidencia o declaración requerida sin alterar resultados originales.

## Figura 4
Cobertura retrospectiva de los intervalos del híbrido

### Cambio 1 · ubicación original: nuevo

**Antes**

No existía

**Después**

Figura 4
Cobertura retrospectiva de los intervalos del híbrido

**Justificación:** Completar definición, método, evidencia o declaración requerida sin alterar resultados originales.

## Figure 4. Retrospective coverage of hybrid prediction intervals.

### Cambio 1 · ubicación original: nuevo

**Antes**

No existía

**Después**

Figure 4. Retrospective coverage of hybrid prediction intervals.

**Justificación:** Completar definición, método, evidencia o declaración requerida sin alterar resultados originales.

## Nota. Todas las ventanas frente a lluvia ≥5 mm/día. La línea discontinua in

### Cambio 1 · ubicación original: nuevo

**Antes**

No existía

**Después**

Nota. Todas las ventanas frente a lluvia ≥5 mm/día. La línea discontinua indica el nivel nominal; la categoría de lluvia alta contiene dos fechas en 2024 y tres en 2025. Ventanas correlacionadas, no ensayos independientes. Caso semisintético. Fuente: data/validation/ta01-rolling-interval-coverage.csv.

**Justificación:** Completar definición, método, evidencia o declaración requerida sin alterar resultados originales.

## La Figura 5 resume la sensibilidad al ruido y a la pérdida aleatoria de ent

### Cambio 1 · ubicación original: nuevo

**Antes**

No existía

**Después**

La Figura 5 resume la sensibilidad al ruido y a la pérdida aleatoria de entradas.

**Justificación:** Completar definición, método, evidencia o declaración requerida sin alterar resultados originales.

## Figura 5
Sensibilidad predictiva a ruido y faltantes aleatorios

### Cambio 1 · ubicación original: nuevo

**Antes**

No existía

**Después**

Figura 5
Sensibilidad predictiva a ruido y faltantes aleatorios

**Justificación:** Completar definición, método, evidencia o declaración requerida sin alterar resultados originales.

## Figure 5. Predictive sensitivity to noise and random missing inputs.

### Cambio 1 · ubicación original: nuevo

**Antes**

No existía

**Después**

Figure 5. Predictive sensitivity to noise and random missing inputs.

**Justificación:** Completar definición, método, evidencia o declaración requerida sin alterar resultados originales.

## Nota. Ruido relativo a la desviación de entrenamiento y faltantes imputados

### Cambio 1 · ubicación original: nuevo

**Antes**

No existía

**Después**

Nota. Ruido relativo a la desviación de entrenamiento y faltantes imputados con medias de entrenamiento. Cada punto compara la condición perturbada con el caso limpio del mismo modelo. Sin reentrenamiento. Caso semisintético. Fuente: data/validation/ta01-robustness-summary.csv.

**Justificación:** Completar definición, método, evidencia o declaración requerida sin alterar resultados originales.

## La Figura 6 compara el error de las variantes con entradas enmascaradas, si

### Cambio 1 · ubicación original: nuevo

**Antes**

No existía

**Después**

La Figura 6 compara el error de las variantes con entradas enmascaradas, sin atribuirles un efecto causal aislado.

**Justificación:** Completar definición, método, evidencia o declaración requerida sin alterar resultados originales.

## Figura 6
Enmascaramiento de entradas hidrológicas y mecánicas

### Cambio 1 · ubicación original: nuevo

**Antes**

No existía

**Después**

Figura 6
Enmascaramiento de entradas hidrológicas y mecánicas

**Justificación:** Completar definición, método, evidencia o declaración requerida sin alterar resultados originales.

## Figure 6. Masking hydrological and mechanical inputs.

### Cambio 1 · ubicación original: nuevo

**Antes**

No existía

**Después**

Figure 6. Masking hydrological and mechanical inputs.

**Justificación:** Completar definición, método, evidencia o declaración requerida sin alterar resultados originales.

## Nota. Entradas sustituidas por medias de entrenamiento. MAE en las mismas v

### Cambio 1 · ubicación original: nuevo

**Antes**

No existía

**Después**

Nota. Entradas sustituidas por medias de entrenamiento. MAE en las mismas ventanas del conjunto no cronológico de prueba. Las variantes no son modelos reentrenados ni ablaciones de términos individuales de la pérdida. Caso semisintético. Fuente: data/validation/ta01-ablation-summary.csv.

**Justificación:** Completar definición, método, evidencia o declaración requerida sin alterar resultados originales.

## Tabla 6
MAE con entradas limpias y perturbadas

### Cambio 1 · ubicación original: nuevo

**Antes**

No existía

**Después**

Tabla 6
MAE con entradas limpias y perturbadas

**Justificación:** Completar definición, método, evidencia o declaración requerida sin alterar resultados originales.

## Table 6. MAE with clean and perturbed inputs.

### Cambio 1 · ubicación original: nuevo

**Antes**

No existía

**Después**

Table 6. MAE with clean and perturbed inputs.

**Justificación:** Completar definición, método, evidencia o declaración requerida sin alterar resultados originales.

## RQ3 Robustez frente a perturbaciones

### Cambio 1 · ubicación original: 83

**Antes**

Con ruido del 5 % en las entradas, el MAE de la LSTM aumentó 5,13 % a 1 h y 5,97 % a 6 h; el del híbrido aumentó 53,88 % y 46,10 %. Con 30 % de valores faltantes, los aumentos fueron 102,80 % y 60,88 % para la LSTM, frente a 133,96 % y 70,77 % para el híbrido. En estos dos tipos de perturbación, la corrección perdió su pequeña ventaja de MAE limpio. El ensayo utiliza faltantes aleatorios e imputación por media sin reentrenamiento; no reproduce todas las fallas posibles de sensores ni prueba comportamiento en campo. Fuente: data/validation/ta01-model-robustness.json.

**Después**

Con ruido del 5 % en las entradas, el MAE de la LSTM aumentó 5,13 % a 1 h y 5,97 % a 6 h; el del híbrido aumentó 53,88 % y 46,10 %. Con 30 % de valores faltantes, los aumentos fueron 102,80 % y 60,88 % para la LSTM, frente a 133,96 % y 70,77 % para el híbrido. En estos dos tipos de perturbación, la corrección perdió su pequeña ventaja de MAE limpio. El ensayo utiliza faltantes aleatorios e imputación por media sin reentrenamiento; no reproduce todas las fallas posibles de sensores ni prueba comportamiento en campo. Fuente: data/validation/ta01-model-robustness.json. La Tabla 6 conserva los errores absolutos de las condiciones principales.

**Justificación:** Incluir evidencia numérica absoluta junto a los porcentajes relativos de degradación.

## Tabla 5
Alcance de la verificación numérica y espacial

### Cambio 1 · ubicación original: nuevo

**Antes**

No existía

**Después**

Tabla 5
Alcance de la verificación numérica y espacial

**Justificación:** Completar definición, método, evidencia o declaración requerida sin alterar resultados originales.

## Table 5. Scope of numerical and spatial verification.

### Cambio 1 · ubicación original: nuevo

**Antes**

No existía

**Después**

Table 5. Scope of numerical and spatial verification.

**Justificación:** Completar definición, método, evidencia o declaración requerida sin alterar resultados originales.

## Figure 1. Data flow and validation of the semisynthetic TA-01 prototype.

### Cambio 1 · ubicación original: nuevo

**Antes**

No existía

**Después**

Figure 1. Data flow and validation of the semisynthetic TA-01 prototype.

**Justificación:** Completar definición, método, evidencia o declaración requerida sin alterar resultados originales.

## Table 1. Scope comparison with closely related studies.

### Cambio 1 · ubicación original: nuevo

**Antes**

No existía

**Después**

Table 1. Scope comparison with closely related studies.

**Justificación:** Completar definición, método, evidencia o declaración requerida sin alterar resultados originales.

## Table 2. Documented experimental configuration.

### Cambio 1 · ubicación original: nuevo

**Antes**

No existía

**Después**

Table 2. Documented experimental configuration.

**Justificación:** Completar definición, método, evidencia o declaración requerida sin alterar resultados originales.

## Table 3. Mean absolute error in the rainfall-date-separated test.

### Cambio 1 · ubicación original: nuevo

**Antes**

No existía

**Después**

Table 3. Mean absolute error in the rainfall-date-separated test.

**Justificación:** Completar definición, método, evidencia o declaración requerida sin alterar resultados originales.

## Table 4. LSTM and hybrid MAE in chronological tests.

### Cambio 1 · ubicación original: nuevo

**Antes**

No existía

**Después**

Table 4. LSTM and hybrid MAE in chronological tests.

**Justificación:** Completar definición, método, evidencia o declaración requerida sin alterar resultados originales.

## Configuración experimental

### Cambio 1 · ubicación original: tabla

**Antes**

5000 remuestreos por bloques de fecha; IC 95 %

**Después**

5000 remuestreos por conglomerados de fecha; IC 95 %

**Justificación:** Nombrar el remuestreo realmente implementado.
