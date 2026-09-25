import test from 'node:test';
import assert from 'node:assert/strict';
import { PublicKey } from '@solana/web3.js';
import { getPreStocksApiBaseUrl, mapLivePreStocksAsset, } from '../src/utils/prestocksApi.js';
import { formatPythPrice, hasConfiguredPythHermesToken, parsePythPrice, validatePythHermesToken, } from '../src/utils/pythConnection.js';
import { shouldRebalance } from '../src/utils/agent-orchestrator.js';
import { MOCK_PYTH_TOKEN, startMockSponsorServer, } from './mock-sponsor-server.js';
const validMint = new PublicKey('11111111111111111111111111111111').toBase58();
test('routes Pyth and PreStocks through the isolated mock sponsor server', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalPythEndpoint = process.env.PYTH_HERMES_ENDPOINT;
    const originalPreStocksEndpoint = process.env.PRESTOCKS_API_BASE_URL;
    const originalToken = process.env.PYTH_PRO_TOKEN;
    const mock = await startMockSponsorServer();
    process.env.NODE_ENV = 'test';
    process.env.PYTH_HERMES_ENDPOINT = mock.pythEndpoint;
    process.env.PRESTOCKS_API_BASE_URL = mock.prestocksBaseUrl;
    process.env.PYTH_PRO_TOKEN = MOCK_PYTH_TOKEN;
    try {
        await validatePythHermesToken();
        const assets = await (await import('../src/utils/prestocksApi.js')).fetchLivePreStocksAssets();
        assert.equal(assets[0]?.status, 'LIVE');
        assert.equal(assets[0]?.address, validMint);
    }
    finally {
        await mock.close();
        if (originalNodeEnv === undefined)
            delete process.env.NODE_ENV;
        else
            process.env.NODE_ENV = originalNodeEnv;
        if (originalPythEndpoint === undefined)
            delete process.env.PYTH_HERMES_ENDPOINT;
        else
            process.env.PYTH_HERMES_ENDPOINT = originalPythEndpoint;
        if (originalPreStocksEndpoint === undefined)
            delete process.env.PRESTOCKS_API_BASE_URL;
        else
            process.env.PRESTOCKS_API_BASE_URL = originalPreStocksEndpoint;
        if (originalToken === undefined)
            delete process.env.PYTH_PRO_TOKEN;
        else
            process.env.PYTH_PRO_TOKEN = originalToken;
    }
});
test('uses the supplied threshold for the rebalance decision', () => {
    assert.equal(shouldRebalance({ liveStockPrice: 179, threshold: 180 }), true);
    assert.equal(shouldRebalance({ liveStockPrice: 180, threshold: 180 }), false);
    assert.equal(shouldRebalance({ liveStockPrice: 220, threshold: 250 }), true);
});
test('rejects invalid rebalance decision inputs', () => {
    assert.throws(() => shouldRebalance({ liveStockPrice: Number.NaN, threshold: 180 }), /finite positive/);
    assert.throws(() => shouldRebalance({ liveStockPrice: 100, threshold: 0 }), /finite positive/);
});
test('uses the configured PreStocks API base URL without changing validation rules', () => {
    const originalBaseUrl = process.env.PRESTOCKS_API_BASE_URL;
    process.env.PRESTOCKS_API_BASE_URL = 'https://api.example.test/';
    try {
        assert.equal(getPreStocksApiBaseUrl(), 'https://api.example.test');
    }
    finally {
        if (originalBaseUrl === undefined)
            delete process.env.PRESTOCKS_API_BASE_URL;
        else
            process.env.PRESTOCKS_API_BASE_URL = originalBaseUrl;
    }
});
test('rejects a non-HTTPS PreStocks API base URL', () => {
    const originalBaseUrl = process.env.PRESTOCKS_API_BASE_URL;
    process.env.PRESTOCKS_API_BASE_URL = 'http://api.example.test';
    try {
        assert.throws(() => getPreStocksApiBaseUrl(), /must use HTTPS/);
    }
    finally {
        if (originalBaseUrl === undefined)
            delete process.env.PRESTOCKS_API_BASE_URL;
        else
            process.env.PRESTOCKS_API_BASE_URL = originalBaseUrl;
    }
});
test('rejects a PreStocks asset when status is absent', () => {
    assert.equal(mapLivePreStocksAsset({
        contract_address: validMint,
        symbol: 'ASB',
        tokenPrice: 1,
    }), null);
});
test('rejects a PreStocks asset when status is SUSPENDED', () => {
    assert.equal(mapLivePreStocksAsset({
        contract_address: validMint,
        symbol: 'ASB',
        tokenPrice: 1,
        status: 'SUSPENDED',
    }), null);
});
test('rejects a PreStocks asset when status is empty', () => {
    assert.equal(mapLivePreStocksAsset({
        contract_address: validMint,
        symbol: 'ASB',
        tokenPrice: 1,
        status: '',
    }), null);
});
test('accepts only an explicit LIVE PreStocks asset with a valid mint', () => {
    assert.deepEqual(mapLivePreStocksAsset({
        contract_address: validMint,
        symbol: 'ASB',
        tokenPrice: 1,
        status: 'LIVE',
    }), {
        address: validMint,
        product: 'ASB',
        symbol: 'ASB',
        tokenPrice: 1,
        status: 'LIVE',
    });
});
test('accepts the official address field only with an explicit LIVE status', () => {
    assert.deepEqual(mapLivePreStocksAsset({
        address: validMint,
        symbol: 'ASB',
        tokenPrice: 1,
        status: 'LIVE',
    }), {
        address: validMint,
        product: 'ASB',
        symbol: 'ASB',
        tokenPrice: 1,
        status: 'LIVE',
    });
});
test('rejects an explicit LIVE PreStocks asset with an invalid mint', () => {
    assert.equal(mapLivePreStocksAsset({
        contract_address: 'not-a-solana-mint',
        symbol: 'ASB',
        tokenPrice: 1,
        status: 'LIVE',
    }), null);
});
test('formats and parses Pyth signed price values precisely', () => {
    assert.equal(formatPythPrice(123456n, -3), '123.456');
    assert.equal(formatPythPrice(123n, -5), '0.00123');
    assert.equal(formatPythPrice(-123456n, -3), '-123.456');
    assert.equal(parsePythPrice(123456n, -3), 123.456);
});
test('does not treat the placeholder Hermes token as configured', () => {
    assert.equal(hasConfiguredPythHermesToken(), false);
});
test('resolves only when Hermes responds with HTTP 200', async () => {
    const originalToken = process.env.PYTH_PRO_TOKEN;
    process.env.PYTH_PRO_TOKEN = 'test-token';
    let authorizationHeader = null;
    try {
        const result = await validatePythHermesToken(async (_input, init) => {
            authorizationHeader = new Headers(init?.headers).get('authorization');
            return new Response('{}', { status: 200 });
        });
        assert.equal(result, undefined);
        assert.equal(authorizationHeader, 'Bearer test-token');
        await assert.rejects(validatePythHermesToken(async () => new Response('{}', { status: 401 })), /HTTP 401/);
    }
    finally {
        if (originalToken === undefined)
            delete process.env.PYTH_PRO_TOKEN;
        else
            process.env.PYTH_PRO_TOKEN = originalToken;
    }
});
test('fails closed when the Hermes request rejects', async () => {
    const originalToken = process.env.PYTH_PRO_TOKEN;
    process.env.PYTH_PRO_TOKEN = 'test-token';
    try {
        await assert.rejects(validatePythHermesToken(async () => {
            throw new Error('network failure');
        }), /request failed/);
    }
    finally {
        if (originalToken === undefined)
            delete process.env.PYTH_PRO_TOKEN;
        else
            process.env.PYTH_PRO_TOKEN = originalToken;
    }
});
