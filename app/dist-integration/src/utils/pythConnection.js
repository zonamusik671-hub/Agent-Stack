import { PriceServiceConnection } from '@pythnetwork/price-service-client';
import { PublicKey } from '@solana/web3.js';
const DEFAULT_PYTH_HERMES_ENDPOINT = 'https://hermes.pyth.network';
const DEFAULT_AAPL_FEED_ID = 'f9c017263a506240646467c9d2833076137d076d000000000000000000000001';
export function getPythOnChainConfig(cluster = process.env.SOLANA_CLUSTER === 'mainnet-beta'
    ? 'mainnet-beta'
    : 'devnet') {
    const programValue = cluster === 'devnet'
        ? process.env.PYTH_PROGRAM_ID_DEVNET
        : process.env.PYTH_PROGRAM_ID_MAINNET_BETA;
    const feedId = (cluster === 'devnet'
        ? process.env.PYTH_FEED_ID_DEVNET
        : process.env.PYTH_FEED_ID_MAINNET_BETA)?.replace(/^0x/, '');
    if (!programValue?.trim() || !feedId?.trim()) {
        throw new Error(`Pyth ${cluster} program ID and feed ID must be configured.`);
    }
    if (!/^[0-9a-f]{64}$/i.test(feedId)) {
        throw new Error(`Invalid Pyth ${cluster} feed ID.`);
    }
    try {
        return {
            cluster,
            programId: new PublicKey(programValue),
            priceFeed: new PublicKey(process.env[`PYTH_PRICE_ACCOUNT_${cluster === 'devnet' ? 'DEVNET' : 'MAINNET_BETA'}`] ?? ''),
            feedId,
        };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Invalid Pyth ${cluster} on-chain configuration: ${message}`);
    }
}
function getPythHermesEndpoint() {
    return process.env.PYTH_HERMES_ENDPOINT?.trim() || DEFAULT_PYTH_HERMES_ENDPOINT;
}
function getPythAccessToken() {
    const accessToken = process.env.PYTH_PRO_TOKEN?.trim();
    if (!accessToken ||
        accessToken === 'TOKEN_PYTH_PRO_ASLI' ||
        accessToken.startsWith('Masukkan_')) {
        return undefined;
    }
    return accessToken;
}
export function hasConfiguredPythHermesToken() {
    return getPythAccessToken() !== undefined;
}
export async function validatePythHermesToken(request = fetch) {
    const accessToken = getPythAccessToken();
    if (!accessToken) {
        throw new Error('Pyth Hermes access token is not configured.');
    }
    const url = new URL('/v2/updates/price/latest', getPythHermesEndpoint());
    url.searchParams.set('ids[]', DEFAULT_AAPL_FEED_ID);
    try {
        const response = await request(url, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });
        if (response.status !== 200) {
            throw new Error(`Pyth Hermes token validation failed with HTTP ${response.status}.`);
        }
    }
    catch (error) {
        if (error instanceof Error &&
            error.message.startsWith('Pyth Hermes token validation failed')) {
            throw error;
        }
        throw new Error('Pyth Hermes token validation request failed.');
    }
}
export const pythConnection = new PriceServiceConnection(getPythHermesEndpoint(), {
    accessToken: getPythAccessToken(),
    priceFeedRequestConfig: { binary: true },
});
export const AAPL_FEED_ID = (process.env.PYTH_FEED_ID ?? DEFAULT_AAPL_FEED_ID).replace(/^0x/, '');
export async function getLatestPythPrice(feedId) {
    if (process.env.NODE_ENV === 'production' && !getPythAccessToken()) {
        throw new Error('Pyth Hermes access token is required in production.');
    }
    if (!/^[0-9a-f]{64}$/i.test(feedId)) {
        throw new Error(`Pyth feed ID tidak valid: ${feedId}`);
    }
    if (typeof window !== 'undefined') {
        const response = await fetch(`/api/pyth?id=0x${feedId}`, { cache: 'no-store' });
        const payload = await response.json();
        if (!response.ok) {
            const message = typeof payload === 'object' && payload !== null && 'error' in payload
                ? String(payload.error)
                : `Pyth proxy returned HTTP ${response.status}.`;
            throw new Error(message);
        }
        const parsed = payload.parsed;
        const rawPrice = parsed?.[0]?.price;
        if (!rawPrice?.price || typeof rawPrice.expo !== 'number') {
            throw new Error('Pyth proxy returned an invalid price payload.');
        }
        const price = Number(rawPrice.price) * 10 ** rawPrice.expo;
        if (!Number.isFinite(price) || price <= 0) {
            throw new Error('Pyth proxy returned an invalid price.');
        }
        return price;
    }
    const connection = new PriceServiceConnection(getPythHermesEndpoint(), {
        accessToken: getPythAccessToken(),
        priceFeedRequestConfig: { binary: true },
    });
    const feeds = await connection.getLatestPriceFeeds([feedId]);
    if (!feeds?.length) {
        throw new Error(`Pyth feed tidak ditemukan atau tidak tersedia: ${feedId}`);
    }
    const rawPrice = feeds[0].getPriceUnchecked();
    const price = parsePythPrice(BigInt(rawPrice.price), rawPrice.expo);
    if (!Number.isFinite(price) || price <= 0) {
        throw new Error(`Harga Pyth tidak valid: ${String(rawPrice.price)}e${String(rawPrice.expo)}`);
    }
    return price;
}
export function formatPythPrice(price, expo) {
    const exponent = typeof expo === 'bigint' ? Number(expo) : expo;
    if (!Number.isInteger(exponent) || !Number.isSafeInteger(exponent)) {
        throw new Error(`Pyth exponent tidak valid: ${String(expo)}`);
    }
    const negative = price < 0n;
    const digits = (negative ? -price : price).toString();
    const decimalPosition = digits.length + exponent;
    let formatted;
    if (decimalPosition <= 0) {
        formatted = `0.${'0'.repeat(-decimalPosition)}${digits}`;
    }
    else if (decimalPosition >= digits.length) {
        formatted = `${digits}${'0'.repeat(decimalPosition - digits.length)}`;
    }
    else {
        formatted = `${digits.slice(0, decimalPosition)}.${digits.slice(decimalPosition)}`;
    }
    return negative ? `-${formatted}` : formatted;
}
export function parsePythPrice(price, expo) {
    const formatted = formatPythPrice(price, expo);
    const parsed = Number(formatted);
    if (!Number.isFinite(parsed)) {
        throw new Error(`Nilai harga Pyth berada di luar rentang number: ${formatted}`);
    }
    return parsed;
}
