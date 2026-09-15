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

La separación entrenamiento/validación/prueba debe hacerse por `scenario_id`, nunca mezclando al azar horas de un mismo escenario. Una división inicial apropiada es 70/15/15 por escenario, manteniendo los eventos más extremos en validación y prueba.

La división reproducible ya generada contiene 350 escenarios de entrenamiento, 75 de validación y 75 de prueba. El evento de 102.88 mm/día se reserva para prueba y el siguiente evento extremo para validación. Para reconstruirla:

```bash
npm run split:fem
```

## Línea base temporal

La primera referencia entrenada es una regresión ridge autorregresiva. Usa el desplazamiento inducido actual, lluvia, presión de poros, índice de seguridad y parámetros geotécnicos. La lluvia dentro del horizonte se trata como un pronóstico meteorológico exógeno conocido. El hiperparámetro se selecciona únicamente con validación.

La salida final aplica una restricción auditable: el desplazamiento inducido acumulado no puede ser menor que el valor presente. El JSON conserva las métricas de ridge sin restricción y el número de predicciones corregidas.

```bash
npm run train:baseline -- --horizon=1
npm run train:baseline -- --horizon=6
```

En la prueba aislada, la línea base restringida reduce el MAE frente a persistencia aproximadamente 52.8% a una hora y 54.1% a seis horas. Estos resultados describen el conjunto FEM semisintético y no demuestran desempeño sobre un talud real.

## LSTM entrenada

El proyecto incluye una LSTM many-to-one implementada con NumPy. Usa puertas de entrada, olvido, candidato y salida, retropropagación a través del tiempo, optimizador Adam, recorte de gradiente y parada temprana. Cada ejemplo contiene seis horas de historia y predice el incremento a una o seis horas.

```bash
npm run train:lstm -- --horizon=1
npm run train:lstm -- --horizon=6
npm run test:lstm
```

La prueba del núcleo compara la retropropagación con una derivada numérica. Con la semilla registrada, el error relativo observado es inferior a 1×10⁻⁸.

Sobre las mismas ventanas de prueba, la LSTM obtiene un MAE de 0.00002098 mm a una hora, frente a 0.00002611 mm de ridge. A seis horas obtiene 0.00015200 mm, frente a 0.00016457 mm. Sin embargo, a seis horas ridge conserva mejor RMSE y R², por lo que no se puede afirmar que la LSTM sea uniformemente superior.

## Uso en el visor

`POST /api/fem/run` ejecuta las 24 soluciones horarias y devuelve el campo nodal de cada estado. El visor Three.js muestra el corte triangular FEM delante del talud:

- con **Movimiento del terreno** activo, deforma los nodos según el desplazamiento incremental por lluvia;
- con esa opción desactivada, mantiene la malla fija y muestra vectores;
- el color verde–amarillo–rojo representa la magnitud relativa del movimiento dentro de la corrida;
- la geometría usa autoescala visual para hacer legibles desplazamientos submilimétricos; los valores del panel permanecen en magnitud física real.

## Siguiente validación científica

1. Contrastar el solver con un benchmark geotécnico publicado.
2. Ejecutar un análisis de sensibilidad de malla y condiciones de borde.
3. Sustituir los rangos supuestos por parámetros de un caso abierto documentado.
4. Incorporar observaciones públicas de deformación o construir un experimento físico a escala.
5. Entrenar una línea base temporal y luego la LSTM/PINN, conservando una prueba completamente aislada.
