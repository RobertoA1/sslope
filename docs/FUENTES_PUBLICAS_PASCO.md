# Datos públicos para avanzar con TA-01 sin acceso a una mina

El punto del CSV NASA POWER incorporado al proyecto es **10,68° S, 76,26° O**. Es una referencia climática próxima a Cerro de Pasco, **no** la ubicación levantada de un talud concreto. El caso TA-01 continúa siendo semisintético; no debe atribuirse a una mina real.

| Fuente | Qué aporta | Qué no aporta | Estado en el proyecto |
|---|---|---|---|
| [NASA POWER](https://power.larc.nasa.gov/) (`PRECTOTCORR`/MERRA-2) | Serie diaria de precipitación 2020–2025 para el punto citado | Pluviómetro del talud, intensidad horaria observada o infiltración | CSV integrado; el reparto uniforme en 24 h es un supuesto explícito |
| [INGEMMET GEOCATMIN, capa de geología](https://geocatmin.ingemmet.gob.pe/arcgis/rest/services/SERV_MAPAS_GEOLOGICOS/MapServer/11) | Contexto geológico regional y unidades cartografiadas | Cohesión, fricción, permeabilidad, espesor real de estratos o discontinuidades medidos en el talud | Pendiente de seleccionar un sitio y contrastar su posición con el mapa |
| [USGS SRTM 1 Arc-Second Global](https://www.usgs.gov/centers/eros/science/usgs-eros-archive-digital-elevation-shuttle-radar-topography-mission-srtm) | Topografía regional de ~30 m por píxel | Bancos, bermas, grietas o geometría reciente de una mina; el SRTM procede de una campaña histórica | Pendiente de seleccionar área y extraer perfiles; requiere revisión visual y referencia vertical |
| [ASF Vertex/HyP3 InSAR bajo demanda](https://hyp3-docs.asf.alaska.edu/guides/insar_product_guide/) | Interferogramas Sentinel-1 y, si la coherencia lo permite, desplazamiento superficial relativo en la línea de visión (LOS) | Desplazamiento 3D completo, movimiento interno, nivel freático o FoS | Opcional; requiere selección y procesamiento de escenas, corrección, referencia estable y control de calidad |

El producto [OPERA DISP de ASF](https://docs.asf.alaska.edu/vertex/displacement/) **no cubre Perú** en su cobertura Sentinel-1 publicada; no debe presentarse como una descarga directa de desplazamiento para Pasco. InSAR bajo demanda es otra ruta y sus resultados deben conservar la dirección LOS, coherencia, fechas de adquisición e incertidumbre. Un interferograma aislado no separa por sí mismo las componentes vertical y horizontal del movimiento.

## Orden práctico

1. Mantener el CSV NASA POWER ya cargado como contexto de lluvia regional, con su latitud, longitud y resolución espacial. No convertir sus totales diarios en intensidades horarias observadas.
2. Elegir **un talud o área de estudio identificable** y fijar coordenadas, sistema de referencia, extensión y fecha. Sin ese paso, geología, DEM y radar podrían referirse a lugares distintos.
3. Consultar GEOCATMIN y descargar/registrar las unidades que cruzan el área. Usarlas para formular hipótesis estratigráficas, no para asignar propiedades mecánicas numéricas sin ensayos.
4. Obtener un DEM SRTM y extraer una sección transversal con QGIS u otra herramienta GIS. La sección puede servir para un escenario topográfico regional; el diseño de bancos/bermas requiere una fuente de mayor resolución y fecha apropiada.
5. Si se necesita movimiento superficial observado, buscar escenas Sentinel-1 repetidas en Vertex y procesarlas con HyP3. Antes de incorporar una serie, guardar producto, fechas, órbita, LOS, referencia estable, máscara de coherencia, unidades y resolución. No mezclar LOS con desplazamiento del FEM sin una transformación geométrica justificada.
6. Para **calibración geotécnica** siguen haciendo falta, como mínimo, geometría local de alta resolución, ensayos o rangos defendibles de resistencia y permeabilidad, nivel piezométrico y desplazamiento independiente. Los datos públicos anteriores no sustituyen ese conjunto. Hasta entonces, `operationalDecisionAllowed` debe permanecer desactivado.

Separa siempre tres niveles de evidencia: dato público observado/derivado, parámetro supuesto y resultado simulado. Si se importa un nuevo archivo, conserva procedencia, licencia, fechas, CRS, unidades y SHA-256 antes de entrenar o comparar pronósticos.
