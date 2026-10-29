import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import path from "node:path";
import { tmpdir } from "node:os";
import { rm } from "node:fs/promises";
import { runtimeConfiguration, requestHostAllowed, requestOriginAllowed } from "../src/runtime.js";

test("el servidor local conserva su base y rechaza hosts externos no configurados", () => {
  const local = runtimeConfiguration({});
  assert.equal(local.isVercel, false);
  assert.ok(local.databasePath.endsWith("data/local/sslope.sqlite"));
  assert.equal(requestHostAllowed("localhost", local), true);
  assert.equal(requestHostAllowed("foreign.example", local), false);
  const configured = runtimeConfiguration({ SSLOPE_DB_PATH: "/tmp/sslope-test.sqlite", SSLOPE_ALLOWED_HOSTS: " slopes.example.org, preview.example.org " });
  assert.equal(configured.databasePath, "/tmp/sslope-test.sqlite");
  assert.equal(requestHostAllowed("slopes.example.org", configured), true);
  assert.equal(requestHostAllowed("foreign.example", configured), false);
  const proxied = { host: 'localhost:4000', 'x-forwarded-host': 'slopes.example' };
  assert.equal(requestOriginAllowed('https://slopes.example', proxied, runtimeConfiguration({ VERCEL: '1' })), true);
  assert.equal(requestOriginAllowed('https://foreign.example', proxied, runtimeConfiguration({ VERCEL: '1' })), false);
  assert.equal(requestOriginAllowed('https://slopes.example', proxied, local), false);
});

test("la entrada Vercel admite dominios remotos, SQLite temporal, JSON parseado y los casos científicos", async (t) => {
  // Node ejecuta cada archivo de pruebas en su propio proceso. No se abre la
  // base del usuario ni se lee su clave del .env durante esta integración.
  process.env.VERCEL = "1";
  process.env.OPENAI_API_KEY = "";
  const runtime = runtimeConfiguration();
  assert.ok(runtime.databasePath.startsWith(`${tmpdir()}${path.sep}`));
  const { default: handler } = await import("../api/index.js");
  const { closeRepository } = await import("../src/app.js");
  t.after(async () => {
    closeRepository();
    await rm(path.dirname(runtime.databasePath), { recursive: true, force: true });
  });
  const server = http.createServer(async (req, res) => {
    if (req.headers["x-test-body-mode"]) {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const bytes = Buffer.concat(chunks);
      const mode = req.headers["x-test-body-mode"];
      req.body = mode === "object" ? JSON.parse(bytes) : mode === "buffer" ? bytes : bytes.toString("utf8");
    }
    await handler(req, res);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  function request(route, { method = "GET", body, headers = {} } = {}) {
    return new Promise((resolve, reject) => {
      const req = http.request({ hostname: "127.0.0.1", port: server.address().port, path: route, method,
        headers: { Host: "slopes-preview.vercel.app", "Content-Type": "application/json", ...headers } }, (res) => {
        let raw = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => { raw += chunk; });
        res.on("end", () => resolve({ status: res.statusCode, headers: res.headers,
          data: res.headers["content-type"]?.includes("application/json") ? JSON.parse(raw) : raw }));
      });
      req.on("error", reject);
      req.end(body);
    });
  }

  // El mismo handler sirve HTML, JavaScript del navegador y módulos Three.js.
  // El JavaScript se entrega como recurso; nunca se importa como servidor.
  for (const [route, contentType, content] of [
    ["/", "text/html", /src="\/app\.js"/],
    ["/app.js", "text/javascript", /window\.location\.search/],
    ["/artifact-tools.js", "text/javascript", /tableWorkbook/],
    ["/table-workbook.js", "text/javascript", /spreadsheetml/],
    ["/article-tables.js", "text/javascript", /renderArticleTables/],
    ["/vendor/three/build/three.module.js", "text/javascript", /export/]
  ]) {
    const asset = await request(route);
    assert.equal(asset.status, 200, route);
    assert.ok(asset.headers["content-type"].startsWith(contentType), route);
    assert.match(asset.data, content, route);
  }

  const articleTables = await request('/article/tables.json');
  assert.equal(articleTables.status, 200);
  assert.equal(articleTables.data.tables.length, 7);
  assert.equal(articleTables.data.tables.at(-1).rows.length, 40);

  for (const number of [3, 4, 5]) {
    const figure = await request(`/article/figura-${number}.jpg`);
    assert.equal(figure.status, 200);
    assert.equal(figure.headers['content-type'], 'image/jpeg');
    assert.ok(Number(figure.headers['content-length'] || 0) > 0 || figure.data.length > 100000);
  }
  for (const number of [1, 2, 3]) {
    for (const [format, type] of [['svg', 'image/svg+xml'], ['png', 'image/png']]) {
      const figure = await request(`/article/figura-${number}.${format}`);
      assert.equal(figure.status, 200);
      assert.equal(figure.headers['content-type'], type);
    }
  }

  const health = await request("/api/health");
  assert.equal(health.status, 200);
  assert.equal(health.headers["cache-control"], "no-store");
  const persistence = await request("/api/persistence/status");
  assert.equal(persistence.data.ephemeral, true);
  assert.equal(persistence.data.filePath, runtime.databasePath);
  const chat = await request("/api/chat/status");
  assert.equal(chat.data.configured, false);
  const table = { title: "Prueba de interpretación", context: "mm", headers: ["Modelo", "MAE"], rows: [["Persistencia", "2.3"]] };
  const noModel = await request("/api/tables/explain", { method: "POST", body: JSON.stringify(table) });
  assert.equal(noModel.status, 503);
  const invalidTable = await request("/api/tables/explain", { method: "POST", body: "{" });
  assert.equal(invalidTable.status, 400);
  const foreignTable = await request("/api/tables/explain", { method: "POST", body: JSON.stringify(table), headers: { Origin: "https://foreign.example" } });
  assert.equal(foreignTable.status, 403);

  for (const route of ["/api/mines/century", "/api/mines/pasco", "/api/research/century", "/api/research/chronological?horizon=6&testYear=2024", "/api/research/ta01-spatial-prediction", "/api/research/ta01-wet-scenario", "/api/rainfall-history"]) {
    const response = await request(route);
    assert.equal(response.status, 200, `${route}: ${JSON.stringify(response.data).slice(0, 200)}`);
  }
  const telemetry = await request("/api/telemetry?limit=1");
  assert.equal(telemetry.data.readings.length, 1);
  const parameters = { method: "POST", body: JSON.stringify({ cohesionKpa: 90 }), headers: { Origin: "https://slopes-preview.vercel.app" } };
  for (const mode of [undefined, "object", "string", "buffer"]) {
    const response = await request("/api/simulation", { ...parameters, headers: { ...parameters.headers, ...(mode ? { "x-test-body-mode": mode } : {}) } });
    assert.equal(response.status, 200);
    assert.equal(response.data.parameters.cohesionKpa, 90);
  }
  const readback = await request("/api/simulation");
  assert.equal(readback.data.parameters.cohesionKpa, 90);
  const rejected = await request("/api/simulation", { ...parameters, headers: { Origin: "https://foreign.example" } });
  assert.equal(rejected.status, 403);
  const malformed = await request("/api/simulation", { method: "POST", body: "{" });
  assert.equal(malformed.status, 400);
  const largeChat = await request("/api/chat", { method: "POST", body: JSON.stringify({ context: "x".repeat(600001) }), headers: { "x-test-body-mode": "object" } });
  assert.equal(largeChat.status, 400);
  assert.match(largeChat.data.error, /600 kB/);
  const missing = await request("/api/missing");
  assert.equal(missing.status, 404);
});
