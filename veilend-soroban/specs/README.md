# Contract Specs

Generated contract specs should live in this directory when they are refreshed
for backend or frontend integration work.

Expected generated files:

- `veillend-contract.md`: human-readable contract interface from the WASM spec.
- `veillend-contract.xdr`: base64 XDR contract spec entries for tooling.

Regenerate both files from `veilend-soroban` after changing public contract
methods, events, errors, or contract types:

```bash
stellar contract build
scripts/export-spec.sh
```

The export helper reads `VEILLEND_WASM` when the WASM artifact is not at the
default release path:

```bash
VEILLEND_WASM=target/wasm32-unknown-unknown/release/veillend_contract.wasm scripts/export-spec.sh
```

Client contributors should treat these files as the contract integration
boundary. If the generated spec changes, update backend/mobile/web callers in
the same feature branch or note the downstream migration in the PR.
