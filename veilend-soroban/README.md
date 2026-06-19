# VeilLend Soroban Contract

This directory is the active Rust/Soroban contract workspace for VeilLend on Stellar.

## Current Scope

The contract currently provides an initial VeilLend lending scaffold with:

- contract initialization with an admin and minimum collateral ratio
- supported-asset configuration
- position storage per user and asset
- basic `deposit`, `borrow`, `repay`, and `withdraw` state transitions
- typed contract events for key lending actions

This is a protocol foundation, not the full privacy implementation yet. Token transfers, price oracles, liquidation logic, and shielded proof verification still need to be added in follow-up iterations.

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

The helper script chooses `stellar contract build` when the Stellar CLI is
available and falls back to Cargo's explicit WASM target otherwise:

```bash
scripts/build-contract.sh
```

## Testnet Scripts

Copy the example environment file and fill in local values:

```bash
cp .env.testnet.example .env.testnet
```

Required variables:

- `STELLAR_SOURCE_ACCOUNT`: a Stellar CLI identity configured locally.
- `STELLAR_NETWORK`: Stellar CLI network name, defaulting to `testnet`.
- `VEILLEND_WASM`: path to the built WASM artifact, defaulting to the release WASM.
- `VEILLEND_CONTRACT_ID`: deployed contract id for invoke calls.

Deploy the built contract to testnet:

```bash
STELLAR_SOURCE_ACCOUNT=alice scripts/deploy-testnet.sh
```

Invoke read methods on a deployed contract:

```bash
VEILLEND_CONTRACT_ID=CD... STELLAR_SOURCE_ACCOUNT=alice scripts/invoke-testnet.sh admin
VEILLEND_CONTRACT_ID=CD... STELLAR_SOURCE_ACCOUNT=alice scripts/invoke-testnet.sh min_collateral_ratio_bps
```

Pass contract arguments after the function name:

```bash
VEILLEND_CONTRACT_ID=CD... STELLAR_SOURCE_ACCOUNT=alice scripts/invoke-testnet.sh is_asset_supported --asset <asset-address>
VEILLEND_CONTRACT_ID=CD... STELLAR_SOURCE_ACCOUNT=alice scripts/invoke-testnet.sh get_position --user <user-address> --asset <asset-address>
```

## Testing

```bash
cargo test
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

1. Write code in `src/lib.rs`
2. Format and lint with `cargo fmt` and `cargo clippy --all-targets -- -D warnings`
3. Run `cargo test`
4. Build WASM with `cargo build --target wasm32-unknown-unknown --release`
5. Build Soroban artifacts with `stellar contract build`

## Next Steps

- wire in Stellar token transfers for deposit and repayment flows
- add price feeds and enforce collateral health using oracle-backed values
- introduce liquidation and reserve management logic
- add shielded commitment/nullifier storage for the privacy layer
- add Soroban host tests for the lending lifecycle and authorization rules

## Documentation

- [Soroban Documentation](https://soroban.stellar.org/docs)
- [Stellar Developer Docs](https://developers.stellar.org/docs)
