#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${VEILLEND_OUT_DIR:-$ROOT_DIR/target/stellar}"

if ! command -v cargo >/dev/null 2>&1; then
  echo "cargo is required. Install Rust 1.88.0 as documented in veilend-soroban/README.md." >&2
  exit 1
fi

if ! command -v stellar >/dev/null 2>&1; then
  echo "stellar CLI is required. Install with: cargo install --locked stellar-cli --version 23.0.1" >&2
  exit 1
fi

mkdir -p "$OUT_DIR"

cargo build \
  --manifest-path "$ROOT_DIR/Cargo.toml" \
  --target wasm32-unknown-unknown \
  --release

stellar contract build \
  --manifest-path "$ROOT_DIR/Cargo.toml" \
  --out-dir "$OUT_DIR"

echo "Build complete."
echo "Cargo WASM: $ROOT_DIR/target/wasm32-unknown-unknown/release/veillend_contract.wasm"
echo "Stellar build output: $OUT_DIR"
