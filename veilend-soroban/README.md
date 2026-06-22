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

Or use the repository script, which runs both build steps and writes Stellar CLI output to `target/stellar`:

```bash
./scripts/build.sh
```

## Testnet Deploy And Invoke Scripts

Copy the testnet environment template and fill in the values for your funded Stellar CLI identity and contract addresses:

```bash
cp .env.testnet.example .env.testnet
```

Required environment variables:

- `STELLAR_SOURCE`: funded Stellar CLI identity, secret key, or seed phrase used as the transaction source.
- `VEILLEND_ADMIN`: public address passed to the contract constructor as admin.
- `VEILLEND_CONTRACT_ID`: deployed contract id, required for invoke flows.
- `VEILLEND_ASSET`: asset contract id used in asset configuration and lending calls.
- `VEILLEND_USER`: user public address for position reads and user-authorized actions.

Optional environment variables:

- `STELLAR_NETWORK`: Stellar CLI network name. Defaults to `testnet`.
- `VEILLEND_MIN_COLLATERAL_RATIO_BPS`: constructor collateral ratio. Defaults to `15000`.
- `VEILLEND_WASM`: custom path to `veillend_contract.wasm`.
- `VEILLEND_ENV_FILE`: custom env file path. Defaults to `.env.testnet`.

Build and deploy to Stellar testnet:

```bash
./scripts/build.sh
./scripts/deploy-testnet.sh
```

The deploy script prints the deployed contract id. Save that value as `VEILLEND_CONTRACT_ID` in `.env.testnet`.

Invoke read-only and write flows through the generic wrapper:

```bash
./scripts/invoke-testnet.sh configure_asset --admin "$VEILLEND_ADMIN" --asset "$VEILLEND_ASSET" --supported true
./scripts/invoke-testnet.sh set_oracle_price --admin "$VEILLEND_ADMIN" --asset "$VEILLEND_ASSET" --price 1
./scripts/invoke-testnet.sh deposit --user "$VEILLEND_USER" --asset "$VEILLEND_ASSET" --amount 100
./scripts/invoke-testnet.sh get_position --user "$VEILLEND_USER" --asset "$VEILLEND_ASSET"
```

Stellar CLI parses function arguments after the `--` separator from the deployed contract interface, so additional contract functions can be invoked with the same wrapper.

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
