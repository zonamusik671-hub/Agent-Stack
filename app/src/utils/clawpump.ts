import {
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmRawTransaction,
  SystemProgram,
  Transaction,
} from '@solana/web3.js';
import { createHash } from 'node:crypto';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export interface ClawpumpNetworkConfig {
  rpcEndpoint: string;
  chainId: string;
  launchProgramId?: PublicKey;
}

export interface ClawpumpFundingPlan {
  network: ClawpumpNetworkConfig;
  agentWallet: PublicKey;
  amount: bigint;
  asset: string;
}

export interface ClawpumpLaunchPlan {
  network: ClawpumpNetworkConfig;
  agentWallet: PublicKey;
  basketId: string;
  transaction?: Transaction;
}

export interface ClawpumpLaunchProof {
  network: string;
  basketId: string;
  agentWallet: string;
  signature: string;
  recordedAt: string;
}

export type ClawpumpExecutionMode = 'live' | 'sandbox';

export interface ClawpumpExecutionOptions {
  mode?: ClawpumpExecutionMode;
  connection?: Connection;
  payer?: Keypair;
}

export interface ClawpumpExecutionResult {
  mode: ClawpumpExecutionMode;
  signature: string;
  simulated: boolean;
}

export async function persistClawpumpLaunchProof(
  proof: ClawpumpLaunchProof,
  path: string,
): Promise<void> {
  if (!path.trim()) {
    throw new Error('Clawpump proof path is required.');
  }

  const serialized = `${JSON.stringify(proof)}\n`;
  const temporaryPath = `${path}.${process.pid}.${Date.now()}.tmp`;
  try {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(temporaryPath, serialized, { encoding: 'utf8', flag: 'wx' });
    await rename(temporaryPath, path);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to persist Clawpump launch proof: ${message}`);
  }
}

function validateNetwork(network: ClawpumpNetworkConfig): void {
  if (!network.rpcEndpoint.trim()) {
    throw new Error('Clawpump RPC endpoint is required.');
  }

  new URL(network.rpcEndpoint);

  if (!network.chainId.trim()) {
    throw new Error('Clawpump chain ID is required.');
  }
}

export function createClawpumpFundingPlan(params: {
  network: ClawpumpNetworkConfig;
  agentWallet: PublicKey;
  amount: bigint;
  asset: string;
}): ClawpumpFundingPlan {
  validateNetwork(params.network);

  if (params.amount <= 0n) {
    throw new Error('Clawpump funding amount must be positive.');
  }

  if (!params.asset.trim()) {
    throw new Error('Clawpump funding asset is required.');
  }

  return { ...params };
}

export function createClawpumpLaunchPlan(params: {
  network: ClawpumpNetworkConfig;
  agentWallet: PublicKey;
  basketId: string;
  transaction?: Transaction;
}): ClawpumpLaunchPlan {
  validateNetwork(params.network);

  if (!params.basketId.trim()) {
    throw new Error('Clawpump basket ID is required.');
  }

  return { ...params };
}

export function recordClawpumpLaunchProof(params: {
  network: ClawpumpNetworkConfig;
  basketId: string;
  agentWallet: PublicKey;
  signature: string;
  recordedAt?: string;
}): ClawpumpLaunchProof {
  validateNetwork(params.network);

  if (!params.basketId.trim() || !params.signature.trim()) {
    throw new Error('Clawpump basket ID and launch signature are required.');
  }

  return {
    network: params.network.chainId,
    basketId: params.basketId,
    agentWallet: params.agentWallet.toBase58(),
    signature: params.signature,
    recordedAt: params.recordedAt ?? new Date().toISOString(),
  };
}

function getExecutionMode(mode?: ClawpumpExecutionMode): ClawpumpExecutionMode {
  const resolved = mode ?? (process.env.CLAWPUMP_MODE === 'live' ? 'live' : 'sandbox');
  if (resolved !== 'live' && resolved !== 'sandbox') {
    throw new Error(`Unsupported Clawpump execution mode: ${resolved}`);
  }
  return resolved;
}

function createSandboxSignature(kind: string, basketId: string, wallet: PublicKey): string {
  return `sandbox-${createHash('sha256')
    .update(`${kind}:${basketId}:${wallet.toBase58()}`)
    .digest('hex')}`;
}

async function submitClawpumpTransaction(
  transaction: Transaction,
  options: ClawpumpExecutionOptions,
): Promise<string> {
  if (!options.connection || !options.payer) {
    throw new Error('Live Clawpump execution requires a connection and payer.');
  }

  const { blockhash, lastValidBlockHeight } =
    await options.connection.getLatestBlockhash('confirmed');
  transaction.feePayer = options.payer.publicKey;
  transaction.recentBlockhash = blockhash;
  transaction.lastValidBlockHeight = lastValidBlockHeight;

  const simulation = await options.connection.simulateTransaction(transaction);
  if (simulation.value.err) {
    throw new Error(`Clawpump transaction simulation failed: ${JSON.stringify(simulation.value.err)}`);
  }

  transaction.partialSign(options.payer);
  try {
    return await sendAndConfirmRawTransaction(
      options.connection,
      transaction.serialize(),
      { commitment: 'confirmed' },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Clawpump transaction submission failed: ${message}`);
  }
}

export async function executeClawpumpFunding(
  plan: ClawpumpFundingPlan,
  options: ClawpumpExecutionOptions = {},
): Promise<ClawpumpExecutionResult> {
  const mode = getExecutionMode(options.mode);
  if (mode === 'sandbox') {
    return {
      mode,
      signature: createSandboxSignature('funding', plan.asset, plan.agentWallet),
      simulated: true,
    };
  }

  const payer = options.payer;
  if (!payer) {
    throw new Error('Live Clawpump funding requires a payer.');
  }
  const transaction = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: payer.publicKey,
      toPubkey: plan.agentWallet,
      lamports: plan.amount <= BigInt(Number.MAX_SAFE_INTEGER)
        ? Number(plan.amount)
        : (() => {
            throw new Error('Live Clawpump funding amount exceeds JavaScript lamport range.');
          })(),
    }),
  );
  const signature = await submitClawpumpTransaction(transaction, options);
  return { mode, signature, simulated: false };
}

export async function executeClawpumpLaunch(
  plan: ClawpumpLaunchPlan,
  options: ClawpumpExecutionOptions = {},
): Promise<ClawpumpLaunchProof> {
  const mode = getExecutionMode(options.mode);
  
  if (mode === 'sandbox') {
    return recordClawpumpLaunchProof({
      network: plan.network,
      basketId: plan.basketId,
      agentWallet: plan.agentWallet,
      signature: createSandboxSignature('launch', plan.basketId, plan.agentWallet),
    });
  }

  if (!plan.network.launchProgramId) {
    throw new Error('Live Clawpump launch requires launchProgramId in network config.');
  }

  // Native Anchor Instruction Builder
  if (!plan.transaction) {
    throw new Error(
      'Live Clawpump launch requires a transaction built by the official Clawpump SDK or CLI; ' +
      'refusing to broadcast an unverified instruction.',
    );
  }

  const signature = await submitClawpumpTransaction(plan.transaction, options);

  return recordClawpumpLaunchProof({
    network: plan.network,
    basketId: plan.basketId,
    agentWallet: plan.agentWallet,
    signature,
  });
}