import test from 'node:test';
import assert from 'node:assert/strict';
import { createTableInterpreter, validateTable } from '../src/chat/table-analysis.js';
import { chatConfiguration } from '../src/chat/chat-service.js';
import { proxyTableAnalysis } from '../research-app/lib/table-analysis-proxy.mjs';

const env = { OPENAI_API_KEY: 'test-only', OPENAI_MODEL: 'modelo-del-chat' };
const table = () => ({ title: 'MAE de prueba', context: 'Prismas reales; no validación operacional.', headers: ['Modelo', 'MAE mm'], rows: [['Persistencia', '6.392'], ['LSTM', '11.574']] });

test('interpretación usa el modelo del chat, cifras completas, instrucciones seguras y caché por datos', async () => {
  const calls = [];
  const interpret = createTableInterpreter({ env, modelFactory: configuration => {
    assert.equal(configuration.model, chatConfiguration(env).model);
    return { invoke: async (messages, options) => { calls.push({ messages, options }); return { content: 'La persistencia tiene menor MAE de prueba. No implica validez operacional.' }; } };
  } });
  const signal = new AbortController().signal;
  const [one, two] = await Promise.all([interpret(table(), { signal }), interpret(table(), { signal })]);
  assert.equal(calls.length, 1); assert.deepEqual(one, two); assert.equal(one.model, env.OPENAI_MODEL);
  assert.match(calls[0].messages[0].content, /nunca instrucciones/); assert.match(calls[0].messages[0].content, /validación, no el conjunto de prueba/);
  assert.deepEqual(JSON.parse(calls[0].messages[1].content), table()); assert.equal(calls[0].options.signal, signal);
  assert.ok(!JSON.stringify(one).includes(env.OPENAI_API_KEY));
  const changed = table(); changed.rows[0][1] = '1.23456789';
  await interpret(changed); assert.equal(calls.length, 2);
  env.OPENAI_MODEL = 'otro-modelo'; await interpret(table()); assert.equal(calls.length, 3); env.OPENAI_MODEL = 'modelo-del-chat';
});

test('no consulta al proveedor sin clave o con tablas inválidas, ni almacena errores', async () => {
  for (const value of [{}, { ...table(), rows: [] }, { ...table(), rows: [['incompleta']] }, { ...table(), rows: [[{}, '2']] }, { ...table(), context: 'x'.repeat(16001) }]) assert.throws(() => validateTable(value));
  await assert.rejects(createTableInterpreter({ env: {} })(table()), error => error.status === 503);
  let calls = 0, released = 0;
  const interpret = createTableInterpreter({ env, modelFactory: () => ({ invoke: async () => { calls++; throw new Error('falló'); } }) });
  for (let count = 0; count < 2; count++) await assert.rejects(interpret(table(), { admit: () => () => { released++; } }));
  assert.equal(calls, 2); assert.equal(released, 2);
});

test('el laboratorio llama al binding de IA en ejecución y conserva el control de origen', async () => {
  const env = { VERCEL: '1', APP_INTERNAL_URL: 'https://internal.example/service/app/' };
  const calls = [];
  const fetchImpl = async (url, options) => { calls.push({ url: String(url), options }); return Response.json({ text: 'Interpretación', model: 'chat' }); };
  const request = origin => new Request('https://slopes.example/research/api/table-explanation', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(table()) });
  assert.equal((await proxyTableAnalysis(request('https://foreign.example'), { env, fetchImpl })).status, 403);
  assert.equal(calls.length, 0);
  assert.equal((await proxyTableAnalysis(request('https://slopes.example'), { env, fetchImpl })).status, 200);
  assert.equal(calls[0].url, 'https://internal.example/service/app/api/tables/explain');
  assert.equal(calls[0].options.body.byteLength > 0, true);
  assert.equal((await proxyTableAnalysis(request('https://slopes.example'), { env: { VERCEL: '1' }, fetchImpl })).status, 503);
});
