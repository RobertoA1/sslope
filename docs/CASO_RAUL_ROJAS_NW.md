# Caso de estudio real candidato: pared noroeste de Raúl Rojas

## Delimitación inicial

El sitio elegido es el tajo abierto Raúl Rojas, Cerro de Pasco. La unidad de análisis **no es todo el tajo**, sino un transecto A–B que cruza aproximadamente su pared noroeste y avanza hacia el interior. Queda registrado en [`data/sites/raul-rojas-nw-transect.geojson`](../data/sites/raul-rojas-nw-transect.geojson):

| Punto | Longitud WGS84 | Latitud WGS84 | Significado cartográfico |
|---|---:|---:|---|
| A | -76.26486 | -10.67041 | Flanco noroeste aproximado |
| C | -76.26228502 | -10.67319501 | Inicio aproximado del tramo descendente en SRTM, **no** corona medida |
| B | -76.25971 | -10.67598 | Interior del tajo aproximado |

Longitud horizontal geodésica aproximada: **837 m**; azimut A→B: **138°**. Para buscar insumos espaciales, usar un corredor de **±100 m** alrededor del transecto, reproyectándolo antes a UTM WGS84 zona 18S (`EPSG:32718`) para aplicar el búfer en metros. Esta anchura es una regla de búsqueda, **no** una medida de la pared ni del ancho del mecanismo de falla. Los extremos se eligieron visualmente sobre el [polígono público del tajo en OpenStreetMap, vía 343484051, versión 5](https://www.openstreetmap.org/way/343484051/history/5), consultado el 22 de septiembre de 2026. La geometría de OSM tampoco es un levantamiento topográfico de la mina.

Se consultaron **25 elevaciones SRTM 30 m** con interpolación bilineal a lo largo de A–B: [`raul-rojas-nw-srtm30m-profile.csv`](../data/sites/raul-rojas-nw-srtm30m-profile.csv). El perfil se mantiene cerca de 4304–4311 m hasta unos 418 m desde A; después desciende hasta 4093 m en B. El tramo descendente aproximado tiene ~217 m de desnivel en ~418 m horizontales. **No se han identificado aún la corona y el pie reales:** SRTM procede de la campaña de 2000, representa la forma global con píxeles de ~30 m y no documenta la geometría del tajo en 2009, 2025 ni 2026. No deben reconstruirse bancos ni bermas actuales a partir de este perfil. Tampoco se ha comprobado que el transecto cruce exactamente los puntos de la tesis sobre el sector NW: sus coordenadas de monitoreo no aparecen en las tablas revisadas.

## Evidencia disponible y compatibilidad temporal

| Componente | Evidencia localizada | Uso permitido ahora | Falta crítica |
|---|---|---|---|
| Lluvia | NASA POWER 2020–2025 y [serie MERRA-2 de agosto 2009 a enero 2010](../data/sites/raul-rojas-nw-power-rain-2009-2010.csv), punto -10.68, -76.26 | Forzante regional diaria; la nueva serie coincide aproximadamente con el **período** de los prismas históricos | Pluviómetro local, intensidades subdiarias y fechas exactas de cada lectura; lluvia regional no prueba causalidad |
| Geometría | Polígono OSM, perfil SRTM de 2000 y [secciones históricas publicadas en 2011](https://repositorio.uni.edu.pe/bitstream/20.500.14076/10463/1/perales_oj.pdf) | Ubicación, orientación y relieve global histórico | DEM/levantamiento local adecuado y contemporáneo, con fecha, CRS, datum vertical, bancos y bermas |
| Geología y resistencia | [Informe técnico NI 43-101](https://www.pascoresources.com/_resources/reports/43-101_El_Metalurgista.pdf?v=112709) y tablas de Perales (2011) | Hipótesis y rangos históricos a evaluar | Asignación de unidades y ensayos al transecto NW y al período elegido; no copiar parámetros como si fueran medidos hoy |
| Desplazamiento | Perales (2011) describe GeoMos/SSR; la [tesis de Ramos (2026)](https://gestionrepo.unmsm.edu.pe/items/66eba497-666f-4139-b9cb-cf1fa10ac241) reproduce **11 valores acumulados por prisma** de agosto 2009 a enero 2010 en rampa oeste/principal, transcritos en [`raul-rojas-nw-prism-aggregate-2009-2010.csv`](../data/sites/raul-rojas-nw-prism-aggregate-2009-2010.csv) | Contraste histórico de orden de magnitud, **no** entrenamiento ni validación temporal | Coordenadas y componente del movimiento de cada prisma, fechas de instalación y serie de lecturas diarias; las tablas publicadas son agregados de seis meses |
| Agua subterránea | [Tesis hidrogeológica UNDAC (2024)](https://alicia.concytec.gob.pe/vufind/Record/RUND_828423a8223d52ab86252de4b3e38d61/Details) menciona piezómetros del tajo | Justifica buscar nivel freático y parámetros hidráulicos | Lecturas de esos piezómetros, cota/profundidad, fechas y asociación espacial a la pared NW |

Los estudios citados pertenecen a períodos distintos. **No se debe mezclar** un desplazamiento histórico con lluvia 2020–2025 ni interpretar una tabla de diseño de 2011 como caracterización actual. La serie NASA POWER 2009–2010 sí comparte meses con los acumulados publicados, pero no basta para comparar lluvia–movimiento día a día. Para estos 184 días, POWER/MERRA-2 informa 88,42 mm en total y 6,65 mm como máximo diario; estas cifras son de una celda regional, no de un pluviómetro del talud. Tampoco se puede atribuir el colapso mencionado en la tesis a la lluvia solo con esta información.

Las figuras 27–28 de Ramos muestran **cálculos de estabilidad con otro software**, no observaciones: sin botadero In-Pit, FoS global `1,151` y de zona superior `0,929`; con botadero propuesto, `1,236` y `1,483`, respectivamente. El esquema publicado indica análisis estático sin superficie de agua, por lo que tampoco valida nuestra respuesta FEM a lluvia. Los valores por prisma provienen de tablas reproducidas de un informe geomecánico histórico; carecen de ubicación exacta para asociarlos al transecto A–B.

## Siguiente avance verificable

1. Sustituir el perfil SRTM histórico por topografía contemporánea del corredor A–B, con licencia, fecha, CRS y datum vertical; verificar corona, bancos, bermas y pie. Mientras no exista, mantener solo una geometría global de baja fidelidad.
2. Buscar la **serie diaria original GeoMos/SSR 2009–2010** y las coordenadas de prismas como PM-71 en la documentación de los autores o mediante solicitud de datos. Revisar aparte la tesis hidrogeológica. Si no se dispone de las series, considerar InSAR como observación externa limitada; los 11 acumulados publicados no sirven para entrenar una LSTM temporal.
3. Construir un **caso Raúl Rojas NW separado de TA-01**. Registrar cada parámetro como observado, derivado de fuente pública o supuesto; calibrar con una parte de las fechas y reservar otras para contraste independiente.
4. Mantener desactivada toda decisión operacional. Esta delimitación identifica una zona de investigación, no un gemelo validado ni una alerta de seguridad.

## Procedencia de los archivos nuevos

Las consultas y límites se registran en [`raul-rojas-nw-provenance.json`](../data/sites/raul-rojas-nw-provenance.json). El perfil se obtuvo con el [servicio público Open Topo Data](https://www.opentopodata.org/api/) (`srtm30m`, 25 muestras, bilineal); la lluvia histórica con la [API diaria de NASA POWER](https://power.larc.nasa.gov/docs/services/api/temporal/daily/) (`PRECTOTCORR`, `AG`, `LST`). Las elevaciones se redondean a metros enteros por el raster/API, y los desplazamientos se transcribieron de las figuras 19–20 de la tesis, página impresa 42. Ninguno de estos archivos es telemetría en vivo.
