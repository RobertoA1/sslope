# Integración del artículo con M-1

## Propósito

El proyecto implementa el flujo operativo propuesto por el manuscrito **“Gemelo digital basado en una red neuronal informada por la física para la predicción en tiempo real de la estabilidad de taludes en minas a cielo abierto”**. La integración permite desarrollar y evaluar los componentes de forma incremental, manteniendo explícita su madurez científica.

## Correspondencia implementada

| Artículo | Implementación actual | Estado |
|---|---|---|
| Estado mecánico FEM | Solver 2D CST lineal para TA-01; el pronóstico en vivo conserva además la aproximación reducida | Implementado, no calibrado |
| Dependencia temporal LSTM | LSTM many-to-one entrenada con BPTT/Adam y línea base ridge comparable | Entrenada con FEM semisintético; sin validación real |
| Restricción PINN | Corrección y residuo informados por física | Prototipo, sin entrenamiento |
| Telemetría | Desplazamiento, presión de poros, lluvia, calidad y fuente | API operativa en memoria |
| Sensibilidad hidrológica | Eventos manuales y lluvia diaria NASA POWER de Pasco, con infiltración y drenaje | Semisintética; respuesta demostrativa |
| Alerta temprana | FoS, índice de riesgo, incertidumbre y niveles configurables | Política no validada |
| Representación espacial | Visor Three.js con geometría 3D y sección FEM 2D nodal animada | El corte es FEM 2D; el volumen no es FEM 3D |
| Evaluación experimental | Backtest temporal y ablación con MAE, RMSE, sesgo y R² | Datos sintéticos o mixtos |

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

## Interpretación correcta

El experimento sirve para depurar el protocolo y detectar qué componente ayuda o perjudica en los datos actuales. Que una variante obtenga menor error no demuestra superioridad científica: los datos sintéticos provienen de reglas conocidas y los componentes todavía no han sido calibrados ni entrenados.

## Criterios antes de publicar resultados

- FEM 2D/3D calibrado y contrastado con un caso de referencia.
- División temporal documentada de datos reales, sin fuga de información.
- LSTM entrenada y comparada con persistencia y regresión.
- PINN entrenada con pérdidas de datos, equilibrio, contorno y consistencia FEM.
- Ablación repetida por estación, evento y horizonte.
- Métricas de error, alerta, incertidumbre y latencia con intervalos de confianza.
- Registro persistente de conjuntos de datos, parámetros, pesos y ejecuciones.

Hasta cumplir estos criterios, el sistema debe describirse como **prototipo de investigación y apoyo académico a la decisión**.
