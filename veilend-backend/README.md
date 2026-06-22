# VeilLend Backend

<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

## Description

The VeilLend NestJS backend provides the core infrastructure for the VeilLend platform on Stellar/Soroban. It handles off-chain computations, indexing of on-chain events, user portfolios, asset tracking, and authentication.

## Module Layout

The application architecture is organized into distinct domain modules to clearly separate responsibilities:

### Core Modules

- **Auth (`src/auth`)**
  - **Responsibility**: Manages wallet-based authentication, verifying Stellar signatures, session management, and role-based access control (RBAC).

- **Portfolios (`src/portfolios`)**
  - **Responsibility**: Manages user portfolios, aggregates positions, calculates health factors, and groups assets per user or wallet address.

- **Assets (`src/assets`)**
  - **Responsibility**: Tracks individual assets and tokens supported by the protocol. Manages price feeds, token metadata, and reserve configurations.

- **Transactions (`src/transactions`)**
  - **Responsibility**: Orchestrates the transaction lifecycle (borrowing, lending, liquidations). Simulates Soroban transactions and maintains transaction history.

- **Indexing (`src/indexer`)**
  - **Responsibility**: Listens to Stellar and Soroban ledger events, parses on-chain activity, and synchronizes the protocol state to the local database.

- **Admin Configuration (`src/admin`)**
  - **Responsibility**: Manages protocol-wide settings, risk parameters (e.g., LTV, liquidation thresholds), and administrative operations.

## Shared Contracts and DTO Conventions

To maintain a consistent API structure, we enforce strict Data Transfer Object (DTO) validation and response formatting.

### Directory Structure
Shared contracts and common code reside in `src/common`.

### DTO Validation
- All controllers use NestJS `ValidationPipe`.
- DTOs strictly define boundaries using `class-validator` decorators (e.g., `@IsString()`, `@IsNumber()`).
- Data transformation uses `class-transformer` decorators (e.g., `@Type()`).

### Standardized Responses
We utilize standard API wrapper formats to ensure predictable frontend consumption.
- **Success/Error Wrapper**: `ApiResponseDto<T>` (e.g., `{ success: true, data: { ... } }`)

### Pagination
For list-based endpoints, the following conventions apply:
- **Request**: `PageOptionsDto` defines query options (`page`, `take`, `order`).
- **Response**: `PageDto<T>` wraps an array of data alongside pagination metadata (`PageMetaDto`).

## Project setup

```bash
npm install
cp .env.example .env
```

The backend reads `.env` through Nest `ConfigModule`. The committed
`.env.example` currently documents rate-limit defaults; the Stellar/indexer
settings below are optional because the code has testnet-safe defaults:

```bash
# Optional server port. Defaults to 3000.
PORT=3000

# Optional Stellar testnet overrides.
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
STELLAR_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
STELLAR_NETWORK_PASSPHRASE="Test SDF Network ; September 2015"

# Optional indexer overrides.
STELLAR_CONTRACT_ID=
STELLAR_INDEXER_START_LEDGER=1
STELLAR_INDEXER_POLL_INTERVAL_MS=5000
```

## Compile and run the project

```bash
# development
npm run start

# watch mode
npm run start:dev

# production mode
npm run start:prod
```

The development server listens on `PORT` when set, otherwise `3000`.

## Run tests

```bash
# unit tests
npm run test

# e2e tests
npm run test:e2e

# test coverage
npm run test:cov
```

## Contributor quick check

For a fresh backend change, run these commands from `veilend-backend/` before
opening a pull request:

```bash
npm run lint
npm run test
npm run build
```

Use `npm run start:dev` for local manual testing after the build and tests pass.

## Troubleshooting

| Problem | Likely cause | Fix |
| --- | --- | --- |
| `EADDRINUSE` on startup | Port 3000 is already in use | Set `PORT=3001` in `.env` and restart |
| Stellar RPC calls fail locally | RPC/Horizon URL override is invalid | Remove the override to use the built-in testnet defaults |
| Indexer starts too early | `STELLAR_INDEXER_START_LEDGER` is lower than the target contract history | Set a later ledger for local indexing tests |
| Rate limit tests behave unexpectedly | `.env` overrides throttle settings | Reset `THROTTLE_*` and `AUTH_THROTTLE_*` to `.env.example` values |
| E2E tests cannot connect | Backend is not running or test config is stale | Start `npm run start:dev` in another shell and review `test/jest-e2e.json` |

## Workspace notes

- Run backend commands from `veilend-backend/`, not the repository root.
- Contract code lives in `../veilend-soroban/`; backend changes should avoid
  editing Soroban contracts unless the issue explicitly asks for it.
- Mobile and web clients live in sibling folders and are not required for
  backend setup.
