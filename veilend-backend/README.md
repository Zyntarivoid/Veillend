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

## Contributor Setup Guide

Use this guide when setting up the backend locally for a feature, bug fix, or
documentation contribution. The CI workflow runs this package from the
`veilend-backend` directory on Node.js 20.x with `npm ci`, then runs lint,
build, and tests.

### Prerequisites

- Node.js 20.x
- npm, bundled with Node.js
- A shell from the repository root

### First-time setup

```bash
cd veilend-backend
npm ci
cp .env.example .env
```

The checked-in `.env.example` contains the default rate-limit settings used by
`ConfigModule`. The backend also has safe defaults for Stellar testnet
configuration, so a fresh contributor can start the app without adding Stellar
variables immediately.

### Environment variables

| Variable | Used by | Default / note |
| --- | --- | --- |
| `PORT` | `src/main.ts` | `3000` |
| `THROTTLE_TTL` | global request throttling | `60000` |
| `THROTTLE_LIMIT` | global request throttling | `100` |
| `AUTH_THROTTLE_TTL` | auth throttle configuration placeholder | listed in `.env.example` |
| `AUTH_THROTTLE_LIMIT` | auth throttle configuration placeholder | listed in `.env.example` |
| `STELLAR_HORIZON_URL` | Stellar Horizon client | `https://horizon-testnet.stellar.org` |
| `STELLAR_SOROBAN_RPC_URL` | Soroban RPC client | `https://soroban-testnet.stellar.org` |
| `STELLAR_NETWORK_PASSPHRASE` | Stellar network selection | `Test SDF Network ; September 2015` |
| `STELLAR_CONTRACT_ID` | indexer target contract | test contract id in `src/indexer/indexer.config.ts` |
| `STELLAR_INDEXER_START_LEDGER` | indexer startup ledger | `1` |
| `STELLAR_INDEXER_POLL_INTERVAL_MS` | indexer polling interval | `5000` |
| `DATABASE_URL` | Prisma schema | required only when working on Prisma-backed flows |

See `INDEXER.md` for more detail when working on the Soroban event indexer.

### Run the backend locally

```bash
# one-shot development server
npm run start

# watch mode for active backend work
npm run start:dev

# production entrypoint after npm run build
npm run start:prod
```

The app listens on `http://localhost:3000` unless `PORT` is set.

### Useful scripts

```bash
# compile TypeScript
npm run build

# lint and auto-fix supported TypeScript files
npm run lint

# format source and test files
npm run format

# unit tests
npm run test

# e2e tests
npm run test:e2e

# test coverage
npm run test:cov

# debug tests
npm run test:debug
```

Before opening a pull request, run the same checks as CI from
`veilend-backend`:

```bash
npm run lint
npm run build
npm run test
```

### Troubleshooting

- `npm ci` fails with lockfile or engine errors: confirm you are using Node.js
  20.x and running the command from `veilend-backend`, not the repository root.
- The server starts on an unexpected port: check whether `PORT` is set in your
  shell or `.env`; otherwise Nest listens on `3000`.
- Stellar or Soroban requests fail locally: start with the default testnet
  settings, then override `STELLAR_HORIZON_URL`, `STELLAR_SOROBAN_RPC_URL`,
  `STELLAR_NETWORK_PASSPHRASE`, or `STELLAR_CONTRACT_ID` only for the network
  you are testing.
- Indexer behavior looks stale: verify `STELLAR_INDEXER_START_LEDGER` and
  `STELLAR_INDEXER_POLL_INTERVAL_MS`, then check `INDEXER.md` for the manual
  catch-up and rewind endpoints.
- Prisma commands or database-backed changes fail: provide a PostgreSQL
  `DATABASE_URL` in `.env` before running Prisma-specific commands. The current
  app bootstrap does not require this for the basic `start`, `build`, and unit
  test flow.
- CI fails but local scripts pass: rerun `npm ci`, `npm run lint`,
  `npm run build`, and `npm run test` from a clean checkout of
  `veilend-backend` to match the GitHub Actions workflow.
