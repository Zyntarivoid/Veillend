# VeilLend Soroban Contract

Active Rust/Soroban workspace for **VeilLend** on Stellar.  
Path: `veilend-soroban/` (from the monorepo root).

## Contributor quickstart

```bash
# 1) Toolchain (pinned in rust-toolchain.toml)
rustup toolchain install 1.88.0
rustup target add wasm32-unknown-unknown --toolchain 1.88.0
rustup target add wasm32v1-none --toolchain 1.88.0

# 2) From this directory
cd veilend-soroban
cargo test --locked
cargo build --locked --target wasm32-unknown-unknown --release

# Optional: Stellar CLI (version pinned for this Rust line)
cargo install --locked stellar-cli --version 23.0.1
stellar contract build
```

Ubuntu system deps (for `stellar-cli`):

```bash
sudo apt-get update
sudo apt-get install -y pkg-config libdbus-1-dev libudev-dev
```

| Pin | Value |
| --- | --- |
| Rust | **1.88.0** (`rust-toolchain.toml`) |
| Stellar CLI | **23.0.1** |
| WASM target | `wasm32-unknown-unknown` |
| Crate | `veillend-contract` → `VeilLendContract` |

Prefer **`--locked`** so builds match `Cargo.lock` and CI.

---

## What works today

Scaffold for a Stellar lending protocol (not full privacy yet):

- Contract init with admin + minimum collateral ratio
- Supported-asset configuration
- Per-user/per-asset position storage
- Per-asset reserve accounting
- Protocol fee tracking separated from user balances
- `deposit` / `borrow` / `repay` / `withdraw` state transitions
- Typed contract events for lending actions
- Contract + storage-schema metadata for migration safety

**Not in this scaffold yet:** Stellar asset transfers, live price oracles, liquidation, shielded proof verification.

---

## Reserve accounting model

Each supported asset keeps an `AssetReserve`:

| Field | Meaning |
| --- | --- |
| `total_balance` | Protocol-tracked balance held for the asset |
| `protocol_fees` | Portion of that balance owned by the treasury |

User deposits/borrows live in `Position` records — fees are never mixed into user balances.

### State transitions

| Action | User position | Reserve |
| --- | --- | --- |
| `deposit` | deposited ↑ | `total_balance` ↑ |
| `borrow` | borrowed ↑ | `total_balance` ↓ |
| `repay` | borrowed ↓ | `total_balance` ↑ |
| `withdraw` | deposited ↓ | `total_balance` ↓ |
| `record_protocol_fee` | — | `total_balance` ↑ and `protocol_fees` ↑ |

### Events

User action events (`deposit`, `borrow`, `repay`, `withdraw`) plus `asset_reserve_updated` on every reserve change (for indexers / treasury tooling).

---

## Build, test, lint

```bash
# Unit / host tests
cargo test --locked

# WASM release artifact
cargo build --locked --target wasm32-unknown-unknown --release

# Or via Stellar CLI
stellar contract build

# Format + lint (CI-style)
cargo fmt --all -- --check
cargo clippy --locked --all-targets -- -D warnings
```

Default target is **not** set in `.cargo/config.toml` — always pass `--target wasm32-unknown-unknown` for contract WASM builds.

---

## Specs & TypeScript bindings

Specs live under `specs/`. After a successful build:

```bash
# From WASM (no deployed contract id required)
stellar contract bindings typescript \
  --output-dir ./specs \
  --wasm target/wasm32-unknown-unknown/release/veillend_contract.wasm

# Inspect interface
stellar contract info interface \
  --wasm target/wasm32-unknown-unknown/release/veillend_contract.wasm
```

Commit updated bindings when the public interface changes.

---

## Contract / storage schema metadata

Call `contract_metadata()` before migrations or off-chain readers.

| Metadata field | Current | Meaning |
| --- | --- | --- |
| `contract_version` | `1` | Public interface version |
| `storage_schema_version` | `1` | Serialized keys/values version |
| `storage_schema_id` | `VLENDV1` | Stable layout id |

### Schema `VLENDV1` keys

| Durability | Key | Value |
| --- | --- | --- |
| Instance | `Admin` | `Address` |
| Instance | `MinCollateralRatioBps` | `u32` |
| Persistent | `SupportedAsset(Address)` | `bool` |
| Persistent | `Position(Address, Address)` | `Position { deposited, borrowed }` |
| Persistent | `OraclePrice(Address)` | `i128` |

- Public interface change → bump `CONTRACT_VERSION`
- `DataKey` or value shape change → bump `STORAGE_SCHEMA_VERSION` + new `STORAGE_SCHEMA_ID`
- Keep this table in sync with `src/`

---

## Suggested development loop

1. Edit `src/` (contract entry is `VeilLendContract`)
2. `cargo fmt` + `cargo clippy --locked --all-targets -- -D warnings`
3. `cargo test --locked`
4. `cargo build --locked --target wasm32-unknown-unknown --release`
5. Optionally refresh `specs/` bindings and commit them

---

## Roadmap (not done in this scaffold)

Priority order for follow-up work (also tracked as campaign issues):

1. **Stellar asset transfers** — wire SAC transfers into deposit / repay / withdraw
2. **Oracle prices** — feed prices and enforce collateral health
3. **Liquidations** — unhealthy position liquidation + treasury flows
4. **Privacy layer** — shielded commitment / nullifier storage + proof verification
5. **Host integration tests** — full lending lifecycle + auth rules under Soroban

---

## Docs

- [Soroban docs](https://soroban.stellar.org/docs)
- [Stellar developer docs](https://developers.stellar.org/docs)
- Monorepo root [README](../README.md)
