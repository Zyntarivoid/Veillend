# Upgrading the VeilLend Contract

This is the operational runbook for shipping a new version of the VeilLend
Soroban contract through the on-chain timelocked upgrade path. The contract
cannot be upgraded by anyone except a current admin, and only after a
minimum delay (`UPGRADE_MIN_TIMELOCK_LEDGERS`, see below), so a bug cannot be
fixed silently and a compromised admin cannot swap the wasm instantly.

## How the mechanism works

- `propose_upgrade(admin, new_wasm_hash)` records a pending `Upgrade` action.
  The delay is `max(TimelockLedgers, UPGRADE_MIN_TIMELOCK_LEDGERS)` and is
  snapshotted into the action at proposal time — shrinking the global timelock
  afterwards does not shorten it.
- `execute_upgrade(admin, action_id)` (after the delay) verifies the new wasm's
  `contract_metadata().contract_version` is not lower than the running one,
  emits `ContractUpgraded { old_version, new_wasm_hash, ledger }`, and swaps
  the executable. It works even while the contract is paused.
- `cancel_upgrade(admin, action_id)` removes a pending upgrade.
- `migrate(admin)` runs the post-upgrade storage migration (idempotent,
  admin-only) and advances the stored `StorageSchemaVersion`. It refuses to
  run twice for the same target with `AlreadyMigrated`.

`get_pending_action(action_id)` exposes the pending upgrade's wasm hash and
`executable_at_ledger` during the delay window, so indexers and the admin UI
can show "upgrade pending, executable at ledger N".

`UPGRADE_MIN_TIMELOCK_LEDGERS` is currently `2000` (~2.8 hours on Futurenet at
5s ledgers, ~5.5 hours on Mainnet at 10s ledgers).

## Runbook

### 1. Build the new wasm

```bash
cd veilend-soroban
cargo build --target wasm32-unknown-unknown --release
# or: stellar contract build
```

The artifact is `target/wasm32-unknown-unknown/release/veillend_contract.wasm`
(or wherever `stellar contract build` puts it).

### 2. Hash the wasm

```bash
sha256sum target/wasm32-unknown-unknown/release/veillend_contract.wasm
```

The hash (hex) is the `new_wasm_hash` you will propose. Install the wasm on
the network so the hash exists (e.g. `stellar contract upload` or the
equivalent SDK call); `execute_upgrade` will fail if the hash was never
uploaded.

### 3. Propose

Call `propose_upgrade(admin, new_wasm_hash)` from an admin wallet. Note the
returned `action_id` and the `executable_at_ledger` from
`get_pending_action(action_id)`.

### 4. Announce

Before executing, announce the upgrade publicly (the delay exists so the
community can audit the hash, the version bump, and the migration plan).

### 5. Wait

Wait until the current ledger sequence >= `executable_at_ledger`.

### 6. Execute

Call `execute_upgrade(admin, action_id)`. This emits `ContractUpgraded` and
swaps the executable. If the new wasm reports a lower `contract_version` than
the running one, execution fails with `InvalidUpgradeVersion` and nothing
changes.

### 7. Migrate

If the new release bumps the storage schema (a new `STORAGE_SCHEMA_VERSION`),
call `migrate(admin)` to run the post-upgrade storage migration. This emits
`StorageMigrated { from_version, to_version }` and advances the stored
schema version. It is idempotent; a second call for the same target fails with
`AlreadyMigrated`.

### 8. Verify

```text
contract_metadata() -> { contract_version, storage_schema_version, storage_schema_id }
```

Confirm `contract_version` matches the new release and (after migration)
`storage_schema_version` matches the new schema. Spot-check a couple of view
functions (`get_admins`, `min_collateral_ratio_bps`, ...) and confirm the
indexer is still consuming events (it should also observe the new
`contract_upgraded` / `storage_migrated` events).

## Versioning rules

- Bump `CONTRACT_VERSION` whenever the public interface changes (new/changed
  entrypoints, events, errors). `execute_upgrade` rejects wasms reporting a
  lower `contract_version` than the running one, so a release that does not
  bump it cannot be deployed over an older one.
- Bump `STORAGE_SCHEMA_VERSION` (and assign a new `STORAGE_SCHEMA_ID`) whenever
  a `DataKey` variant or any stored value shape changes, and add the
  corresponding transition to `migrate_storage_from` in `src/lib.rs`. The
  upgrade + migrate flow exists precisely so this can be done on a live
  deployment instead of forcing users to withdraw and re-deposit.

## Test fixtures

The upgrade integration tests (`tests/integration.rs`) upgrade to two small
purpose-built fixture wasms committed under `tests/fixtures/`:

- `veillend_v2.wasm` — "v2": `contract_version = 11`, storage schema 7, plus an
  `upgraded_marker()` function that v1 does not have (proves the swap). Its
  version always exceeds the contract's current `CONTRACT_VERSION` so the
  upgrade version guard accepts it.
- `veillend_v1.wasm` — "v1": `contract_version = 4` (proves downgrades are
  rejected).

Both are built from the single `upgrade_fixture/` crate (selected by the
`FIXTURE_VERSION` build-script env var) with the **default** release profile —
the root workspace's release profile (lto + opt-level z) emits a
`call_indirect` encoding the protocol-23 host wasmparser rejects, so fixture
artifacts must use the plain profile to be loadable in tests.

Regenerate them when the fixture contract changes:

```bash
cd veilend-soroban
cargo build --manifest-path upgrade_fixture/Cargo.toml --target wasm32-unknown-unknown --release
cp upgrade_fixture/target/wasm32-unknown-unknown/release/veillend_contract_fixture.wasm \
    tests/fixtures/veillend_v2.wasm
FIXTURE_VERSION=v1 cargo build --manifest-path upgrade_fixture/Cargo.toml --target wasm32-unknown-unknown --release
cp upgrade_fixture/target/wasm32-unknown-unknown/release/veillend_contract_fixture.wasm \
    tests/fixtures/veillend_v1.wasm
```
