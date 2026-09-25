import test from 'node:test';
import assert from 'node:assert/strict';
import { createPythPriceAccountFixture, validatePythPriceAccountFixture } from '../src/utils/pythFixtureHelper.js';
import { readFile } from 'node:fs/promises';
import * as anchor from '@coral-xyz/anchor';
import {
  createAssociatedTokenAccount,
  createMint,
  getAccount,
  mintTo,
  TOKEN_2022_PROGRAM_ID,
} from '@solana/spl-token';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import {
  AnchorClient,
  deriveVault,
  deriveVaultAuthority,
  deriveVaultTokenAccount,
} from '../src/utils/anchorClient.js';

class KeypairWallet implements anchor.Wallet {
  constructor(readonly payer: Keypair) {}
  get publicKey() { return this.payer.publicKey; }
  async signTransaction<T extends anchor.web3.Transaction | anchor.web3.VersionedTransaction>(tx: T) {
    if (tx instanceof anchor.web3.Transaction) tx.partialSign(this.payer);
    else tx.sign([this.payer]);
    return tx;
  }
  async signAllTransactions<T extends anchor.web3.Transaction | anchor.web3.VersionedTransaction>(txs: T[]) {
    return Promise.all(txs.map((tx) => this.signTransaction(tx)));
  }
}

function liquidationCollateral(
  collateral: bigint,
  debt: bigint,
  repayment: bigint,
  bonusBps: bigint,
): bigint {
  if (debt <= 0n || repayment <= 0n || repayment > debt) {
    throw new Error('invalid repayment');
  }
  const base = (collateral * repayment) / debt;
  return ((base * (10_000n + bonusBps)) / 10_000n) > collateral
    ? collateral
    : (base * (10_000n + bonusBps)) / 10_000n;
}

test('liquidation bonus is bounded and cannot release more collateral than locked', () => {
  assert.equal(liquidationCollateral(1_000n, 500n, 100n, 500n), 210n);
  assert.equal(liquidationCollateral(100n, 1n, 1n, 10_000n), 100n);
});

test('creates a parser-valid Pyth v2 price account fixture offline', () => {
  const data = createPythPriceAccountFixture({
    price: 100_000n,
    confidence: 100n,
    exponent: -2,
    timestamp: BigInt(Math.floor(Date.now() / 1000)),
    validSlot: 10n,
  });
  assert.equal(data.length, 3312);
  assert.deepEqual(validatePythPriceAccountFixture(data), data);
});

test('Borrow -> oracle price drop -> liquidation against a mock oracle account', {
  skip: process.env.RUN_BORROWING_INTEGRATION !== '1' || !process.env.BORROWING_PHASE,
}, async () => {
  const fixturePath = process.env.PYTH_FIXTURE_PATH;
  assert.ok(fixturePath, 'PYTH_FIXTURE_PATH must point to a validated Pyth account fixture');
  const fixture = validatePythPriceAccountFixture(await readFile(fixturePath));
  assert.equal(fixture.length, 3312);
  assert.ok(process.env.PYTH_PRICE_ACCOUNT, 'PYTH_PRICE_ACCOUNT is required');
  assert.ok(process.env.PYTH_ORACLE_PROGRAM, 'PYTH_ORACLE_PROGRAM must match the validator account owner');
  const endpoint = process.env.ANCHOR_PROVIDER_URL ?? 'http://127.0.0.1:8899';
  const connection = new Connection(endpoint, 'confirmed');
  const statePath = process.env.BORROWING_STATE_PATH;
  assert.ok(statePath, 'BORROWING_STATE_PATH is required');
  const phase = process.env.BORROWING_PHASE;
  if (phase === 'borrow') {
    const owner = Keypair.generate();
    const signature = await connection.requestAirdrop(owner.publicKey, 3e9);
    await connection.confirmTransaction(signature, 'confirmed');
    const client = new AnchorClient(connection, new KeypairWallet(owner));
    const vaultMint = await createMint(connection, owner, owner.publicKey, null, 6, undefined, undefined, TOKEN_2022_PROGRAM_ID);
    const loanMint = await createMint(connection, owner, owner.publicKey, null, 6, undefined, undefined, TOKEN_2022_PROGRAM_ID);
    const collateralAccount = await createAssociatedTokenAccount(connection, owner, vaultMint, owner.publicKey, undefined, TOKEN_2022_PROGRAM_ID);
    await mintTo(connection, owner, vaultMint, collateralAccount, owner, 1_000_000n, [], undefined, TOKEN_2022_PROGRAM_ID);
    const basketId = Date.now();
    const [vault] = deriveVault(owner.publicKey, basketId);
    const [vaultTokenAccount] = deriveVaultTokenAccount(vault);
    await client.initializeVault({
      basketId, aiAgent: owner.publicKey, maxRebalanceAmount: new anchor.BN(1_000_000),
      minReserveAmount: new anchor.BN(0), vaultMint,
    });
    await client.depositUsdc({
      vault, userTokenAccount: collateralAccount, vaultPda: deriveVaultAuthority(vault)[0],
      vaultTokenAccount, vaultMint, amount: new anchor.BN(1_000_000),
    });
    await client.configureBorrowing({
      vault, maxLtvBps: 5_000, liquidationLtvBps: 8_000, maxPriceAgeSeconds: new anchor.BN(3600),
      maxConfidenceBps: 1_000, liquidationBonusBps: 500,
      oraclePriceFeed: new PublicKey(process.env.PYTH_PRICE_ACCOUNT),
      oracleProgram: new PublicKey(process.env.PYTH_ORACLE_PROGRAM),
    });
    await client.initializeBorrowPool({ vault, loanMint });
    const [loanTokenAccount] = PublicKey.findProgramAddressSync([Buffer.from('loan_token'), vault.toBuffer()], client.program.programId);
    await mintTo(connection, owner, loanMint, loanTokenAccount, owner, 1_000_000n, [], undefined, TOKEN_2022_PROGRAM_ID);
    await client.initializeBorrowPosition({ vault, borrower: owner.publicKey });
    const borrowerLoanAccount = await createAssociatedTokenAccount(connection, owner, loanMint, owner.publicKey, undefined, TOKEN_2022_PROGRAM_ID);
    await client.borrowAgainstCollateral({
      vault, borrower: owner.publicKey, vaultTokenAccount, vaultMint, loanMint, borrowerLoanAccount,
      oraclePriceFeed: new PublicKey(process.env.PYTH_PRICE_ACCOUNT), collateralAmount: new anchor.BN(500_000),
    });
    await (await import('node:fs/promises')).writeFile(statePath, JSON.stringify({
      owner: Array.from(owner.secretKey), vault: vault.toBase58(), vaultMint: vaultMint.toBase58(),
      loanMint: loanMint.toBase58(), vaultTokenAccount: vaultTokenAccount.toBase58(),
      borrowerLoanAccount: borrowerLoanAccount.toBase58(), basketId,
    }) + '\n', { mode: 0o600 });
    return;
  }
  assert.equal(phase, 'liquidate', `Unsupported borrowing phase: ${phase}`);
  const state = JSON.parse(await (await import('node:fs/promises')).readFile(statePath, 'utf8')) as {
    owner: number[]; vault: string; vaultMint: string; loanMint: string;
    vaultTokenAccount: string; basketId: number;
  };
  const owner = Keypair.fromSecretKey(Uint8Array.from(state.owner));
  const liquidator = Keypair.generate();
  const airdrop = await connection.requestAirdrop(liquidator.publicKey, 2e9);
  await connection.confirmTransaction(airdrop, 'confirmed');
  const ownerClient = new AnchorClient(connection, new KeypairWallet(owner));
  const liquidatorClient = new AnchorClient(connection, new KeypairWallet(liquidator));
  const loanMint = new PublicKey(state.loanMint);
  const vaultMint = new PublicKey(state.vaultMint);
  const liquidatorLoanAccount = await createAssociatedTokenAccount(connection, liquidator, loanMint, liquidator.publicKey, undefined, TOKEN_2022_PROGRAM_ID);
  const liquidatorCollateralAccount = await createAssociatedTokenAccount(connection, liquidator, vaultMint, liquidator.publicKey, undefined, TOKEN_2022_PROGRAM_ID);
  await mintTo(connection, owner, loanMint, liquidatorLoanAccount, owner, 250_000n, [], undefined, TOKEN_2022_PROGRAM_ID);
  const before = (await getAccount(connection, liquidatorCollateralAccount, 'confirmed', TOKEN_2022_PROGRAM_ID)).amount;
  const signature = await liquidatorClient.liquidatePosition({
    vault: new PublicKey(state.vault), borrower: owner.publicKey,
    vaultTokenAccount: new PublicKey(state.vaultTokenAccount), vaultMint, loanMint,
    liquidatorLoanAccount, liquidatorCollateralAccount,
    oraclePriceFeed: new PublicKey(process.env.PYTH_PRICE_ACCOUNT), repayAmount: new anchor.BN(250_000),
  });
  const after = (await getAccount(connection, liquidatorCollateralAccount, 'confirmed', TOKEN_2022_PROGRAM_ID)).amount;
  assert.equal(after - before, 525_000n);
  assert.match(signature, /^[1-9A-HJ-NP-Za-km-z]{32,88}$/);
});
