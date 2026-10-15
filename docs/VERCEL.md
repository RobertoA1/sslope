# Despliegue en Vercel

## Tablero principal: raíz del repositorio

1. Importa el repositorio en Vercel, con **Root Directory `.`** y **Framework Preset `Other`**.
2. Conserva los valores de `vercel.json`: instalación `npm ci`, build `npm run build`, salida `dist` y función `api/index.js` de Node.js. `package.json` fija Node **24.x**.
3. Si necesitas el chat, configura `OPENAI_API_KEY` y opcionalmente `OPENAI_MODEL` en las variables de entorno de Vercel. La clave solo se usa en el servidor. Sin clave, el tablero funciona y el chat informa que falta configuración.
4. Despliega y abre el dominio asignado. También puedes ejecutar `npx vercel` desde la raíz para crear un preview y `npx vercel --prod` cuando quieras publicar producción.

Para verificar el build localmente:

```bash
npm ci
npm run build
npm test
```

El build produce `dist/index.html`, estilos, módulos del tablero, el bundle del chat y Three.js en `/vendor/three/`. Vercel sirve esos archivos estáticos y enruta `/api/*` a un único handler. La función incluye los artefactos de modelos, lluvia, Century y validación que se leen en ejecución. `.vercelignore` y las exclusiones de la función dejan fuera `.env`, bases locales, fuentes externas y el laboratorio Python.

La entrada `api/index.js` importa `src/app.js` sin iniciar un servidor. `npm start` sigue iniciando `src/server.js` y conserva SQLite local en `data/local/sslope.sqlite`. Para otro volumen local puedes definir `SSLOPE_DB_PATH`; para hosts adicionales fuera de Vercel, `SSLOPE_ALLOWED_HOSTS` acepta nombres separados por comas, sin protocolo ni puerto. En Vercel se admiten los dominios que enruta la plataforma; los POST de navegador siguen exigiendo el mismo origen.

## Almacenamiento y límites

Vercel proporciona un [sistema de archivos de solo lectura y espacio temporal en `/tmp`](https://vercel.com/docs/functions/runtimes). En este despliegue SQLite usa una carpeta temporal de la instancia; nunca intenta escribir en el código desplegado. `/api/persistence/status` devuelve `ephemeral: true` y el tablero muestra **datos temporales**, con un aviso visible de su alcance.

Las escrituras pueden perderse cuando la instancia desaparezca. Distintas instancias tienen bases y simulaciones independientes: incluso peticiones consecutivas pueden consultar estados diferentes. El estado de una instancia se comparte entre quienes accedan a ella; no hay aislamiento por usuario. Esta modalidad sirve para demostrar el prototipo con los casos y datos públicos incluidos. No almacenes en ella telemetría que necesites conservar.

Para persistencia duradera, el despliegue Node/Docker existente con volumen sigue disponible. Usar una base externa desde Vercel exige implementar un repositorio remoto y resolver también el estado de simulaciones que ahora vive en memoria.

La función tiene una duración máxima configurada de 120 segundos para cálculo y chat. La plataforma también limita el tamaño de las peticiones y respuestas: un JSON de importación o descarga grande puede superar ese límite antes del límite propio del programa (8 MB en el servidor local). Los entrenamientos Python se ejecutan fuera de Vercel. Los límites exactos dependen de la plataforma y del plan; consulta las [limitaciones de Functions](https://vercel.com/docs/functions/limitations).

Antes de compartir una URL, recuerda que el prototipo no incluye autenticación multiusuario. Si habilitas el chat con una clave de pago, limita el acceso al despliegue. El control de frecuencia del chat es local a cada instancia.

## Comprobaciones tras desplegar

- `/` carga el tablero; Century y Cerro de Pasco muestran sus modelos y el visor 3D.
- `/vendor/three/build/three.module.js` y `/vendor/chat-panel.js` responden como JavaScript.
- `/api/health` devuelve `status: "ok"`.
- `/api/persistence/status` devuelve `ephemeral: true`.
- `/api/mines/century`, `/api/mines/pasco` y `/api/research/century` devuelven los casos incluidos.
- `/api/chat/status` informa de la configuración sin exponer la clave.
- En Laboratorio TA-01, una simulación o cambio de escenario responde sin errores de disco de solo lectura.

## Century Lab: proyecto independiente

Para la interfaz Next.js, crea otro proyecto con raíz `research-app`, preset **Next.js** y `CENTURY_API_ORIGIN` apuntando al origen HTTPS de un backend FastAPI externo. El backend necesita `CENTURY_ALLOWED_ORIGINS` con el origen exacto de la interfaz, sus datos, dependencias Python y almacenamiento persistente. Los previews tienen su propio origen y deben autorizarse explícitamente cuando se usen para escribir.

La interfaz mantiene `/api/*` en el mismo dominio y utiliza rewrites al backend. El backend conserva entrenamientos y resultados entre peticiones. No se ejecuta dentro de la función del tablero principal. La versión Streamlit requiere un alojamiento Python persistente. Consulta el [README del laboratorio](../research-app/README.md).

Referencias: [runtime Node.js](https://vercel.com/docs/functions/runtimes/node-js), [versiones de Node](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions) y [configuración de Vercel](https://vercel.com/docs/project-configuration/vercel-json).
