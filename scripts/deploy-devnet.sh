#!/usr/bin/env bash
set -Eeuo pipefail

export NO_DNA=1
readonly ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly CLUSTER="devnet"
readonly RPC_URL="${SOLANA_RPC_URL:-https://api.devnet.solana.com}"
USDC_DEVNET_MINT="${USDC_DEVNET_MINT:-${TOKEN_2022_MINT:-}}"

required_vars=(
  ASB_PROGRAM_ID
  PROGRAM_KEYPAIR
  DEPLOY_WALLET
  PYTH_DEVNET_PROGRAM_ID
  PYTH_DEVNET_FEED_ID
  PYTH_DEVNET_PRICE_ACCOUNT
  USDC_DEVNET_MINT
  METEORA_DBC_POOL
)

for name in "${required_vars[@]}"; do
  [[ -n "${!name:-}" ]] || { printf 'Missing required environment variable: %s\n' "$name" >&2; exit 1; }
done
[[ -f "$DEPLOY_WALLET" ]] || { printf 'Wallet file does not exist: %s\n' "$DEPLOY_WALLET" >&2; exit 1; }
[[ -f "$PROGRAM_KEYPAIR" ]] || { printf 'Program keypair file does not exist: %s\n' "$PROGRAM_KEYPAIR" >&2; exit 1; }

command -v solana >/dev/null || { echo "solana CLI is required" >&2; exit 1; }
command -v cargo-build-sbf >/dev/null || { echo "cargo-build-sbf is required" >&2; exit 1; }
command -v node >/dev/null || { echo "node is required" >&2; exit 1; }
command -v python3 >/dev/null || { echo "python3 is required" >&2; exit 1; }

validate_pubkey() {
  local name="$1" value="$2"
  (cd "$ROOT_DIR/app" && node -e "const {PublicKey}=require('@solana/web3.js'); new PublicKey(process.argv[1])" "$value") >/dev/null 2>&1 || {
    printf '%s is not a valid base58 public key\n' "$name" >&2
    exit 1
  }

  validate_live_account() {
    local name="$1" value="$2"
    [[ "$value" != "11111111111111111111111111111111" ]] || {
      printf '%s must not use the System Program address\n' "$name" >&2
      exit 1
    }
    solana account "$value" --url "$RPC_URL" >/dev/null 2>&1 || {
      printf '%s account is not available on %s: %s\n' "$name" "$RPC_URL" "$value" >&2
      exit 1
    }
  }
}

validate_pubkey ASB_PROGRAM_ID "$ASB_PROGRAM_ID"
program_keypair_address="$(solana address -k "$PROGRAM_KEYPAIR")"
[[ "$program_keypair_address" == "$ASB_PROGRAM_ID" ]] || {
  printf 'PROGRAM_KEYPAIR address %s does not match ASB_PROGRAM_ID %s\n' \
    "$program_keypair_address" "$ASB_PROGRAM_ID" >&2
  exit 1
}
validate_pubkey PYTH_DEVNET_PROGRAM_ID "$PYTH_DEVNET_PROGRAM_ID"
validate_pubkey PYTH_DEVNET_PRICE_ACCOUNT "$PYTH_DEVNET_PRICE_ACCOUNT"
validate_pubkey USDC_DEVNET_MINT "$USDC_DEVNET_MINT"
validate_pubkey METEORA_DBC_POOL "$METEORA_DBC_POOL"

solana config set --url "$RPC_URL" --keypair "$DEPLOY_WALLET" >/dev/null
solana cluster-version >/dev/null
wallet_lamports="$(solana balance --lamports --url "$RPC_URL" --keypair "$DEPLOY_WALLET" | awk 'NR==1 {print $1}')"
[[ "$wallet_lamports" =~ ^[0-9]+$ ]] && (( wallet_lamports > 0 )) || {
  printf 'DEPLOY_WALLET has no SOL on %s; fund it before deployment\n' "$RPC_URL" >&2
  exit 1
}
validate_live_account PYTH_DEVNET_PROGRAM_ID "$PYTH_DEVNET_PROGRAM_ID"
validate_live_account PYTH_DEVNET_PRICE_ACCOUNT "$PYTH_DEVNET_PRICE_ACCOUNT"
validate_live_account USDC_DEVNET_MINT "$USDC_DEVNET_MINT"
validate_live_account METEORA_DBC_POOL "$METEORA_DBC_POOL"

if [[ "${DRY_RUN:-0}" == "1" ]]; then
  printf 'Dry run OK for %s on %s\n' "$ASB_PROGRAM_ID" "$RPC_URL"
  exit 0
fi
[[ "${DEPLOY_DEVNET_CONFIRM:-0}" == "1" ]] || {
  echo "Set DEPLOY_DEVNET_CONFIRM=1 to deploy. Use DRY_RUN=1 to validate configuration." >&2
  exit 1
}

cd "$ROOT_DIR"
NO_DNA=1 cargo-build-sbf --force-tools-install --tools-version v1.56 \
  --arch v3 --sbf-out-dir target/deploy
artifact="$ROOT_DIR/target/deploy/agent_stock_basket.so"
[[ -s "$artifact" ]] || { echo "Build did not produce $artifact" >&2; exit 1; }
deploy_output="$(NO_DNA=1 solana program deploy "$artifact" \
  --url "$RPC_URL" \
  --keypair "$DEPLOY_WALLET" \
  --program-id "$PROGRAM_KEYPAIR" 2>&1)"
printf '%s\n' "$deploy_output"
deploy_signature="$(printf '%s\n' "$deploy_output" | awk '/^Signature:/ {print $2; exit}')"
[[ -n "$deploy_signature" ]] || {
  echo "Deployment output did not contain a confirmed signature." >&2
  exit 1
}

program_info="$(solana program show "$ASB_PROGRAM_ID" --url "$RPC_URL" 2>&1)" || {
  printf '%s\n' "$program_info" >&2
  exit 1
}
printf '%s\n' "$program_info"

manifest="${DEVNET_DEPLOY_MANIFEST:-$ROOT_DIR/devnet-deployment.json}"
tmp_manifest="${manifest}.tmp.$$"
trap 'rm -f "$tmp_manifest"' EXIT
python3 - "$tmp_manifest" "$ASB_PROGRAM_ID" "$RPC_URL" "$PYTH_DEVNET_PROGRAM_ID" \
  "$PYTH_DEVNET_FEED_ID" "$PYTH_DEVNET_PRICE_ACCOUNT" "$USDC_DEVNET_MINT" "$METEORA_DBC_POOL" \
  "$deploy_signature" <<'PY'
import json, sys
path, program, rpc, pyth_program, feed, price, usdc, meteora, signature = sys.argv[1:]
with open(path, "w", encoding="utf-8") as f:
    json.dump({
        "cluster": "devnet", "rpcUrl": rpc, "programId": program,
        "deploymentSignature": signature,
        "pyth": {"programId": pyth_program, "feedId": feed, "priceAccount": price},
        "usdcMint": usdc, "meteoraDbcPool": meteora,
    }, f, indent=2)
    f.write("\n")
PY
mv -f "$tmp_manifest" "$manifest"
printf 'Deployment manifest written to %s\n' "$manifest"
