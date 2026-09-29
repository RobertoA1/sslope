import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";

// Node 24 ya incluye un lector .env; no hace falta otra dependencia.
try {
  loadEnvFile(fileURLToPath(new URL("../../.env", import.meta.url)));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
