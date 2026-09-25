import test from 'node:test';
import assert from 'node:assert/strict';
import * as anchor from '@coral-xyz/anchor';
import { createAssociatedTokenAccount, createMint, getAccount, mintTo, TOKEN_2022_PROGRAM_ID, } from '@solana/spl-token';
import { Connection, Keypair } from '@solana/web3.js';
import { AGENT_STOCK_BASKET_PROGRAM_ID, AnchorClient, deriveVault, deriveVaultAuthority, deriveVaultTokenAccount, } from '../src/utils/anchorClient.js';
class KeypairWallet {
    payer;
    constructor(payer) {
        this.payer = payer;
    }
    get publicKey() {
        return this.payer.publicKey;
    }
    async signTransaction(tx) {
        if (tx instanceof anchor.web3.Transaction)
            tx.partialSign(this.payer);
        else
            tx.sign([this.payer]);
        return tx;
    }
    async signAllTransactions(txs) {
        txs.forEach((tx) => {
            if (tx instanceof anchor.web3.Transaction)
                tx.partialSign(this.payer);
            else
                tx.sign([this.payer]);
        });
        return txs;
    }
}
test('rejects an execute_rebalance signed by an unauthorized agent', { skip: process.env.RUN_ANCHOR_INTEGRATION !== '1' }, async () => {
    const endpoint = process.env.ANCHOR_PROVIDER_URL ?? 'http://127.0.0.1:8899';
    const connection = new Connection(endpoint, 'confirmed');
    const owner = Keypair.generate();
    const unauthorized = Keypair.generate();
    for (const recipient of [owner, unauthorized]) {
        const signature = await connection.requestAirdrop(recipient.publicKey, 2e9);
        await connection.confirmTransaction(signature, 'confirmed');
    }
    const ownerClient = new AnchorClient(connection, new KeypairWallet(owner));
    const mint = await createMint(connection, owner, owner.publicKey, null, 6, undefined, undefined, TOKEN_2022_PROGRAM_ID);
    const basketId = Math.floor(Date.now() / 1000);
    const vault = deriveVault(owner.publicKey, basketId)[0];
    const [vaultTokenAccount] = deriveVaultTokenAccount(vault);
    await ownerClient.initializeVault({
        basketId,
        aiAgent: owner.publicKey,
        maxRebalanceAmount: new anchor.BN(100),
        minReserveAmount: new anchor.BN(0),
        vaultMint: mint,
    });
    const unauthorizedClient = new AnchorClient(connection, new KeypairWallet(unauthorized));
    await assert.rejects(unauthorizedClient.executeRebalance({
        vault,
        vaultTokenAccount,
        // Account constraints pass; the handler must reject the signer first.
        destinationTokenAccount: vaultTokenAccount,
        vaultMint: mint,
        amount: new anchor.BN(1),
        expectedBasketId: basketId,
    }), (error) => String(error).includes('UnauthorizedAgent') ||
        String(error).includes('6003'));
    assert.equal(AGENT_STOCK_BASKET_PROGRAM_ID.toBase58(), ownerClient.program.programId.toBase58());
});
test('deposits Token-2022 USDC and executes an authorized rebalance', { skip: process.env.RUN_ANCHOR_INTEGRATION !== '1' }, async () => {
    const endpoint = process.env.ANCHOR_PROVIDER_URL ?? 'http://127.0.0.1:8899';
    const connection = new Connection(endpoint, 'confirmed');
    const owner = Keypair.generate();
    const amount = 1000000n;
    const rebalanceAmount = 400000n;
    const airdropSignature = await connection.requestAirdrop(owner.publicKey, 2e9);
    await connection.confirmTransaction(airdropSignature, 'confirmed');
    const wallet = new KeypairWallet(owner);
    const client = new AnchorClient(connection, wallet);
    const mint = await createMint(connection, owner, owner.publicKey, null, 6, undefined, undefined, TOKEN_2022_PROGRAM_ID);
    const userTokenAccount = await createAssociatedTokenAccount(connection, owner, mint, owner.publicKey, undefined, TOKEN_2022_PROGRAM_ID);
    await mintTo(connection, owner, mint, userTokenAccount, owner, amount, [], undefined, TOKEN_2022_PROGRAM_ID);
    const basketId = Math.floor(Date.now() / 1000) + 1;
    const [vault] = deriveVault(owner.publicKey, basketId);
    const [vaultTokenAccount] = deriveVaultTokenAccount(vault);
    await client.initializeVault({
        basketId,
        aiAgent: owner.publicKey,
        maxRebalanceAmount: new anchor.BN(amount.toString()),
        minReserveAmount: new anchor.BN(0),
        vaultMint: mint,
    });
    await client.depositUsdc({
        vault,
        userTokenAccount,
        vaultPda: deriveVaultAuthority(vault)[0],
        vaultTokenAccount,
        vaultMint: mint,
        amount: new anchor.BN(amount.toString()),
    });
    const vaultBalanceAfterDeposit = await getAccount(connection, vaultTokenAccount, 'confirmed', TOKEN_2022_PROGRAM_ID);
    assert.equal(vaultBalanceAfterDeposit.amount, amount);
    await client.executeRebalance({
        vault,
        vaultTokenAccount,
        destinationTokenAccount: userTokenAccount,
        vaultMint: mint,
        amount: new anchor.BN(rebalanceAmount.toString()),
        expectedBasketId: basketId,
    });
    const vaultBalanceAfterRebalance = await getAccount(connection, vaultTokenAccount, 'confirmed', TOKEN_2022_PROGRAM_ID);
    const destinationBalance = await getAccount(connection, userTokenAccount, 'confirmed', TOKEN_2022_PROGRAM_ID);
    assert.equal(vaultBalanceAfterRebalance.amount, amount - rebalanceAmount);
    assert.equal(destinationBalance.amount, rebalanceAmount);
});
