import * as anchor from '@coral-xyz/anchor';
import { readFileSync } from 'node:fs';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmRawTransaction,
} from '@solana/web3.js';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  TOKEN_2022_PROGRAM_ID,
} from '@solana/spl-token';
import {
  AnchorClient,
  deriveVaultAuthority,
  deriveVaultTokenAccount,
} from './anchorClient.js';
import { fetchLivePreStocksAssets, PreStocksAsset } from './prestocksApi.js';
import { AAPL_FEED_ID, getLatestPythPrice } from './pythConnection.js';
import {
  createClawpumpFundingPlan,
  createClawpumpLaunchPlan,
  executeClawpumpFunding,
  executeClawpumpLaunch,
  persistClawpumpLaunchProof,
  type ClawpumpLaunchProof,
} from './clawpump.js';

const SOLANA_RPC_ENDPOINT = process.env.SOLANA_RPC_URL ?? 'https://api.mainnet-beta.solana.com';
const connection = new Connection(SOLANA_RPC_ENDPOINT, 'confirmed');
const LOOP_INTERVAL_MS = 30_000;
const LOCK_TTL_MS = 120_000;
const DEFAULT_CLAWPUMP_FUNDING_LAMPORTS = 1n;

function getOrchestratorLockPath(vaultAccountAddress: string, idBasket: number): string {
  const safeVault = vaultAccountAddress.replace(/[^A-Za-z0-9_-]/g, '_');
  return join(
    process.env.ASB_LOCK_DIRECTORY?.trim() || tmpdir(),
    `asb-orchestrator-${safeVault}-${idBasket}.lock`,
  );
}

async function acquireDistributedLock(lockPath: string): Promise<(() => Promise<void>) | null> {
  try {
    await mkdir(lockPath);
    await writeFile(join(lockPath, 'owner'), `${process.pid}\n${Date.now()}\n`, { flag: 'wx' });
    return async () => {
      await rm(lockPath, { recursive: true, force: true });
    };
  } catch (error: unknown) {
    const code = error && typeof error === 'object' && 'code' in error
      ? (error as { code?: string }).code
      : undefined;
    if (code !== 'EEXIST') {
      throw new Error(`Unable to acquire orchestrator lock: ${String(error)}`);
    }
    try {
      if (Date.now() - (await stat(lockPath)).mtimeMs > LOCK_TTL_MS) {
        await rm(lockPath, { recursive: true, force: true });
      }
    } catch (staleLockError: unknown) {
      throw new Error(`Unable to inspect orchestrator lock: ${String(staleLockError)}`);
    }
    return null;
  }
}

async function retryCycle<T>(operation: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error: unknown) {
      lastError = error;
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, 500 * (2 ** (attempt - 1))));
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export interface RebalanceDecisionInput {
  liveStockPrice: number;
  threshold: number;
}

export function shouldRebalance({
  liveStockPrice,
  threshold,
}: RebalanceDecisionInput): boolean {
  if (!Number.isFinite(liveStockPrice) || !Number.isFinite(threshold) || threshold <= 0) {
    throw new Error('Rebalance decision requires finite positive price and threshold values.');
  }

  return liveStockPrice < threshold;
}

function getTradingThreshold(): number {
  const configuredThreshold = process.env.ASB_TRADING_THRESHOLD?.trim();
  if (!configuredThreshold) {
    return 180;
  }

  const threshold = Number(configuredThreshold);
  if (!Number.isFinite(threshold) || threshold <= 0) {
    throw new Error('ASB_TRADING_THRESHOLD must be a finite positive number.');
  }

  return threshold;
}

function loadAgentKeypair(): Keypair {
  const keypairPath =
    process.env.AGENT_KEYPAIR_PATH ?? `${homedir()}/.config/solana/id.json`;

  try {
    const secretKey = JSON.parse(readFileSync(keypairPath, 'utf8')) as unknown;
    if (
      !Array.isArray(secretKey) ||
      secretKey.some((value) => !Number.isInteger(value) || value < 0 || value > 255)
    ) {
      throw new Error('Keypair file must contain a JSON byte array.');
    }

    return Keypair.fromSecretKey(Uint8Array.from(secretKey));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to load agent keypair from ${keypairPath}: ${message}`);
  }
}

function getClawpumpFundingAmount(): bigint {
    const configured = process.env.CLAWPUMP_FUNDING_LAMPORTS?.trim();
    if (!configured) return DEFAULT_CLAWPUMP_FUNDING_LAMPORTS;
    try {
      const amount = BigInt(configured);
      if (amount <= 0n) throw new Error('must be positive');
      return amount;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Invalid CLAWPUMP_FUNDING_LAMPORTS: ${message}`);
    }
  }

async function executeClawpumpAfterRebalance(
    agentKeypair: Keypair,
    basketId: number,
  ): Promise<ClawpumpLaunchProof> {
    const rpcEndpoint = process.env.CLAWPUMP_RPC_ENDPOINT?.trim() || SOLANA_RPC_ENDPOINT;
    const chainId = process.env.CLAWPUMP_CHAIN_ID?.trim() || 'solana-localnet';
    const network = { rpcEndpoint, chainId };
    const basket = String(basketId);
    const mode = process.env.CLAWPUMP_MODE === 'live' ? 'live' : 'sandbox';
    const fundingPlan = createClawpumpFundingPlan({
      network,
      agentWallet: agentKeypair.publicKey,
      amount: getClawpumpFundingAmount(),
      asset: process.env.CLAWPUMP_FUNDING_ASSET?.trim() || 'SOL',
    });
    const launchPlan = createClawpumpLaunchPlan({
      network,
      agentWallet: agentKeypair.publicKey,
      basketId: basket,
    });

    const options = { mode: mode as 'live' | 'sandbox', connection, payer: agentKeypair };
    await executeClawpumpFunding(fundingPlan, options);
    const proof = await executeClawpumpLaunch(launchPlan, options);
    const proofPath = process.env.CLAWPUMP_PROOF_PATH?.trim()
      || join(tmpdir(), `asb-clawpump-proof-${agentKeypair.publicKey.toBase58()}-${basket}.json`);
    await persistClawpumpLaunchProof(proof, proofPath);
    return proof;
}

export async function runAgentOrchestrator(vaultAccountAddress: string, idBasket: number) {
  console.log(`[ASB Orchestrator] Menjalankan Agen AI untuk Vault: ${vaultAccountAddress} (basket ${idBasket})`);

  const runCycle = async (): Promise<void> => {
    const releaseLock = await acquireDistributedLock(
      getOrchestratorLockPath(vaultAccountAddress, idBasket),
    );
    if (!releaseLock) {
      console.log('[Orchestrator] Siklus sebelumnya masih berjalan; siklus ini dilewati.');
      return;
    }

    try {
      const liveStockPrice = await retryCycle(() => getLatestPythPrice(AAPL_FEED_ID));
      console.log(`[Pyth Oracle] Harga Real-Time AAPL: $${liveStockPrice.toFixed(2)}`);

      const preStocksAssets: PreStocksAsset[] = await retryCycle(() => fetchLivePreStocksAssets());
      const targetAsset = preStocksAssets.find(
        (asset) => asset.symbol === 'AAPL' || asset.symbol === 'AAPLX',
      );

      if (!targetAsset || targetAsset.status !== 'LIVE') {
        console.error('[PreStocks] Aset target tidak LIVE; semua transaksi dihentikan.');
        return;
      }

      const tradingThreshold = getTradingThreshold();
      if (shouldRebalance({ liveStockPrice, threshold: tradingThreshold })) {
        console.log(`🚨 [AI DECISION] Harga $${liveStockPrice.toFixed(2)} di bawah ambang batas $${tradingThreshold}!`);
        console.log('⚡ Menginisialisasi pengiriman instruksi execute_rebalance ke program Anchor Rust...');

        const vaultPubkey = new PublicKey(vaultAccountAddress);
        let rwaMintPubkey: PublicKey;
        try {
          rwaMintPubkey = new PublicKey(targetAsset.address);
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          throw new Error(`Mint address PreStocks tidak valid: ${message}`);
        }
        const amountToRebalance = BigInt(1000000);
        const tokenDecimals = 6;

        const rebalanceSignature = await sendOnChainRebalance(
          vaultPubkey,
          rwaMintPubkey,
          amountToRebalance,
          tokenDecimals,
          idBasket,
        );
        if (!rebalanceSignature) {
          throw new Error('Rebalance completed without a transaction signature.');
        }
        const proof = await executeClawpumpAfterRebalance(loadAgentKeypair(), idBasket);
        console.log(`[Clawpump] Launch proof recorded: ${proof.signature}`);
      } else {
        console.log('[AI DECISION] Kondisi portofolio aman. Tidak diperlukan tindakan alokasi.');
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[Orchestrator Error] Siklus gagal-closed; tidak ada transaksi dikirim:', message);
    } finally {
      await releaseLock();
    }
  };

  await runCycle();
  return setInterval(() => {
    void runCycle();
  }, LOOP_INTERVAL_MS);
}

async function sendOnChainRebalance(
  vaultPubkey: PublicKey,
  rwaMintPubkey: PublicKey,
  amount: bigint,
  decimals: number,
  expectedBasketId: number,
) {
  if (amount <= 0n) {
    throw new Error('Rebalance amount must be greater than zero.');
  }
  if (!Number.isInteger(decimals) || decimals < 0) {
    throw new Error('Token decimals must be a non-negative integer.');
  }

  const agentKeypair = loadAgentKeypair();
  const wallet: anchor.Wallet = {
    payer: agentKeypair,
    publicKey: agentKeypair.publicKey,
    signTransaction: async (transaction) => {
      if (transaction instanceof anchor.web3.Transaction) {
        transaction.partialSign(agentKeypair);
      } else {
        transaction.sign([agentKeypair]);
      }
      return transaction;
    },
    signAllTransactions: async (transactions) => {
      transactions.forEach((transaction) => {
        if (transaction instanceof anchor.web3.Transaction) {
          transaction.partialSign(agentKeypair);
        } else {
          transaction.sign([agentKeypair]);
        }
      });
      return transactions;
    },
  };
  const client = new AnchorClient(connection, wallet);
  const [vaultAuthority] = deriveVaultAuthority(vaultPubkey);
  const [vaultTokenAccount] = deriveVaultTokenAccount(vaultPubkey);
  const destinationTokenAccount = getAssociatedTokenAddressSync(
    rwaMintPubkey,
    agentKeypair.publicKey,
    false,
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );

  try {
    const transaction = await client.program.methods
      .executeRebalance(
        new anchor.BN(amount.toString()),
        new anchor.BN(expectedBasketId),
      )
      .accounts({
        signerAgent: agentKeypair.publicKey,
        vault: vaultPubkey,
        vaultAuthority,
        vaultTokenAccount,
        destinationTokenAccount,
        vaultMint: rwaMintPubkey,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .transaction();
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    transaction.feePayer = agentKeypair.publicKey;
    transaction.recentBlockhash = blockhash;
    transaction.lastValidBlockHeight = lastValidBlockHeight;
    transaction.partialSign(agentKeypair);

    const signature = await sendAndConfirmRawTransaction(
      connection,
      transaction.serialize(),
      { commitment: 'confirmed' },
    );
    console.log(`[RPC] Rebalance confirmed: ${signature}`);
    return signature;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Rebalance transaction failed: ${message}`);
  }
}
