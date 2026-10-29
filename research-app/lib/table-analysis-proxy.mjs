import { proxyBackend } from './backend-proxy.mjs';

export function proxyTableAnalysis(request, { env = process.env, fetchImpl = fetch } = {}) {
  return proxyBackend(request, ['tables', 'explain'], { fetchImpl, env: {
    ...env, CENTURY_BACKEND_URL: env.APP_INTERNAL_URL,
    CENTURY_API_ORIGIN: env.TABLE_AI_ORIGIN || 'http://127.0.0.1:3000'
  } });
}
