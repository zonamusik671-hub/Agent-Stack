import { writeValidatorAccountFixture, createPythPriceAccountFixture } from '../src/utils/pythFixtureHelper.js';
import { PublicKey } from '@solana/web3.js';
import { writeFile } from 'node:fs/promises';

const price = BigInt(process.env.PYTH_FIXTURE_PRICE ?? '');
const outputPath = process.env.PYTH_VALIDATOR_ACCOUNT_JSON;
const owner = process.env.PYTH_ORACLE_PROGRAM;
if (!Number.isSafeInteger(Number(price)) || price <= 0n || !outputPath || !owner) {
  throw new Error('PYTH_FIXTURE_PRICE, PYTH_VALIDATOR_ACCOUNT_JSON and PYTH_ORACLE_PROGRAM are required');
}
const data = createPythPriceAccountFixture({
  price,
  confidence: 1n,
  exponent: -2,
  timestamp: BigInt(Math.floor(Date.now() / 1000)),
  validSlot: 1n,
});
await writeValidatorAccountFixture(outputPath, {
  owner: new PublicKey(owner),
  lamports: 1_000_000_000,
  data,
});
if (process.env.PYTH_FIXTURE_PATH) await writeFile(process.env.PYTH_FIXTURE_PATH, data, { mode: 0o600 });
