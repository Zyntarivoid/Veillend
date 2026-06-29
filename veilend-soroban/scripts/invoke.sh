#!/usr/bin/env bash
# Invoke VeilLend contract methods on Stellar Testnet
# Usage: ./scripts/invoke.sh <function_name> [args...]
#
# Environment variables:
#   CONTRACT_ID - Contract ID (required)
#   IDENTITY    - Stellar identity (default: "alice")
#   NETWORK     - Network (default: "testnet")
#
# Examples:
#   # Initialize the contract
#   CONTRACT_ID=C... ./scripts/invoke.sh initialize \
#     --arg '{"address":"G...","min_collateral_ratio":"150"}'
#
#   # Deposit funds
#   CONTRACT_ID=C... ./scripts/invoke.sh deposit \
#     --arg '{"user":"G...","asset":"USDC","amount":"1000000000"}'
#
#   # Borrow against collateral
#   CONTRACT_ID=C... ./scripts/invoke.sh borrow \
#     --arg '{"user":"G...","asset":"USDC","amount":"500000000"}'
#
#   # Repay a loan
#   CONTRACT_ID=C... ./scripts/invoke.sh repay \
#     --arg '{"user":"G...","asset":"USDC","amount":"250000000"}'
#
#   # Withdraw collateral
#   CONTRACT_ID=C... ./scripts/invoke.sh withdraw \
#     --arg '{"user":"G...","asset":"USDC","amount":"100000000"}'

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

CONTRACT_ID="${CONTRACT_ID:-}"
IDENTITY="${IDENTITY:-alice}"
NETWORK="${NETWORK:-testnet}"

if [ -z "$CONTRACT_ID" ]; then
  echo "ERROR: CONTRACT_ID environment variable is required"
  echo "Usage: CONTRACT_ID=C... $0 <function_name> [args...]"
  exit 1
fi

if [ $# -lt 1 ]; then
  echo "ERROR: Function name required"
  echo "Usage: CONTRACT_ID=C... $0 <function_name> [args...]"
  echo ""
  echo "Available functions:"
  echo "  initialize    - Initialize contract with admin and min collateral ratio"
  echo "  deposit       - Deposit collateral"
  echo "  borrow        - Borrow against collateral"
  echo "  repay         - Repay borrowed amount"
  echo "  withdraw      - Withdraw collateral"
  exit 1
fi

FUNCTION_NAME="$1"
shift

echo "→ Invoking $FUNCTION_NAME on $NETWORK..."
echo "  Contract: $CONTRACT_ID"
echo "  Identity: $IDENTITY"
echo ""

stellar contract invoke \
  --id "$CONTRACT_ID" \
  --identity "$IDENTITY" \
  --network "$NETWORK" \
  -- "$FUNCTION_NAME" \
  "$@"
