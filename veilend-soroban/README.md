# VeilLend Soroban Contract

This directory contains the active Rust/Soroban contract workspace for VeilLend
on Stellar. The crate is named `veillend-contract` and exposes the
`VeilLendContract` contract from `src/lib.rs`.

## Current Scope

The contract is a lending scaffold that currently supports:

- one-time initialization with an admin and minimum collateral ratio
- admin-managed supported asset configuration
- per-user, per-asset position storage
- basic `deposit`, `borrow`, `repay`, and `withdraw` state transitions
- read methods for admin, collateral ratio, asset support, and positions
- typed Soroban events for asset configuration and lending actions

The scaffold does not yet move Stellar assets or verify privacy proofs. Token
transfers, oracle pricing, liquidation, storage TTL policy, and shielded
commitment/nullifier logic are planned follow-up work.

## Prerequisites

Install the pinned Rust toolchain:

```bash
rustup toolchain install 1.88.0
```

Install the WebAssembly targets used by Cargo and the Stellar CLI:

```bash
rustup target add wasm32-unknown-unknown --toolchain 1.88.0
rustup target add wasm32v1-none --toolchain 1.88.0
```

Install the pinned Stellar CLI:

```bash
cargo install --locked stellar-cli --version 23.0.1
```

On Ubuntu runners or local Ubuntu machines, install the CLI system
dependencies before installing `stellar-cli`:

```bash
sudo apt-get update
sudo apt-get install -y pkg-config libdbus-1-dev libudev-dev
```

## Quick Start

Run commands from `veilend-soroban` unless noted otherwise.

```bash
cargo fmt --check
cargo test
cargo clippy --locked --all-targets -- -D warnings
cargo build --target wasm32-unknown-unknown --release
stellar contract build
```

The Cargo workspace root is the repository root, but the Soroban package lives
in this directory. Cargo does not set a default build target in
`.cargo/config.toml`, so use `--target wasm32-unknown-unknown` when building
WASM artifacts directly.

## Contract Surface

Public methods:

- `__constructor(admin, min_collateral_ratio_bps)` initializes contract state.
- `configure_asset(admin, asset, supported)` toggles supported asset status.
- `deposit(user, asset, amount)` increases deposited balance.
- `borrow(user, asset, amount)` increases borrowed balance after collateral checks.
- `repay(user, asset, amount)` reduces borrowed balance.
- `withdraw(user, asset, amount)` reduces deposited balance after collateral checks.
- `get_position(user, asset)` returns stored position balances.
- `is_asset_supported(asset)` returns current asset support status.
- `admin()` returns the configured admin address.
- `min_collateral_ratio_bps()` returns the configured collateral ratio.

Errors are emitted with `panic_with_error!` and the `VeilLendError` contract
error enum. Events use Soroban `#[contractevent]` types instead of the
deprecated legacy publish payload pattern.

## Development Workflow

1. Make contract changes in `src/lib.rs`.
2. Keep state keys, events, and errors explicit and stable for client integrators.
3. Run formatting, tests, and lint checks.
4. Build the WASM artifact with Cargo or `stellar contract build`.
5. Update this README when public methods, events, errors, or setup steps change.

## Roadmap

- wire Stellar token transfers into deposit, repay, and withdrawal flows
- add price feeds and oracle-backed collateral valuation
- enforce liquidation and reserve-management rules
- define storage TTL bump strategy for persistent contract state
- add shielded commitment and nullifier storage for the privacy layer
- expand Soroban host tests for initialization, authorization, and lending flows

## Documentation

- [Soroban Documentation](https://soroban.stellar.org/docs)
- [Stellar Developer Docs](https://developers.stellar.org/docs)
