import { Connection, PublicKey } from '@solana/web3.js';
import { fetchPythPriceAccountFixture } from '../src/utils/pythFixtureHelper.js';

const rpcUrl = process.env.PYTH_RPC_URL ?? 'https://api.devnet.solana.com';
const addressText = process.env.PYTH_PRICE_ACCOUNT;
const ownerText = process.env.PYTH_DEVNET_PROGRAM_ID;
const outputPath = process.env.PYTH_FIXTURE_PATH ?? './.pyth-price-account.bin';

if (!addressText || !ownerText) {
  throw new Error(
    'PYTH_PRICE_ACCOUNT and PYTH_DEVNET_PROGRAM_ID are required; truncated placeholders are not accepted',
  );
}

const connection = new Connection(rpcUrl, 'confirmed');
const fixture = await fetchPythPriceAccountFixture(
  connection,
  new PublicKey(addressText),
  new PublicKey(ownerText),
  outputPath,
);
console.log(JSON.stringify({
  rpcUrl,
  address: fixture.address.toBase58(),
  owner: fixture.owner.toBase58(),
  bytes: fixture.data.length,
  outputPath,
}));
