import { proxyTableAnalysis } from '../../../lib/table-analysis-proxy.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  return proxyTableAnalysis(request);
}
