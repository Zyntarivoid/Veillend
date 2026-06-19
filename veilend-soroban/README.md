# VeilLend Soroban Contract

This directory is the active Rust/Soroban contract workspace for VeilLend on Stellar.

## Contributor Quick Start

```bash
cd veilend-soroban
rustup toolchain install 1.88.0
rustup target add wasm32-unknown-unknown --toolchain 1.88.0
rustup target add wasm32v1-none --toolchain 1.88.0
cargo install --locked stellar-cli --version 23.0.1
cargo fmt --check
cargo clippy --locked --all-targets -- -D warnings
cargo test
stellar contract build
```

Use this checklist before opening a PR:

- Keep all contract changes in `src/lib.rs` unless a new module is clearly needed.
- Add or update tests for every state transition or error path you touch.
- Keep storage keys and event topics stable unless the PR explicitly migrates them.
- Document any new testnet environment variables or CLI commands in this file.

## Current Scope

The contract currently provides an initial VeilLend lending scaffold with:

- contract initialization with an admin and minimum collateral ratio
- supported-asset configuration
- position storage per user and asset
- basic `deposit`, `borrow`, `repay`, and `withdraw` state transitions
- typed contract events for key lending actions

This is a protocol foundation, not the full privacy implementation yet. Token transfers, price oracles, liquidation logic, and shielded proof verification still need to be added in follow-up iterations.

## Current Contract Surface

The active contract is `VeilLendContract` in `src/lib.rs`.

| Function | Purpose | Notes |
| --- | --- | --- |
| `__constructor(env, admin, min_collateral_ratio_bps)` | Initializes admin and minimum collateral ratio. | Requires `admin.require_auth()` and rejects ratios below 100%. |
| `configure_asset(env, admin, asset, supported)` | Enables or disables an asset for lending actions. | Admin-only; emits `AssetConfigured`. |
| `deposit(env, user, asset, amount)` | Increases the user's deposited balance for a supported asset. | Requires positive amount and user auth; token transfer integration is still pending. |
| `borrow(env, user, asset, amount)` | Increases the user's borrowed balance after collateral checks. | Uses the configured minimum collateral ratio. |
| `repay(env, user, asset, amount)` | Reduces the user's borrowed balance. | Rejects repayments larger than the current borrowed amount. |
| `withdraw(env, user, asset, amount)` | Reduces the user's deposited balance after collateral checks. | Rejects withdrawals larger than the current deposit. |
| `get_position(env, user, asset)` | Reads a user's stored position. | Returns zero balances when no position exists. |
| `is_asset_supported(env, asset)` | Reads whether an asset is enabled. | Defaults to `false`. |
| `admin(env)` | Reads the configured admin. | Panics with `Unauthorized` before initialization. |
| `min_collateral_ratio_bps(env)` | Reads the configured collateral ratio. | Defaults to `15_000` if missing. |

### Storage Keys

| Key | Value |
| --- | --- |
| `Admin` | Contract admin address. |
| `MinCollateralRatioBps` | Minimum collateral ratio in basis points. |
| `SupportedAsset(Address)` | Boolean asset allowlist entry. |
| `Position(Address, Address)` | Per-user, per-asset `Position { deposited, borrowed }`. |

### Events

The contract emits typed Soroban `#[contractevent]` records for `asset_configured`, `deposit`, `borrow`, `repay`, and `withdraw`. Keep event topics stable so indexers can continue following lending activity.

## Prerequisites

Install the pinned Rust toolchain for this contract:

```bash
rustup toolchain install 1.88.0
```

Install the WebAssembly targets used by Cargo and the Stellar CLI:

```bash
rustup target add wasm32-unknown-unknown --toolchain 1.88.0
rustup target add wasm32v1-none --toolchain 1.88.0
```

Install the Stellar CLI:

```bash
cargo install --locked stellar-cli --version 23.0.1
```

On Ubuntu runners or local Ubuntu machines, install the required system packages first:

```bash
sudo apt-get update
sudo apt-get install -y pkg-config libdbus-1-dev libudev-dev
```

## Local Build

From this directory, run either build flow:

```bash
cargo build --target wasm32-unknown-unknown --release
```

```bash
stellar contract build
```

The Cargo build emits the WASM target under `target/wasm32-unknown-unknown/release/`. The Stellar CLI build should be used before deploy/invoke work because it applies the Soroban contract build pipeline expected by testnet tooling.

## Testing

```bash
cargo test
```

For focused changes, run the smallest package-level test first, then rerun the full workspace check before opening a PR:

```bash
cargo test -p veillend-contract
cargo clippy --locked --all-targets -- -D warnings
```

## Linting

```bash
cargo clippy --locked --all-targets -- -D warnings
```

## Notes

- `rust-toolchain.toml` pins the contract to Rust `1.88.0`.
- The crate is named `veillend-contract` and exposes the `VeilLendContract` Soroban contract.
- Event emission uses Soroban `#[contractevent]` types rather than the deprecated legacy publish payload pattern.
- Cargo does not set a default target in `.cargo/config.toml`; use explicit `--target wasm32-unknown-unknown` when building contract WASM artifacts.
- `stellar-cli` is pinned to `23.0.1` in CI/local setup because newer releases require a newer Rust compiler than this repo currently uses.
- On Ubuntu, `stellar-cli` currently also needs `pkg-config`, `libdbus-1-dev`, and `libudev-dev` installed before `cargo install`.

## Development Workflow

1. Confirm the change matches the current scaffold in `src/lib.rs`.
2. Write code in `src/lib.rs` or a small module imported from it.
3. Format with `cargo fmt --check` before committing.
4. Lint with `cargo clippy --locked --all-targets -- -D warnings`.
5. Run `cargo test`.
6. Build WASM with `cargo build --target wasm32-unknown-unknown --release`.
7. Build Soroban artifacts with `stellar contract build`.
8. Include the commands you ran in the PR description.

## Next Steps

The scaffold is intentionally state-first. Planned follow-up work should land in this rough order:

1. Add Soroban host tests for initialization, asset configuration, and the full deposit/borrow/repay/withdraw lifecycle.
2. Wire Stellar token transfers into deposit, repayment, and withdrawal flows.
3. Add price feeds and enforce collateral health using oracle-backed values.
4. Introduce liquidation and reserve management logic.
5. Add shielded commitment/nullifier storage for the privacy layer.
6. Add deployment and invocation scripts for testnet contributors.

## Documentation

- [Soroban Documentation](https://soroban.stellar.org/docs)
- [Stellar Developer Docs](https://developers.stellar.org/docs)
