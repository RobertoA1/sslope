import path from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));

export function runtimeConfiguration(env = process.env) {
  const isVercel = env.VERCEL === "1";
  return {
    isVercel,
    databasePath: isVercel
      ? path.join(tmpdir(), `sslope-${process.pid}`, "sslope.sqlite")
      : path.resolve(env.SSLOPE_DB_PATH || path.join(root, "data/local/sslope.sqlite")),
    allowedHosts: new Set(["127.0.0.1", "localhost", "[::1]", ...(env.SSLOPE_ALLOWED_HOSTS || "").split(",").map((host) => host.trim().toLowerCase()).filter(Boolean)])
  };
}

export function requestHostAllowed(hostname, runtime) {
  // Vercel enruta los dominios de previews y los dominios personalizados.
  // La aplicación conserva la comprobación de Origin para las escrituras.
  return runtime.isVercel || runtime.allowedHosts.has(hostname);
}

export function requestOriginAllowed(origin, headers, runtime) {
  try {
    const publicHost = runtime.isVercel ? headers['x-forwarded-host'] || headers.host : headers.host;
    return new URL(origin).host === publicHost;
  } catch { return false; }
}
