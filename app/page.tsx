'use client';

import { useMemo } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
import { clusterApiUrl } from '@solana/web3.js';

import { WalletConnect } from './src/components/WalletConnect.js';
import { VaultDashboard } from './src/components/VaultDashboard.js';
import { RebalanceStatus } from './src/components/RebalanceStatus.js';

import '@solana/wallet-adapter-react-ui/styles.css';

export default function Page() {
    const endpoint = useMemo(
        () => {
            const configured = process.env.NEXT_PUBLIC_RPC_URL?.trim();
            if (!configured) return clusterApiUrl('devnet');
            try {
                const url = new URL(configured);
                if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
                    return clusterApiUrl('devnet');
                }
                return url.toString().replace(/\/$/, '');
            } catch {
                return clusterApiUrl('devnet');
            }
        },
        [],
    );
    const wallets = useMemo(() => [new PhantomWalletAdapter(), new SolflareWalletAdapter()], []);

    return (
        <ConnectionProvider endpoint={endpoint}>
            <WalletProvider wallets={wallets} autoConnect>
                <WalletModalProvider>
                    <div className="min-h-screen bg-slate-950 font-sans">
                        <a
                            href="#main-content"
                            className="sr-only z-50 rounded-md bg-emerald-400 px-4 py-2 font-medium text-slate-950 focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
                        >
                            Skip to content
                        </a>
                        <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-slate-950/90 px-4 py-4 backdrop-blur sm:px-6">
                            <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-3">
                                        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/15 text-sm font-bold text-emerald-300 ring-1 ring-emerald-400/20">
                                            ASB
                                        </span>
                                        <div>
                                            <p className="truncate text-sm font-semibold tracking-wide text-white">
                                                Agent Stock Basket
                                            </p>
                                            <p className="text-xs text-slate-500">Automated Token-2022 vault</p>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex shrink-0 items-center gap-3">
                                    <span className="hidden rounded-full border border-blue-900/60 bg-blue-950/40 px-3 py-1.5 text-xs font-medium text-blue-300 sm:inline-flex">
                                        <span className="mr-2 h-1.5 w-1.5 self-center rounded-full bg-blue-400" />
                                        Solana Devnet
                                    </span>
                                    <WalletConnect />
                                </div>
                            </div>
                        </header>
                        <main id="main-content" className="mx-auto w-full max-w-7xl">
                            <RebalanceStatus />
                            <VaultDashboard />
                        </main>
                        <footer className="border-t border-slate-900 px-6 py-8">
                            <div className="mx-auto flex max-w-7xl flex-col gap-3 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
                                <p>ASB infrastructure for verified Pre-IPO asset baskets.</p>
                                <div className="flex gap-4">
                                    <span>Token-2022</span>
                                    <span>Pyth</span>
                                    <span>Meteora DBC</span>
                                </div>
                            </div>
                        </footer>
                    </div>
                </WalletModalProvider>
            </WalletProvider>
        </ConnectionProvider>
    );
}