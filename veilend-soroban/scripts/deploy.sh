#!/usr/bin/env bash
# Deploy and invoke VeilLend contract on Stellar Testnet
# Usage: ./scripts/deploy.sh [network_alias]
#
# Prerequisites:
#   - stellar-cli 23.0.1+ installed
#   - A funded testnet identity (use `stellar identity generate --network testnet <name>`)
#
# Environment variables:
#   IDENTITY   - Stellar identity to use for deployment (default: "alice")
#   NETWORK    - Network to deploy to (default: "testnet")

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTRACT_DIR="$(dirname "$SCRIPT_DIR")"

IDENTITY="${IDENTITY:-alice}"
NETWORK="${NETWORK:-testnet}"

echo "=== VeilLend Contract Deployment ==="
echo "Identity: $IDENTITY"
echo "Network:  $NETWORK"
echo ""

# Step 1: Build the contract
echo "→ Building contract..."
cd "$CONTRACT_DIR"
cargo build --target wasm32-unknown-unknown --release 2>&1

WASM_FILE="$(cargo metadata --format-version 1 --no-deps | python3 -c "import sys,json; artifacts=json.load(sys.stdin)['target_directory']; print(f'{artifacts}/wasm32-unknown-unknown/release/veillend_contract.wasm')")"

if [ ! -f "$WASM_FILE" ]; then
  echo "ERROR: WASM file not found at $WASM_FILE"
  exit 1
fi

echo "✓ Built: $WASM_FILE"
echo ""

# Step 2: Deploy
echo "→ Deploying to $NETWORK..."
DEPLOY_OUTPUT=$(stellar contract deploy \
  --wasm "$WASM_FILE" \
  --identity "$IDENTITY" \
  --network "$NETWORK" \
  2>&1)

CONTRACT_ID=$(echo "$DEPLOY_OUTPUT" | tail -1)

if [ -z "$CONTRACT_ID" ]; then
  echo "ERROR: Deployment failed"
  echo "$DEPLOY_OUTPUT"
  exit 1
fi

echo "✓ Contract ID: $CONTRACT_ID"
echo ""
echo "=== Deployment Complete ==="
echo "Save this CONTRACT_ID for invocation:"
echo "  export CONTRACT_ID=$CONTRACT_ID"
