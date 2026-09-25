const PRESTOCKS_URL = 'https://prestocks.com/api/prestocks';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function GET() {
  try {
    const response = await fetch(PRESTOCKS_URL, {
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      return json({ error: `PreStocks returned HTTP ${response.status}.` }, 502);
    }
    const payload: unknown = await response.json();
    if (!Array.isArray(payload)) {
      return json({ error: 'PreStocks returned a non-array payload.' }, 502);
    }
    return json(payload);
  } catch (cause: unknown) {
    return json(
      { error: cause instanceof Error ? cause.message : 'PreStocks request failed.' },
      502,
    );
  }
}
