# Precipitación histórica de Pasco

## Archivo

`pasco-nasa-power-2020-2025.csv` es una copia sin modificaciones del archivo entregado para el caso de estudio TA-01.

| Campo | Valor |
|---|---|
| Fuente | NASA POWER |
| Producto indicado por el archivo | MERRA-2 Precipitation Corrected |
| Variable | PRECTOTCORR |
| Unidad | mm/día |
| Resolución temporal | Diaria, LST |
| Coordenadas | latitud -10.68, longitud -76.26 |
| Elevación de la celda MERRA-2 | 3994.12 m |
| Periodo | 2020-01-01 a 2025-12-31 |
| Registros válidos | 2192 |
| Valores faltantes | 0 |
| SHA-256 | `929141bc669ced424ce537d372e231fcaa9f9566010bcf9914af7ea32cb639d2` |
| Sitio de origen | https://power.larc.nasa.gov/ |

## Uso en el simulador

El valor diario seleccionado se conserva íntegramente. Para ejecutar el motor horario, el sistema lo distribuye uniformemente entre 24 intervalos. Esta transformación se registra como `UNIFORM_24H_ESTIMATED`; no representa una observación horaria ni mediciones dentro de una mina.

La lluvia tiene procedencia real de reanálisis, pero la presión de poros y el desplazamiento resultantes continúan siendo salidas simuladas del modelo reducido. Por ello el conjunto combinado se clasifica como semisintético y no permite uso operacional.
