// Only imported by the Node route handler. Bindings are read on every request,
// never from next.config, a build, middleware, or a browser bundle.
export async function proxyBackend(request, segments, { env = process.env, fetchImpl = fetch } = {}) {
  const fail = (status, detail) => Response.json({ detail }, { status, headers: { 'Cache-Control': 'no-store' } });
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method) && request.headers.has('origin')) {
    const incoming = new URL(request.url);
    // Vercel forwards the public authority while the function URL may refer to
    // the internal service. Outside Vercel, ignore forwarded authority headers.
    const host = (env.VERCEL === '1' && request.headers.get('x-forwarded-host')) || request.headers.get('host') || incoming.host;
    const protocol = (env.VERCEL === '1' && request.headers.get('x-forwarded-proto')) || incoming.protocol.slice(0, -1);
    let expectedOrigin;
    try { expectedOrigin = new URL(`${protocol}://${host}`).origin; } catch { return fail(403, 'Origen no autorizado para modificar experimentos'); }
    if (request.headers.get('origin') !== expectedOrigin) return fail(403, 'Origen no autorizado para modificar experimentos');
  }
  if (!segments.length || segments.some(segment => !segment || segment === '.' || segment === '..' || /[\\/]/.test(segment))) {
    return fail(400, 'Ruta de API no válida');
  }
  const target = env.CENTURY_BACKEND_URL || (env.VERCEL === '1' ? null : env.CENTURY_API_ORIGIN || 'http://127.0.0.1:8001');
  if (!target) return fail(503, 'No está disponible el binding interno de la API de investigación.');
  try {
    const base = new URL(target.endsWith('/') ? target : `${target}/`);
    if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) return fail(503, 'Configuración de API no válida.');
    const url = new URL(`api/${segments.map(encodeURIComponent).join('/')}`, base);
    url.search = new URL(request.url).search;
    const headers = new Headers();
    for (const name of ['accept', 'content-type']) {
      if (request.headers.has(name)) headers.set(name, request.headers.get(name));
    }
    // Origin was checked at the public ingress. Cookies and browser credentials
    // are not forwarded to the internal service.
    const upstream = await fetchImpl(url, {
      method: request.method, headers,
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : await request.arrayBuffer(),
      cache: 'no-store', redirect: 'error',
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(120000)])
    });
    const responseHeaders = new Headers(upstream.headers);
    for (const name of ['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade', 'content-length', 'content-encoding', 'set-cookie']) responseHeaders.delete(name);
    responseHeaders.set('Cache-Control', 'no-store');
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  } catch {
    return fail(502, 'No se pudo conectar con la API de investigación.');
  }
}
