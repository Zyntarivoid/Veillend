#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTRACT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${CONTRACT_DIR}/.." && pwd)"
OUT_DIR="${CONTRACT_DIR}/specs"
BINDINGS_DIR="${OUT_DIR}/typescript"
WASM_OUT_DIR="${CONTRACT_DIR}/target/spec-wasm"
WASM_FILE="${WASM_OUT_DIR}/veillend_contract.wasm"

command -v stellar >/dev/null 2>&1 || {
  echo "stellar CLI is required. Install it with: cargo install --locked stellar-cli --version 23.0.1" >&2
  exit 127
}

mkdir -p "${OUT_DIR}" "${WASM_OUT_DIR}"

cd "${CONTRACT_DIR}"

stellar contract build \
  --out-dir "${WASM_OUT_DIR}"

if [ ! -f "${WASM_FILE}" ]; then
  echo "Expected Wasm artifact not found: ${WASM_FILE}" >&2
  exit 1
fi

stellar contract info interface \
  --wasm "${WASM_FILE}" \
  --output xdr-base64 \
  > "${OUT_DIR}/veillend-contract.interface.xdr.txt"

stellar contract info interface \
  --wasm "${WASM_FILE}" \
  --output rust \
  > "${OUT_DIR}/veillend-contract.interface.rs"

stellar contract bindings typescript \
  --wasm "${WASM_FILE}" \
  --output-dir "${BINDINGS_DIR}" \
  --overwrite

cat > "${OUT_DIR}/BUILD_INFO.md" <<EOF
# VeilLend Contract Spec Build

- Source package: \`veillend-contract\`
- Wasm artifact: \`${WASM_FILE#${REPO_ROOT}/}\`
- Interface XDR: \`veilend-soroban/specs/veillend-contract.interface.xdr.txt\`
- Interface Rust reference: \`veilend-soroban/specs/veillend-contract.interface.rs\`
- TypeScript bindings: \`veilend-soroban/specs/typescript/\`

Regenerate with:

\`\`\`bash
./veilend-soroban/scripts/export-contract-specs.sh
\`\`\`
EOF

echo "Contract specs exported to ${OUT_DIR}"
