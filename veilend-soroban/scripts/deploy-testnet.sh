#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${VEILLEND_ENV_FILE:-$ROOT_DIR/.env.testnet}"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "$ENV_FILE"
  set +a
fi

: "${STELLAR_SOURCE:?Set STELLAR_SOURCE to a funded Stellar CLI identity, secret key, or seed phrase.}"
: "${VEILLEND_ADMIN:?Set VEILLEND_ADMIN to the admin public address passed to the constructor.}"

NETWORK="${STELLAR_NETWORK:-testnet}"
MIN_COLLATERAL_RATIO_BPS="${VEILLEND_MIN_COLLATERAL_RATIO_BPS:-15000}"
WASM_PATH="${VEILLEND_WASM:-$ROOT_DIR/target/stellar/veillend_contract.wasm}"

if ! command -v stellar >/dev/null 2>&1; then
  echo "stellar CLI is required. Install with: cargo install --locked stellar-cli --version 23.0.1" >&2
  exit 1
fi

if [[ ! -f "$WASM_PATH" ]]; then
  "$ROOT_DIR/scripts/build.sh"
fi

if [[ ! -f "$WASM_PATH" ]]; then
  WASM_PATH="$ROOT_DIR/target/wasm32-unknown-unknown/release/veillend_contract.wasm"
fi

if [[ ! -f "$WASM_PATH" ]]; then
  echo "Unable to find veillend_contract.wasm. Set VEILLEND_WASM to the built artifact path." >&2
  exit 1
fi

stellar contract deploy \
  --wasm "$WASM_PATH" \
  --source-account "$STELLAR_SOURCE" \
  --network "$NETWORK" \
  -- \
  --admin "$VEILLEND_ADMIN" \
  --min_collateral_ratio_bps "$MIN_COLLATERAL_RATIO_BPS"
