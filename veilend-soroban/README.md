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
- a timelocked contract upgrade path (`propose_upgrade`/`execute_upgrade`/`cancel_upgrade`) with a hard minimum delay, a downgrade version guard, and a post-upgrade `migrate` entrypoint

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
| `contract_version` | `8` | The public contract interface version. |
| `storage_schema_version` | `5` | The version of serialized storage keys and values. |
| `storage_schema_id` | `VLENDV5` | A compact, stable identifier for this storage layout. |

`storage_schema_version` reflects the **deployed instance's** schema: it is stored at construction and only advanced by `migrate`, so immediately after an upgrade to a wasm with a newer storage layout it still reports the pre-migration version until the migration runs.

Schema `VLENDV5` uses these keys:

| Durability | Key | Value |
| :--- | :--- | :--- |
| Instance | `AdminSet` | `Vec<Address>` |
| Instance | `TimelockLedgers` | `u32` |
| Instance | `NextActionId` | `u64` |
| Instance | `PendingAction(u64)` | `PendingAction { kind, payload, executable_at_ledger: u32, proposer: Address }` |
| Instance | `StorageSchemaVersion` | `u32` |
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

The admin authority is a `Vec<Address>` (`AdminSet`): any one of N admins can act, and `add_admin`/`remove_admin` manage membership (with a last-admin lockout guard). Privileged mutations — `configure_asset`, `set_oracle_price`, `update_asset_caps`, `set_min_collateral_ratio`, pausing, `record_protocol_fee`, `withdraw_reserves`, and upgrading — follow a `propose_*` → `execute_*` (after the `TimelockLedgers` delay) → `cancel_*` flow, with `set_paused(false)` exempt so unpausing stays immediate.

Upgrades (`propose_upgrade`/`execute_upgrade`/`cancel_upgrade`) are timelocked like every other privileged mutation but with a hard floor: the delay is `max(TimelockLedgers, UPGRADE_MIN_TIMELOCK_LEDGERS)` and is snapshotted into the pending action at proposal time, so an admin cannot shrink the global timelock and immediately swap the wasm. `execute_upgrade` is **not** blocked while the contract is paused — pausing is the expected response to a discovered bug and must never lock out the fix. It also rejects downgrades: a wasm whose `contract_metadata().contract_version` is lower than the running one fails with `InvalidUpgradeVersion`.

After an upgrade to a wasm with a newer storage layout, an admin calls `migrate(admin)` (idempotent, admin-only) to run the post-upgrade storage migration and advance the stored `StorageSchemaVersion`; a second call for the same target version fails with `AlreadyMigrated`. See [`UPGRADING.md`](./UPGRADING.md) for the operational runbook.

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
| `execute_upgrade`, `migrate` | The upgrade + migrate flow is the incident-response path for a paused contract: you pause first, then upgrade and migrate to ship the fix. |
| `add_admin`, `remove_admin`, `set_timelock_ledgers` | Incident response (e.g. removing a compromised admin) must not be paused shut. |
| Every `propose_*` and `cancel_*` (for any action kind) | Proposing has no effect until the corresponding `execute_*` runs (which *is* gated), and cancelling a pending — possibly malicious — action must remain possible mid-incident. |

`CircuitBreakerTriggered` (error code 16) was removed: it was defined and tested but never thrown, and `ContractPaused` (12) already fully covers pause semantics. Code 16 is retired, not reassigned.

When changing the public interface, increment `CONTRACT_VERSION`. When changing a `DataKey` variant or any stored value shape, increment `STORAGE_SCHEMA_VERSION` and assign a new `STORAGE_SCHEMA_ID`, and add the corresponding transition to `migrate_storage_from`. **Keep this table in sync with the implementation** — any drift will break migrations and off-chain readers.

## Error codes

All contract errors are typed via `VeilLendError` (`#[contracterror]`, `#[repr(u32)]`). Each variant maps to a unique `u32` code that client integrators can match on:

| Code | Error | Meaning |
| :--- | :--- | :--- |
| 1 | `AlreadyInitialized` | Contract has already been initialized |
| 2 | `Unauthorized` | Caller is not an admin (or the requested admin does not exist) |
| 3 | `UnsupportedAsset` | Asset is not supported by the protocol |
| 4 | `InvalidAmount` | Amount must be positive |
| 5 | `InsufficientCollateral` | Collateral ratio below minimum after operation |
| 6 | `InsufficientDeposit` | Withdraw amount exceeds deposited balance |
| 7 | `RepayTooLarge` | Repay amount exceeds outstanding borrowed balance |
| 8 | `InvalidCollateralRatio` | Minimum collateral ratio is below 100% (10_000 bps) |
| 9 | `NotInitialized` | Contract has not been initialized yet |
| 10 | `ZeroAmount` | Amount of zero is not allowed |
| 11 | `OraclePriceMissing` | Oracle price not configured for the asset |
| 12 | `ContractPaused` | Operation blocked: contract is paused |
| 13 | `DepositCapExceeded` | Deposit cap would be exceeded |
| 14 | `BorrowCapExceeded` | Borrow cap would be exceeded |
| 15 | `InvalidCap` | Invalid cap value (must be positive or -1 for unlimited) |
| 17 | `InsufficientReserve` | Reserve balance is too low for the requested action |
| 18 | `TimelockNotReady` | Pending action's timelock window has not elapsed yet |
| 19 | `UnknownAction` | No pending action with the given id (or wrong kind) |
| 20 | `LastAdminRequired` | Cannot remove the last remaining admin |
| 21 | `InvalidTimelock` | Timelock value is outside the allowed range |
| 22 | `TimelockRequired` | Pausing requires a timelocked proposal (use propose/execute) |
| 23 | `OraclePriceStale` | Oracle price is stale (exceeded maximum age) |
| 24 | `OraclePriceChangeExceedsLimit` | Oracle price change exceeds maximum allowed change |
| 25 | `OraclePriceBelowMin` | Oracle price is below minimum allowed price |
| 26 | `OraclePriceAboveMax` | Oracle price is above maximum allowed price |
| 27 | `AssetHasActivePositions` | Cannot disable an asset with active deposited/borrowed balances |
| 28 | `CapBelowOutstanding` | Proposed cap is below the current outstanding total for the asset |
| 29 | `ProtocolFeeExceedsLimit` | Requested protocol fee exceeds the admin-configured max bound |
| 30 | `ArithmeticOverflow` | Arithmetic overflow or underflow in interest accrual/index math |
| 31 | `SupplyCapExceeded` | Deposit would exceed the configured aggregate supply cap |
| 32 | `PositionNotLiquidatable` | Position does not meet the liquidation criteria |
| 33 | `FlashLoanNotConfigured` | Flash loan requested for an asset without flash-loan configuration |
| 34 | `FlashLoanDisabled` | Flash loans are disabled for the asset |
| 35 | `FlashLoanExceedsMaxBps` | Flash loan fee would exceed the configured maximum |
| 36 | `FlashLoanUnderRepayment` | Flash loan repaid less than the owed amount |
| 37 | `FlashLoanReentrancy` | Flash-loan reentrancy attempt detected |
| 38 | `InvalidFlashLoanPremium` | Flash-loan premium is outside the allowed range |
| 39 | `InvalidFlashLoanMaxBps` | Flash-loan max bps is outside the allowed range |
| 40 | `InvalidInterestParams` | Interest-rate model parameters are out of the allowed bounds |
| 41 | `InvalidSignature` | Permit signature verification failed |
| 42 | `PermitExpired` | Permit has expired (deadline passed) |
| 43 | `PermitNonceMismatch` | Permit nonce does not match the expected value |
| 44 | `PermitChainMismatch` | Permit chain ID does not match the contract's chain ID |
| 45 | `InvalidUpgradeVersion` | Proposed upgrade wasm reports a `contract_version` lower than the running one (downgrade rejected) |
| 46 | `AlreadyMigrated` | Storage migration already completed for the target storage-schema version |

## Development Workflow

1. Write code in `src/lib.rs`
2. Format and lint with `cargo fmt` and `cargo clippy --all-targets -- -D warnings`
3. Run `cargo test`
4. Build WASM with `cargo build --target wasm32-unknown-unknown --release`
5. Build Soroban artifacts with `stellar contract build`
6. (Optional) Generate/update specifications/bindings and commit to `specs/`
7. If the upgrade integration tests' fixture wasms changed, regenerate them (see [`UPGRADING.md`](./UPGRADING.md))

## Next Steps

- wire in Stellar token transfers for deposit and repayment flows
- add price feeds and enforce collateral health using oracle-backed values
- introduce liquidation and treasury management logic on top of the reserve ledger
- add shielded commitment/nullifier storage for the privacy layer
- add Soroban host tests for the lending lifecycle and authorization rules

## Documentation

- [Soroban Documentation](https://soroban.stellar.org/docs)
- [Stellar Developer Docs](https://developers.stellar.org/docs)
