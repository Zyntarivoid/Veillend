# VeilLend Backend

This backend is a NestJS API for the VeilLend platform. It exposes wallet-authenticated endpoints, Starknet contract integrations, and persistence through Supabase or a local PostgreSQL fallback.

## Prerequisites

- Node.js 22+ and npm
- A local PostgreSQL instance if you are not using Supabase
- Optional: a local Starknet devnet for contract-related flows

## Quick start from scratch

1. Change into the backend folder:

```bash
cd veilend-backend
```

2. Install dependencies:

```bash
npm install
```

3. Create your environment file:

```bash
cp .env.example .env
```

If you are using PowerShell on Windows, use:

```powershell
Copy-Item .env.example .env
```

4. Review the values in .env and update at least the following for local development:

- `JWT_SECRET`
- `DATABASE_URL` (or Supabase values)
- `STARKNET_RPC_URL` / `STARKNET_DEVNET_URL`

5. Start the development server:

```bash
npm run start:dev
```

The API will be available at http://localhost:3000 unless you override `PORT` in your environment.

## Available scripts

The commands below match the scripts defined in package.json:

```bash
# Build the project
npm run build

# Start in development mode with file watching
npm run start:dev

# Start in debug mode
npm run start:debug

# Run the unit test suite
npm run test

# Run end-to-end tests
npm run test:e2e

# Generate a coverage report
npm run test:cov

# Lint the codebase
npm run lint
```

## Database and local services

- If `USE_SUPABASE=false` or no Supabase credentials are provided, the backend will connect to the PostgreSQL URL in `DATABASE_URL` and apply the SQL from `supabase_schema.sql` at startup.
- For contract and transaction flows, run a Starknet devnet or point `STARKNET_RPC_URL` to a reachable node.

## Testing

Run the unit tests with:

```bash
npm run test
```

Run the end-to-end suite with:

```bash
npm run test:e2e
```

## Troubleshooting

- `npm install` fails: remove the existing lockfile and dependencies, then rerun `npm install`.
- The app cannot connect to PostgreSQL: verify `DATABASE_URL` and that PostgreSQL is running.
- The install step reports an engine mismatch: use Node.js 22+ because the Starknet dependency requires it.
- Authentication fails: confirm `JWT_SECRET` is set and the wallet signature flow is using the expected network.
- Starknet calls fail: confirm `STARKNET_RPC_URL` or `STARKNET_DEVNET_URL` points to a reachable node.
- Port already in use: stop the process using port 3000 or change `PORT` in `.env`.

## Project structure

- `src/app.module.ts` – application module wiring
- `src/main.ts` – bootstrap and Swagger setup
- `src/auth/` – wallet authentication and JWT handling
- `src/starknet/` – Starknet helpers and transaction execution utilities
- `src/supabase/` – Supabase client or PostgreSQL fallback adapter
- `src/*-pool/`, `src/interest-token/`, `src/governance/` – contract-facing modules

## Notes for contributors

- Keep environment variables in `.env` locally and do not commit secrets.
- Prefer the documented npm scripts for build, test, and lint tasks so CI and local behavior stay aligned.
- Use `npm run lint` and the relevant test command before opening a pull request.
