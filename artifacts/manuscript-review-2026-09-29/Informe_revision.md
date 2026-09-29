# Revisión científica y editorial del manuscrito TA-01

Fecha: 29 de septiembre de 2026. Manuscrito: «Prototipo semisintético FEM LSTM con corrección guiada por física para pronosticar desplazamientos en taludes». Revisión del documento proporcionado y del repositorio local sslope, HEAD `e1a4b2881de331da0cee3a680b3e04bc2914173e`.

Se entrega una copia revisada, no una sustitución del original. El amarillo identifica texto añadido o modificado; 22 comentarios de Word señalan decisiones pendientes. `Cambios_por_seccion.md` registra antes → después y justificación. No se recalcularon ni sustituyeron resultados originales, intervalos de confianza o valores p; tampoco se entrenaron modelos ni se modificó el software. Las figuras nuevas presentan resultados archivados, no experimentos nuevos.

## 1. Diagnóstico ejecutivo

Veredicto: REVISIÓN MAYOR; es un estudio computacional potencialmente publicable, pero esta versión no está lista para envío.

- Fortaleza 1. Encuadre explícitamente semisintético y conclusiones que no prometen validez operacional.
- Fortaleza 2. Cuatro líneas base comparables y dos horizontes sobre ventanas comunes.
- Fortaleza 3. Separación por fechas y dos evaluaciones cronológicas con reentrenamiento.
- Fortaleza 4. Predicciones, modelos, manifiestos y 86 huellas SHA-256 contrastables y coincidentes.
- Fortaleza 5. Pruebas analíticas FEM, sensibilidad de malla y evaluación de robustez diferenciadas.

- Debilidad 1. Los valores p y la permutación/Holm descritos carecen de un artefacto reproducible localizado.
- Debilidad 2. El comando publicado no reproduce la malla archivada; las ecuaciones omiten transformaciones del código.
- Debilidad 3. Las diferencias predictivas son extremadamente pequeñas frente al redondeo previo de las etiquetas FEM.
- Debilidad 4. Calibración reutilizada, escasas fechas húmedas y ausencia de ablación reentrenada del corrector.
- Debilidad 5. Revista e idioma contradictorios; novedad, referencias y declaraciones requieren cierre editorial.

### Alcance de la auditoría

El estudio auditado es TA-01, no el conjunto Century Mine ni los experimentos de la aplicación paralela `research-app`. Solo la precipitación procede de una fuente externa; geometría, propiedades geotécnicas, presión de poros, sensores espaciales y desplazamientos son simulados. NASA POWER aporta reanálisis diario en −10,68°, −76,26°, no una estación instrumental de mina. El punto de lluvia no convierte la geometría supuesta en una reconstrucción de Cerro de Pasco.

Se contrastaron los archivos de validación, los scripts de generación/entrenamiento y el solver; no se ejecutó una reproducción completa del entrenamiento. La coincidencia de hashes verifica integridad, no identidad de resultados de una ejecución nueva. La verificación bibliográfica distingue registro de DOI, ficha editorial y lectura íntegra: no atribuye a una ficha bibliográfica la autenticación de cuarenta citas textuales.

### Revista: conflicto que debe resolver el autor

La solicitud nombra Boletín Geológico y Minero (BGM), pero las instrucciones copiadas pertenecen a Earth Sciences Research Journal (ESRJ). El [PDF oficial accesible de BGM](https://web.igme.es/Boletin/archivos/5-Rules%20for%20authors.pdf) admite español o inglés y establece resúmenes de 100–250 palabras. Las [normas de ESRJ](https://revistas.unal.edu.co/index.php/esrj/about/submissions) exigen inglés y resumen de hasta 300 palabras. También difieren los elementos de envío. No debe mezclarse una norma con la otra.

Se mantiene español y resumen inglés, conforme al idioma solicitado. El PDF de BGM es una fuente oficial accesible, pero debe contrastarse con las instrucciones de la plataforma de envío vigente antes de presentar el manuscrito. No se ha confirmado un cuartil JCR/Scopus ni se atribuye la condición Q1 a la revista. La cuota de 40 referencias y 80 % recientes se trata como requisito del autor, no como una exigencia editorial verificada.

## 2. Hallazgos priorizados y auditoría de fondo

| ID | Sección | Problema | Gravedad | Corrección propuesta |
|---|---|---|---|---|
| A01 | Métodos/RQ2/conclusiones | No se localizó código ni CSV/JSON de las 20 000 permutaciones, valores p y Holm. | Crítica | Aportar script, semillas, estadístico, regla bilateral, p sin ajustar/ajustado, familia de cuatro comparaciones y hashes. Se conservaron los p con [VERIFICAR]; no se ratifican. |
| A02 | Reproducción | El comando omite malla: el script usa 14 × 9, pero los 500 escenarios archivados usan 30 × 20. | Crítica | Publicar receta explícita, con malla y rutas/prefijos independientes. Verificar reproducción sin sobreescribir resultados originales. |
| A03 | Escala de resultados | Magnitudes nodales redondeadas a 10⁻⁵ mm antes de construir etiquetas; diferencias entre modelos inferiores a ese paso. | Mayor | Ejecutar sensibilidad a precisión completa/redondeo y tolerancia; no inferir precisión instrumental nanométrica. Preservar cifras actuales. |
| A04 | Ecuaciones 2–3 | El corrector opera sobre el cambio estandarizado, con reconstrucción y proyección final; la fórmula esquemática lo omite. | Mayor | Confirmar y sustituir por la formulación completa propuesta abajo. Las ecuaciones originales se conservaron y comentaron. |
| A05 | Calibración | Validación utilizada para selección/detención temprana y para cuantil de intervalos. | Mayor | Nombrarlos intervalos empíricos. Para garantía calibrada: reservar calibración independiente y considerar dependencia y cambio temporal. |
| A06 | Ablación | Las variantes «sin hidrología/FEM» enmascaran entradas en inferencia, no reentrenan ni aíslan términos de pérdida. | Mayor | Renombrar como enmascaramiento. Comparar corrector libre y corrector restringido de igual capacidad, y retirar cada término con reentrenamiento. |
| A07 | Novedad | La tabla próxima se limita a 2022–2025 y no acredita prioridad absoluta. | Mayor | Comparar también Du (2026), Tian (2026) y Dong (2025), ya presentes en bibliografía. Delimitar protocolo reproducible y resultado negativo, no combinación inédita por afirmación. |
| A08 | Partición | El corte por fecha reserva extremos y balancea un índice generado; no es muestreo aleatorio simple. | Mayor | Declarar regla y manifestar que el estimando depende de esa selección; conservar los cortes cronológicos. |
| A09 | Información exógena | Lluvia futura conocida y perfil horario construido desde un total diario. | Mayor | Definir pronóstico condicionado a lluvia idealizada; contrastar posteriormente entradas meteorológicas disponibles al tiempo de emisión. |
| A10 | Remuestreo | Bootstrap de conglomerados por fecha, no bloques de días consecutivos; dependencia entre fechas no comprobada. | Mayor | Usar terminología correcta y justificar unidades de independencia. Considerar bloques temporales o eventos multidiarios si procede. |
| A11 | Tamaño muestral | Las miles de ventanas no son miles de eventos independientes; lluvia alta contiene dos/tres fechas. | Mayor | Reportar escenarios, fechas y ventanas por separado. No afirmar robustez extrema a partir de dos/tres eventos. |
| A12 | Entrenamiento | Sin búsqueda comparable extensa ni repetición neuronal por semillas; corrector entrenado con predicciones in-sample. | Mayor | Declarar alcance; añadir repeticiones y predicciones fuera de muestra para la segunda etapa cuando se evalúe generalización. |
| A13 | Restricción física | Monotonía parcial del corrector no implica monotonía global del híbrido; las líneas base también proyectan la salida. | Mayor | Aclarar variables mantenidas fijas y restricción compartida; no llamar PINN de campo a la corrección agregada. |
| A14 | FEM/RQ4 | Refinamiento no monótono; PIELM comparte operador y sensores sintéticos. | Mayor | Separar verificación analítica, concordancia interna, convergencia y validación externa. No afirmar independencia del referente. |
| A15 | Resultados/RQ2 | «Sin evidencia» puede confundirse con equivalencia; porcentajes y bootstrap usan precisiones diferentes. | Mayor | IC de diferencia con unidades y signo; ningún IC excluye cero. Equivalencia necesita margen práctico predefinido y prueba apropiada. No modificar porcentajes sin revisión autoral. |
| A16 | Disponibilidad | Docker del visor no encierra toda la cadena científica; entorno/hardware parcialmente fijados. | Mayor | Release inmutable, DOI archivado, dependencias exactas, comandos completos y prueba de reproducción. [VERIFICAR acceso público y licencia de fuentes]. |
| E01 | Revista/idioma | BGM y ESRJ son destinos distintos. | Crítica editorial | Confirmar destino; no traducir íntegramente ni adaptar normas incompatibles por suposición. |
| E02 | Figuras/tablas | El original tiene una figura de flujo y cuatro imágenes de ecuaciones, no seis figuras de evidencia; cuatro tablas principales y dos anexos. | Mayor | Se crearon seis figuras y seis tablas principales con fuentes. Las dos tablas de anexo quedan identificadas como A1/A2, no como tablas de resultados. |
| E03 | Anexos/referencias | Cuarenta citas literales/traducciones en A2 duplican la revisión; autenticación puntual pendiente. | Mayor | Preferir síntesis y mover matriz a suplemento; eliminar A2 solo con aprobación. Añadir ubicación de cada literal si se conserva. |
| E04 | Autoría/declaraciones | Dirección completa, correspondencia y roles CRediT pendientes; alcance de IA no confirmado. | Mayor | Solicitar datos reales a autores. No inventar departamentos, roles, ORCID, financiación ni declaraciones de exclusividad. |
| E05 | Estilo de envío | Numeración de secciones, líneas continuas, puntos clave y ubicación de leyendas dependen de BGM; ESRJ exigiría versión íntegra en inglés. | Menor hasta confirmar destino | Completar maquetación específica después de resolver E01. Esta es copia de revisión, no versión anónima ni lista para envío. |
| R01 | Bibliografía | Referencia de Tekhné no confirmada suficientemente en fuente primaria. | Mayor | Mantener [VERIFICAR en fuente editorial], aportar artículo o ficha oficial; no declararla inexistente. |
| R02 | Bibliografía | Guevara/Gómez/Ortiz: orden de autores discrepante; Sequeira: paginaciones distintas según fuente. | Mayor | Resolver con versión editorial definitiva, sin cambiar datos bibliográficos unilateralmente. |

### Trazabilidad objetivo → RQ → método → evidencia → conclusión

Objetivo afinado: evaluar, en el caso semisintético TA-01, el pronóstico del desplazamiento máximo inducido por lluvia respecto del estado inicial y el comportamiento de una corrección residual monótona. La red aprende un cambio temporal; el valor finalmente evaluado no es ese cambio aislado ni el desplazamiento total de una mina.

| RQ | Método y unidad | Evidencia archivada | Conclusión admisible |
|---|---|---|---|
| RQ1: desempeño | Persistencia, ridge, LSTM e híbrido; mismas ventanas; fechas disjuntas y cortes 2024/2025. | `ta01-model-comparison.csv`, `ta01-rolling-origin-model-comparison.csv`; Tablas 3–4. | Orden relativo dentro del generador y cambio por año; no extrapolar precisión de campo. |
| RQ2: aporte consistente | Diferencia pareada MAE(LSTM) − MAE(híbrido), 5000 remuestreos por fecha. | `ta01-rolling-origin-bootstrap.json`; Figura 3. Los p citados siguen sin origen localizado. | Inversión del orden y cuatro IC que incluyen cero: no se demuestra mejora consistente; tampoco equivalencia. |
| RQ3: degradación | Ruido y faltantes aleatorios, imputación con medias de entrenamiento, sin reentrenar. | `ta01-robustness-summary.csv`; Tabla 6/Figura 5. | El híbrido es más sensible en estas perturbaciones; no generalizar a todo fallo instrumental. |
| RQ4: concordancia interna | Pruebas analíticas FEM, sensibilidad de malla y PIELM con referente FEM compartido. | `ta01-fem-mesh-sensitivity.json`, `ta01-spatial-pinn-validation.json`; Tabla 5/Figura 2. | Se verifican aspectos del cálculo y cuantifica concordancia interna; no se valida el talud real. |

### Datos y tamaño muestral

El generador produce 500 escenarios × 24 horas = 12 000 registros. En la partición principal hay 350/75/75 escenarios de entrenamiento/validación/prueba y 346/74/75 fechas únicas. A 1 h se evalúan 1350 ventanas principales; a 6 h, 975. En 2024, la prueba tiene 82 escenarios y 82 fechas, con 1476/1066 ventanas a 1/6 h; en 2025, 78 escenarios y 76 fechas, con 1404/1014 ventanas. Los denominadores deben acompañar las tablas o las notas de métodos. No son muestras independientes por ventana.

Se verificó que los escaladores se ajustan con entrenamiento y que ninguna fecha/escenario cruza conjuntos. Esto no demuestra ausencia de todas las amenazas: persisten lluvia futura idealizada, selección de extremos, geometría común y evaluación contra el propio generador. El corrector in-sample no constituye por sí solo fuga hacia prueba, pero merece comparación con ajuste fuera de muestra. La selección ridge usa validación; no se encontró una búsqueda sistemática comparable para las redes.

### Interpretación de magnitudes e inferencia

Los MAE originales y sus intervalos se mantienen. La unidad mm es un submúltiplo SI válido; conviene mostrar resultados muy pequeños en notación científica, con el multiplicador en el eje o encabezado y la misma unidad para el IC. La Figura 3 utiliza escalas explícitas de 10⁻⁷ mm a 1 h y 10⁻⁶ mm a 6 h. Un signo positivo favorece al híbrido. Mostrar más decimales no equivale a resolver mejor la física.

El redondeo en `src/core/fem-2d.js` impone un paso de 10⁻⁵ mm = 10⁻⁸ m. Un MAE promedio por debajo del paso es matemáticamente posible: los promedios y predicciones continuas no tienen por qué ser múltiplos del paso. La cuestión crítica es la relevancia física y la estabilidad de la comparación frente a redondeo, tolerancia, malla e incertidumbre del generador. No se afirma que el redondeo invalide automáticamente todos los resultados.

«Todos los IC incluyen cero» significa evidencia insuficiente de diferencia bajo este diseño, no modelos equivalentes. Para equivalencia se necesitaría un margen de error relevante preespecificado, compatible con el uso geotécnico, y un análisis apropiado. No se inventa ese margen. Los porcentajes del manuscrito se obtienen de MAE resumidos redondeados; el bootstrap usa predicciones guardadas con otra precisión. Se pide aclarar esa base, no reemplazar porcentajes.

Para tamaños del efecto, priorizar diferencia absoluta de MAE e IC, acompañada de reducción relativa como medida descriptiva. Puede añadirse normalización por escala del objetivo o ruido instrumental cuando esa escala esté definida y respaldada; no introducir una precisión instrumental hipotética como si fuera real.

### Formulación completa propuesta, pendiente de aprobación

Las ecuaciones originales se numeraron a la derecha y se conservaron por integridad. Para representar el código, sea `q` la predicción del cambio estandarizado de la LSTM, `c` la corrección en esa misma escala y `μδ`, `σδ` parámetros del cambio objetivo calculados solo en entrenamiento:

`ŷ_LSTM(t+h) = max[y(t), y(t) + μδ + σδ q]`

`ŷ_híbrido(t+h) = max[y(t), y(t) + μδ + σδ(q + c)]`

No es, en general, sumar la corrección a una salida LSTM ya proyectada. La derivada monótona del corrector se interpreta manteniendo fija la salida base y las demás entradas directas. Estas fórmulas son propuestas de concordancia documental con el código, no resultados nuevos; deben confirmarse y trasladarse a ecuaciones editables antes del envío.

### Reproducción: receta que debe completarse

El comando inicial propuesto, en un directorio nuevo y sin sobrescribir el conjunto archivado, debe incluir al menos:

```bash
npm run generate:fem -- --scenarios=500 --seed=20260915 --mesh-x=30 --mesh-y=20 --output=<directorio-nuevo>/ta01-fem-500.csv
```

Es una plantilla: sustituir `<directorio-nuevo>` por una ruta válida. No basta ese comando para reproducir el artículo; deben fijarse todos los prefijos de partición, los dos horizontes, los cortes temporales, pesos y salidas. La receta publicada debería preservar los originales, verificar hashes cuando sea aplicable y separar réplica de métricas archivadas de reentrenamiento nuevo. La auditoría no ejecutó el comando.

### Amenazas a la validez y ruta a datos reales

- Interna: dependencia entre ventanas/fechas, selección de extremos, falta de repeticiones, precisión de etiquetas, validación reutilizada y referente compartido. Los controles existentes reducen algunas amenazas, no todas.
- Externa: una geometría supuesta, rangos de parámetros asumidos, lluvia diaria desagregada y solo dos años de prueba no representan todas las minas, mecanismos de falla ni eventos extremos.
- De constructo: desplazamiento máximo FEM, índice local de seguridad y restricciones agregadas no equivalen a movimiento instrumental, FoS por reducción de resistencia ni garantía de alerta. MAE pequeño no es una medida de seguridad operacional.

Ruta recomendada: definir primero una sección real y coordenadas de sensores; obtener geometría y propiedades con incertidumbre; alinear lluvia observada, presión de poros y desplazamientos; calibrar parámetros solo en periodos de desarrollo; separar validación futura y sitios/eventos; comparar componentes de desplazamiento realmente medibles; comprobar intervalos, retrasos, alarmas falsas y eventos omitidos; evaluar retrospectivamente antes de cualquier uso prospectivo. Sin esos datos puede publicarse un benchmark semisintético honesto, pero no una validación de campo.

## 3. Edición por secciones y auditoría de forma

El texto completo afinado está en `Articulo_TA01_revisado.docx`. Se mantuvieron orden, voz, contenido central y resultados; el registro completo antes → después está en `Cambios_por_seccion.md`. No se pretende sustituir las decisiones científicas pendientes con cambios de estilo.

| Sección | Cambio aplicado | Qué se dejó pendiente |
|---|---|---|
| Título/autoría | Conservación del título y de los datos proporcionados. | Confirmar revista, correspondencia, direcciones, ORCID faltante; título corto/puntos clave si BGM lo requiere. |
| Resúmenes | Objetivo: «incremento» → «desplazamiento máximo respecto del estado inicial»; «bloques» → «conglomerados». | Recuento final y ajuste de idioma según revista; no traducir todo a inglés sin confirmar ESRJ. |
| Introducción | Paráfrasis de citas extensas, verbos prudentes y novedad acotada. | Comparación crítica con los trabajos próximos más recientes, sin alegar prioridad absoluta. |
| Métodos | Definición de etiqueta/siglas; restricción compartida; escalado; partición; entrenamiento in-sample; calibración y enmascaramiento. | Ecuaciones completas, trazabilidad de p y receta íntegra. |
| Resultados | Numeración por aparición, seis figuras y dos tablas adicionales de evidencia archivada. | Los p siguen [VERIFICAR]; no se cambiaron cifras. |
| Discusión | Precisión de almacenamiento, información futura, sensibilidad y límites internos/externos. | Experimentos de precisión, semillas, ablaciones y datos de campo: no se simulan resultados nuevos. |
| Conclusiones | «Confirmó» → «verificó aspectos»; distinción entre evidencia insuficiente y equivalencia. | Ratificación de inferencia y alcance tras cerrar hallazgos críticos. |
| Declaraciones | CRediT como campo por confirmar y declaración de IA más transparente. | Aprobación efectiva de roles, financiación, conflictos, uso de IA y versión para revisión ciega. |
| Referencias/anexos | Seis fundamentos metodológicos verificables; referencias ordenadas y marcas específicas. | Literalidad de A2, orden de autores/paginación discrepantes y conveniencia de retirar A2 del envío. |

Times New Roman 12 y doble interlineado en texto; tablas a 10 pt y espaciado compacto por legibilidad en la copia de revisión. No afirmar cumplimiento del requisito de 12/doble para las tablas si la revista lo aplica a todo el documento. Los títulos de las figuras se acompañan de versión inglesa. Las seis figuras independientes se exportan a 400 dpi y SVG; ecuaciones originales siguen siendo raster y se recomienda conversión a formato editable tras aprobar su contenido. La numeración es por orden de aparición; cada figura/tabla principal tiene mención previa, título y nota. No se agregó mapa: por tanto no se presenta una escala geográfica inventada. Si se añade un mapa, necesita coordenadas, proyección y escala.

La copia conserva los dos anexos recibidos. A1 puede ser suplemento; A2 no aporta evidencia experimental nueva y hace el documento largo. No hay un límite de extensión confirmado que permita declarar incumplimiento por número de páginas. Se recomienda una versión de envío más breve, sin la colección de traducciones literales, después de aprobación autoral. Para BGM quedarían además numeración de secciones/líneas, título abreviado, puntos clave bilingües y leyendas agrupadas donde pida la plataforma. Para ESRJ queda pendiente traducción íntegra y expediente de revisión doble ciego.

## 4. Figuras y tablas: especificación y sustitución por datos reales

Se alcanzó el objetivo de seis figuras y seis tablas principales sin fabricar muestras. Figura 1 es un esquema ilustrativo del flujo; Figuras 2–6 muestran resultados semisintéticos archivados. Los PNG y SVG, junto con `figure-provenance.json` y sus hashes fuente, se entregan en el paquete de material gráfico.

| Figura | Variables/ejes y aporte | Fuente exacta | Qué cambiar para datos reales |
|---|---|---|---|
| 1, modificada | Diagrama NASA → escenarios → FEM → ventanas → LSTM/corrector → evaluación; fondo claro. No ejes numéricos. | `scripts/generate-fem-dataset.js`, `scripts/train-lstm.py`, `scripts/train-physics-guided.py`, `scripts/generate-research-summary.js`. | Sustituir bloque supuesto por levantamiento y fuentes instrumentales, y mostrar asimilación/actualización solo si se implementa. |
| 2, añadida | Dos paneles: x=`node_count`; y=`maximum_rainfall_displacement_mm` y `displacement_difference_against_48x32_percent`. Expone refinamiento no monótono. | `data/validation/ta01-fem-mesh-summary.csv`. | Rehacer geometría/materiales y mallas de la sección real; el refinamiento sigue siendo ensayo numérico, no medición. |
| 3, añadida | Forest plot por año/horizonte, ΔMAE e IC95 %; línea cero; escalas declaradas. No dibuja p. | `data/validation/ta01-rolling-origin-bootstrap.json`: `observedDifferenceMm`, `confidenceInterval95Mm`, `testYear`, `horizonHours`. | Generar predicciones alineadas con desplazamientos observados y repetir agrupamiento por eventos reales; no sustituir solo la etiqueta sin definir el observable. |
| 4, añadida | x=año/horizonte; y=100×`empirical_coverage`, segmentos `ALL`/`RAIN_HIGH_GE_5`; nivel nominal. Revela deterioro húmedo. | `data/validation/ta01-rolling-interval-coverage.csv`. | Recalibrar en periodo independiente con residuos observados y reevaluar los mismos segmentos con suficientes eventos. |
| 5, añadida | Paneles 1/6 h; x=`condition`; y=`mae_increase_percent`, modelos LSTM/HYBRID. Sensibilidad relativa. | `data/validation/ta01-robustness-summary.csv`. | Mantener perturbaciones rotuladas sintéticas o añadir fallos/ruido reales con distribución y procedencia documentadas. |
| 6, añadida | Paneles 1/6 h; x=`variant_id`; y=`mae_mm`, multiplicadores explícitos. Enmascaramiento sin reentrenar. | `data/validation/ta01-ablation-summary.csv`. | Para ablación real, entrenar variantes completas sobre datos instrumentales, mismas particiones/capacidad/presupuesto y nuevas salidas identificadas. |

Las Figuras 3–6 usan colores de alto contraste y además signo, marcador, posición o trama: la interpretación no depende solo del color. Las fuentes están en el registro de procedencia; no se exportaron capturas oscuras de la app como evidencia. Las Figuras 2 y Tabla 5 comparten tema, pero el gráfico expone la trayectoria no monótona y la tabla distingue tipos de verificación. Figura 5 y Tabla 6 complementan degradación relativa y errores absolutos. No se añade un gráfico de barras que simplemente duplique todas las celdas de Tablas 3–4.

| Tabla | Estado y contenido | Fuente | Sustitución/pendiente |
|---|---|---|---|
| 1 | Original: antecedentes; datos, física, temporalidad, validación. | Publicaciones citadas; matriz A1. | Ampliar comparación próxima a 2026 y cotejar texto completo; no sustituir con simulación. |
| 2 | Original Tabla 4 renumerada: configuración, semillas, particiones, entorno. | Scripts y `data/models/ta01-lstm-1h.json`, `ta01-physics-guided-1h.json`; manifiestos. | Actualizar configuración real y entorno exacto sin borrar la configuración histórica. |
| 3 | Original Tabla 2 renumerada: MAE de cuatro modelos, 1/6 h. | `data/validation/ta01-model-comparison.csv`. | Nueva tabla de validación instrumental identificada separadamente. |
| 4 | Original Tabla 3 renumerada: MAE LSTM/híbrido 2024/2025. | `data/validation/ta01-rolling-origin-model-comparison.csv`. | Cortes temporales futuros reales sin mezclar años usados para calibrar/seleccionar. |
| 5 | Añadida: prueba de parche, elasticidad, Biot, malla y PIELM; magnitud, resultado, alcance. | `data/validation/ta01-fem-mesh-sensitivity.json`, `ta01-spatial-pinn-validation.json`. | Mantener verificaciones analíticas e incorporar por separado errores en sensores/levantamiento independientes. |
| 6 | Añadida: condición limpia, ruido 5 % y faltantes 30 %; ventanas, MAE LSTM/híbrido por horizonte. | `data/validation/ta01-robustness-summary.csv`. | Contrastar con fallos reales; no presentar perturbaciones artificiales como eventos registrados. |

Las tablas A1/A2 no cuentan entre estas seis principales. Se exportan seis hojas Excel, con valores numéricos tipados cuando corresponde, sin fórmulas de recálculo que alteren las métricas. Son copias editoriales de resultados congelados, no un nuevo motor estadístico.

### Qué archivo/columna/parámetro debe reemplazarse

Precipitación: `data/rainfall/pasco-nasa-power-2020-2025.csv`, con encabezado `YEAR,DOY,PRECTOTCORR` después del bloque de metadatos NASA; sustituir la serie diaria `PRECTOTCORR` solo mediante una ingestión que conserve fecha, zona horaria, unidad y bandera de procedencia. Para lluvia horaria real se requiere adaptar la entrada: no basta pegar una serie horaria en una columna diaria y conservar el perfil rectangular.

Geometría/materiales: configuración en `scripts/generate-fem-dataset.js` y `src/core/fem-2d.js`; sustituir sección, bancos, estratos y rangos LHS asumidos por geometría y parámetros identificados con incertidumbre. Mantener una versión TA-01 histórica. Presión de poros y desplazamiento: crear un conjunto instrumental separado con coordenadas, tiempos y unidades; mapearlo al observable del modelo. La columna actual `rainfall_induced_max_displacement_mm` es el máximo FEM respecto del estado inicial: una lectura radar, prismática o GNSS no es automáticamente ese mismo máximo. Definir transformación/operador de observación, no renombrar un sensor como si fuera la etiqueta original. Los 12 sensores de PIELM deben reemplazarse por lecturas independientes identificadas como reales, no por otra salida del FEM.

## 5. Referencias: adiciones, correcciones y depuración

El original contiene 41 referencias, 40 con año 2022–2026 y NASA sin fecha; los 40 DOI son únicos. Las citas se distribuyen en cuerpo y matriz A1: no es correcto afirmar que las cuarenta obras están ausentes del texto, pero tampoco que todas sostienen el argumento principal. El recuento tras añadir seis fundamentos es 47 referencias. En la ventana 2019–2026, 42/46 referencias fechadas son recientes (91,3 %); incluyendo NASA en el denominador, 42/47 (89,4 %). En 2022–2026 son 40/46 fechadas (87,0 %). Se cumplen los umbrales solicitados bajo estos denominadores; la relevancia pesa más que completar una cuota. No se identificó autocita de los dos autores en la lista, sin que esto constituya una auditoría de identidades exhaustiva.

`references-audit.json` registra consulta de metadatos y fuentes editoriales por referencia. Trece consultas de DOI recibieron limitación de acceso; se contrastaron doce mediante páginas editoriales alternativas y una sigue pendiente. Una respuesta HTTP limitada o metadatos incompletos no demuestra que una referencia sea falsa. La verificación disponible de registro/título no autentica cada autor, página, traducción ni conclusión.

### Adiciones aplicadas, en APA 7

- Field, C. A., & Welsh, A. H. (2007). Bootstrapping clustered data. *Journal of the Royal Statistical Society: Series B (Statistical Methodology), 69*(3), 369–390. https://doi.org/10.1111/j.1467-9868.2007.00593.x
- Hochreiter, S., & Schmidhuber, J. (1997). Long short-term memory. *Neural Computation, 9*(8), 1735–1780. https://doi.org/10.1162/neco.1997.9.8.1735
- Holm, S. (1979). A simple sequentially rejective multiple test procedure. *Scandinavian Journal of Statistics, 6*(2), 65–70. https://www.jstor.org/stable/4615733
- Karniadakis, G. E., Kevrekidis, I. G., Lu, L., Perdikaris, P., Wang, S., & Yang, L. (2021). Physics-informed machine learning. *Nature Reviews Physics, 3*, 422–440. https://doi.org/10.1038/s42254-021-00314-5
- Kingma, D. P., & Ba, J. (2015). Adam: A method for stochastic optimization. *International Conference on Learning Representations*. https://arxiv.org/abs/1412.6980
- Raissi, M., Perdikaris, P., & Karniadakis, G. E. (2019). Physics-informed neural networks: A deep learning framework for solving forward and inverse problems involving nonlinear partial differential equations. *Journal of Computational Physics, 378*, 686–707. https://doi.org/10.1016/j.jcp.2018.10.045

Las seis se citan en métodos; no se añadieron referencias de relleno. Adam se fecha por la conferencia de 2015, aunque el preprint es de 2014. Holm respalda el procedimiento descrito, pero citarlo no resuelve la falta del cálculo experimental de los p.

### Correcciones pendientes, sin cambiar datos bibliográficos por cuenta propia

- Briceño, Guillén, Belandria y León (2023), *Tekhné*, 26(3), 62–72, DOI https://doi.org/10.62876/tekhn.v26i3.6137: **[VERIFICAR fuente editorial y ficha APA completa]**. No se propone un orden/nombres ampliados no confirmados. El manuscrito conserva la entrada proporcionada y una marca específica.
- Guevara, Gómez y Ortiz (2024), DOI https://doi.org/10.23857/pc.v9i3.6761: **[VERIFICAR orden de autoría]**. La fuente editorial consultada coloca a Gómez primero; conservar la entrada original hasta decidir con la versión definitiva y actualizar también la cita del anexo.
- Sequeira (2023), DOI https://doi.org/10.15517/iv.v25i44.54752: **[VERIFICAR paginación]**. La ficha editorial presenta 1–14 y otra presentación 93–107. No se elige arbitrariamente una paginación; precisar edición y hacer consistente la ficha.
- NASA POWER: mantener autor institucional y URL real; confirmar página específica y fecha de consulta si corresponde al recurso dinámico. No inventar fecha de publicación.
- Referencias con metadatos vacíos/incompletos: conservar y cotejar autoría/paginación con PDF editorial antes de cerrar APA. El registro detallado incluye el nivel de verificación; no significa que todas estén certificadas íntegramente.

### Quitar o mover: propuestas, no eliminaciones automáticas

No se borró ninguna referencia original para mantener la estructura pedida. Recomendación: conservar antecedentes que contribuyan a novedad, método o interpretación; mover matriz A1 a suplemento y retirar A2 de la versión de envío si los autores aprueban. Evitar mantener publicaciones solo para cumplir «40» cuando no aporten al argumento. Tras depuración, hacer la revisión bidireccional de citas nuevamente.

Las citas largas y traducciones de Liu, Pei y Piciullo en la introducción se parafrasearon. A2 todavía contiene literales cuya exactitud y traducción están **[VERIFICAR]**; se requiere ubicación específica, no solo DOI. Los apellidos Zhang/Liu repetidos deben desambiguarse consistentemente siguiendo APA; no confundir obras con primer autor distinto. Se recomienda revisión final manual de cursivas, signos, iniciales y nombres compuestos.

## 6. Carta de presentación y revisores sugeridos

### Borrador de carta al editor

Estimado/a editor/a de [REVISTA POR CONFIRMAR]:

Presentamos para su consideración «Prototipo semisintético FEM LSTM con corrección guiada por física para pronosticar desplazamientos en taludes». El trabajo evalúa un flujo reproducible de simulación FEM y aprendizaje temporal con un corrector residual monótono, usando precipitación de reanálisis y respuestas geotécnicas simuladas. Compara líneas base, cortes temporales, sensibilidad a entradas degradadas y verificaciones numéricas. Los resultados no demuestran superioridad general del corrector ni validación operacional en mina; ese límite forma parte del aporte y de la discusión.

Los artefactos de datos, código y evaluación se identificarán mediante [URL pública verificada, versión y DOI de archivo]. Antes del envío, los autores confirmarán originalidad, ausencia de evaluación simultánea, aprobación de la versión final, financiación, conflictos y alcance de asistencia de IA. Estas confirmaciones no se dan por realizadas en este borrador.

Atentamente,
[Autor/a de correspondencia, institución, dirección postal y correo]

No enviar esta carta hasta resolver los hallazgos críticos y completar sus campos. No se ha remitido a ninguna revista.

### Tres perfiles de revisor, sin identidades inventadas

1. Especialista en geotecnia computacional: doctorado y publicaciones recientes sobre FEM, interacción hidro-mecánica y estabilidad de taludes; capacidad para evaluar verificación, convergencia y diferencia entre índice local y FoS por reducción de resistencia.
2. Especialista en aprendizaje temporal guiado por física: doctorado y publicaciones recientes sobre LSTM, corrección residual, restricciones monótonas o PINN; experiencia en separación temporal, ablaciones y generalización fuera de distribución.
3. Especialista en estadística de series y validación predictiva: maestría/doctorado y publicaciones recientes sobre dependencia, bootstrap por conglomerados/bloques, comparaciones múltiples y calibración de intervalos; capaz de revisar estimandos y tamaños del efecto.

Seleccionar personas de instituciones distintas, sin conflictos de colaboración recientes, y verificar actividad científica de los últimos dos años y contacto institucional. Estos son perfiles de búsqueda, no una lista de personas/contactos ya comprobados. Si la revista resulta ser ESRJ, los tres perfiles solicitados no cubren sus cinco revisores identificados exigidos para el expediente; deberán completarse cinco candidatos reales.

## 7. Checklist final

✔ Encuadre semisintético, sin afirmar gemelo de mina validado ni superioridad demostrada.

✔ Resultados principales y CI contrastados con fuentes; resultados originales conservados.

✔ Integridad de 86 archivos contrastada con el manifiesto; hashes coincidentes.

✖ Valores p, permutación y Holm experimental reproducibles: falta artefacto/script localizado.

✔ Objetivo, etiqueta y RQ definidos y enlazados con evidencia y conclusiones.

✔ Escaladores de entrenamiento y separación de fechas/escenarios comprobados.

✖ Ausencia de toda amenaza de fuga/generalización: lluvia futura idealizada y selección de eventos siguen siendo límites.

✔ Bootstrap nombrado por conglomerados de fecha; independencia entre fechas declarada como supuesto.

✖ Calibración independiente y garantía de cobertura: no acreditadas.

✖ Ablación causal/reentrenada del corrector y repeticiones por semillas: pendientes.

✖ Sensibilidad a precisión/redondeo y solver: pendiente de nuevos experimentos.

✔ Se diferencia evidencia insuficiente de equivalencia; pequeñas magnitudes no se interpretan como precisión de campo.

✔ Seis figuras y seis tablas principales, con fuentes y formatos independientes de entrega.

✔ Figuras nuevas a 400 dpi y SVG, fondo claro y codificación no exclusiva por color.

✖ Ecuaciones 2–3 completas y editables: se preservaron con comentarios, requieren aprobación.

✔ Tablas principales exportadas a Word y Excel; valores originales congelados.

✔ Resúmenes bilingües estructurados; 210 palabras en español y 188 en inglés, ambos bajo 250.

✔ Más de 40 referencias y proporción reciente superior al 80 % bajo denominadores explícitos.

✖ Autenticación completa de fichas, cuarenta citas literales y traducciones: pendiente; marcas específicas incluidas.

✔ Sin duplicados de DOI entre las cuarenta referencias originales; seis fundamentos añadidos y citados.

✖ Novedad exhaustivamente delimitada frente a los trabajos próximos de 2026: ampliar comparación.

✖ Receta completa, entorno fijado, réplica de entrenamiento y archivo público DOI: no completados en esta edición.

✖ Revista definitiva y sus requisitos actuales íntegramente confirmados: pendiente BGM/ESRJ.

✖ Direcciones completas, correspondencia, roles, declaraciones de autoría e IA: requieren confirmación.

✖ Manuscrito final anonimizado y listo para envío: esta entrega es una copia de revisión con marcas.

✔ Ruta de validación real y sustitución de datos descrita sin fabricar instrumentación ni resultados.

### Prioridad de cierre

Primero resolver revista y autoría; después aportar la inferencia estadística ausente y corregir la receta/ecuaciones con aprobación. A continuación evaluar sensibilidad numérica y controles del corrector si se desean sostener contribuciones más fuertes. Finalmente depurar anexos/referencias y producir una versión limpia específica de la revista. Ninguna edición lingüística sustituye esas comprobaciones científicas.

### Comprobación final de los entregables

Se comprobó la igualdad textual de las dos tablas originales de desempeño y la conservación de cifras en los párrafos de resultados/conclusiones auditados. La copia tiene 22 comentarios correctamente anclados, seis figuras más las cuatro ecuaciones originales, seis tablas principales y dos de suplemento. Se renderizaron las 48 páginas; se corrigieron los desbordamientos detectados. El Excel contiene seis hojas y 172 celdas de tablas contrastadas, sin celdas de error. Los registros están en `quality-check.json` y `excel-quality-check.json`. La revisión visual y los controles editoriales no sustituyen una reproducción del entrenamiento ni cierran la trazabilidad de los p.

