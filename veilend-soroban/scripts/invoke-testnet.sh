#!/bin/sh
set -eu

usage() {
  cat >&2 <<'USAGE'
Usage:
  VEILLEND_CONTRACT_ID=<contract-id> STELLAR_SOURCE_ACCOUNT=<identity> scripts/invoke-testnet.sh <function> [args...]

Examples:
  scripts/invoke-testnet.sh admin
  scripts/invoke-testnet.sh min_collateral_ratio_bps
  scripts/invoke-testnet.sh is_asset_supported --asset <asset-address>
  scripts/invoke-testnet.sh get_position --user <user-address> --asset <asset-address>
USAGE
}

cd "$(dirname "$0")/.."

if [ "$#" -lt 1 ]; then
  usage
  exit 64
fi

network="${STELLAR_NETWORK:-testnet}"
source_account="${STELLAR_SOURCE_ACCOUNT:?Set STELLAR_SOURCE_ACCOUNT to a configured Stellar CLI identity}"
contract_id="${VEILLEND_CONTRACT_ID:?Set VEILLEND_CONTRACT_ID to a deployed contract id}"
function_name="$1"
shift

stellar contract invoke \
  --id "$contract_id" \
  --source "$source_account" \
  --network "$network" \
  -- "$function_name" "$@"
