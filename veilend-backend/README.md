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

Use this guide to install, run, and validate the rebuilt VeilLend backend from a clean checkout.

### Prerequisites

- Node.js 20.x, matching `.github/workflows/veilend-backend.yml`.
- npm, which ships with Node.js.
- Git.
- A shell from the repository root, or from this `veilend-backend` directory.

### Install from scratch

```bash
# from the repository root
cd veilend-backend
npm ci
```

Use `npm ci` instead of `npm install` for contributor setup because the backend has a committed `package-lock.json` and CI also installs dependencies with `npm ci`.

### Environment setup

Create a local `.env` file from the checked-in example:

```bash
cp .env.example .env
```

On Windows PowerShell, use:

```powershell
Copy-Item .env.example .env
```

The example file currently defines throttling defaults:

```dotenv
THROTTLE_TTL=60000
THROTTLE_LIMIT=100
AUTH_THROTTLE_TTL=60000
AUTH_THROTTLE_LIMIT=5
```

The backend listens on `PORT` when it is set. If `PORT` is omitted, NestJS starts on `3000`.

### Run locally

```bash
# one-time start
npm run start

# development watch mode
npm run start:dev
```

After the server starts, open `http://localhost:3000` unless you configured another `PORT`.

### Validate before opening a PR

Run the same checks that backend CI runs:

```bash
npm run lint
npm run build
npm run test
```

For endpoint-level coverage, also run:

```bash
npm run test:e2e
```

Useful optional commands:

```bash
npm run test:watch
npm run test:cov
npm run format
```

### Common troubleshooting

- `npm ci` fails because the lockfile is out of sync: run from `veilend-backend`, make sure `package-lock.json` is present, and do not use a partially copied workspace.
- `nest: command not found`: run `npm ci` first, then use `npm run ...` scripts so npm resolves `node_modules/.bin`.
- Port `3000` is already in use: set another port before starting the backend, for example `PORT=3001 npm run start:dev` on macOS/Linux or `$env:PORT=3001; npm run start:dev` in PowerShell.
- Lint changes files unexpectedly: the `lint` script includes `--fix`. Review `git diff` before committing generated formatting fixes.
- Tests cannot find environment values: confirm `.env` exists in `veilend-backend` and was copied from `.env.example`.
- CI behaves differently from local runs: check that you are using Node.js 20.x and `npm ci`, matching the backend workflow.

### Contributor workflow

1. Create a branch for your backend change.
2. Make the change inside `veilend-backend`.
3. Run `npm run lint`, `npm run build`, and `npm run test`.
4. Include any intentional lint or format updates in the same commit.
5. Open a pull request and mention the issue it fixes.

## Project setup

```bash
$ npm ci
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
