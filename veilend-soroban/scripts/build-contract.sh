#!/bin/sh
set -eu

cd "$(dirname "$0")/.."

if command -v stellar >/dev/null 2>&1; then
  stellar contract build
else
  cargo build --target wasm32-unknown-unknown --release
fi
