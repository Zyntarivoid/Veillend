# VeilLend Contract Specs

This directory is the documented output location for generated VeilLend Soroban contract specs and client bindings.

Run the export script from the repository root:

```bash
./veilend-soroban/scripts/export-contract-specs.sh
```

The script builds the contract WASM and writes:

- `veillend-contract.interface.xdr.txt` - base64-encoded XDR interface entries for tooling that consumes the raw contract spec.
- `veillend-contract.interface.rs` - human-readable Rust interface reference.
- `typescript/` - generated TypeScript client bindings for frontend and backend integration.
- `BUILD_INFO.md` - the source package, artifact path, generated files, and regeneration command for the latest export.

Generated spec artifacts are intentionally ignored by Git so contributors can regenerate them from the current contract source. Keep this README and the export script as the source of truth for where generated client integration files should live.
