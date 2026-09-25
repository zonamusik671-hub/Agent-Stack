import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Connection, Keypair } from '@solana/web3.js';
import {
  createClawpumpFundingPlan,
  createClawpumpLaunchPlan,
  executeClawpumpFunding,
  executeClawpumpLaunch,
  persistClawpumpLaunchProof,
} from '../src/utils/clawpump.js';

const network = {
  rpcEndpoint: process.env.ANCHOR_PROVIDER_URL ?? 'http://127.0.0.1:8899',
  chainId: 'solana-localnet',
};

test('executes Clawpump funding in sandbox mode without requiring a balance', async () => {
  const agentWallet = Keypair.generate().publicKey;
  const plan = createClawpumpFundingPlan({
    network,
    agentWallet,
    amount: 1_000_000_000_000_000_000n,
    asset: 'ASB-USDC',
  });

  const result = await executeClawpumpFunding(plan, { mode: 'sandbox' });

  assert.equal(result.mode, 'sandbox');
  assert.equal(result.simulated, true);
  assert.match(result.signature, /^sandbox-[0-9a-f]{64}$/);
});

test('records a sandbox Clawpump launch proof', async () => {
  const agentWallet = Keypair.generate().publicKey;
  const plan = createClawpumpLaunchPlan({
    network,
    agentWallet,
    basketId: 'basket-integration-1',
  });

  const proof = await executeClawpumpLaunch(plan, { mode: 'sandbox' });

  assert.equal(proof.network, network.chainId);
  assert.equal(proof.basketId, plan.basketId);
  assert.equal(proof.agentWallet, agentWallet.toBase58());
  assert.match(proof.signature, /^sandbox-[0-9a-f]{64}$/);
  assert.doesNotThrow(() => new Date(proof.recordedAt).toISOString());

  const directory = await mkdtemp(join(tmpdir(), 'asb-clawpump-'));
  const proofPath = join(directory, 'proof.json');
  await persistClawpumpLaunchProof(proof, proofPath);
  assert.deepEqual(JSON.parse(await readFile(proofPath, 'utf8')), proof);
});

test(
  'executes live Clawpump funding and launch only when explicitly enabled',
  { skip: process.env.RUN_CLAWPUMP_LIVE !== '1' },
  async () => {
    const payer = Keypair.generate();
    const connection = new Connection(network.rpcEndpoint, 'confirmed');
    const airdrop = await connection.requestAirdrop(payer.publicKey, 2_000_000_000);
    await connection.confirmTransaction(airdrop, 'confirmed');

    const fundingPlan = createClawpumpFundingPlan({
      network,
      agentWallet: payer.publicKey,
      amount: 1n,
      asset: 'ASB-SOL',
    });
    const funding = await executeClawpumpFunding(fundingPlan, {
      mode: 'live',
      connection,
      payer,
    });
    assert.equal(funding.simulated, false);

    const launchPlan = createClawpumpLaunchPlan({
      network,
      agentWallet: payer.publicKey,
      basketId: 'basket-live-integration',
    });
    const proof = await executeClawpumpLaunch(launchPlan, {
      mode: 'live',
      connection,
      payer,
    });
    assert.ok(proof.signature.length > 0);
    assert.notEqual(proof.signature, funding.signature);
  },
);
