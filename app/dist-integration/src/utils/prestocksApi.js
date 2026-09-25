import axios from 'axios';
import { PublicKey } from '@solana/web3.js';
const DEFAULT_API_BASE = 'https://prestocks.com';
export function getPreStocksApiBaseUrl() {
    const configuredBase = process.env.NEXT_PUBLIC_PRESTOCKS_API?.trim() ||
        process.env.PRESTOCKS_API_BASE_URL?.trim();
    const baseUrl = configuredBase || DEFAULT_API_BASE;
    try {
        const parsed = new URL(baseUrl);
        if (parsed.protocol !== 'https:' && process.env.NODE_ENV !== 'test') {
            throw new Error('PreStocks API base URL must use HTTPS.');
        }
        return parsed.toString().replace(/\/$/, '');
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Invalid PreStocks API base URL: ${message}`);
    }
}
export function mapLivePreStocksAsset(asset) {
    const mintAddress = asset.contract_address ?? asset.address;
    if (asset.status !== 'LIVE' ||
        typeof mintAddress !== 'string' ||
        !mintAddress.trim() ||
        typeof asset.symbol !== 'string' ||
        !Number.isFinite(asset.tokenPrice)) {
        return null;
    }
    try {
        new PublicKey(mintAddress);
        return {
            address: mintAddress,
            product: asset.product ?? asset.name ?? asset.symbol,
            symbol: asset.symbol,
            tokenPrice: asset.tokenPrice,
            status: 'LIVE',
        };
    }
    catch {
        return null;
    }
}
function isPreStocksApiAsset(value) {
    if (typeof value !== 'object' || value === null) {
        return false;
    }
    const asset = value;
    return ((typeof asset.contract_address === 'string' || typeof asset.address === 'string') &&
        typeof asset.symbol === 'string' &&
        typeof asset.tokenPrice === 'number' &&
        (asset.status === undefined || typeof asset.status === 'string') &&
        (asset.name === undefined || typeof asset.name === 'string') &&
        (asset.product === undefined || typeof asset.product === 'string'));
}
export async function fetchLivePreStocksAssets() {
    const endpoint = typeof window === 'undefined'
        ? `${getPreStocksApiBaseUrl()}/api/prestocks`
        : '/api/prestocks';
    const { data } = await axios.get(endpoint, {
        timeout: 10000,
    });
    if (!Array.isArray(data)) {
        throw new Error('Respons PreStocks bukan array aset');
    }
    return data
        .filter(isPreStocksApiAsset)
        .map(mapLivePreStocksAsset)
        .filter((asset) => asset !== null);
}
export const getLivePreStocks = fetchLivePreStocksAssets;
export default fetchLivePreStocksAssets;
