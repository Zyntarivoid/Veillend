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
  - **Responsibility**: Manages wallet-based authentication, verifying Stellar signatures, and role-based access control (RBAC). Issues database-backed sessions that can be inspected (`GET /auth/session`) and revoked (`POST /auth/logout`) independently of JWT expiry — see [`SESSION.md`](./SESSION.md) for the full lifecycle.

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

## Contract Synchronization & Validation

To maintain alignment between the backend and the evolving Soroban contract interface, two npm scripts are provided:

- **Sync Contracts**: `npm run sync-contracts`
  Run this command to refresh and generate updated artifacts if the smart contract logic changes. (Note: Currently relies on existing shapes per configuration, but serves as the standard refresh command for contributors).
- **Validate Contracts**: `npm run validate-contracts`
  Run this command during development or in CI to statically detect contract shape drift. It ensures the indexer natively handles all expected contract events without missing critical handlers.

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

### Prerequisites

- **Node.js 20+** and npm
- **PostgreSQL 16+** (or Docker for the Compose workflow)
- _(Optional)_ **Docker & Docker Compose** for the containerized workflow

### Option A: Local (no Docker)

```bash
# 1. Copy environment template and adjust values
cp .env.example .env

# 2. Install dependencies
npm install

# 3. Generate Prisma Client
npx prisma generate

# 4. Run database migrations (requires a running Postgres instance)
npx prisma migrate deploy

# 5. (Optional) Seed demo data for dashboard / history testing
npm run seed
```

### Option B: Docker Compose (recommended for contributors)

The fastest way to get the full stack running locally:

```bash
# Start Postgres + backend
docker compose up -d

# Follow logs
docker compose logs -f backend

# Seed demo data into the running container
docker compose exec backend npx prisma db seed

# Tear down (keeps Postgres data volume)
docker compose down

# Tear down and remove all data
docker compose down -v
```

The backend will be available at **http://localhost:3000**.
Health check: `curl http://localhost:3000/health`

### Option C: Build & run the Docker image manually

```bash
docker build -t veilend-backend .

docker run -p 3000:3000 \
  -e DATABASE_URL=postgresql://user:pass@host:5432/veilend \
  -e JWT_SECRET=dev_secret \
  veilend-backend
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

# e2e tests (requires a running Postgres – set DATABASE_URL in .env)
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## CI Pipeline

Every pull request triggers the **VeilLend Backend CI** workflow which runs three jobs in parallel:

| Job                    | What it does                                                                        |
| ---------------------- | ----------------------------------------------------------------------------------- |
| **Lint, Build & Test** | `npm ci` → `prisma generate` → lint → build → unit tests → contract-spec validation |
| **E2E Tests**          | Spins up a Postgres service container, runs migrations, then executes the E2E suite |
| **Docker Build**       | Builds the Docker image to catch Dockerfile regressions early                       |

All jobs must pass before a PR can be merged.
