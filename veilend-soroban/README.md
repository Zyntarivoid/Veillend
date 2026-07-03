# VeilLend Soroban Contract

This directory is the active Rust/Soroban contract workspace for VeilLend on
Stellar. It contains the `veillend-contract` crate and exposes the
`VeilLendContract` contract from `src/lib.rs`.

## Current Contract Scope

The contract is a lending protocol foundation, not the full privacy
implementation yet. The current contract supports:

- constructor-based initialization with an admin and minimum collateral ratio
- admin-controlled supported-asset configuration
- per-user, per-asset position storage
- `deposit`, `borrow`, `repay`, and `withdraw` state transitions
- admin-set oracle prices used by collateral checks
- typed Soroban `#[contractevent]` events for asset and lending actions
- host-side unit tests for core structs/errors, plus checked-in snapshots for
  asset configuration, oracle pricing, and collateral limits

Token transfers, liquidations, reserve accounting, and shielded proof
verification are still planned follow-up work.

## Prerequisites

Run these commands from the repository root or from `veilend-soroban` as noted.
The CI workflow uses Rust `1.88.0`, the `wasm32-unknown-unknown` and
`wasm32v1-none` targets, and `stellar-cli` `23.0.1`.

```bash
rustup toolchain install 1.88.0
rustup target add wasm32-unknown-unknown --toolchain 1.88.0
rustup target add wasm32v1-none --toolchain 1.88.0
```

On Ubuntu, install the system packages required before installing the Stellar
CLI:

```bash
sudo apt-get update
sudo apt-get install -y pkg-config libdbus-1-dev libudev-dev
```

Install the Stellar CLI version used by CI:

```bash
cargo install --locked stellar-cli --version 23.0.1
```

## Build And Test

Use the active Soroban workspace directory:

```bash
cd veilend-soroban
```

Run the CI-aligned local checks:

```bash
cargo fmt --all -- --check
cargo clippy --locked --all-targets -- -D warnings
cargo test --locked --target x86_64-unknown-linux-gnu
cargo build --locked --target wasm32-unknown-unknown --release
stellar contract build
```

For a faster edit loop while developing contract logic, run:

```bash
cargo test --target x86_64-unknown-linux-gnu
cargo build --target wasm32-unknown-unknown --release
```

## Contributor Workflow

1. Work in `veilend-soroban/src/lib.rs` for the active contract.
2. Keep changes focused on one issue or behavior.
3. Add or update host-side tests when changing contract behavior.
4. Run the CI-aligned commands above before opening a pull request.
5. Mention any commands you could not run in the pull request description.

The `veilend-soroban/veilend_hello` folder is a leftover starter contract and
is excluded from the root Cargo workspace. Do not use it for new VeilLend
contract work.

## Roadmap

Already present:

- lending position storage and basic lending state transitions
- admin asset support toggles
- oracle price storage and collateral checks for borrow/withdraw flows
- structured Soroban events for configured assets, deposits, borrows, repays,
  and withdrawals

Planned next:

- wire in Stellar token transfers for real deposit, repayment, and withdrawal
  asset movement
- add liquidation and reserve-management rules
- add explicit pause or emergency-stop storage and public admin controls
- expand host-side tests for the full lending lifecycle and authorization rules
- add shielded commitment/nullifier storage and proof-verification hooks for the
  privacy layer
- export contract specs and document client integration flows

## Notes

- `rust-toolchain.toml` pins the contract to Rust `1.88.0`.
- `soroban-sdk` is pinned to `=23.5.3` in `Cargo.toml`.
- `.cargo/config.toml` intentionally does not set a default target. Use
  `--target wasm32-unknown-unknown` for contract WASM builds and
  `--target x86_64-unknown-linux-gnu` for host tests.
- `stellar-cli` is pinned to `23.0.1` because newer versions may require a Rust
  compiler newer than the repository toolchain.

## Troubleshooting

- `cargo test` tries to run for WebAssembly: pass
  `--target x86_64-unknown-linux-gnu` so host-side Soroban tests run locally.
- `cargo build` does not produce a contract WASM: pass
  `--target wasm32-unknown-unknown --release`.
- `stellar contract build` is missing: install `stellar-cli` `23.0.1` with
  `cargo install --locked stellar-cli --version 23.0.1`.
- `stellar-cli` fails to install on Ubuntu: install `pkg-config`,
  `libdbus-1-dev`, and `libudev-dev` first.
- Clippy or Cargo resolves different dependencies locally: include `--locked`
  when matching CI.

## Documentation

- [Soroban Documentation](https://soroban.stellar.org/docs)
- [Stellar Developer Docs](https://developers.stellar.org/docs)
