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

## Contributor Setup

From the repository root, enter the backend workspace and install the locked dependencies:

```bash
cd veilend-backend
npm install
```

Create a local environment file from the checked-in example:

```bash
cp .env.example .env
```

The default backend port is `3000`. Override it with `PORT` when needed:

```env
PORT=3001
```

The `.env.example` file includes rate-limit settings used by the global throttling guard. The Stellar and Soroban clients also have testnet defaults in code, but indexer work can be customized with the variables documented in `INDEXER.md`.

## Running Locally

Run the API in watch mode while developing:

```bash
npm run start:dev
```

Run the API once without watch mode:

```bash
npm run start
```

Build first, then run the compiled output:

```bash
npm run build
npm run start:prod
```

## Testing and Quality Checks

```bash
# unit tests
npm run test

# e2e tests
npm run test:e2e

# test coverage
npm run test:cov

# TypeScript build
npm run build

# ESLint check/fix
npm run lint
```

## Troubleshooting

- **`npm install` fails with dependency resolution errors**: remove `node_modules`, keep `package-lock.json`, and run `npm install` again from `veilend-backend`.
- **The API starts on the wrong port**: set `PORT` in `.env`, then restart `npm run start:dev`.
- **Indexer requests fail against Soroban RPC**: confirm the optional Stellar indexer variables from `INDEXER.md`, especially `STELLAR_CONTRACT_ID`, `STELLAR_INDEXER_START_LEDGER`, and `STELLAR_INDEXER_POLL_INTERVAL_MS`.
- **Tests do not pick up new specs**: backend unit tests are matched with `src/.*\.spec\.ts$` in `package.json`; place focused unit specs under `src`.
