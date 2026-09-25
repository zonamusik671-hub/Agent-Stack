'use client';

import { useCallback, useEffect, useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { PublicKey } from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';
import { AAPL_FEED_ID, getLatestPythPrice } from '../utils/pythConnection.js';
import { fetchLivePreStocksAssets, type PreStocksAsset } from '../utils/prestocksApi.js';
import {
  AnchorClient,
  deriveVault,
  deriveVaultAuthority,
  deriveVaultTokenAccount,
} from '../utils/anchorClient.js';

type DashboardStatus = 'idle' | 'loading' | 'ready' | 'error';

export function VaultDashboard() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { publicKey } = wallet;
  const [basketId, setBasketId] = useState(42);
  const [price, setPrice] = useState<number | null>(null);
  const [assets, setAssets] = useState<PreStocksAsset[]>([]);
  const [status, setStatus] = useState<DashboardStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [depositAmount, setDepositAmount] = useState('');
  const [vaultBalance, setVaultBalance] = useState<string | null>(null);
  const [vaultBalanceLoading, setVaultBalanceLoading] = useState(false);
  const [depositStatus, setDepositStatus] = useState<'idle' | 'loading' | 'confirmed' | 'error'>('idle');
  const [signatureHash, setSignatureHash] = useState<string | null>(null);
  const [depositError, setDepositError] = useState<string | null>(null);
  const [vaultInitialized, setVaultInitialized] = useState(false);
  const [initializeStatus, setInitializeStatus] = useState<'idle' | 'loading' | 'confirmed' | 'error'>('idle');
  const [initializeError, setInitializeError] = useState<string | null>(null);
  const [rpcHealthy, setRpcHealthy] = useState<boolean | null>(null);

  const vaultAddress = publicKey
    ? deriveVault(publicKey, basketId)[0].toBase58()
    : null;

  const refreshVaultBalance = useCallback(async () => {
    if (!publicKey || !vaultAddress) {
      setVaultBalance(null);
      return;
    }
    const mintValue = process.env.NEXT_PUBLIC_USDC_MINT ?? process.env.NEXT_PUBLIC_TOKEN_2022_MINT;
    if (!mintValue) {
      setVaultBalance(null);
      return;
    }
    try {
      setVaultBalanceLoading(true);
      const mint = new PublicKey(mintValue);
      const [vault] = deriveVault(publicKey, basketId);
      const [tokenAccount] = deriveVaultTokenAccount(vault);
      const balance = await connection.getTokenAccountBalance(tokenAccount, 'confirmed');
      setVaultBalance(balance.value.uiAmountString ?? null);
    } catch (cause: unknown) {
      setVaultBalance(null);
    } finally {
      setVaultBalanceLoading(false);
    }
  }, [basketId, connection, publicKey, vaultAddress]);

  const refreshVaultState = useCallback(async () => {
    if (!publicKey) {
      setVaultInitialized(false);
      return;
    }
    const [vault] = deriveVault(publicKey, basketId);
    setVaultInitialized((await connection.getAccountInfo(vault, 'confirmed')) !== null);
  }, [basketId, connection, publicKey]);

  const validateTokenAccount = useCallback(async (address: PublicKey, mint: PublicKey) => {
    const account = await connection.getParsedAccountInfo(address, 'confirmed');
    if (!account.value || !account.value.owner.equals(TOKEN_2022_PROGRAM_ID)) {
      throw new Error(`Token-2022 account not found: ${address.toBase58()}`);
    }
    const parsed = account.value.data;
    if ('parsed' in parsed && parsed.parsed?.info?.mint !== mint.toBase58()) {
      throw new Error(`Token account mint mismatch: expected ${mint.toBase58()}.`);
    }
  }, [connection]);

  const refreshData = useCallback(async () => {
    if (!publicKey) {
      setStatus('idle');
      setPrice(null);
      setAssets([]);
      return;
    }

    setStatus('loading');
    setError(null);
    try {
      await connection.getLatestBlockhash('confirmed');
      setRpcHealthy(true);
      const [latestPrice, liveAssets] = await Promise.all([
        getLatestPythPrice(AAPL_FEED_ID),
        fetchLivePreStocksAssets(),
      ]);
      setPrice(latestPrice);
      setAssets(liveAssets);
      setStatus('ready');
    } catch (cause: unknown) {
      setRpcHealthy(false);
      setStatus('error');
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [connection, publicKey]);

  useEffect(() => {
    void refreshData();
    void refreshVaultBalance();
    void refreshVaultState();
  }, [refreshData, refreshVaultBalance, refreshVaultState]);

  const initializeVault = useCallback(async () => {
    if (!publicKey || !wallet.signTransaction || !wallet.signAllTransactions) {
      setInitializeError('Connect a wallet that can sign transactions before initializing the vault.');
      setInitializeStatus('error');
      return;
    }
    const mintValue = process.env.NEXT_PUBLIC_USDC_MINT ?? process.env.NEXT_PUBLIC_TOKEN_2022_MINT;
    if (!mintValue) {
      setInitializeError('NEXT_PUBLIC_USDC_MINT or NEXT_PUBLIC_TOKEN_2022_MINT is not configured.');
      setInitializeStatus('error');
      return;
    }
    setInitializeStatus('loading');
    setInitializeError(null);
    try {
      const mint = new PublicKey(mintValue);
      const client = new AnchorClient(connection, {
        publicKey,
        signTransaction: wallet.signTransaction,
        signAllTransactions: wallet.signAllTransactions,
      });
      const signature = await client.initializeVault({
        basketId,
        aiAgent: publicKey,
        maxRebalanceAmount: new anchor.BN(1_000_000),
        minReserveAmount: new anchor.BN(0),
        vaultMint: mint,
      });
      await connection.confirmTransaction(signature, 'confirmed');
      setVaultInitialized(true);
      setInitializeStatus('confirmed');
      setSignatureHash(signature);
      await refreshVaultBalance();
    } catch (cause: unknown) {
      setInitializeStatus('error');
      setInitializeError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [
    basketId,
    connection,
    publicKey,
    refreshVaultBalance,
    wallet.signAllTransactions,
    wallet.signTransaction,
  ]);

  const depositUsdc = useCallback(async () => {
    if (!publicKey) {
      setDepositError('Connect a wallet before depositing USDC.');
      setDepositStatus('error');
      return;
    }
    if (!wallet.signTransaction || !wallet.signAllTransactions) {
      setDepositError('The connected wallet cannot sign transactions.');
      setDepositStatus('error');
      return;
    }
    if (!vaultInitialized) {
      setDepositError('Initialize the vault before depositing.');
      setDepositStatus('error');
      return;
    }
    const mintValue = process.env.NEXT_PUBLIC_USDC_MINT ?? process.env.NEXT_PUBLIC_TOKEN_2022_MINT;
    if (!mintValue) {
      setDepositError('NEXT_PUBLIC_USDC_MINT or NEXT_PUBLIC_TOKEN_2022_MINT is not configured.');
      setDepositStatus('error');
      return;
    }
    const parsedAmount = Number(depositAmount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setDepositError('Enter a USDC amount greater than zero.');
      setDepositStatus('error');
      return;
    }

    setDepositStatus('loading');
    setSignatureHash(null);
    setDepositError(null);
    try {
      const mint = new PublicKey(mintValue);
      const [vault] = deriveVault(publicKey, basketId);
      const [vaultPda] = deriveVaultAuthority(vault);
      const userTokenAccount = getAssociatedTokenAddressSync(
        mint,
        publicKey,
        false,
        TOKEN_2022_PROGRAM_ID,
      );
      const [vaultTokenAccount] = deriveVaultTokenAccount(vault);
      await validateTokenAccount(userTokenAccount, mint);
      const vaultTokenInfo = await connection.getAccountInfo(vaultTokenAccount, 'confirmed');
      if (!vaultTokenInfo || !vaultTokenInfo.owner.equals(TOKEN_2022_PROGRAM_ID)) {
        throw new Error('Vault Token-2022 PDA is not initialized or has an invalid owner.');
      }
      const amount = new anchor.BN(Math.round(parsedAmount * 1_000_000));
      const client = new AnchorClient(connection, {
        publicKey,
        signTransaction: wallet.signTransaction,
        signAllTransactions: wallet.signAllTransactions,
      });
      const signature = await client.depositUsdc({
        vault,
        vaultPda,
        userTokenAccount,
        vaultTokenAccount,
        vaultMint: mint,
        amount,
      });
      await connection.confirmTransaction(signature, 'confirmed');
      setSignatureHash(signature);
      setDepositStatus('confirmed');
      await refreshVaultBalance();
    } catch (cause: unknown) {
      setDepositStatus('error');
      setDepositError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [
    basketId,
    connection,
    depositAmount,
    publicKey,
    refreshVaultBalance,
    validateTokenAccount,
    vaultInitialized,
    wallet.signAllTransactions,
    wallet.signTransaction,
  ]);

  return (
    <section className="mx-auto max-w-5xl px-6 pb-16 pt-24 text-slate-100">
      <div className="mb-8">
        <p className="text-sm font-medium uppercase tracking-[0.25em] text-emerald-400">
          Agent Stock Basket
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">
          Retail access to verified Pre-IPO assets
        </h1>
        <p className="mt-3 max-w-2xl text-slate-400">
          Pyth prices, PreStocks status, and the Anchor Vault are shown together.
          Swap execution remains explicit and requires a configured Meteora pool.
        </p>
      </div>

      {!publicKey ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-6 text-slate-300">
          Connect a wallet to derive your Vault PDA and load live data.
        </div>
      ) : (
        <>
          <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatusPill label="Cluster" value="Devnet" tone="blue" />
            <StatusPill
              label="RPC"
              value={rpcHealthy === false ? 'Unavailable' : rpcHealthy === true ? 'Connected' : 'Checking…'}
              tone={rpcHealthy === false ? 'red' : rpcHealthy === true ? 'green' : 'slate'}
            />
            <StatusPill label="Pyth" value={price === null ? 'Unavailable' : 'Live'} tone={price === null ? 'amber' : 'green'} />
            <StatusPill label="PreStocks" value={status === 'error' ? 'Unavailable' : `${assets.length} LIVE`} tone={status === 'error' ? 'amber' : 'green'} />
            <StatusPill
              label="Meteora DBC"
              value={process.env.NEXT_PUBLIC_METEORA_DBC_POOL ? 'Configured' : 'Not configured'}
              tone={process.env.NEXT_PUBLIC_METEORA_DBC_POOL ? 'green' : 'amber'}
            />
            <StatusPill label="Clawpump" value="Approval required" tone="slate" />
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <Metric label="Wallet" value={shorten(publicKey.toBase58())} />
            <Metric label="Vault PDA" value={vaultAddress ? shorten(vaultAddress) : '—'} />
            <Metric label="RPC" value={shorten(connection.rpcEndpoint)} />
          </div>

          <section className="mt-6">
            <div className="mb-3 flex items-end justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                  Integrated systems
                </p>
                <h2 className="mt-1 text-xl font-semibold">ASB control plane</h2>
              </div>
              <span className="text-xs text-slate-500">Fail-closed by default</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <SystemCard
                name="Anchor Vault"
                description="Custody, initialization, deposits, and agent authorization."
                status={vaultInitialized ? 'Ready' : 'Initialize required'}
                tone={vaultInitialized ? 'green' : 'amber'}
              />
              <SystemCard
                name="Token-2022"
                description="PDA-owned vault token account and mint validation."
                status={vaultInitialized ? 'Protected' : 'Waiting for vault'}
                tone={vaultInitialized ? 'green' : 'slate'}
              />
              <SystemCard
                name="Pyth Network"
                description="Oracle price trigger with server-side Hermes fallback."
                status={price === null ? 'Offline / retrying' : 'Live'}
                tone={price === null ? 'amber' : 'green'}
              />
              <SystemCard
                name="PreStocks"
                description="Only assets with status LIVE and valid mints are eligible."
                status={status === 'error' ? 'Unavailable' : `${assets.length} LIVE assets`}
                tone={status === 'error' ? 'amber' : 'green'}
              />
              <SystemCard
                name="Meteora DBC"
                description="Quote, simulation, and minimumAmountOut slippage guard."
                status={process.env.NEXT_PUBLIC_METEORA_DBC_POOL ? 'Pool configured' : 'Not configured'}
                tone={process.env.NEXT_PUBLIC_METEORA_DBC_POOL ? 'green' : 'slate'}
              />
              <SystemCard
                name="Credit & yield"
                description="Borrowing, liquidation, and yield actions require oracle accounts."
                status="On-chain setup required"
                tone="slate"
              />
              <SystemCard
                name="Clawpump"
                description="Official SDK/CLI transaction only; placeholder instructions rejected."
                status="Approval required"
                tone="slate"
              />
            </div>
          </section>

          <div className="mt-6 flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/70 p-5">
            <div>
              <p className="text-sm text-slate-400">Tracked AAPL price</p>
              <p className="mt-1 text-3xl font-semibold">
                {price === null ? '—' : `$${price.toFixed(2)}`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void refreshData()}
              disabled={status === 'loading'}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {status === 'loading' ? 'Refreshing…' : 'Refresh data'}
            </button>
          </div>

          <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900/70 p-5">
            <h2 className="text-lg font-semibold">Vault lifecycle</h2>
            <p className="mt-1 text-sm text-slate-400">
              {vaultInitialized ? 'Vault initialized and ready for Token-2022 deposits.' : 'Initialize this basket vault before depositing.'}
            </p>
            {!vaultInitialized && (
              <button
                type="button"
                onClick={() => void initializeVault()}
                disabled={initializeStatus === 'loading'}
                className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {initializeStatus === 'loading' ? 'Initializing…' : 'Initialize Vault'}
              </button>
            )}
            {initializeStatus === 'confirmed' && (
              <p className="mt-3 text-sm text-emerald-400">Vault initialized successfully.</p>
            )}
            {initializeError && <p className="mt-3 text-sm text-rose-400">{initializeError}</p>}
          </div>

          <section className="mt-6 grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold">Credit & yield</h2>
                  <p className="mt-1 text-sm text-slate-400">
                    Borrowing and liquidation stay disabled until a verified Pyth
                    price account and loan mint are configured.
                  </p>
                </div>
                <span className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-400">
                  Not configured
                </span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <ActionButton label="Configure borrowing" disabled />
                <ActionButton label="Open borrow position" disabled />
                <ActionButton label="Claim yield" disabled />
                <ActionButton label="Liquidate position" disabled />
              </div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold">Agent execution</h2>
                  <p className="mt-1 text-sm text-slate-400">
                    Pyth → decision → Anchor rebalance → Meteora. Every
                    broadcast requires a configured account and wallet approval.
                  </p>
                </div>
                <span className="rounded-full border border-blue-900/60 bg-blue-950/30 px-3 py-1 text-xs text-blue-300">
                  Guarded
                </span>
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <ActionButton label="Refresh all systems" onClick={() => void refreshData()} disabled={status === 'loading'} />
                <ActionButton label="Simulate rebalance" disabled />
                <ActionButton label="Open Meteora quote" disabled={!process.env.NEXT_PUBLIC_METEORA_DBC_POOL} />
              </div>
            </div>
          </section>

          <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900/70 p-5">
            <h2 className="text-lg font-semibold">Vault USDC deposit</h2>
            <p className="mt-1 text-sm text-slate-400">
              Deposits use Token-2022 and require wallet confirmation.
            </p>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <input
                type="number"
                min="0"
                step="0.000001"
                value={depositAmount}
                onChange={(event) => setDepositAmount(event.target.value)}
                disabled={!vaultInitialized || depositStatus === 'loading'}
                placeholder="Amount in USDC"
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500"
              />
              <button
                type="button"
                onClick={() => void depositUsdc()}
                disabled={!vaultInitialized || depositStatus === 'loading'}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {depositStatus === 'loading' ? 'Confirming…' : 'Deposit USDC'}
              </button>
            </div>
            <p className="mt-3 text-sm text-slate-400">
              Vault balance: {vaultBalanceLoading ? (
                <span className="inline-block h-4 w-20 animate-pulse rounded bg-slate-700 align-middle" />
              ) : vaultBalance === null ? 'Not available' : `${vaultBalance} USDC`}
            </p>
            {depositStatus === 'confirmed' && signatureHash && (
              <a
                className="mt-2 block break-all text-sm text-emerald-400 underline decoration-emerald-700 underline-offset-4"
                href={`https://explorer.solana.com/tx/${signatureHash}?cluster=devnet`}
                target="_blank"
                rel="noreferrer"
              >
                Confirmed on Devnet: {signatureHash}
              </a>
            )}
            {depositError && (
              <p className="mt-2 break-words text-sm text-rose-400">{depositError}</p>
            )}
          </div>

          {error && (
            <p className="mt-4 rounded-lg border border-amber-900/50 bg-amber-950/30 p-4 text-sm text-amber-300">
              {error}
            </p>
          )}

          <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900/70 p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">LIVE PreStocks assets</h2>
              <span className="text-sm text-slate-400">{assets.length} assets</span>
            </div>
            {assets.length === 0 ? (
              <p className="mt-4 text-sm text-slate-400">
                No asset is eligible. The API response must include status LIVE and a valid mint address.
              </p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[30rem] text-left text-sm">
                  <thead className="border-b border-slate-800 text-xs uppercase tracking-wider text-slate-500">
                    <tr><th className="px-3 py-3">Asset</th><th className="px-3 py-3">Price</th><th className="px-3 py-3">Mint</th><th className="px-3 py-3">Status</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {assets.map((asset) => (
                      <tr key={asset.address}>
                        <td className="px-3 py-3 font-medium text-slate-200">{asset.product}</td>
                        <td className="px-3 py-3 font-mono text-slate-300">${asset.tokenPrice.toFixed(2)}</td>
                        <td className="px-3 py-3 font-mono text-xs text-slate-500">{shorten(asset.address)}</td>
                        <td className="px-3 py-3"><span className="rounded-full bg-emerald-950/50 px-2 py-1 text-xs text-emerald-300">LIVE</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-5">
      <p className="text-xs uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-2 truncate font-mono text-sm text-slate-200">{value}</p>
    </div>
  );
}

function StatusPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'blue' | 'green' | 'amber' | 'red' | 'slate';
}) {
  const colors = {
    blue: 'border-blue-900/60 bg-blue-950/30 text-blue-300',
    green: 'border-emerald-900/60 bg-emerald-950/30 text-emerald-300',
    amber: 'border-amber-900/60 bg-amber-950/30 text-amber-300',
    red: 'border-rose-900/60 bg-rose-950/30 text-rose-300',
    slate: 'border-slate-800 bg-slate-900/70 text-slate-300',
  };
  return (
    <div className={`rounded-lg border px-4 py-3 ${colors[tone]}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wider opacity-70">{label}</p>
      <p className="mt-1 text-sm font-medium">{value}</p>
    </div>
  );
}

function SystemCard({
  name,
  description,
  status,
  tone,
}: {
  name: string;
  description: string;
  status: string;
  tone: 'green' | 'amber' | 'slate';
}) {
  const colors = {
    green: 'bg-emerald-400',
    amber: 'bg-amber-400',
    slate: 'bg-slate-500',
  };
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${colors[tone]}`} />
        <h3 className="font-medium text-slate-100">{name}</h3>
      </div>
      <p className="mt-2 min-h-10 text-xs leading-5 text-slate-500">{description}</p>
      <p className="mt-3 text-xs font-medium text-slate-300">{status}</p>
    </div>
  );
}

function ActionButton({
  label,
  disabled = false,
  onClick,
}: {
  label: string;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-medium text-slate-200 transition hover:border-emerald-600 hover:text-emerald-300 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {label}
    </button>
  );
}

function shorten(value: string): string {
  return value.length > 18 ? `${value.slice(0, 8)}…${value.slice(-8)}` : value;
}
