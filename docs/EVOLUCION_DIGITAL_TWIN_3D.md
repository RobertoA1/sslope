# Evolución integrada del Digital Twin 3D

## Decisión de arquitectura

La evolución conserva la arquitectura existente:

```text
Telemetría → TwinStore/API → estado actual → predicción/riesgo → visor 3D
                                      ↑                         ↓
                    fuente de geometría / sensores / trazabilidad
```

No se crea un segundo sistema de monitoreo ni un segundo visor. La geometría queda como una fuente versionada que alimenta al mismo gemelo digital y el visor existente consume el mismo pronóstico y las mismas lecturas.

El visor operativo utiliza Three.js/WebGL para la escena, cámara orbital, iluminación, sombras, textura procedural y selección espacial de sensores. El modo realista es opcional y no modifica los resultados del modelo: únicamente cambia la representación visual.

La simulación temporal sí tiene una representación espacial explícita: por defecto, la superficie pronosticada y los fragmentos que representan suelo, roca y sedimentos se deforman en vivo con amplificación visual, conservando una malla fantasma de referencia. Si se desactiva **Movimiento del terreno**, la geometría permanece fija y se muestran vectores de movimiento. Los milímetros calculados siguen visibles en la interfaz para evitar confundir la amplificación con magnitud física real.

Los eventos de lluvia entran al mismo flujo mediante `/api/weather-event`. El prototipo genera lecturas horarias de presión de poros y desplazamiento con una respuesta dependiente de intensidad, duración, infiltración y drenaje; el visor muestra precipitación animada y oscurecimiento del terreno. Es una respuesta hidrológica demostrativa, no un modelo hidrogeológico calibrado.

## Fuente de geometría

| Fuente | Estado en esta versión | Alcance científico |
|---|---|---|
| Procedural | Implementada | Geometrías paramétricas para demostración y experimentación |
| Foto única | Implementada como aproximación visual | No es una reconstrucción métrica ni fotogrametría; requiere calibración y varias imágenes para precisión |
| OBJ / STL ASCII o binario | Importación y previsualización mediante Three.js | Malla aportada por el usuario, sin inferir propiedades geotécnicas |
| glTF / GLB | Importación y previsualización mediante Three.js; glTF requiere recursos embebidos | Malla aportada por el usuario, sin inferir propiedades geotécnicas |
| Fotogrametría multivista | Contrato preparado | Requiere pipeline de calibración de cámara, nube de puntos y validación |

La geometría y la superficie de falla se mantienen separadas. La primera es una entidad visual/espacial; las superficies de falla deben provenir de LEM/FEM validados, no del generador visual.

## Estados de modelos científicos

| Componente | Estado actual | Papel dentro del Twin |
|---|---|---|
| FEM | Modelo reducido de equilibrio/Mohr–Coulomb | Indicador físico de demostración; no sustituye FEM calibrado |
| LSTM | Sustituto recurrente determinista | Contrato temporal; requiere entrenamiento antes de una afirmación de IA |
| PINN | Corrección informada por física | Prototipo de integración; requiere entrenamiento/validación |

La UI debe presentar estos estados y no convertir sus salidas de demostración en resultados científicos.

## Flujo de actualización

```text
Nuevo dato o lluvia simulada → validación y persistencia → estado actual
          → predicción temporal → evaluación de riesgo configurable
          → actualización de capas, sensores y trazabilidad del visor 3D
```

Los niveles se evalúan mediante una política configurable con `/api/risk-policy`. Sus valores iniciales llevan el estado `DEMO_NO_VALIDADA`; no representan criterios geotécnicos del sitio hasta su calibración y aprobación.

## Siguiente fase científica

1. Asociar sensores reales a coordenadas de la malla importada.
2. Implementar almacenamiento persistente y versiones de geometría.
3. Integrar solver FEM/LEM sobre geometría/estratos reales.
4. Entrenar LSTM/PINN con división temporal, métricas y conjuntos documentados.
5. Sustituir las aproximaciones de foto única por fotogrametría multivista validada.
