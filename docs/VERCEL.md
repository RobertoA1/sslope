# Un proyecto Vercel con tres servicios

El `vercel.json` de la raíz usa Vercel Services. Las opciones de build y funciones están dentro de cada servicio; las reglas públicas permanecen en la raíz. La distribución es:

| Servicio | Raíz | Acceso público | Llamadas internas |
| --- | --- | --- | --- |
| `app` | `.` | `/` y todas las rutas restantes, incluida su API `/api/*` | Ninguna |
| `research-app` | `research-app` | `/research` y `/research/*` | `backend` mediante `CENTURY_BACKEND_URL` |
| `backend` | `research-app` | Ninguno | Recibe las llamadas de `research-app` |

El backend comparte directorio raíz con Next.js porque `backend.main:app` utiliza imports de paquete y lee `data/century/Data.zip` desde esa carpeta. Son builds independientes: Next.js instala `package-lock.json`; FastAPI instala las dependencias ligeras de `pyproject.toml`. El backend no incluye TensorFlow ni los artefactos locales de entrenamiento.

## Rutas y binding

Las reglas de `/research` aparecen antes del catch-all. Se conserva el prefijo al entrar en Next.js, que tiene `basePath: /research`. El navegador llama a `/research/api/*`; un Route Handler Node procesa esas llamadas y consulta `CENTURY_BACKEND_URL` **durante cada petición**. No se usa el binding en el build, en `next.config.ts`, en middleware ni en el navegador.

El binding se declara en el servicio que llama, `research-app`, con los cuatro campos `type`, `service`, `format` y `env`. Vercel inyecta la URL: **no configures `CENTURY_BACKEND_URL` manualmente**. El proxy conserva un posible prefijo interno de la URL, añade `/api/*`, transmite query, JSON y descargas, y comprueba el origen de las escrituras antes de comunicarse con FastAPI.

El servicio `app` declara `api/index.js` como entrada Node y `npm run dev` como comando local explícito; su build incluye los archivos públicos y los módulos Three.js. El tablero mantiene `/api/*` para sus sensores, simulaciones, minas, modelos y chat. Enviar globalmente `/api/*` a FastAPI rompería ese tablero. FastAPI no tiene rewrite público: el binding no le concede una ruta de entrada pública. Sus endpoints `/api/*` solo se utilizan internamente a través del proxy.

## Desarrollo y verificación

Requisitos: Node 24, una versión reciente de Vercel CLI compatible con Services y Python 3.12 para el runtime de FastAPI. `vercel dev` administra los servicios y sus bindings:

```bash
vercel dev -L
```

`-L` permite verificar sin autenticar ni vincular un proyecto de Vercel. Con un proyecto ya vinculado puedes usar `vercel dev`. Si existe una `.venv` en `research-app`, la CLI la reutiliza: debe usar Python 3.12. Conserva el entorno Python 3.11 del entrenamiento local y usa otro checkout con una `.venv` 3.12 para probar Services si necesitas ambos.

Comprobaciones en el dominio o puerto único:

- `/` carga el tablero y `/api/health` identifica `M-1 Digital Twin`.
- `/api/mines/century` y `/api/mines/pasco` cargan los datos públicos del visor.
- `/research` carga Century Lab y sus recursos están bajo `/research/_next/`.
- `/research/api/health` identifica `century-research-lab` e informa `training_enabled: false` en Vercel.
- `/research/api/dataset` permite explorar los datos; POST `/research/api/preview` permite revisar limpieza y particiones.
- POST `/research/api/experiments` devuelve 503 con una explicación; no crea trabajos que puedan perderse.
- El frontend muestra que el entrenamiento es local y mantiene deshabilitado su botón de entrenamiento en este despliegue.
- Una ruta como `/backend/api/health` no expone FastAPI.

Para comprobar código y builds por separado:

```bash
npm ci
npm run build
npm test
npm --prefix research-app ci
npm --prefix research-app run typecheck
npm --prefix research-app run build
```

El build Next.js funciona sin `CENTURY_BACKEND_URL`; la comprobación de disponibilidad corresponde al handler en ejecución. Para ejecutar el laboratorio completo por separado, usa `npm run lab` desde `research-app`: su URL ahora es `http://127.0.0.1:3001/research`. Fuera de Vercel, el proxy usa `CENTURY_API_ORIGIN` o el backend local `http://127.0.0.1:8001`. Este fallback no se usa en Vercel.

## Publicación y límites

Importa el repositorio con Root Directory `.` y habilita Services en tu proyecto Vercel. La plataforma construye los tres servicios de forma independiente. Para activar el chat del tablero, configura `OPENAI_API_KEY` y opcionalmente `OPENAI_MODEL` como variables del proyecto. No publiques `.env` ni bases o resultados locales; `.vercelignore` conserva el código y el dataset del backend y excluye los entornos, claves e historiales.

El tablero `app` conserva su modalidad demostrativa con SQLite temporal por instancia. El estado puede reiniciarse o variar entre peticiones y no está aislado por usuario. Para telemetría duradera sigue disponible Node/Docker con volumen persistente.

En Vercel, Century Lab permite exploración y vistas previas sin abrir SQLite ni lanzar trabajadores. El entrenamiento completo, sus modelos y su historial permanecen disponibles localmente con `backend/requirements-lock.txt`. Llevar entrenamiento a la nube requiere integrar una cola de trabajos y almacenamiento duradero. Streamlit sigue siendo una aplicación Python local independiente.

Referencias oficiales: [Services](https://vercel.com/docs/services), [routing](https://vercel.com/docs/services/routing), [bindings](https://vercel.com/docs/services/bindings), [configuración por servicio](https://vercel.com/docs/services/config-reference) y [FastAPI](https://vercel.com/docs/frameworks/backend/fastapi).
