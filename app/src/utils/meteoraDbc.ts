import {
  DynamicBondingCurveClient,
  type SwapParams,
} from '@meteora-ag/dynamic-bonding-curve-sdk';
import {
  Connection,
  Keypair,
  PublicKey,
  SimulatedTransactionResponse,
  Transaction,
  sendAndConfirmRawTransaction,
} from '@solana/web3.js';
import BN from 'bn.js';
import type { PreStocksAsset } from './prestocksApi.js';

const DEFAULT_RPC_ENDPOINT = 'https://api.devnet.solana.com';

export const METEORA_DBC_RPC_ENDPOINT = process.env.SOLANA_RPC_ENDPOINT ?? DEFAULT_RPC_ENDPOINT;
export const DEVNET_METEORA_POOL = new PublicKey('Eo7WjKq67rjJ6h78ZxPkcf69BM55vi31Dx1MRe4V15aW');
export const DEVNET_PRESTOCKS_MINT = new PublicKey('CwLA34c1F3xJ7kR8DfhGjNk93nSaQ5PqM4k93nF5pump');

export interface MeteoraPoolConfig {
  pool: PublicKey;
  baseMint: PublicKey;
  quoteMint: PublicKey;
  endpoint: string;
}

export interface MeteoraSwapTestInput {
  asset: PreStocksAsset;
  pool: PublicKey;
  owner: PublicKey;
  amountIn: bigint;
  minimumAmountOut: bigint;
  swapBaseForQuote: boolean;
  referralTokenAccount?: PublicKey | null;
  endpoint?: string;
}

export interface MeteoraSwapTransactionMetadata {
  amountIn: bigint;
  minimumAmountOut: bigint;
  expectedAmountOut?: bigint;
}

const METEORA_SWAP_METADATA = Symbol('meteoraSwapMetadata');
type MeteoraSwapTransaction = Transaction & {
  [METEORA_SWAP_METADATA]?: MeteoraSwapTransactionMetadata;
};

export function getMeteoraSwapTransactionMetadata(
  transaction: Transaction,
): MeteoraSwapTransactionMetadata | undefined {
  return (transaction as MeteoraSwapTransaction)[METEORA_SWAP_METADATA];
}

export function setMeteoraSwapTransactionMetadata(
  transaction: Transaction,
  metadata: MeteoraSwapTransactionMetadata,
): void {
  (transaction as MeteoraSwapTransaction)[METEORA_SWAP_METADATA] = metadata;
}

export function configureMeteoraPool(params?: {
  pool?: PublicKey;
  baseMint?: PublicKey;
  quoteMint?: PublicKey;
  endpoint?: string;
}): MeteoraPoolConfig {
  const endpoint = params?.endpoint ?? METEORA_DBC_RPC_ENDPOINT;
  new URL(endpoint);

  return {
    pool: params?.pool ?? DEVNET_METEORA_POOL,
    baseMint: params?.baseMint ?? DEVNET_PRESTOCKS_MINT,
    quoteMint: params?.quoteMint ?? new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'), // Default USDC
    endpoint,
  };
}

export function validateLivePreStocksMint(asset: PreStocksAsset): PublicKey {
  if (asset.status !== 'LIVE') {
    throw new Error(`PreStocks asset ${asset.symbol} is not LIVE`);
  }

  try {
    return new PublicKey(asset.address);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid PreStocks mint for ${asset.symbol}: ${message}`);
  }
}

export function createMeteoraDbcClient(
  endpoint = METEORA_DBC_RPC_ENDPOINT,
): DynamicBondingCurveClient {
  return DynamicBondingCurveClient.create(new Connection(endpoint, 'confirmed'));
}

export async function buildMeteoraSwapTransaction(params: {
  asset: PreStocksAsset;
  pool: PublicKey;
  owner: PublicKey;
  amountIn: bigint;
  minimumAmountOut: bigint;
  swapBaseForQuote: boolean;
  referralTokenAccount?: PublicKey | null;
  endpoint?: string;
}): Promise<Transaction> {
  validateLivePreStocksMint(params.asset);
  if (params.amountIn <= 0n || params.minimumAmountOut < 0n) {
    throw new Error('Meteora swap amounts must be non-negative and amountIn must be positive');
  }

  const swapParams: SwapParams = {
    owner: params.owner,
    pool: params.pool,
    amountIn: new BN(params.amountIn.toString()),
    minimumAmountOut: new BN(params.minimumAmountOut.toString()),
    swapBaseForQuote: params.swapBaseForQuote,
    referralTokenAccount: params.referralTokenAccount ?? null,
  };

  const transaction = await createMeteoraDbcClient(params.endpoint).pool.swap(swapParams);
  setMeteoraSwapTransactionMetadata(transaction, {
    amountIn: params.amountIn,
    minimumAmountOut: params.minimumAmountOut,
  });
  return transaction;
}

export async function quoteMeteoraSwap(params: {
  pool: PublicKey;
  amountIn: bigint;
  swapBaseForQuote: boolean;
  slippageBps: number;
  endpoint?: string;
}): Promise<{ expectedAmountOut: bigint; minimumAmountOut: bigint }> {
  if (params.amountIn <= 0n) {
    throw new Error('Meteora quote amountIn must be greater than zero');
  }
  if (!Number.isInteger(params.slippageBps) || params.slippageBps < 0 || params.slippageBps > 10_000) {
    throw new Error('Meteora slippageBps must be an integer between 0 and 10000');
  }

  const client = createMeteoraDbcClient(params.endpoint);
  const virtualPool = await client.state.getPool(params.pool);
  if (!virtualPool) {
    throw new Error(`Meteora pool not found: ${params.pool.toBase58()}`);
  }

  const poolConfigAddress = (virtualPool as { config?: PublicKey }).config;
  if (!poolConfigAddress) {
    throw new Error(`Meteora pool has no config: ${params.pool.toBase58()}`);
  }
  const config = await client.state.getPoolConfig(poolConfigAddress);
  if (!config) {
    throw new Error(`Meteora pool config not found: ${poolConfigAddress.toBase58()}`);
  }

  const currentPoint = new BN(await client.connection.getSlot('confirmed'));
  const quote = client.pool.swapQuote({
    virtualPool,
    config,
    swapBaseForQuote: params.swapBaseForQuote,
    amountIn: new BN(params.amountIn.toString()),
    slippageBps: params.slippageBps,
    hasReferral: false,
    eligibleForFirstSwapWithMinFee: false,
    currentPoint,
  });
  const expectedAmountOut = BigInt(quote.outputAmount.toString());
  const minimumAmountOut = BigInt(quote.minimumAmountOut.toString());
  if (expectedAmountOut <= 0n || minimumAmountOut <= 0n || minimumAmountOut > expectedAmountOut) {
    throw new Error('Meteora returned an invalid swap quote');
  }

  return { expectedAmountOut, minimumAmountOut };
}

/**
 * Prepares the transaction used by a later Meteora swap test.
 * This function does not sign or submit a transaction.
 */
export async function prepareMeteoraSwapTest(
  params: MeteoraSwapTestInput,
): Promise<Transaction> {
  return buildMeteoraSwapTransaction(params);
}

export async function simulateMeteoraSwapTransaction(params: {
  connection: Connection;
  transaction: Transaction;
  feePayer: PublicKey;
}): Promise<SimulatedTransactionResponse> {
  const { connection, transaction, feePayer } = params;
  transaction.feePayer ??= feePayer;

  if (!transaction.recentBlockhash) {
    const { blockhash } = await connection.getLatestBlockhash('confirmed');
    transaction.recentBlockhash = blockhash;
  }

  const simulation = await connection.simulateTransaction(transaction);
  if (simulation.value.err) {
    throw new Error('Meteora swap simulation failed.');
  }

  return {
    ...simulation.value,
    err: simulation.value.err ?? null,
  };
}

export async function executeMeteoraSwap(params: {
  transaction: Transaction;
  connection: Connection;
  feePayer: Keypair;
}): Promise<string> {
  const { transaction, connection, feePayer } = params;
  await simulateMeteoraSwapTransaction({
    connection,
    transaction,
    feePayer: feePayer.publicKey,
  });
  transaction.partialSign(feePayer);

  try {
    return await sendAndConfirmRawTransaction(
      connection,
      transaction.serialize(),
      { commitment: 'confirmed' },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Meteora swap submission failed after simulation: ${message}`);
  }
}
