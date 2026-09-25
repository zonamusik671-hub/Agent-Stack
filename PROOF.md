# ASB Devnet Proof

**Status:** Pending real Devnet execution.  
**Cluster:** Solana Devnet  
**RPC:** `https://api.devnet.solana.com`

This file is a submission ledger, not a claim that transactions have already
been executed. Do not add sandbox signatures, simulation identifiers, localnet
signatures, private keys, or access tokens.

## Required configuration

| Item | Value |
|---|---|
| ASB program ID | `<full Devnet program ID>` |
| Deploy wallet | `<public key only>` |
| Pyth Devnet program | `<full public key>` |
| Pyth Devnet feed ID | `<64-character hexadecimal ID>` |
| Pyth Devnet price account | `<full public key>` |
| Token-2022 asset mint | `<full public key>` |
| Token-2022 quote/USDC mint | `<full public key>` |
| Meteora DBC pool | `<full public key>` |
| Clawpump agent wallet | `<full public key>` |

## Transaction ledger

| # | Stage | Signature | Signer | Explorer | Verification |
|---:|---|---|---|---|---|
| 1 | Program deployment | `PENDING` | — | — | Not executed |
| 2 | Vault initialization | `PENDING` | — | — | Not executed |
| 3 | Token-2022 deposit | `PENDING` | — | — | Not executed |
| 4 | Meteora swap | `PENDING` | — | — | Not executed |
| 5 | Clawpump launch | `PENDING` | — | — | Not executed |
| 6 | Borrow/liquidation E2E | `PENDING` | — | — | Not executed |

Explorer URL format:

```text
https://explorer.solana.com/tx/<SIGNATURE>?cluster=devnet
```

## Evidence rules

- A signature is valid only after `getTransaction` confirms it on Devnet.
- Record the exact instruction purpose and signer for every signature.
- Keep Pyth, Token-2022, Meteora, and Clawpump addresses complete.
- Do not mark a row complete if simulation succeeded but broadcast failed.
- Do not claim an official Clawpump launch while the service returns no
  verifiable Solana signature.

## Demo recording

Video: `PENDING — record 2–3 minutes after the ledger is populated`

The recording must show the Devnet cluster, the product flow, and the Explorer
pages for the signatures above. It must not expose wallet files, seed phrases,
Hermes tokens, or other credentials.

## Devnet Deployment & Operations Ledger

- **Program ID**: `6LBuCtzf3cFAJyg5rfEUJ4eq7JmYDg2fbJkgiCmm2Ci2`
- **Deploy Tx Signature**: `<INSERT_REAL_DEPLOY_TX_SIGNATURE>`
- **Vault Initialization Tx**: `<INSERT_REAL_VAULT_INIT_TX_SIGNATURE>`
- **Token-2022 Deposit Tx**: `<INSERT_REAL_DEPOSIT_TX_SIGNATURE>`
- **Meteora Swap Tx**: `<INSERT_REAL_SWAP_TX_SIGNATURE>`