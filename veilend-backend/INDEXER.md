# Soroban Event Indexer Pipeline

This indexer ingests on-chain events emitted by the VeilLend Soroban smart contract, normalizes them, and stores them in a local read model database.

---

## 🏗️ Architecture & Schema Design

The indexer runs as a background service in the NestJS backend, polling the configured Stellar/Soroban RPC node for new events.

### Read Model Schema (`veilend-db.json`)
The read models are saved locally in a query-friendly JSON structure:
*   **`checkpoint`**: Stores the highest successfully indexed ledger sequence (`lastIndexedLedger`).
*   **`transactions`**: Ingests `deposit`, `borrow`, `repay`, and `withdraw` events. Includes unique transaction IDs (for idempotency), user addresses, asset addresses, stringified 128-bit decimal amounts, ledger numbers, hashes, and timestamps.
*   **`positions`**: Tracks normalized per-user, per-asset financial states:
    *   `deposited`: Sum of all deposits minus withdrawals.
    *   `borrowed`: Sum of all borrows minus repays.
*   **`assets`**: Stores support status of configuration assets.

---

## 🔄 Indexer Lifecycle Behaviors

### 1. Resume Behavior (Crash & Restart Recovery)
When the backend starts up:
1.  The indexer retrieves the last saved ledger sequence from the database checkpoint (`lastIndexedLedger`).
2.  If the database is uninitialized, it defaults to `STELLAR_INDEXER_START_LEDGER` (configured in env, defaults to `1`).
3.  The indexer requests the oldest available ledger sequence from the Soroban RPC health endpoint (`getHealth`).
4.  **Retention Safety Check**: If the database checkpoint is older than the oldest ledger currently retained by the RPC node (due to ledger expiration or pruning), it automatically jumps the starting height forward to `oldestLedger` and logs a warning about the skipped historical period. This prevents API query failures.
5.  It fetches events in chunks of up to 100, page-navigating using the RPC response pagination `cursor`, and commits the updated checkpoint to disk upon catching up.

### 2. Replay Behavior (Historical Sync Reset)
If you modify your read model schemas or want to index all events from scratch, you can trigger a full historical event replay:
*   **API Trigger**: Issue a `POST /indexer/replay` HTTP request.
*   **Manual Trigger**: Stop the server, delete `veilend-db.json` from the backend directory (or manually reset `lastIndexedLedger` to `0` inside it), and restart the backend.

The replay flow:
1.  Clears all existing positions, transaction history, and asset mappings.
2.  Resets the database checkpoint sequence to `0`.
3.  Triggers an immediate indexing run starting back from the configured `STELLAR_INDEXER_START_LEDGER`.

---

## ⚙️ Environment Configuration

Define the following environment variables in your `.env` file to customize the pipeline:

```env
# VeilLend Soroban contract address to query events for
STELLAR_CONTRACT_ID=CCW57ZST4NV43YS7JZKMGLG62624NV43YS7JZKMGLG62624NV43YS7JZ

# Starting ledger sequence for indexer if no checkpoint is found
STELLAR_INDEXER_START_LEDGER=1

# Polling frequency in milliseconds
STELLAR_INDEXER_POLL_INTERVAL_MS=5000
```
