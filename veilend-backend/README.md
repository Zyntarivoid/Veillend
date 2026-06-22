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

## Public Configuration Endpoints

The rebuilt backend exposes read-only configuration for frontend and mobile
clients:

- `GET /assets` lists supported asset metadata, risk factors, and cache hints.
- `GET /assets/:symbol` returns metadata for a single supported symbol.
- `GET /protocol/config` returns Stellar network, contract, risk, and
  collateral configuration.
- `GET /protocol/risk` returns only protocol risk and collateral rules.

These endpoints set `Cache-Control: public, max-age=60` because the values are
read-mostly and safe for short-lived client reuse.

## Project setup

```bash
$ npm install
```

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```
