# Datos reales de Century Mine

## Alcance y procedencia

Caso independiente de Century Mine (Australia), suministrado por Tjaart de Wit, Colorado School of Mines, [Zenodo 15003054](https://zenodo.org/records/15003054). Licencia CC BY 4.0, comprobada en la API oficial del registro. Archivo original: `data/external/century-mine/Data.zip`. Se verifican MD5 y SHA-256 antes de preparar las series y se conservan hashes de cada archivo leído.

El artículo asociado es [de Wit y Snieder (2026), Seismica](https://doi.org/10.26443/seismica.v5i1.1902), que describe Century Mine y un inicio de falla el 23/02/2014. La afiliación de Colorado no es la ubicación de la mina. El artículo cita un paquete ampliado, Zenodo 14969229; aquí se utiliza el paquete pequeño solicitado.

## Inventario auditado

| Fuente dentro del ZIP | Contenido comprobado | Uso actual |
| --- | --- | --- |
| West Wall Prism Movements | 7178 lecturas, 49 prismas, 20/11/2013–20/02/2014. Magnitud 3D explícitamente en mm desde una referencia de 20 de noviembre. | Entrenamiento y evaluación independientes. |
| South_West_Corner | 82401 lecturas, 160 prismas, columnas de diferencias de coordenadas. | Inventario; no se une al primer modelo. |
| slopeMovement.dat | Export parecido a South_West, con cabecera desalineada respecto a identificador de prisma dividido en dos columnas. | Original conservado; no se usa ni se cuenta como observaciones adicionales independientes. |
| Lluvia BOM 2013 y 2014 | 730 registros diarios, estación 029167; valores faltantes, período y calidad conservados. | Entrada rezagada, no lluvia futura. |
| events-and-blasts.csv | 1171 eventos. | Inventario; no se usa como aceleración ni coeficiente sísmico. |
| mean-velocity-changes.txt | 44 registros de cambio porcentual de velocidad sísmica. | Inventario; no son velocidad de desplazamiento del suelo. |

No se publican presión de poros o parámetros suficientes para calibrar el FEM/híbrido de este primer caso. No se rellenan esas variables con ceros, datos Pasco o estimaciones presentadas como observaciones.

## Preparación y contrato temporal

- Se usa la última lectura real de cada prisma y fecha: 3163 observaciones diarias. No se promedian sensores entre sí ni se mezclan las referencias de los dos archivos.
- Las fechas y horas se conservan como `timestampLocal`, **sin sufijo UTC**, porque la zona del export no está confirmada. Para diferencias de horas internas se usan sus tiempos de reloj como escala común, no una conversión geográfica.
- No se rellenan fechas ausentes. Duplicados idénticos se contabilizan y consolidan; timestamps contradictorios se excluyen. Este original tiene cero duplicados idénticos y cero conflictos.
- La lluvia diaria se conserva en mm, no se divide entre 24 para fingir precipitación horaria. Solo se incorpora la lluvia fechada dos días antes, con período de medida de un día. El rezago es conservador para evitar el total futuro, pero no representa una identificación física del tiempo de infiltración.
- Se conserva la calidad BOM sin afirmar que está completamente controlada. No se interpreta una lluvia vacía como cero.
- El objetivo es la magnitud 3D publicada de la **lectura del día siguiente**. El intervalo puede diferir de 24 h. No se validan horizontes de 1 o 6 h. El primer experimento es anterior al inicio de la falla.
- Cada secuencia usa seis días observados consecutivos, más la lectura previa para calcular el primer incremento. Variables: magnitud de movimiento, incremento previo, intervalo previo en horas y lluvia rezagada. Ninguna entrada contiene el desplazamiento objetivo ni lluvia futura.
- Se pronostica el incremento y se suma al valor actual. No se obliga a que el movimiento aumente: las mediciones reales pueden bajar por ruido, referencias y trayectoria. No se recortan predicciones desfavorables.

## Particiones y modelos

Fechas de objetivo separadas en orden temporal:

| Partición | Regla | Ventanas |
| --- | --- | ---: |
| Entrenamiento | Objetivo hasta 31/01/2014 | 766 |
| Validación | Origen desde 01/02 y objetivo hasta 10/02/2014 | 198 |
| Prueba | Origen desde 11/02 y objetivo hasta 20/02/2014 | 231 |

Una ventana que cruza el límite origen/objetivo se excluye. El historial anterior al origen puede reutilizar observaciones ya disponibles, como en una evaluación rolling-origin; no hay entrenamiento posterior a enero. Solo se evalúan sensores que aparecen en entrenamiento. 1575 candidatos se omiten por fechas incompletas/lluvia ausente, 38 por límites y 16 por sensor no entrenado.

Normalización e incremento medio/desviación se calculan solo con entrenamiento. Ridge elige lambda por MAE de validación. LSTM reutiliza el núcleo NumPy verificado del proyecto, pero **entrena pesos nuevos**: 4 variables, 8 unidades ocultas, memoria de 6 días, semilla 15003054, Adam 0.003, lotes de 64, máximo 160 épocas y paciencia de 25. Completó 85 épocas y conserva la época 60 seleccionada por validación. La prueba no elige lambda, época o modelo. La tendencia extrapola la última velocidad pasada a 24 h nominales, sin consultar la hora futura.

## Resultado inicial

| Modelo | MAE validación (mm) | MAE prueba (mm) | RMSE prueba (mm) | R² prueba |
| --- | ---: | ---: | ---: | ---: |
| Persistencia | 4.383 | 6.392 | 17.422 | 0.8714 |
| Tendencia lineal | 8.359 | 10.178 | 23.358 | 0.7689 |
| Ridge | 6.543 | 9.572 | 20.156 | 0.8279 |
| LSTM | 3.844 | 11.574 | 27.578 | 0.6778 |

La LSTM gana en validación, pero **pierde en prueba frente a persistencia**. No hay evidencia aquí de que la IA compleja mejore el pronóstico de campo. Este resultado se conserva; cambiar retrospectivamente el modelo por el mejor de prueba produciría una selección optimista.

Las métricas globales agrupan varias series con niveles distintos. Un R² alto puede reflejar diferencias entre prismas, no buena predicción de cambios diarios. MAE del incremento es el mismo MAE de la magnitud porque todos los modelos parten del mismo valor actual. Hay métricas por prisma, pero sus ventanas comparten sitio y fechas: no son 231 experimentos independientes. No se calculan intervalos de confianza que presupongan esa independencia. No hay evaluación de detección de falla, tasas de falsas alarmas ni horizonte operacional.

## Uso y reproducción

En el tablero busca **Century Mine · prismas observados**, debajo del monitoreo. Selecciona prisma y modelo. La tabla agrupa todos los prismas; la nota bajo el gráfico muestra métricas del prisma elegido. Los puntos amarillos son predicciones sobre fechas de prueba reservadas; violeta corresponde a validación. El gráfico no une días ausentes. La inferencia de la última ventana se ejecuta en Node con los pesos guardados y se identifica como **reproducción retrospectiva**, no pronóstico actual.

```bash
npm run prepare:century
npm run train:century
npm test
```

La preparación requiere `unzip`; el entrenamiento Python 3 y NumPy. La aplicación servida solo necesita Node y los artefactos preparados. Reinicia el servidor tras regenerar artefactos, porque el caso se carga en caché después de verificar hashes.

API: `GET /api/research/century`, `?sensor=22-1917`, `?sensor=22-1917&origin=2014-02-18`. Descargas: `?download=daily` y `?download=report`. Fechas/prismas sin ventana válida devuelven error. Los modelos no se exponen por API y los datos no se insertan en el almacén de telemetría sintética/operacional. El chatbot recibe el caso seleccionado como contexto independiente, solo con el consentimiento existente.

Artefactos: series `data/generated/century-prisms-daily.csv`, ventanas `century-sequences.json`, manifiesto `century-dataset-manifest.json`, pesos `data/models/century-prism-daily-lstm.json` y evaluación `data/validation/century-real-data-evaluation.json`. Los hashes impiden servir pesos y series incompatibles. Pruebas JS reconcilian inferencia, pares predichos y métricas con Python.

## Qué se puede decir en un paper

“Además de la evaluación semisintética TA-01, se realizó una evaluación retrospectiva independiente con mediciones públicas de prismas de Century Mine. Se entrenó una LSTM específica del dominio observado y se comparó cronológicamente con líneas base, sin imputar estados FEM o presión de poros inexistentes. La mejora en validación no se sostuvo en prueba.”

Esto es evidencia inicial de evaluación con **datos de campo**, no validación del gemelo digital completo ni de Cerro de Pasco. Para ampliar: evaluar el archivo South_West con revisión de unidades/referencias y calidad, repetir múltiples cortes temporales y estudiar la falla; añadir señales sísmicas sin ventanas centradas que filtren información futura; conseguir geometría, materiales y condiciones hidráulicas para calibrar un FEM del sitio. Cualquier ajuste nuevo después de ver esta prueba necesita otro período de prueba independiente.
