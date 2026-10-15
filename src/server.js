import http from "node:http";
import handler, { closeRepository } from "./app.js";

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "127.0.0.1";
const server = http.createServer(handler);

server.listen(port, host, () => console.log(`M-1 Digital Twin: http://${host}:${port}`));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => { closeRepository(); process.exit(0); });
