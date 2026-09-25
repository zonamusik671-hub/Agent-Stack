'use client';

import { FC, useEffect, useState } from 'react';

interface PythPrice {
    price: string;
    expo: number;
}

const PYTH_HERMES_URL = "/api/pyth?id=";
const AAPL_FEED_ID = "0x49f6b6f3f742145b13689c6d0407e3768ba2f6c0294e77227e8d641147a27453";

export const RebalanceStatus: FC = () => {
    const [price, setPrice] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchPrice() {
            try {
                setLoading(true);
                const response = await fetch(`${PYTH_HERMES_URL}${AAPL_FEED_ID}`, {
                    cache: 'no-store',
                });
                const data: unknown = await response.json();
                if (!response.ok) {
                    const message =
                        typeof data === 'object' && data !== null && 'error' in data
                            ? String(data.error)
                            : `Pyth proxy returned HTTP ${response.status}.`;
                    throw new Error(message);
                }
                const priceData = (data as { parsed?: Array<{ price?: PythPrice }> }).parsed?.[0]?.price;
                if (!priceData) {
                    throw new Error('Pyth proxy returned no parsed price.');
                }
                const computed = parseFloat(priceData.price) * Math.pow(10, priceData.expo);
                if (!Number.isFinite(computed) || computed <= 0) {
                    throw new Error('Pyth returned an invalid price.');
                }
                setPrice(computed);
                setError(null);
            } catch (cause: unknown) {
                setPrice(null);
                setError(cause instanceof Error ? cause.message : 'Pyth Hermes unavailable.');
            } finally {
                setLoading(false);
            }
        }
        fetchPrice();
        const interval = setInterval(fetchPrice, 10000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="mx-6 mb-6 p-4 bg-slate-900 border border-slate-800 rounded-xl flex items-center justify-between">
            <div className="flex items-center space-x-3">
                <span className={`w-2.5 h-2.5 rounded-full ${error ? 'bg-amber-500' : 'bg-emerald-500 animate-pulse'}`}></span>
                <div>
                    <h4 className="text-sm font-medium text-white">Pyth Hermes Feed (Equity.US.AAPL)</h4>
                    <p className="text-xs text-slate-400 font-mono">
                        {loading ? 'Retrying feed…' : error ? 'Offline / Retrying' : 'Trigger rebalancing otomatis aktif'}
                    </p>
                </div>
            </div>
            <div className="text-right">
                <span className="text-lg font-bold text-white font-mono">
                    {loading && price === null ? (
                        <span className="inline-block h-6 w-24 animate-pulse rounded bg-slate-700" />
                    ) : price === null ? 'Unavailable' : `$${price.toFixed(2)}`}
                </span>
            </div>
        </div>
    );
};