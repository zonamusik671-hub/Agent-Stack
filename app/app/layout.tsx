import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'Agent Stock Basket',
  description: 'Solana Vault for verified Pre-IPO assets',
  applicationName: 'Agent Stock Basket',
  keywords: ['Solana', 'Token-2022', 'PreStocks', 'Pyth', 'Meteora'],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="bg-slate-950">
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased">
        {children}
      </body>
    </html>
  );
}
