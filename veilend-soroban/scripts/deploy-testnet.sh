#!/bin/sh
set -eu

cd "$(dirname "$0")/.."

network="${STELLAR_NETWORK:-testnet}"
source_account="${STELLAR_SOURCE_ACCOUNT:?Set STELLAR_SOURCE_ACCOUNT to a configured Stellar CLI identity}"
wasm="${VEILLEND_WASM:-target/wasm32-unknown-unknown/release/veillend_contract.wasm}"

if [ ! -f "$wasm" ]; then
  echo "WASM artifact not found: $wasm" >&2
  echo "Run scripts/build-contract.sh first." >&2
  exit 1
fi

stellar contract deploy \
  --wasm "$wasm" \
  --source "$source_account" \
  --network "$network"
