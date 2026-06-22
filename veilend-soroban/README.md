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

## Contract Error Model

Contract failures use the `VeilLendError` enum. Error codes are stable for client integrations, and clients can call `error_message(code)` to map a numeric code to contributor-facing copy.

| Code | Variant | Main trigger |
| --- | --- | --- |
| 1 | `AlreadyInitialized` | Constructor is called after the contract was already initialized. |
| 2 | `Unauthorized` | Admin-only actions are signed by a non-admin address. |
| 3 | `UnsupportedAsset` | Lending action references an asset that has not been configured as supported. |
| 4 | `InvalidAmount` | Amount or oracle price is zero or negative. |
| 5 | `InsufficientCollateral` | Borrow or withdraw would violate the minimum collateral ratio. |
| 6 | `InsufficientDeposit` | Withdraw amount is greater than deposited balance. |
| 7 | `RepayTooLarge` | Repay amount is greater than outstanding borrowed balance. |
| 8 | `InvalidCollateralRatio` | Constructor collateral ratio is less than `10000` basis points. |

Admin methods use the same authorization helper before mutating state, and lending methods validate asset support and positive amounts before writing positions.

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
