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

El valor diario seleccionado se conserva íntegramente. La utilidad `uniformHourlyProfile` lo distribuye uniformemente entre 24 intervalos y registra `UNIFORM_24H_ESTIMATED`. El generador TA-01 (`src/core/study-case-ta01.js`) usa también perfiles rectangulares supuestos de 6, 12 o 24 horas, repartiendo el total diario dentro de su duración; las horas restantes tienen lluvia cero. El escenario sin lluvia usa 24 horas. Ambas transformaciones son distribuciones horarias estimadas: no son observaciones horarias ni mediciones dentro de una mina. El manifiesto y cada escenario conservan la duración utilizada.

La lluvia tiene procedencia real de reanálisis, pero la presión de poros y el desplazamiento resultantes continúan siendo salidas simuladas del modelo reducido. Por ello el conjunto combinado se clasifica como semisintético y no permite uso operacional.
