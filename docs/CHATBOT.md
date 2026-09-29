# Asistente contextual M-1

El botón **Asistente M-1**, abajo a la derecha, abre un chat de consulta integrado con Vercel AI SDK, su adaptador oficial LangChain y `ChatOpenAI`. No cambia las simulaciones ni sustituye el criterio de un geotécnico.

## Configuración

Se requiere Node.js 24 o superior. En la raíz del proyecto existe un `.env` vacío para colocar la clave:

```dotenv
OPENAI_API_KEY=tu_clave_privada
OPENAI_MODEL=gpt-4o-mini
```

Puedes elegir otro modelo compatible con `ChatOpenAI` que esté habilitado en tu cuenta. La disponibilidad y el saldo se comprueban al consultar al proveedor, no mediante el estado local del chat.

```bash
npm install
npm start
```

Abre `http://127.0.0.1:3000`, pulsa **Asistente M-1**, autoriza el envío del contexto y escribe. Enter envía; Shift+Enter añade una línea. Hay controles para detener, reintentar y comenzar una conversación nueva. Tras cambiar `.env`, reinicia el servidor. El botón ↻ vuelve a comprobar su configuración.

`npm start` y `npm run dev` compilan automáticamente el cliente con esbuild. Si ejecutas directamente `node src/server.js`, primero usa `npm run build:chat`. Docker Compose toma las variables de `.env` sin copiar ese archivo a la imagen.

## Contexto y alcance

Cada pregunta incluye una instantánea nueva del tablero: texto de indicadores y paneles científicos (también plegables), valores de los controles, sensor/horizonte, pronóstico completo, telemetría mostrada, geometría registrada, lluvia, ablación y parámetros visuales. Si hay una corrida FEM, incluye sus resúmenes horarios, pronósticos LSTM/híbrido y el campo nodal del estado horario más cercano al progreso visual; no se envían todas las mallas de las 24 horas. La animación puede interpolar entre estados.

El servidor agrega su estado actual de gemelo, sensores, FEM y persistencia. Se identifican ambas fechas para distinguir la pantalla capturada de posibles cambios posteriores en el servidor. La amplificación se informa por separado de los desplazamientos físicos.

El asistente no recibe una imagen del visor, fotos ni los archivos de geometría originales; sí recibe los resultados y metadatos mostrados. No tiene acceso arbitrario al sistema de archivos, herramientas de modificación ni navegación web. Las instantáneas se actualizan al enviar, no continuamente durante una respuesta.

El prompt está en `src/chat/project-prompt.js`. Explica el proyecto, controles, métricas, TA-01, FEM reducido frente a FEM 2D, LSTM, corrector físico, PIELM, SSRM externo y el candidato Raúl Rojas. Obliga a distinguir datos sintéticos, reanálisis e información de campo, y a no presentar el prototipo como validado para decisiones mineras.

## Privacidad, límites y pruebas

- La clave solo se carga en el servidor mediante el lector `.env` nativo de Node. `.env` está excluido de Git y Docker; `/api/chat/status` devuelve únicamente proveedor, modelo y presencia de configuración.
- Se solicita autorización visible porque las preguntas y el contexto, incluida telemetría importada, se transmiten a OpenAI. La app no persiste el chat en SQLite ni en localStorage. El tratamiento de los datos por OpenAI depende de tu cuenta y de sus políticas.
- Las respuestas se renderizan con Marked (Markdown/GFM) y se sanitizan con DOMPurify antes de insertarlas. Se admiten títulos, énfasis, listas, tablas, citas, enlaces y código. Se bloquean scripts, atributos de eventos, estilos, formularios, imágenes e iframes; los enlaces usan protocolos permitidos y `noopener noreferrer`. Las preguntas y los errores se conservan como texto literal. Durante streaming el renderizado se agrupa cada 80 ms para reducir el trabajo del navegador. El contexto se trata como datos no confiables, no instrucciones. Estas medidas no garantizan que un modelo nunca alucine o siga una inyección; revisa sus respuestas.
- Se limitan preguntas a 4000 caracteres, contexto a 400 kB, historial enviado a 20 mensajes/32000 caracteres, dos respuestas simultáneas y 12 solicitudes por minuto por dirección local. La respuesta tiene un presupuesto de 1800 tokens y un tiempo total máximo de 90 segundos.
- Para mallas externas grandes se envían hasta 1200 nodos, declarando cuántos quedaron omitidos; el texto del tablero tiene un máximo de 60000 caracteres y también declara cualquier recorte. Si aun así el contexto supera el límite, se rechaza explícitamente, sin enviar un resumen silencioso.
- La aplicación sigue siendo local y sin autenticación. No la expongas mediante túneles o en Internet sin autenticación, cuotas por usuario, TLS y controles de acceso; el límite por dirección no sustituye estas medidas.

```bash
node --test test/chat.test.js
npm test
```

Las pruebas usan un modelo simulado: verifican transporte Vercel/LangChain, streaming incremental, prompt, contexto, validaciones, límites y sanitización de errores sin consumir OpenAI. Una respuesta real requiere configurar una clave con acceso y saldo.

## Archivos

- `src/chat/env.js`: carga privada de configuración.
- `src/chat/project-prompt.js`: instrucciones del asistente.
- `src/chat/chat-service.js`: validación, LangChain, adaptación al streaming Vercel y límites.
- `public/chat-context.js`: captura de datos del tablero y reducción explícita de la malla a un estado horario.
- `public/chat-panel.js`: interfaz, consentimiento, historial temporal, streaming y cancelación.
- `public/chat-markdown.js`: parseo con Marked, sanitización con DOMPurify y actualizaciones agrupadas del streaming.
- `test/chat-markdown.test.js`: pruebas de formato y protección XSS con jsdom, sin OpenAI.
- `scripts/build-chat.js`: bundle del cliente para el navegador sin migrar la app a React/Next.js.
- `test/chat.test.js`: pruebas locales sin proveedor externo.

## Documentación oficial consultada

Se siguió el [adaptador LangChain de Vercel AI SDK](https://ai-sdk.dev/providers/adapters/langchain), la [integración ChatOpenAI de LangChain](https://docs.langchain.com/oss/javascript/integrations/chat/openai) y la [documentación oficial de OpenAI](https://developers.openai.com/api/docs/quickstart) para la configuración del proveedor. Las APIs instaladas se comprobaron también contra sus declaraciones de tipos.

El renderizado Markdown sigue la [documentación oficial de Marked](https://marked.js.org/), que recomienda sanitizar su salida, y la [documentación oficial de DOMPurify](https://github.com/cure53/DOMPurify).
