# VeilLend Soroban Contract

This directory is the active Rust/Soroban contract workspace for VeilLend on Stellar.

## Current Scope

The contract currently provides an initial VeilLend lending scaffold with:

- contract initialization with an admin and minimum collateral ratio
- supported-asset configuration with per-asset borrow/deposit caps
- position storage per user and asset
- basic `deposit`, `borrow`, `repay`, and `withdraw` state transitions
- oracle-backed collateral valuation (`set_oracle_price` / `get_oracle_price`)
- protocol fee tracking (`record_protocol_fee` / `get_protocol_fee`)
- interest accrual scaffold (`accrue_interest`)
- **global pause mechanism** (`set_paused` / `is_paused` / `require_not_paused`)
- typed contract events for key lending actions

This is a protocol foundation, not the full privacy implementation yet. Token transfers, liquidation logic, and shielded proof verification still need to be added in follow-up iterations.

## Pause Mechanism

The contract exposes a global emergency pause controlled by the admin.
`set_paused(admin, true)` freezes all state-mutating entrypoints **except**
`repay` and `withdraw`, which remain open so users can always exit their
positions even during an incident.

### Pause-checked entrypoints

| Entrypoint            | Pause-checked | Rationale                                                      |
|-----------------------|:-------------:|----------------------------------------------------------------|
| `__constructor`       | ✗             | One-shot initialiser                                           |
| `set_paused`          | ✗             | The pause switch itself must stay usable                       |
| `configure_asset`     | ✓             | Admin mutation — blocked so a compromised key can't reconfig   |
| `update_asset_caps`   | ✓             | Admin mutation — blocked during incidents                      |
| `set_oracle_price`    | ✓             | Admin mutation — blocked to prevent oracle manipulation        |
| `record_protocol_fee` | ✓             | Fee accrual — blocked during incidents                         |
| `accrue_interest`     | ✓             | Permissionless debt clock — stopped so debt doesn't grow while users can't act |
| `deposit`             | ✓             | New capital inflow — halted during incidents                   |
| `borrow`              | ✓             | New debt creation — halted during incidents                    |
| `repay`               | ✗ (intentional) | Users must always be able to reduce debt                     |
| `withdraw`            | ✗ (intentional) | Users must always be able to exit their positions            |

The `✗` gaps on `repay` / `withdraw` are **deliberate**: blocking exits would
trap users in leveraged positions during exactly the scenarios where pausing is
most likely.

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
