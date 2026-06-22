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

: "${STELLAR_SOURCE:?Set STELLAR_SOURCE to the Stellar CLI identity, secret key, or seed phrase that signs the invoke.}"
: "${VEILLEND_CONTRACT_ID:?Set VEILLEND_CONTRACT_ID to the deployed contract id.}"

NETWORK="${STELLAR_NETWORK:-testnet}"
FUNCTION_NAME="${1:-${VEILLEND_FN:-}}"

if [[ -z "$FUNCTION_NAME" ]]; then
  echo "Usage: $0 <contract_fn> [--arg-name value ...]" >&2
  echo "Example: $0 get_position --user G... --asset C..." >&2
  exit 1
fi

shift || true

if ! command -v stellar >/dev/null 2>&1; then
  echo "stellar CLI is required. Install with: cargo install --locked stellar-cli --version 23.0.1" >&2
  exit 1
fi

stellar contract invoke \
  --id "$VEILLEND_CONTRACT_ID" \
  --source-account "$STELLAR_SOURCE" \
  --network "$NETWORK" \
  -- \
  "$FUNCTION_NAME" \
  "$@"
