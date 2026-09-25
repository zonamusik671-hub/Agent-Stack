import { createServer, type Server } from 'node:http';

const VALID_MINT = '11111111111111111111111111111111';
const MOCK_TOKEN = 'mock-pyth-token';

export interface MockSponsorServer {
  baseUrl: string;
  pythEndpoint: string;
  prestocksBaseUrl: string;
  close: () => Promise<void>;
}

export async function startMockSponsorServer(): Promise<MockSponsorServer> {
  const server = createServer((request, response) => {
    if (request.url?.startsWith('/v2/updates/price/latest')) {
      const authorization = request.headers.authorization;
      if (authorization !== `Bearer ${MOCK_TOKEN}`) {
        response.writeHead(401, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ error: 'unauthorized' }));
        return;
      }

      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({
        binary: false,
        parsed: [{
          id: 'f9c017263a506240646467c9d2833076137d076d000000000000000000000001',
          price: { price: '18000', conf: '1', expo: -2, publish_time: 1 },
        }],
      }));
      return;
    }

    if (request.url === '/api/prestocks') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify([{
        contract_address: VALID_MINT,
        name: 'Mock ASB',
        symbol: 'AAPLX',
        tokenPrice: 180,
        status: 'LIVE',
      }]));
      return;
    }

    response.writeHead(404);
    response.end();
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    await closeServer(server);
    throw new Error('Mock sponsor server did not expose a TCP address.');
  }

  const baseUrl = `http://127.0.0.1:${address.port}`;
  return {
    baseUrl,
    pythEndpoint: baseUrl,
    prestocksBaseUrl: baseUrl,
    close: () => closeServer(server),
  };
}

export const MOCK_PYTH_TOKEN = MOCK_TOKEN;

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}
