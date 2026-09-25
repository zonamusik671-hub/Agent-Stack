const FEED_ID_PATTERN = /^0x?[0-9a-f]{64}$/i;
const UPSTREAMS = [
  'https://hermes.pyth.network/v2/updates/price/latest',
  'https://hermes-beta.pyth.network/v2/updates/price/latest',
  'https://xc-mainnet.pyth.network/api/latest_price_feeds',
] as const;

type ParsedPrice = { price: string; expo: number };

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Cache-Control': 'no-store', 'Content-Type': 'application/json' },
  });
}

function parsePrice(payload: unknown): ParsedPrice | null {
  if (!payload || typeof payload !== 'object') return null;
  const root = payload as { parsed?: unknown; price_feeds?: unknown };
  const parsed = Array.isArray(root.parsed)
    ? root.parsed
    : Array.isArray(root.price_feeds)
      ? root.price_feeds
      : [];
  const first = parsed[0] as { price?: unknown } | undefined;
  const price = first?.price;
  if (!price || typeof price !== 'object') return null;
  const value = (price as { price?: unknown }).price;
  const expo = (price as { expo?: unknown }).expo;
  return typeof value === 'string' && typeof expo === 'number' && Number.isInteger(expo)
    ? { price: value, expo }
    : null;
}

function upstreamUrl(base: string, feedId: string): string {
  const url = new URL(base);
  url.searchParams.append('ids[]', feedId.replace(/^0x/i, ''));
  if (base.includes('xc-mainnet')) url.searchParams.set('binary', 'false');
  return url.toString();
}

export async function GET(request: Request) {
  const requestedId = new URL(request.url).searchParams.get('id')?.trim() ?? '';
  const feedId = requestedId.startsWith('0x') ? requestedId : `0x${requestedId}`;
  if (!FEED_ID_PATTERN.test(feedId)) {
    return json({ error: 'A valid Pyth feed ID is required.', price: null });
  }

  const headers: HeadersInit = {
    Accept: 'application/json',
    'User-Agent': 'AgentStockBasket/1.0 (+https://github.com/agent-stock-basket)',
  };
  const token = process.env.PYTH_PRO_TOKEN?.trim();
  if (token && !token.startsWith('TOKEN_') && !token.startsWith('Masukkan_')) {
    headers.Authorization = `Bearer ${token}`;
  }

  const errors: string[] = [];
  for (const upstream of UPSTREAMS) {
    try {
      const response = await fetch(upstreamUrl(upstream, feedId), {
        headers,
        cache: 'no-store',
        signal: AbortSignal.timeout(5_000),
      });
      if (!response.ok) {
        errors.push(`${new URL(upstream).hostname}: HTTP ${response.status}`);
        continue;
      }
      const payload: unknown = await response.json();
      const price = parsePrice(payload);
      if (price) return json({ parsed: [{ price }], source: upstream, price });
      errors.push(`${new URL(upstream).hostname}: invalid price payload`);
    } catch (cause: unknown) {
      errors.push(`${new URL(upstream).hostname}: ${cause instanceof Error ? cause.message : 'request failed'}`);
    }
  }

  return json({ error: `Pyth feed unavailable. ${errors.join('; ')}`, price: null });
}
