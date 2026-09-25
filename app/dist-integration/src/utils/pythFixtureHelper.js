import { readFile, rename, writeFile } from 'node:fs/promises';
const PYTH_MAGIC = 0xa1b2c3d4;
const PYTH_VERSION = 2;
const PYTH_ACCOUNT_TYPE_PRICE = 3;
const PYTH_PRICE_ACCOUNT_SIZE = 3312;
const AGGREGATE_OFFSET = 208;
const PRICE_INFO_STATUS_OFFSET = AGGREGATE_OFFSET + 16;
const PRICE_INFO_PUB_SLOT_OFFSET = AGGREGATE_OFFSET + 24;
function writeU64(data, offset, value) {
    if (value < 0n || value > 0xffffffffffffffffn) {
        throw new RangeError(`u64 value out of range at offset ${offset}`);
    }
    data.writeBigUInt64LE(value, offset);
}
function writeI64(data, offset, value) {
    if (value < -0x8000000000000000n || value > 0x7fffffffffffffffn) {
        throw new RangeError(`i64 value out of range at offset ${offset}`);
    }
    data.writeBigInt64LE(value, offset);
}
/**
 * Builds the exact fixed-size Solana Pyth v2 PriceAccount layout consumed by
 * pyth-sdk-solana 0.10.x (GenericPriceAccount<32, ()>).
 */
export function createPythPriceAccountFixture(values) {
    if (values.price <= 0n)
        throw new RangeError('Pyth price must be positive');
    if (values.confidence < 0n)
        throw new RangeError('Pyth confidence cannot be negative');
    if (!Number.isInteger(values.exponent) || values.exponent < -128 || values.exponent > 127) {
        throw new RangeError('Pyth exponent must fit an i8');
    }
    const data = Buffer.alloc(PYTH_PRICE_ACCOUNT_SIZE);
    data.writeUInt32LE(PYTH_MAGIC, 0);
    data.writeUInt32LE(PYTH_VERSION, 4);
    data.writeUInt32LE(PYTH_ACCOUNT_TYPE_PRICE, 8);
    data.writeUInt32LE(PYTH_PRICE_ACCOUNT_SIZE, 12);
    data.writeUInt8(1, 16); // PriceType::Price
    data.writeInt32LE(values.exponent, 20);
    data.writeBigUInt64LE(values.validSlot ?? 1n, 40);
    writeI64(data, 96, values.timestamp);
    writeI64(data, 208, values.price);
    writeU64(data, 216, values.confidence);
    data.writeUInt8(1, PRICE_INFO_STATUS_OFFSET); // PriceStatus::Trading
    data.writeUInt8(0, PRICE_INFO_STATUS_OFFSET + 1); // CorpAction::NoCorpAct
    writeU64(data, PRICE_INFO_PUB_SLOT_OFFSET, values.pubSlot ?? values.validSlot ?? 1n);
    return data;
}
export function validatePythPriceAccountFixture(data) {
    const fixture = Buffer.from(data);
    if (fixture.length !== PYTH_PRICE_ACCOUNT_SIZE) {
        throw new Error(`Invalid Pyth price account length: ${fixture.length}`);
    }
    if (fixture.readUInt32LE(0) !== PYTH_MAGIC
        || fixture.readUInt32LE(4) !== PYTH_VERSION
        || fixture.readUInt32LE(8) !== PYTH_ACCOUNT_TYPE_PRICE) {
        throw new Error('Fixture is not a Pyth v2 price account');
    }
    if (fixture.readUInt8(PRICE_INFO_STATUS_OFFSET) !== 1) {
        throw new Error('Fixture aggregate price is not Trading');
    }
    if (fixture.readBigInt64LE(AGGREGATE_OFFSET) <= 0n) {
        throw new Error('Fixture aggregate price must be positive');
    }
    return fixture;
}
export async function fetchPythPriceAccountFixture(connection, address, expectedOwner, outputPath) {
    const account = await connection.getAccountInfo(address, 'confirmed');
    if (!account)
        throw new Error(`Pyth account not found: ${address.toBase58()}`);
    if (!account.owner.equals(expectedOwner)) {
        throw new Error(`Unexpected Pyth owner for ${address.toBase58()}: ${account.owner.toBase58()}`);
    }
    const data = validatePythPriceAccountFixture(account.data);
    const temporaryPath = `${outputPath}.tmp.${process.pid}`;
    await writeFile(temporaryPath, data, { mode: 0o600 });
    await rename(temporaryPath, outputPath);
    return { address, owner: account.owner, lamports: account.lamports, data };
}
export async function readPythPriceAccountFixture(path) {
    return validatePythPriceAccountFixture(await readFile(path));
}
export async function writeValidatorAccountFixture(path, account) {
    const data = validatePythPriceAccountFixture(account.data);
    const temporaryPath = `${path}.tmp.${process.pid}`;
    await writeFile(temporaryPath, JSON.stringify({
        lamports: account.lamports,
        owner: account.owner.toBase58(),
        data: [data.toString('base64'), 'base64'],
        executable: false,
        rentEpoch: 0,
    }) + '\n', { mode: 0o600 });
    await rename(temporaryPath, path);
}
export const PYTH_PRICE_ACCOUNT_SIZE_BYTES = PYTH_PRICE_ACCOUNT_SIZE;
