# VeilLend Backend

The VeilLend backend is a NestJS service for the Stellar/Soroban rebuild. It
provides wallet authentication, protocol administration endpoints, indexed
contract read models, asset and portfolio queries, and transaction history for
the web and mobile clients.

This guide is focused on contributors working in `veilend-backend/`.

## What Runs Here

| Area | Source | Purpose |
| --- | --- | --- |
| App shell | `src/app.module.ts`, `src/main.ts` | Starts the NestJS HTTP server on `PORT` or `3000`. |
| Stellar clients | `src/stellar/` | Wraps Horizon and Soroban RPC clients with health checks. |
| Indexer | `src/indexer/` | Polls Soroban contract events and stores local read models in `veilend-db.json`. |
| Auth | `src/auth/` | Handles wallet nonce and signature flows. |
| Portfolios | `src/portfolios/` | Exposes account position summaries. |
| Assets | `src/assets/` | Exposes supported asset and reserve data. |
| Transactions | `src/transactions/` | Exposes transaction lifecycle data. |
| Admin | `src/admin/` | Holds protocol configuration and recovery surfaces. |
| Shared DTOs | `src/common/dto/` | Defines API response and pagination wrappers. |

The repository also contains an older backend under `legacy/`. New backend work
for the GrantFox campaign should happen in this `veilend-backend/` directory
unless an issue explicitly says otherwise.

## Prerequisites

- Node.js 20 or newer.
- npm, using the committed `package-lock.json`.
- Git.
- Optional: a reachable Stellar Horizon endpoint and Soroban RPC endpoint if you
  want the health checks and indexer to talk to a live network.

No database server is required for the current indexer read model. Runtime
indexer state is written to `veilend-db.json` in the backend working directory.

## Fresh Setup

```bash
git clone https://github.com/Zyntarivoid/Veillend.git
cd Veillend/veilend-backend
npm ci
cp .env.example .env
```

On Windows PowerShell, use:

```powershell
Copy-Item .env.example .env
```

Review `.env` before starting the service. The defaults target Stellar testnet
and are safe for local development.

## Environment Variables

| Variable | Default | Notes |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port used by `src/main.ts`. |
| `THROTTLE_TTL` | `60000` | Global throttling window in milliseconds. |
| `THROTTLE_LIMIT` | `100` | Requests allowed per throttling window. |
| `AUTH_THROTTLE_TTL` | `60000` | Reserved for auth-specific rate limiting. |
| `AUTH_THROTTLE_LIMIT` | `5` | Reserved for auth-specific rate limiting. |
| `STELLAR_HORIZON_URL` | `https://horizon-testnet.stellar.org` | Horizon client endpoint. |
| `STELLAR_SOROBAN_RPC_URL` | `https://soroban-testnet.stellar.org` | Soroban RPC endpoint. |
| `STELLAR_NETWORK_PASSPHRASE` | `Test SDF Network ; September 2015` | Stellar network passphrase. |
| `STELLAR_CONTRACT_ID` | Stub contract ID in `src/indexer/indexer.config.ts` | Contract filtered by the event indexer. Replace it for real indexing. |
| `STELLAR_INDEXER_START_LEDGER` | `1` | First ledger used when no checkpoint exists. |
| `STELLAR_INDEXER_POLL_INTERVAL_MS` | `5000` | Delay between indexer polling cycles. |

## Common Commands

Run commands from `veilend-backend/`.

```bash
npm run start
npm run start:dev
npm run start:debug
npm run build
npm run lint
npm run format
npm run test
npm run test:e2e
npm run test:cov
```

Use `npm run start:dev` for local feature work. Use `npm run build`, `npm run
lint`, and the relevant Jest command before opening a pull request.

## Local Verification Flow

1. Install dependencies with `npm ci`.
2. Copy `.env.example` to `.env`.
3. Start the API with `npm run start:dev`.
4. Visit `http://localhost:3000/` and confirm the app returns `Hello World!`.
5. Check indexer state with `GET /indexer/status`.
6. Run the verification commands that match your change:

```bash
npm run build
npm run lint
npm run test
```

For indexer changes, also read `INDEXER.md` and exercise:

```bash
curl http://localhost:3000/indexer/status
curl -X POST http://localhost:3000/indexer/replay
```

## Troubleshooting

### Dependency install fails

Delete `node_modules`, keep `package-lock.json`, and run `npm ci` again. Avoid
mixing package managers because the repository currently commits an npm lockfile.

### Port 3000 is already in use

Set a different port before starting:

```bash
PORT=3001 npm run start:dev
```

On PowerShell:

```powershell
$env:PORT = "3001"; npm run start:dev
```

### Soroban or Horizon health checks warn on startup

Confirm `STELLAR_HORIZON_URL` and `STELLAR_SOROBAN_RPC_URL` are reachable. The
server still starts if the asynchronous health check fails, but Stellar-backed
features may return empty or degraded data until the endpoint is healthy.

### Indexer status shows an empty contract ID

Set `STELLAR_CONTRACT_ID` in `.env`. Without a contract ID, the indexer skips
polling contract events and logs a warning.

### Indexer starts from an unexpected ledger

Check `veilend-db.json`. The indexer resumes from the stored checkpoint. For a
local replay, either call `POST /indexer/replay` or remove `veilend-db.json`
while the server is stopped.

### Tests that touch network clients are flaky

Prefer unit tests with mocked Horizon and Soroban RPC clients. Live endpoint
availability should not be required for deterministic Jest coverage.

## Pull Request Checklist

- Keep backend changes scoped to `veilend-backend/` unless the issue says the
  web, mobile, contract, or legacy workspaces are also in scope.
- Document any new environment variables in this README and `.env.example`.
- Include the exact commands you ran in the PR body.
- Mention whether the indexer read model file `veilend-db.json` was generated
  locally. Do not commit local runtime state unless an issue explicitly asks for
  a fixture.
- Link the issue with `Closes #<issue-number>` when the change fully satisfies
  the acceptance criteria.
