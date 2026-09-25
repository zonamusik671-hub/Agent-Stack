import React, { FC, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { clusterApiUrl } from '@solana/web3.js';

// Mengimpor CSS standar wallet-adapter (Pastikan ini terpasang di proyek Anda)
import '@solana/wallet-adapter-react-ui/styles.css';

interface WalletConnectProps {
  children: React.ReactNode;
}

export const WalletConnectProvider: FC<WalletConnectProps> = ({ children }) => {
  // Menggunakan Devnet atau Mainnet-beta sesuai kebutuhan Hackathon
  const network = WalletAdapterNetwork.Devnet;
  const endpoint = useMemo(() => clusterApiUrl(network), [network]);

  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
    ],
    []
  );

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <div className="absolute top-4 right-4 z-50">
            <ClientWalletButton className="!bg-emerald-600 hover:!bg-emerald-700 !rounded-lg !font-sans !text-sm" />
          </div>
          {children}
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
};

export const WalletConnect: FC = () => (
  <div className="mx-6 flex justify-end">
    <ClientWalletButton />
  </div>
);

const ClientWalletButton = dynamic(
  () => import('@solana/wallet-adapter-react-ui').then((module) => module.WalletMultiButton),
  {
    ssr: false,
    loading: () => (
      <button
        type="button"
        disabled
        className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium opacity-70"
      >
        Select Wallet
      </button>
    ),
  },
);
