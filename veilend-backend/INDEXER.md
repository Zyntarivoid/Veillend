# Soroban Event Indexer Pipeline

This indexer ingests on-chain events emitted by the VeilLend Soroban smart contract, normalizes them, and stores them as PostgreSQL read models via Prisma.

---

## 🏗️ Architecture & Schema Design

The indexer runs as a background service in the NestJS backend, polling the configured Stellar/Soroban RPC node for new events. `IndexerRepository` (`src/indexer/indexer.repository.ts`) is the only component that talks to the database — `IndexerService`/`IndexerController` are unaware of the storage backend.

### Read Model Schema (`prisma/schema.prisma`)
Indexed data is stored in the shared Postgres schema, alongside models owned by other subsystems (auth, admin):
*   **`IndexerCheckpoint`**: A singleton row (fixed id `"global"`) storing the highest successfully indexed ledger sequence (`lastIndexedLedger`). Distinct from `SyncCheckpoint`, which is scoped per-user for a different purpose.
*   **`TransactionHistory`**: Ingests `deposit`, `borrow`, `repay`, and `withdraw` events. The Soroban event id is stored in `sorobanEventId` (unique) and is the true per-event idempotency key — a single Stellar `txHash` can contain multiple contract events, so it cannot be used for dedup on its own. Rows the indexer creates are always written with `status: CONFIRMED` (indexed events are, by definition, already-confirmed on-chain activity) and `amountUsd: 0` (no price-oracle integration exists yet — a known limitation, not built as part of this pipeline).
*   **`Position`**: Tracks normalized per-user, per-asset financial states (`depositedRaw`, `borrowedRaw`), clamped to a minimum of 0. The `Asset`/`User` rows a position references are auto-created (`upsert`) the first time the indexer sees a given wallet/contract address; auto-created `Asset` rows use the contract address itself as a placeholder for `code`/`symbol`/`name` until real metadata is filled in by an admin asset-configuration flow.
*   **`Asset.isSupported`**: Tracks the on-chain `asset_configured` support flag.

---

## 🔄 Indexer Lifecycle Behaviors

### 1. Resume Behavior (Crash & Restart Recovery)
When the backend starts up:
1.  The indexer retrieves the last saved ledger sequence from the `IndexerCheckpoint` table (`lastIndexedLedger`).
2.  If no checkpoint row exists yet, it defaults to `STELLAR_INDEXER_START_LEDGER` (configured in env, defaults to `1`).
3.  The indexer requests the oldest available ledger sequence from the Soroban RPC health endpoint (`getHealth`).
4.  **Retention Safety Check**: If the database checkpoint is older than the oldest ledger currently retained by the RPC node (due to ledger expiration or pruning), it automatically jumps the starting height forward to `oldestLedger` and logs a warning about the skipped historical period. This prevents API query failures.
5.  It fetches events in chunks of up to 100, page-navigating using the RPC response pagination `cursor`, and commits the updated checkpoint to Postgres upon catching up.
6.  Duplicate event delivery is handled at the storage layer: `saveTransaction` returns `false` (no-op) if the event's `sorobanEventId` was already indexed, and the service skips the corresponding position update in that case — so replayed/redelivered events never double-count balances.

### 2. Replay Behavior (Historical Sync Reset)
If you modify your read model schemas or want to index all events from scratch, you can trigger a full historical event replay:
*   **API Trigger**: Issue a `POST /indexer/replay` HTTP request.

The replay flow:
1.  Clears indexer-owned rows only: all `Position` rows, `TransactionHistory` rows carrying a `sorobanEventId`, and the `IndexerCheckpoint` row. `User`, `Asset`, `Session`, and `Admin` rows are **not** touched, since those tables are shared with other subsystems (auth, admin) and must survive a replay.
2.  Triggers an immediate indexing run starting back from the configured `STELLAR_INDEXER_START_LEDGER`.

---

## ⚙️ Environment Configuration

Define the following environment variables in your `.env` file to customize the pipeline:

```env
# PostgreSQL connection string (Prisma) — required for indexer persistence
DATABASE_URL=postgresql://user:password@localhost:5432/veilend

# VeilLend Soroban contract address to query events for
STELLAR_CONTRACT_ID=CCW57ZST4NV43YS7JZKMGLG62624NV43YS7JZKMGLG62624NV43YS7JZ

# Starting ledger sequence for indexer if no checkpoint is found
STELLAR_INDEXER_START_LEDGER=1

# Polling frequency in milliseconds
STELLAR_INDEXER_POLL_INTERVAL_MS=5000
```

## ⚠️ Known Limitations

*   `TransactionHistory.amountUsd` is written as `0` by the indexer — no price-oracle integration exists yet anywhere in the codebase (`AdminService.setOraclePrice` is also currently an unpersisted stub). Populating real USD values is a separate, unscoped effort.
*   Auto-created `Asset` rows (from `asset_configured` events for contracts not yet known to the app) use the contract address as a placeholder for `code`/`symbol`/`name`, since the indexer has no other source for that metadata. A future admin asset-configuration flow is expected to fill in real values.
*   `updatePosition`'s read-modify-write relies on the indexer's poll loop processing events strictly serially (single writer). If indexing is ever parallelized, this needs row-level locking or an atomic increment-then-clamp instead.
