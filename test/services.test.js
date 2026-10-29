import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { proxyBackend } from '../research-app/lib/backend-proxy.mjs';
import { LAB_BASE_PATH, researchApiPath } from '../research-app/lib/paths.mjs';

test('services keep dashboard API, lab paths and the private backend separate', async () => {
  const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
  for (const key of ['functions', 'installCommand', 'buildCommand', 'framework', 'outputDirectory', 'devCommand', 'ignoreCommand']) assert.equal(config[key], undefined);
  const route = pathname => config.rewrites.find(rule => new RegExp(`^${rule.source}$`).test(pathname))?.destination.service;
  for (const pathname of ['/', '/api/health', '/api/mines/century', '/researching']) assert.equal(route(pathname), 'app');
  for (const pathname of ['/research', '/research/', '/research/api/preview', '/research/_next/static/app.js']) assert.equal(route(pathname), 'research-app');
  assert.ok(!config.rewrites.some(rule => rule.destination.service === 'backend'));
  assert.deepEqual(config.services['research-app'].bindings, [
    { type: 'service', service: 'app', format: 'url', env: 'APP_INTERNAL_URL' },
    { type: 'service', service: 'backend', format: 'url', env: 'CENTURY_BACKEND_URL' }
  ]);
  assert.equal(config.services.backend.root, 'research-app');
  assert.equal(LAB_BASE_PATH, '/research');
  assert.equal(researchApiPath('/experiments/id/files/model.h5'), '/research/api/experiments/id/files/model.h5');
});

test('proxy reads the binding per request, preserves its prefix and query, streams downloads', async () => {
  const env = { VERCEL: '1', CENTURY_BACKEND_URL: 'https://internal.example/service/backend/' };
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), options });
    return new Response('download bytes', { headers: { 'Content-Type': 'application/octet-stream', 'Content-Disposition': 'attachment; filename="model.h5"', 'Content-Length': '999', 'Content-Encoding': 'gzip' } });
  };
  const request = () => new Request('https://slopes.example/research/api/experiments/id/files/model.h5?download=1');
  const response = await proxyBackend(request(), ['experiments', 'id', 'files', 'model.h5'], { env, fetchImpl });
  assert.equal(calls[0].url, 'https://internal.example/service/backend/api/experiments/id/files/model.h5?download=1');
  assert.equal(await response.text(), 'download bytes');
  assert.match(response.headers.get('content-disposition'), /model.h5/);
  assert.equal(response.headers.get('content-length'), null);
  assert.equal(response.headers.get('content-encoding'), null);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  env.CENTURY_BACKEND_URL = 'http://new-service.example';
  await proxyBackend(request(), ['health'], { env, fetchImpl });
  assert.equal(calls[1].url, 'http://new-service.example/api/health?download=1');
});

test('proxy preserves JSON and upstream errors while enforcing the public origin', async () => {
  const env = { VERCEL: '1', CENTURY_BACKEND_URL: 'http://backend.internal' };
  let called = 0;
  const fetchImpl = async (_url, options) => {
    called++;
    assert.deepEqual(JSON.parse(new TextDecoder().decode(options.body)), { lag: 2 });
    for (const name of ['cookie', 'authorization', 'host', 'origin']) assert.equal(options.headers.get(name), null);
    return Response.json({ detail: 'Training is local only' }, { status: 503 });
  };
  const request = origin => new Request('https://slopes.example/research/api/preview', { method: 'POST', body: '{"lag":2}', headers: { Origin: origin, Cookie: 'private=value', Authorization: 'Bearer private', 'Content-Type': 'application/json' } });
  const response = await proxyBackend(request('https://slopes.example'), ['preview'], { env, fetchImpl });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).detail, 'Training is local only');
  assert.equal((await proxyBackend(request('https://foreign.example'), ['preview'], { env, fetchImpl })).status, 403);
  assert.equal(called, 1);
});

test('missing bindings and failed upstreams fail explicitly without leaking internal URLs', async () => {
  const req = new Request('https://slopes.example/research/api/health');
  const missing = await proxyBackend(req, ['health'], { env: { VERCEL: '1', CENTURY_API_ORIGIN: 'http://localhost:8001' } });
  assert.equal(missing.status, 503);
  const failed = await proxyBackend(req, ['health'], { env: { CENTURY_BACKEND_URL: 'http://private.internal' }, fetchImpl: async () => { throw new Error('private.internal'); } });
  assert.equal(failed.status, 502);
  assert.ok(!(await failed.text()).includes('private.internal'));
});

test('Vercel proxy checks the forwarded public origin rather than the internal service URL', async () => {
  const headers = { Host: '[::1]:4000', 'X-Forwarded-Host': 'slopes.example', 'X-Forwarded-Proto': 'https', Origin: 'https://slopes.example' };
  const request = () => new Request('http://localhost:4000/api/preview', { method: 'POST', body: '{}', headers });
  const fetchImpl = async () => Response.json({ partitions: {} });
  const env = { VERCEL: '1', CENTURY_BACKEND_URL: 'http://backend.internal' };
  assert.equal((await proxyBackend(request(), ['preview'], { env, fetchImpl })).status, 200);
  assert.equal((await proxyBackend(request(), ['preview'], { env: { CENTURY_BACKEND_URL: 'http://backend.internal' }, fetchImpl })).status, 403);
  headers.Origin = 'https://foreign.example';
  assert.equal((await proxyBackend(request(), ['preview'], { env, fetchImpl })).status, 403);
});
