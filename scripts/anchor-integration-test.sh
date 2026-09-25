#!/usr/bin/env bash
set -euo pipefail

export PATH="${HOME}/.cargo/bin:${PATH}"
export NO_DNA=1
export ANCHOR_PROVIDER_URL="${ANCHOR_PROVIDER_URL:-http://127.0.0.1:8899}"
export RUN_ANCHOR_INTEGRATION=1

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

command -v cargo >/dev/null 2>&1 || {
  echo "cargo was not found in PATH=${PATH}" >&2
  exit 127
}

command -v anchor >/dev/null 2>&1 || {
  echo "anchor was not found in PATH=${PATH}" >&2
  exit 127
}

command -v npm >/dev/null 2>&1 || {
  echo "npm was not found in PATH=${PATH}" >&2
  exit 127
}

rm -rf target/deploy
cargo-build-sbf --force-tools-install --tools-version v1.56 --arch v3 \
  --sbf-out-dir target/deploy
if [[ -f target/deploy-v3/agent_stock_basket-keypair.json ]]; then
  cp target/deploy-v3/agent_stock_basket-keypair.json \
    target/deploy/agent_stock_basket-keypair.json
fi

VALIDATOR_PID=""
cleanup_validator() {
  if [[ -n "${VALIDATOR_PID}" ]]; then
    kill "${VALIDATOR_PID}" 2>/dev/null || true
    wait "${VALIDATOR_PID}" 2>/dev/null || true
  fi
}
trap cleanup_validator EXIT

if ! curl --silent --fail --max-time 2 \
  -H 'Content-Type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' \
  "${ANCHOR_PROVIDER_URL}" >/dev/null 2>&1; then
  command -v solana-test-validator >/dev/null 2>&1 || {
    echo "solana-test-validator is required when no validator is running" >&2
    exit 127
  }
  validator_args=(--reset --quiet
    --bpf-program EeVNS2rn7K7Pq2GvDHzfmPd1GtD9n9S6AtReLqETSR3R
    "${ROOT_DIR}/target/deploy/agent_stock_basket.so")
  if [[ -n "${PYTH_VALIDATOR_ACCOUNT_JSON:-}" ]]; then
    [[ -f "${PYTH_VALIDATOR_ACCOUNT_JSON}" ]] || {
      echo "PYTH_VALIDATOR_ACCOUNT_JSON does not exist" >&2
      exit 1
    }
    [[ -n "${PYTH_PRICE_ACCOUNT:-}" ]] || {
      echo "PYTH_PRICE_ACCOUNT is required with PYTH_VALIDATOR_ACCOUNT_JSON" >&2
      exit 1
    }
    validator_args+=(--account "${PYTH_PRICE_ACCOUNT}" "${PYTH_VALIDATOR_ACCOUNT_JSON}")
  fi
  if [[ "${CLONE_METEORA_PROGRAM:-0}" == "1" ]]; then
    validator_args+=(--url https://api.mainnet-beta.solana.com
      --clone-upgradeable-program dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN)
  fi
  solana-test-validator "${validator_args[@]}" \
    >"${ROOT_DIR}/.validator.log" 2>&1 &
  VALIDATOR_PID=$!
  for _ in $(seq 1 30); do
    if curl --silent --fail --max-time 2 \
      -H 'Content-Type: application/json' \
      --data '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' \
      "${ANCHOR_PROVIDER_URL}" >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done
fi

if ! solana program show EeVNS2rn7K7Pq2GvDHzfmPd1GtD9n9S6AtReLqETSR3R \
  --url "${ANCHOR_PROVIDER_URL}" >/dev/null 2>&1; then
  solana program deploy target/deploy/agent_stock_basket.so \
    --program-id target/deploy/agent_stock_basket-keypair.json \
    --url "${ANCHOR_PROVIDER_URL}"
fi

cargo test --workspace
npm --prefix app run integration-test
