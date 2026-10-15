import type { NextConfig } from 'next';

const configuredOrigin = process.env.CENTURY_API_ORIGIN?.trim();
if (process.env.VERCEL === '1' && !configuredOrigin) {
  throw new Error('Configura CENTURY_API_ORIGIN con la URL HTTPS del backend FastAPI antes de desplegar en Vercel.');
}
const apiOrigin = new URL(configuredOrigin || 'http://127.0.0.1:8001');
if (!['http:', 'https:'].includes(apiOrigin.protocol) || apiOrigin.username || apiOrigin.password || apiOrigin.pathname !== '/' || apiOrigin.search || apiOrigin.hash) {
  throw new Error('CENTURY_API_ORIGIN debe ser un origen HTTP(S), sin credenciales, rutas, query ni fragmento.');
}
if (process.env.VERCEL === '1' && apiOrigin.protocol !== 'https:') {
  throw new Error('CENTURY_API_ORIGIN debe usar HTTPS en Vercel.');
}

const config: NextConfig = {
  poweredByHeader: false,
  devIndicators: false,
  outputFileTracingRoot: process.cwd(),
  turbopack: { root: process.cwd() },
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiOrigin.origin}/api/:path*` }];
  },
};
export default config;
