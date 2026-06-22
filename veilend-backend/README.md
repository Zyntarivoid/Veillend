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

## Docker

Build and run the backend container from the backend directory:

```bash
$ docker build -t veillend-backend .
$ docker run --rm -p 3000:3000 --env-file .env veillend-backend
```

The image builds the NestJS app in a separate stage and runs `node
dist/main.js` in the runtime stage.

## CI Checks

Backend pull requests run dependency installation, `npm run lint:check`,
`npm run test -- --runInBand`, `npm run build`, and a Docker image build through
`.github/workflows/veilend-backend.yml`.

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```
