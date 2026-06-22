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

## Testing

```bash
cargo test
```

## Linting

```bash
cargo clippy --locked --all-targets -- -D warnings
```

## Storage TTL Strategy

Soroban persistent and instance entries can expire if they are not extended. VeilLend uses a uniform TTL policy for long-lived protocol state:

- `STORAGE_BUMP_THRESHOLD_LEDGERS = 120960`
- `STORAGE_EXTEND_TO_LEDGERS = 1209600`

When a write path touches long-lived state, the contract extends TTL if the entry is below the threshold:

- contract instance and code TTL are bumped on constructor, admin configuration, oracle price writes, and lending state transitions
- `SupportedAsset(asset)` TTL is bumped when `configure_asset` writes support flags
- `OraclePrice(asset)` TTL is bumped when `set_oracle_price` writes prices
- `Position(user, asset)` TTL is bumped when deposit, borrow, repay, or withdraw writes a user position

Read-only methods such as `get_position`, `get_oracle_price`, `is_asset_supported`, `admin`, and `min_collateral_ratio_bps` do not bump TTL. This keeps simple reads compatible with simulated or non-submitting CLI usage. Contributors adding new persistent records should call the same bump helper immediately after writes and add a storage TTL test when practical.

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
