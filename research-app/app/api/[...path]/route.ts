import { proxyBackend } from '../../../lib/backend-proxy.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handler(request: Request, context: { params: Promise<{ path: string[] }> }) {
  return proxyBackend(request, (await context.params).path);
}

export { handler as GET, handler as POST, handler as HEAD, handler as OPTIONS, handler as PUT, handler as PATCH, handler as DELETE };
