import test from 'node:test';
import assert from 'node:assert/strict';
import { Connection, Keypair, SystemProgram, Transaction, } from '@solana/web3.js';
import { configureMeteoraPool, getMeteoraSwapTransactionMetadata, setMeteoraSwapTransactionMetadata, simulateMeteoraSwapTransaction, validateLivePreStocksMint, } from '../src/utils/meteoraDbc.js';
const LOCAL_RPC = process.env.ANCHOR_PROVIDER_URL ?? 'http://127.0.0.1:8899';
test('simulates a registered Meteora swap transaction with slippage protection', {
    skip: process.env.RUN_ANCHOR_INTEGRATION !== '1',
}, async () => {
    const connection = new Connection(LOCAL_RPC, 'confirmed');
    const owner = Keypair.generate();
    const mockAsset = {
        address: owner.publicKey.toBase58(),
        product: 'Mock ASB',
        symbol: 'AAPLX',
        tokenPrice: 180,
        status: 'LIVE',
    };
    const pool = configureMeteoraPool({
        pool: owner.publicKey,
        baseMint: validateLivePreStocksMint(mockAsset),
        quoteMint: owner.publicKey,
        endpoint: LOCAL_RPC,
    });
    assert.equal(pool.pool.toBase58(), owner.publicKey.toBase58());
    const minimumAmountOut = 950000n;
    const airdrop = await connection.requestAirdrop(owner.publicKey, 1_000_000_000);
    await connection.confirmTransaction(airdrop, 'confirmed');
    const transaction = new Transaction().add(SystemProgram.transfer({
        fromPubkey: owner.publicKey,
        toPubkey: owner.publicKey,
        lamports: 0,
    }));
    const metadata = {
        amountIn: 1000000n,
        minimumAmountOut,
    };
    setMeteoraSwapTransactionMetadata(transaction, metadata);
    assert.equal(getMeteoraSwapTransactionMetadata(transaction)?.minimumAmountOut, 950000n);
    assert.equal(transaction.feePayer ?? null, null);
    const simulation = await simulateMeteoraSwapTransaction({
        connection,
        transaction,
        feePayer: owner.publicKey,
    });
    assert.ok(transaction.feePayer);
    assert.equal(String(transaction.feePayer), owner.publicKey.toBase58());
    assert.ok(transaction.recentBlockhash);
    assert.ok(simulation.err === null || simulation.err === undefined);
});
