# M-1 Slope Stability Digital Twin

MVP académico de un gemelo digital para pronóstico de estabilidad de taludes de mina a cielo abierto. Integra un estado físico reducido tipo FEM, una celda recurrente temporal y una corrección informada por física; incluye API REST, telemetría sintética, alertas y dashboard.

> Estado: prototipo de investigación. No es un sistema certificado para decisiones de seguridad minera.

## Ejecutar

Se requiere Node.js 20 o superior.

```powershell
npm start
```

Abre `http://localhost:3000`. Para ejecutar las pruebas:

```powershell
npm test
```

## Funcionalidades actuales

- Dos escenarios sintéticos reproducibles: normal y crítico.
- Pronóstico a 1, 6, 24 o 72 horas, con intervalo de incertidumbre.
- Factor de seguridad reducido, presión de poros, velocidad de desplazamiento y diagnóstico de consistencia física.
- Alertas por niveles: NORMAL, VIGILANCIA, ALERTA y CRÍTICO.
- Simulador visual 3D de bancos y bermas con perfiles recto, circular/cóncavo y semicircular/de anfiteatro; incluye dimensiones configurables, estratos de suelo/roca, sensores seleccionables y capas de riesgo, desplazamiento, presión de poros, factor de seguridad e incertidumbre.
- Controles de simulación para ángulo, cohesión, fricción, agua, lluvia, meteorización, sismo/voladura, sobrecarga, drenaje y refuerzo; modifican el cálculo y las alertas en tiempo real.
- API para incorporar lecturas reales y desacoplar instrumentación, modelos científicos y frontend.

## Usar el visor 3D

El visor se encuentra debajo de los indicadores principales. Usa **Vista completa** para encuadrar toda la geometría y los puntos **Cresta**, **Banco medio** o **Pie del talud** para ingresar a esas zonas como en una vista de calle. Arrastra sobre el talud para rotar la cámara —incluido hacia arriba y abajo—, usa la rueda para acercar o alejar, y usa `Shift` mientras arrastras para desplazar la vista. Selecciona una capa en el panel derecho y haz clic en un sensor para consultar su detalle. Activa **Vuelo libre** para usar `W`, `A`, `S`, `D` (avance lateral), `Q`/`E` (bajar/subir) y `Shift` (mayor velocidad). Por defecto están activadas la forma/textura del talud, los colores de material, la capa analítica y el contraste alto; cada opción se puede deshabilitar de forma independiente.

La representación tridimensional actual es una geometría de demostración con resultados 2D interpolados; no afirma ser un cálculo FEM 3D. Esta distinción permite una presentación visual útil y rigurosa mientras se integra un solver FEM 3D validado en una fase posterior.

## API

| Método | Ruta | Uso |
|---|---|---|
| GET | `/api/health` | estado del servicio |
| GET | `/api/telemetry?limit=72` | lecturas recientes |
| POST | `/api/telemetry` | registrar lectura |
| GET | `/api/forecast?horizon=24` | crear pronóstico |
| GET | `/api/alerts` | alertas generadas |
| POST | `/api/scenario` | cargar escenario `normal` o `critical` |
| GET/POST | `/api/simulation` | consultar o ajustar factores geotécnicos simulables |

Ejemplo de ingesta:

```json
{
  "sensorId": "EXT-01",
  "timestamp": "2026-09-07T12:00:00Z",
  "displacementMm": 14.2,
  "porePressureKpa": 125.3,
  "rainfallMmH": 7.4,
  "qualityFlag": "VALID",
  "source": "inclinometer"
}
```

## Evolución científica requerida

El motor actual es deliberadamente liviano para una demostración completa sin dependencias. Para sustentar las afirmaciones del artículo se debe sustituir la celda recurrente determinista por una LSTM entrenada y el corrector por una PINN entrenada, conectar resultados validados de FEniCSx/OpenSeesPy o software FEM externo, y seguir el diseño experimental descrito en [PLAN_IMPLEMENTACION.md](PLAN_IMPLEMENTACION.md).
