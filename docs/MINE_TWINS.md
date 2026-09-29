# Casos de mina en el visor

El selector superior permite elegir **Century Mine**, **Cerro de Pasco** o el **laboratorio TA-01**. Century se abre por defecto. Cada caso mantiene datos, geometría y límites independientes. Seleccionar una mina no cambia la telemetría guardada del laboratorio ni crea alertas.

## Century: prototipo retrospectivo parcial

La geometría representa el **sector instrumentado sudoeste**, no toda la mina. Se deriva del archivo `South_West_Corner_06082014.csv` del [dataset de Tjaart de Wit](https://zenodo.org/records/15003054), CC BY 4.0. El [artículo asociado](https://doi.org/10.26443/seismica.v5i1.1902) documenta el contexto del evento. La mina está en Australia, no en Colorado.

El archivo original, su MD5 y SHA-256 se conservan en `data/external/century-mine`. El inventario ampliado [Zenodo 14969229](https://zenodo.org/records/14969229) incluye el mismo `Data.zip` (mismo MD5), más correlaciones sísmicas de gran tamaño, pero no ofrece una malla topográfica. No se descargan decenas de GB de correlaciones para fabricar una topografía que esos archivos no contienen.

Preparación reproducible:

- 82.401 registros originales de 160 prismas. Una repetición idéntica se consolida; no hay marcas de tiempo contradictorias en este archivo.
- Última lectura existente de cada prisma por fecha local: 22.568 lecturas diarias, **215 fechas observadas** entre 2014-01-01 y 2014-08-06. Se omiten 2014-06-22, 2014-07-07 y 2014-07-18 porque no contienen lecturas; no se inventan fotogramas.
- Referencia: 146 prismas con lectura el 2014-01-01. Las horas difieren entre prismas; no es una medición simultánea.
- Coordenadas E, N, Height del export Quikslope, interpretadas en metros. CRS y datum no están declarados. No se inventa EPSG, posición GPS ni transformación a Pasco. El visor resta un origen local y permuta los ejes para Three.js, sin normalizar dimensiones a un tamaño arbitrario.
- Superficie TIN: Delaunay en E–N con [Delaunator](https://github.com/mapbox/delaunator), alturas de los prismas de referencia e interpolación lineal entre ellos. Se rechazan triángulos con aristas horizontales >150 m de la **capa de movimiento** para reducir puentes sobre zonas sin soporte. Quedan 264 triángulos de los 280 iniciales. El fondo visual conserva los 280; los 16 triángulos largos se muestran siempre grises, fijos y esquemáticos, incluso si sus vértices tienen lecturas. No son topografía levantada ni reciben movimiento o colores analíticos. El límite es una decisión de representación, no una frontera de falla ni una tolerancia geotécnica validada.
- En cada fecha se muestran solamente los prismas que tienen lectura ese día. La superficie histórica de referencia permanece fija y gris debajo de la capa observada, por lo que la ausencia de lecturas no borra el terreno. Un triángulo admitido en la capa de movimiento recibe movimiento y color analítico solo si sus tres vértices tienen observación actual; los demás permanecen como referencia visual gris. No se arrastran ni interpolan lecturas ausentes, no se supone desplazamiento cero y no se extrapola fuera del soporte de la malla de referencia. La base no se amplifica ni se sustituye con lecturas de otro día.
- Los 14 prismas sin referencia el 1 de enero pueden aparecer en fechas posteriores como puntos grises, con sus coordenadas observadas, pero no generan un vector respecto de una referencia inexistente.
- Movimiento: vector de cambio de coordenadas respecto del 1 de enero. Su norma se convierte de m a mm. Es cambio neto de posición, no longitud acumulada de trayectoria ni el acumulado reportado desde noviembre en otro archivo.
- Los campos `Easting Diff`, `Northing Diff`, `Height Diff` originales se conservan en los fotogramas para auditoría, pero no sustituyen el vector calculado a partir de coordenadas. La preparación no modifica el original.
- Dos saltos >1 m entre lecturas diarias de un mismo prisma quedan marcados para revisión. No se borran ni se clasifican automáticamente como error o falla. Sin información adicional pueden ser movimiento real, cambios de referencia o errores de medición.
- Lluvia: registros diarios BOM de estación 029167, preservando fecha, período, calidad, cero y ausencia de datos. Las partículas solo ilustran días con lluvia y período de un día. No son una intensidad horaria observada y no aplican cargas o presión de poros al suelo.

El 23/02/2014 es una referencia bibliográfica del inicio del evento, no una detección del software. Ese día hay 47 prismas con lectura: se conservan los 280 triángulos del fondo visual y se superponen 36 con datos del día; los otros 244 quedan como referencia gris (228 sin cobertura actual completa y 16 de contexto esquemático). La reducción de cobertura **no demuestra** que los sensores restantes fallaron por el derrumbe.

## Cómo usar Century

1. Elegir Century en el selector superior.
2. Elegir fecha y prisma en el tablero o inspeccionar un punto del modelo.
3. Pulsar «Reproducir mediciones» para recorrer fotogramas observados; «Pausar» permite inspeccionarlos. La velocidad se expresa en fechas por segundo, no tiempo real.
4. El movimiento empieza a **1×**, conservando su magnitud. El slider puede amplificarlo solo en pantalla. Coordenadas, lluvia y métricas no cambian. Una amplificación alta puede producir una geometría visual irreal; no representa la escala del movimiento real.
5. Desactivar «Movimiento del terreno» conserva la superficie de referencia y muestra vectores de cambio. Los puntos de esa vista y las flechas son una representación de referencia, no ubicaciones actuales sin amplificación.
6. «Partículas de lluvia observada» se puede desactivar. No implica que la app haya calculado una respuesta mecánica a esa lluvia.
7. «Ampliar» y «Otra ventana» conservan la mina y el fotograma. La ventana principal ofrece «Cerrar ventana y volver aquí».

La superficie gris es referencia histórica, no una medición actual. Al amplificar el movimiento puede verse también debajo de partes medidas que se separan de su posición original: no representa otra capa geológica ni un fallo del terreno. Se conserva la referencia en la ventana adicional y al desactivar el movimiento. No se extrapola fuera del contorno de los prismas de referencia. Los triángulos largos entre prismas solo completan un contexto gris, no una medición del terreno. Las zonas medidas mantienen una referencia tenue para no tapar la superficie desplazada.

La curva del prisma muestra retrospectivamente **todo** su registro. No es información disponible antes de cada fecha ni entrada de un pronóstico causal. No se conectan días ausentes. Verde–amarillo–rojo en el modelo indica cambio de posición relativo al máximo observado en el fotograma, **no riesgo**; la escala varía con la fecha.

## Diferencia con la LSTM integrada

La evaluación LSTM/ridge/persistencia anterior usa **West Wall**, otro archivo, unidades objetivo y particiones hasta 20/02/2014. No se transfieren esos pesos al sector sudoeste, ni se atribuyen sus métricas a esta reconstrucción. El panel «Century · evaluación temporal West Wall» se conserva como evaluación independiente. Ver `CENTURY_DATASET.md`.

El visor nuevo reproduce coordenadas históricas. **No contiene todavía un FEM calibrado para Century ni predice la falla**. Faltan topografía completa y fechada, litología, discontinuidades, parámetros constitutivos, agua y presión de poros. La textura, iluminación y sombras son ilustrativas; no identifican materiales geológicos. No hay FoS, incertidumbre calibrada, alertas ni uso operacional para esta mina.

## Cerro de Pasco

Vista independiente del perfil SRTM de febrero de 2000 del transecto A–B en la pared NW del tajo Raúl Rojas. Sus 25 cotas originales y procedencia permanecen en `data/sites` y se verifica el SHA-256 del perfil. Se extruye un ancho esquemático ±100 m para mostrar el perfil en 3D; **no existe información topográfica transversal observada** en ese modelo.

Los puntos SRTM no son sensores. Los agregados de prismas publicados de Pasco no tienen coordenadas ni una serie diaria para reproducir movimiento. Se deshabilitan reproducción temporal, lluvia asociada al fotograma y amplificación; no se colocan datos de Century en Pasco. Este perfil histórico tampoco constituye un modelo actualizado de la mina.

## Laboratorio TA-01

Conserva el simulador y las pruebas FEM–LSTM semisintéticas existentes. Sus parámetros, sensores, lluvia simulada y alertas orientativas no se aplican a Century o Pasco. Las tarjetas de riesgo demostrativo se ocultan al ver una mina y el chatbot recibe una instantánea explícita del caso y fotograma activos. No se hacen llamadas reales a OpenAI durante las pruebas.

## Archivos y reproducción

```sh
npm run prepare:mine-twins
npm run build:chat
npm test
npm run dev
```

Requiere el archivo original incorporado, Node.js 24 y `unzip` para la preparación. El runtime sirve los JSON derivados sin extraer el ZIP. Docker incluye ambos artefactos derivados.

- `src/core/century-spatial.js`: parser, controles de fuente, reducción diaria y triangulación.
- `scripts/prepare-mine-twins.js`: generación independiente de Century y Pasco, con hashes de fuentes.
- `data/generated/mine-twin-century.json`: puntos, referencia, triángulos, lluvia, fotogramas, advertencias y atribución.
- `data/generated/mine-twin-pasco.json`: perfil histórico y extrusión identificada como esquemática.
- `src/mine-twins.js`: API de solo lectura `GET /api/mines/century` y `GET /api/mines/pasco`. `?download=1` descarga el caso completo.
- `public/mine-twin-frame.js`: transformación métrica, vectores, máscara de cobertura y superficie de referencia y contexto del chat; no depende de Three.js.
- `public/mine-twin-controller.js`: selector, fechas, reproducción y transferencia de fotograma a ventana adicional.
- `public/slope-scene-3d.js`: reutiliza buffers geométricos y marcadores entre fechas. No reconstruye cientos de objetos en cada fotograma ni retransmite toda la serie histórica a la otra ventana.
- `test/mine-twins.test.js`: reconstrucción desde el original, unidades, huecos, escala, API y separación de casos.

## Qué se puede escribir en un paper

«Se implementó un prototipo de gemelo retrospectivo parcial del sector sudoeste de Century Mine, basado en coordenadas públicas de prismas y una superficie TIN interpolada. Se preservó la cobertura temporal observada y se distinguió la reproducción geométrica de la evaluación temporal independiente West Wall. La reconstrucción no constituye una calibración hidromecánica ni acredita predicción de falla o aptitud operacional».

La igualdad entre coordenadas exportadas y reproducidas verifica el software de visualización, **no** una hipótesis física ni la precisión del levantamiento original. Para un gemelo físico de mayor fidelidad se necesita topografía y calibración con una parte de las observaciones, seguida de validación con fechas independientes. Para un gemelo en vivo se necesita además una conexión periódica a instrumentación y un flujo de control de calidad real.
