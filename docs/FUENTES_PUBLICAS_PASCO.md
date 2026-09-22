# Datos públicos para estudiar Raúl Rojas sin acceso a la mina

## Sitio real seleccionado: tajo Raúl Rojas, Cerro de Pasco

El sitio objetivo del futuro estudio de campo es el **tajo abierto Raúl Rojas** en Cerro de Pasco. Como primer sector candidato se prioriza la **pared nor-oeste (NW)**, porque existen publicaciones específicas sobre su monitoreo. El centro aproximado del polígono del tajo en OpenStreetMap es `-10.67661, -76.25992` ([ficha cartográfica](https://mapcarta.com/W343484051)); **no es una coordenada de la pared NW ni un punto de medición**. Se debe delimitar la sección exacta, su sistema de referencia, fecha y versión de geometría antes de atribuirle una simulación.

Ya se registró un [transecto cartográfico NW provisional](CASO_RAUL_ROJAS_NW.md) con extremos y corredor de búsqueda reproducibles. No constituye todavía un perfil topográfico ni fija corona y pie medidos.

Esta elección **no convierte el caso semisintético TA-01 en un modelo calibrado de Raúl Rojas**. Los resultados actuales siguen perteneciendo a TA-01. Para pasar al sitio real, hay que construir una geometría y parametrización nuevas, y compararlas con observaciones independientes del mismo sector y período.

Fuentes específicas localizadas para evaluar su utilidad:

| Fuente | Aporte potencial | Límite antes de incorporarla |
|---|---|---|
| [Perales Orellana, UNI, 2011](https://repositorio.uni.edu.pe/bitstream/20.500.14076/10463/1/perales_oj.pdf) | Secciones representativas de las paredes, rangos y tablas geomecánicas, descripción de GeoMos/SSR 083 y gráficos de deformación de la pared NW | Geometría y parámetros **históricos**; los gráficos publicados no equivalen a una serie digital cruda con fechas, coordenadas e incertidumbre verificadas |
| [Ramos Parra, UNMSM, 2026](https://gestionrepo.unmsm.edu.pe/items/66eba497-666f-4139-b9cb-cf1fa10ac241) | Estudio específico del tramo nor-oeste; reproduce 11 desplazamientos acumulados de prismas de agosto de 2009 a enero de 2010 y un análisis de estabilidad con/sin botadero In-Pit | Revisado: las tablas visibles no aportan fechas diarias ni coordenadas de esos prismas; los FoS son cálculos, no observaciones ni validación de nuestro FEM |
| [Calsina Colqui, UNDAC, 2024](https://alicia.concytec.gob.pe/vufind/Record/RUND_828423a8223d52ab86252de4b3e38d61/Details) | Estudio hidrogeológico de Raúl Rojas; su resumen menciona piezómetros Casagrande | Verificar ubicación, profundidad, fechas, unidades y disponibilidad de lecturas antes de usarlas para calibrar presión de poros |
| [Informe técnico NI 43-101, 2021](https://www.pascoresources.com/_resources/reports/43-101_El_Metalurgista.pdf?v=112709) | Mapa geológico del tajo y contexto estructural | Es contexto geológico, no una malla actual ni mediciones de desplazamiento |

La siguiente decisión técnica es fijar una **sección NW reproducible** y una fecha de referencia; después, comprobar si existen series numéricas de desplazamiento y nivel piezométrico para esa misma sección y período. Hasta entonces la pared NW es un **caso candidato documentado**, no un gemelo digital validado.

El punto del CSV NASA POWER incorporado al proyecto es **10,68° S, 76,26° O**. Es una referencia climática próxima a Cerro de Pasco, **no** la ubicación levantada de un talud concreto. El caso TA-01 continúa siendo semisintético; no debe atribuirse a una mina real.

| Fuente | Qué aporta | Qué no aporta | Estado en el proyecto |
|---|---|---|---|
| [NASA POWER](https://power.larc.nasa.gov/) (`PRECTOTCORR`/MERRA-2) | Serie diaria de precipitación 2020–2025 para el punto citado | Pluviómetro del talud, intensidad horaria observada o infiltración | CSV integrado; el reparto uniforme en 24 h es un supuesto explícito |
| [INGEMMET GEOCATMIN, capa de geología](https://geocatmin.ingemmet.gob.pe/arcgis/rest/services/SERV_MAPAS_GEOLOGICOS/MapServer/11) | Contexto geológico regional y unidades cartografiadas | Cohesión, fricción, permeabilidad, espesor real de estratos o discontinuidades medidos en el talud | Pendiente de seleccionar un sitio y contrastar su posición con el mapa |
| [USGS SRTM 1 Arc-Second Global](https://www.usgs.gov/centers/eros/science/usgs-eros-archive-digital-elevation-shuttle-radar-topography-mission-srtm) | Topografía regional de ~30 m por píxel | Bancos, bermas, grietas o geometría reciente de una mina; el SRTM procede de la campaña de 2000 | Perfil inicial A–B de 25 muestras extraído; requiere topografía contemporánea y de mayor resolución |
| [ASF Vertex/HyP3 InSAR bajo demanda](https://hyp3-docs.asf.alaska.edu/guides/insar_product_guide/) | Interferogramas Sentinel-1 y, si la coherencia lo permite, desplazamiento superficial relativo en la línea de visión (LOS) | Desplazamiento 3D completo, movimiento interno, nivel freático o FoS | Opcional; requiere selección y procesamiento de escenas, corrección, referencia estable y control de calidad |

El producto [OPERA DISP de ASF](https://docs.asf.alaska.edu/vertex/displacement/) **no cubre Perú** en su cobertura Sentinel-1 publicada; no debe presentarse como una descarga directa de desplazamiento para Pasco. InSAR bajo demanda es otra ruta y sus resultados deben conservar la dirección LOS, coherencia, fechas de adquisición e incertidumbre. Un interferograma aislado no separa por sí mismo las componentes vertical y horizontal del movimiento.

## Orden práctico

1. Mantener el CSV NASA POWER 2020–2025 como contexto reciente y la serie histórica 2009–2010 para los meses de los prismas publicados, siempre con latitud, longitud y resolución espacial. No convertir totales diarios en intensidades horarias observadas ni correlacionar agregados de seis meses como si fueran lecturas diarias.
2. Delimitar **una sección concreta de la pared NW** y fijar coordenadas, sistema de referencia, extensión y fecha. Sin ese paso, geología, DEM y radar podrían referirse a lugares distintos.
3. Consultar GEOCATMIN y descargar/registrar las unidades que cruzan el área. Usarlas para formular hipótesis estratigráficas, no para asignar propiedades mecánicas numéricas sin ensayos.
4. Obtener un DEM SRTM y extraer una sección transversal con QGIS u otra herramienta GIS. La sección puede servir para un escenario topográfico regional; el diseño de bancos/bermas requiere una fuente de mayor resolución y fecha apropiada.
5. Si se necesita movimiento superficial observado, buscar escenas Sentinel-1 repetidas en Vertex y procesarlas con HyP3. Antes de incorporar una serie, guardar producto, fechas, órbita, LOS, referencia estable, máscara de coherencia, unidades y resolución. No mezclar LOS con desplazamiento del FEM sin una transformación geométrica justificada.
6. Para **calibración geotécnica** siguen haciendo falta, como mínimo, geometría local de alta resolución, ensayos o rangos defendibles de resistencia y permeabilidad, nivel piezométrico y desplazamiento independiente. Los datos públicos anteriores no sustituyen ese conjunto. Hasta entonces, `operationalDecisionAllowed` debe permanecer desactivado.

Separa siempre tres niveles de evidencia: dato público observado/derivado, parámetro supuesto y resultado simulado. Si se importa un nuevo archivo, conserva procedencia, licencia, fechas, CRS, unidades y SHA-256 antes de entrenar o comparar pronósticos.
