import { sendAndConfirmRawTransaction, SystemProgram, Transaction, } from '@solana/web3.js';
import { createHash } from 'node:crypto';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
export async function persistClawpumpLaunchProof(proof, path) {
    if (!path.trim()) {
        throw new Error('Clawpump proof path is required.');
    }
    const serialized = `${JSON.stringify(proof)}\n`;
    const temporaryPath = `${path}.${process.pid}.${Date.now()}.tmp`;
    try {
        await mkdir(dirname(path), { recursive: true });
        await writeFile(temporaryPath, serialized, { encoding: 'utf8', flag: 'wx' });
        await rename(temporaryPath, path);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Unable to persist Clawpump launch proof: ${message}`);
    }
}
function validateNetwork(network) {
    if (!network.rpcEndpoint.trim()) {
        throw new Error('Clawpump RPC endpoint is required.');
    }
    new URL(network.rpcEndpoint);
    if (!network.chainId.trim()) {
        throw new Error('Clawpump chain ID is required.');
    }
}
export function createClawpumpFundingPlan(params) {
    validateNetwork(params.network);
    if (params.amount <= 0n) {
        throw new Error('Clawpump funding amount must be positive.');
    }
    if (!params.asset.trim()) {
        throw new Error('Clawpump funding asset is required.');
    }
    return { ...params };
}
export function createClawpumpLaunchPlan(params) {
    validateNetwork(params.network);
    if (!params.basketId.trim()) {
        throw new Error('Clawpump basket ID is required.');
    }
    return { ...params };
}
export function recordClawpumpLaunchProof(params) {
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
function getExecutionMode(mode) {
    const resolved = mode ?? (process.env.CLAWPUMP_MODE === 'live' ? 'live' : 'sandbox');
    if (resolved !== 'live' && resolved !== 'sandbox') {
        throw new Error(`Unsupported Clawpump execution mode: ${resolved}`);
    }
    return resolved;
}
function createSandboxSignature(kind, basketId, wallet) {
    return `sandbox-${createHash('sha256')
        .update(`${kind}:${basketId}:${wallet.toBase58()}`)
        .digest('hex')}`;
}
async function submitClawpumpTransaction(transaction, options) {
    if (!options.connection || !options.payer) {
        throw new Error('Live Clawpump execution requires a connection and payer.');
    }
    const { blockhash, lastValidBlockHeight } = await options.connection.getLatestBlockhash('confirmed');
    transaction.feePayer = options.payer.publicKey;
    transaction.recentBlockhash = blockhash;
    transaction.lastValidBlockHeight = lastValidBlockHeight;
    const simulation = await options.connection.simulateTransaction(transaction);
    if (simulation.value.err) {
        throw new Error(`Clawpump transaction simulation failed: ${JSON.stringify(simulation.value.err)}`);
    }
    transaction.partialSign(options.payer);
    try {
        return await sendAndConfirmRawTransaction(options.connection, transaction.serialize(), { commitment: 'confirmed' });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Clawpump transaction submission failed: ${message}`);
    }
}
export async function executeClawpumpFunding(plan, options = {}) {
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
    const transaction = new Transaction().add(SystemProgram.transfer({
        fromPubkey: payer.publicKey,
        toPubkey: plan.agentWallet,
        lamports: plan.amount <= BigInt(Number.MAX_SAFE_INTEGER)
            ? Number(plan.amount)
            : (() => {
                throw new Error('Live Clawpump funding amount exceeds JavaScript lamport range.');
            })(),
    }));
    const signature = await submitClawpumpTransaction(transaction, options);
    return { mode, signature, simulated: false };
}
export async function executeClawpumpLaunch(plan, options = {}) {
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
        throw new Error('Live Clawpump launch requires a transaction built by the official Clawpump SDK or CLI; ' +
            'refusing to broadcast an unverified instruction.');
    }
    const signature = await submitClawpumpTransaction(plan.transaction, options);
    return recordClawpumpLaunchProof({
        network: plan.network,
        basketId: plan.basketId,
        agentWallet: plan.agentWallet,
        signature,
    });
}
