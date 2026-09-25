import axios from 'axios';
import { PublicKey } from '@solana/web3.js';

export interface PreStocksApiAsset {
  /** Current API field; the official schema may expose the same value as `address`. */
  contract_address?: string;
  address?: string;
  name?: string;
  product?: string;
  symbol: string;
  tokenPrice: number;
  /** Deliberately open-ended: unknown provider states must be rejected by the mapper. */
  status?: string;
}

export interface PreStocksAsset {
  address: string;
  product: string;
  symbol: string;
  tokenPrice: number;
  status: 'LIVE';
}

const DEFAULT_API_BASE = 'https://prestocks.com';

export function getPreStocksApiBaseUrl(): string {
  const configuredBase =
    process.env.NEXT_PUBLIC_PRESTOCKS_API?.trim() ||
    process.env.PRESTOCKS_API_BASE_URL?.trim();
  const baseUrl = configuredBase || DEFAULT_API_BASE;

  try {
    const parsed = new URL(baseUrl);
    if (parsed.protocol !== 'https:' && process.env.NODE_ENV !== 'test') {
      throw new Error('PreStocks API base URL must use HTTPS.');
    }
    return parsed.toString().replace(/\/$/, '');
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid PreStocks API base URL: ${message}`);
  }
}

export function mapLivePreStocksAsset(asset: PreStocksApiAsset): PreStocksAsset | null {
  const mintAddress = asset.contract_address ?? asset.address;

  if (
    asset.status !== 'LIVE' ||
    typeof mintAddress !== 'string' ||
    !mintAddress.trim() ||
    typeof asset.symbol !== 'string' ||
    !Number.isFinite(asset.tokenPrice)
  ) {
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
  } catch {
    return null;
  }
}

function isPreStocksApiAsset(value: unknown): value is PreStocksApiAsset {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const asset = value as Record<string, unknown>;
  return (
    (typeof asset.contract_address === 'string' || typeof asset.address === 'string') &&
    typeof asset.symbol === 'string' &&
    typeof asset.tokenPrice === 'number' &&
    (asset.status === undefined || typeof asset.status === 'string') &&
    (asset.name === undefined || typeof asset.name === 'string') &&
    (asset.product === undefined || typeof asset.product === 'string')
  );
}

export async function fetchLivePreStocksAssets(): Promise<PreStocksAsset[]> {
  const endpoint = typeof window === 'undefined'
    ? `${getPreStocksApiBaseUrl()}/api/prestocks`
    : '/api/prestocks';
  const { data } = await axios.get<unknown>(endpoint, {
    timeout: 10000,
  });

  if (!Array.isArray(data)) {
    throw new Error('Respons PreStocks bukan array aset');
  }

  return data
    .filter(isPreStocksApiAsset)
    .map(mapLivePreStocksAsset)
    .filter((asset): asset is PreStocksAsset => asset !== null);
}

export const getLivePreStocks = fetchLivePreStocksAssets;
export default fetchLivePreStocksAssets;
