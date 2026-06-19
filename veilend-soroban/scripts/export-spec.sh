#!/bin/sh
set -eu

cd "$(dirname "$0")/.."

wasm="${VEILLEND_WASM:-target/wasm32-unknown-unknown/release/veillend_contract.wasm}"
spec_dir="${VEILLEND_SPEC_DIR:-specs}"

if [ ! -f "$wasm" ]; then
  echo "WASM artifact not found: $wasm" >&2
  echo "Build the contract first with: stellar contract build" >&2
  exit 1
fi

mkdir -p "$spec_dir"

stellar contract inspect --wasm "$wasm" --output docs > "$spec_dir/veillend-contract.md"
stellar contract inspect --wasm "$wasm" --output xdr-base64 > "$spec_dir/veillend-contract.xdr"

echo "Wrote $spec_dir/veillend-contract.md"
echo "Wrote $spec_dir/veillend-contract.xdr"
