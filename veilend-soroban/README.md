# VeilLend Soroban Contract

This directory is the active Rust/Soroban contract workspace for VeilLend on Stellar.

## Current Scope

The contract currently provides an initial VeilLend lending scaffold with:

- contract initialization with an admin and minimum collateral ratio
- supported-asset configuration
- position storage per user and asset
- reserve accounting per supported asset
- protocol fee tracking separated from user position balances
- basic `deposit`, `borrow`, `repay`, and `withdraw` state transitions
- typed contract events for key lending actions
- a multi-admin set (`AdminSet`) with `add_admin`/`remove_admin` (any one of N admins can act)
- a propose/execute/cancel timelock on privileged mutations (configurable `set_timelock_ledgers`)
- queryable contract and storage-schema metadata for migration safety

This is a protocol foundation, not the full privacy implementation yet. Token transfers, price oracles, liquidation logic, and shielded proof verification still need to be added in follow-up iterations.

## Reserve Accounting Model

Each supported asset now maintains an `AssetReserve` record with:

- `total_balance`: the protocol-tracked balance currently held for that asset
- `protocol_fees`: the portion of that asset balance owned by the protocol treasury

User balances remain in per-user `Position` records, so protocol-owned fees are not mixed into user deposit or borrow balances.

### State transition rules

- `deposit`: increases the user's deposited balance and the asset reserve `total_balance`
- `borrow`: increases the user's borrowed balance and decreases the asset reserve `total_balance`
- `repay`: decreases the user's borrowed balance and increases the asset reserve `total_balance`
- `withdraw`: decreases the user's deposited balance and decreases the asset reserve `total_balance`
- `record_protocol_fee`: increases both `total_balance` and `protocol_fees` for the asset

### Events

The contract continues to emit action-specific user events (`deposit`, `borrow`, `repay`, `withdraw`) and also emits an `asset_reserve_updated` event whenever reserve accounting changes, plus a per-asset `interest_accrued` event whenever a non-zero amount of interest accrues (topic prefix `veillend`, event name `interest_accrued`). Accrual is idempotent: calling `accrue_interest` (or any entrypoint) again at the same ledger timestamp is a pure no-op that touches no storage and emits no events. This keeps reserve and interest state updates observable and documented consistently for indexers and treasury tooling.

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

## Generate Contract Specifications & Bindings

Contract specifications and client bindings make it safe and easy for backend/frontend contributors to integrate with the Soroban contract.

### Generate TypeScript Bindings

To generate TypeScript client bindings for the contract (for use in veilend-web, veilend-backend, etc.):

1. Build the contract first:
   ```bash
   stellar contract build
   ```

2. Generate TypeScript bindings into the `specs` directory:
   ```bash
   stellar contract bindings typescript --output-dir ./specs --contract-id C... # replace with your contract ID or use --wasm
   ```

   Alternatively, to generate from the built WASM file (without needing a contract ID):
   ```bash
   stellar contract bindings typescript --output-dir ./specs --wasm target/wasm32-unknown-unknown/release/veillend_contract.wasm
   ```

### Inspect Contract Spec

To inspect the contract specification (functions, errors, events) from the built WASM:
```bash
stellar contract info interface --wasm target/wasm32-unknown-unknown/release/veillend_contract.wasm
```

### Storing Specifications

All generated specifications and client bindings should be stored in the `specs/` directory.

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
- Asset reserves and protocol-owned fees are stored separately from user `Position` balances.
- Cargo does not set a default target in `.cargo/config.toml`; use explicit `--target wasm32-unknown-unknown` when building contract WASM artifacts.
- `stellar-cli` is pinned to `23.0.1` in CI/local setup because newer releases require a newer Rust compiler than this repo currently uses.
- On Ubuntu, `stellar-cli` currently also needs `pkg-config`, `libdbus-1-dev`, and `libudev-dev` installed before `cargo install`.

## Contract and storage schema metadata

Call `contract_metadata()` on a deployed contract before writing a migration or an off-chain storage reader. The current contract shape is:

| Metadata field | Current value | Meaning |
| :--- | :--- | :--- |
| `contract_version` | `7` | The public contract interface version. |
| `storage_schema_version` | `5` | The version of serialized storage keys and values. |
| `storage_schema_id` | `VLENDV5` | A compact, stable identifier for this storage layout. |

Schema `VLENDV5` uses these keys:

| Durability | Key | Value |
| :--- | :--- | :--- |
| Instance | `AdminSet` | `Vec<Address>` |
| Instance | `TimelockLedgers` | `u32` |
| Instance | `NextActionId` | `u64` |
| Instance | `PendingAction(u64)` | `PendingAction { kind, payload, executable_at_ledger: u32, proposer: Address }` |
| Instance | `MinCollateralRatioBps` | `u32` |
| Instance | `MaxOracleAge` | `u64` |
| Persistent | `SupportedAsset(Address)` | `bool` |
| Persistent | `AssetReserve(Address)` | `AssetReserve { total_balance: i128, protocol_fees: i128 }` |
| Persistent | `Position(Address, Address)` | `Position { deposited: i128, borrowed: i128, supply_index_snapshot: i128, borrow_index_snapshot: i128 }` |
| Persistent | `OraclePrice(Address)` | `i128` |
| Persistent | `DepositCap(Address)` | `i128` |
| Persistent | `BorrowCap(Address)` | `i128` |
| Persistent | `TotalDeposited(Address)` | `i128` |
| Persistent | `TotalBorrowed(Address)` | `i128` |
| Persistent | `Paused` | `bool` |
| Persistent | `InterestState(Address)` | `InterestState { supply_index: i128, borrow_index: i128, last_accrual_timestamp: u64 }` |
| Persistent | `OracleLastUpdated(Address)` | `u64` |
| Persistent | `OraclePrevPrice(Address)` | `i128` |
| Persistent | `OracleMaxChangeBps(Address)` | `u32` |
| Persistent | `OracleMinPrice(Address)` | `i128` |
| Persistent | `OracleMaxPrice(Address)` | `i128` |

The admin authority is a `Vec<Address>` (`AdminSet`): any one of N admins can act, and `add_admin`/`remove_admin` manage membership (with a last-admin lockout guard). Privileged mutations — `configure_asset`, `set_oracle_price`, `update_asset_caps`, `set_min_collateral_ratio`, pausing, and `record_protocol_fee` — follow a `propose_*` → `execute_*` (after the `TimelockLedgers` delay) → `cancel_*` flow, with `set_paused(false)` exempt so unpausing stays immediate.

**Oracle Safety Rails:** The contract includes comprehensive oracle price safety mechanisms including staleness tracking (`OracleLastUpdated`), volatility limits (`OracleMaxChangeBps`, `OraclePrevPrice`), and absolute bounds (`OracleMinPrice`, `OracleMaxPrice`). These protect against stale prices, excessive volatility, and absurd values that could compromise the protocol.

## Global Pause

`Paused` is a single protocol-wide flag. Pausing is timelocked (`propose_set_paused` → `execute_set_paused`); unpausing via `set_paused(admin, false)` is immediate, so incident response is never itself blocked by the timelock. Every mutating entrypoint either checks `require_not_paused` or is deliberately exempt — the table below is authoritative; treat any entrypoint missing from it as a bug, not an oversight.

**Checked (blocked while paused):**

| Entrypoint | Why it's gated |
| :--- | :--- |
| `deposit`, `borrow` (+ `deposit_batch`/`borrow_batch`, `deposit_for`/`borrow_for`) | Core value-moving user actions. |
| `flash_loan` | Moves value; a compromised admin could `configure_flash_loan` + drain via a self-repaying loop otherwise. |
| `accrue_interest` | Permissionless; advancing the debt clock during a freeze contradicts the freeze. |
| `set_oracle_price`, `execute_set_oracle_price` | A malicious oracle write can misprice collateral to enable theft-by-liquidation or bad debt. |
| `set_max_oracle_age`, `set_oracle_max_change_bps`, `set_oracle_price_bounds` | Weakening these bounds first is how an attacker would set up an out-of-range `set_oracle_price` write. |
| `execute_configure_asset` | Enabling/disabling an asset changes what can be deposited/borrowed. |
| `execute_update_asset_caps`, `set_supply_cap`, `set_borrow_cap` | Cap changes gate how much value can move once unpaused. |
| `execute_set_min_collateral_ratio`, `set_close_factor`, `set_interest_params` | Risk parameters that directly control solvency and liquidation behavior. |
| `execute_record_protocol_fee`, `set_max_protocol_fee_bps` | `record_protocol_fee` credits the protocol treasury from user-reserve funds — exactly the "funnel value while paused" vector this issue closes. |
| `execute_withdraw_reserves` | Directly moves protocol treasury funds out of the contract. |
| `configure_flash_loan` | Admin config for `flash_loan`; must not be reconfigurable to set up value extraction while paused. |

**Not checked (intentionally still callable while paused):**

| Entrypoint | Why it stays open |
| :--- | :--- |
| `repay`, `withdraw` (+ batch/permit variants) | Users must always be able to reduce debt or exit collateral, especially during an incident. |
| `liquidate` | Blocking liquidations while paused would let bad debt accumulate exactly when the protocol is most exposed. |
| `set_paused`, `propose_set_paused`/`execute_set_paused`/`cancel_set_paused` | The pause switch itself must stay reachable in both directions. |
| `add_admin`, `remove_admin`, `set_timelock_ledgers` | Incident response (e.g. removing a compromised admin) must not be paused shut. |
| Every `propose_*` and `cancel_*` (for any action kind) | Proposing has no effect until the corresponding `execute_*` runs (which *is* gated), and cancelling a pending — possibly malicious — action must remain possible mid-incident. |

`CircuitBreakerTriggered` (error code 16) was removed: it was defined and tested but never thrown, and `ContractPaused` (12) already fully covers pause semantics. Code 16 is retired, not reassigned.

When changing the public interface, increment `CONTRACT_VERSION`. When changing a `DataKey` variant or any stored value shape, increment `STORAGE_SCHEMA_VERSION` and assign a new `STORAGE_SCHEMA_ID`. **Keep this table in sync with the implementation** — any drift will break migrations and off-chain readers.

## Development Workflow

1. Write code in `src/lib.rs`
2. Format and lint with `cargo fmt` and `cargo clippy --all-targets -- -D warnings`
3. Run `cargo test`
4. Build WASM with `cargo build --target wasm32-unknown-unknown --release`
5. Build Soroban artifacts with `stellar contract build`
6. (Optional) Generate/update specifications/bindings and commit to `specs/`

## Next Steps

- wire in Stellar token transfers for deposit and repayment flows
- add price feeds and enforce collateral health using oracle-backed values
- introduce liquidation and treasury management logic on top of the reserve ledger
- add shielded commitment/nullifier storage for the privacy layer
- add Soroban host tests for the lending lifecycle and authorization rules

## Documentation

- [Soroban Documentation](https://soroban.stellar.org/docs)
- [Stellar Developer Docs](https://developers.stellar.org/docs)
