#!/usr/bin/env bash
set -Eeuo pipefail
export NO_DNA=1

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
ENDPOINT="${ANCHOR_PROVIDER_URL:-https://api.devnet.solana.com}"
STATE_PATH="${BORROWING_STATE_PATH:-${ROOT_DIR}/.borrowing-state-devnet.json}"

# Konfigurasi Devnet Pyth & Oracle
ORACLE_ACCOUNT="EdNs5T8a95Bypw0VvX4kM5B9Y4pX6nSg8Fj1m7PqQwEs"
ORACLE_OWNER="gSbeUDmS7z9ehdBtZc2HnEQkrFcxFyvwU568cAZ8yVb"

cleanup() {
  if [[ "${KEEP_BORROWING_ARTIFACTS:-0}" != "1" ]]; then
    rm -f "$STATE_PATH"
  fi
}
trap cleanup EXIT

NO_DNA=1 anchor build

echo "[Devnet] Executing Borrow Phase..."
RUN_BORROWING_INTEGRATION=1 BORROWING_PHASE=borrow \
  BORROWING_STATE_PATH="$STATE_PATH" PYTH_PRICE_ACCOUNT="$ORACLE_ACCOUNT" \
  PYTH_ORACLE_PROGRAM="$ORACLE_OWNER" ANCHOR_PROVIDER_URL="$ENDPOINT" \
  npm --prefix "$ROOT_DIR/app" run integration-test

echo "[Devnet] Executing Liquidation Phase..."
RUN_BORROWING_INTEGRATION=1 BORROWING_PHASE=liquidate \
  BORROWING_STATE_PATH="$STATE_PATH" PYTH_PRICE_ACCOUNT="$ORACLE_ACCOUNT" \
  PYTH_ORACLE_PROGRAM="$ORACLE_OWNER" ANCHOR_PROVIDER_URL="$ENDPOINT" \
  npm --prefix "$ROOT_DIR/app" run integration-test

echo "Borrow -> price drop -> liquidation Devnet E2E completed"