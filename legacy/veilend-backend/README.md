# VeilLend Backend

VeilLend Backend is a NestJS API server for the legacy VeilLend workspace. It provides wallet authentication, Starknet contract helpers, Supabase support, and a local Postgres fallback for contributor development.

## Project Location

Run all backend commands from this directory:

```bash
cd legacy/veilend-backend
```

## Prerequisites

- Node.js and npm
- A local Postgres database if you are not using Supabase
- A Starknet devnet or RPC endpoint for contract-backed flows
- A copied `.env` file based on `.env.example`

## Setup From a Fresh Clone

```bash
cd legacy/veilend-backend
npm install
cp .env.example .env
```

Then edit `.env` for one of the supported data backends:

- Supabase: set `USE_SUPABASE=true`, `SUPABASE_URL`, `SUPABASE_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`.
- Local Postgres fallback: keep `USE_SUPABASE=false` and set `DATABASE_URL` or the `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, and `PGDATABASE` values.

For local contract flows, set `STARKNET_RPC_URL`, `STARKNET_DEVNET_URL`, and the development-only admin wallet values in `.env`.

## Run the Backend

```bash
npm run start:dev
```

The default development port is `3000` unless `PORT` is changed in `.env`.

## Workspace Scripts

| Command | Purpose |
| --- | --- |
| `npm run start` | Start the NestJS app once. |
| `npm run start:dev` | Start the app in watch mode for local development. |
| `npm run start:debug` | Start the app in debug watch mode. |
| `npm run start:prod` | Run the compiled app from `dist/main`. |
| `npm run build` | Compile the NestJS project. |
| `npm run lint` | Run ESLint with automatic fixes over `src`, `apps`, `libs`, and `test`. |
| `npm run format` | Format TypeScript files in `src` and `test`. |
| `npm run test` | Run Jest unit tests. |
| `npm run test:watch` | Run Jest in watch mode. |
| `npm run test:cov` | Run Jest with coverage output. |
| `npm run test:e2e` | Run e2e tests with `test/jest-e2e.json`. |

## Local Development Notes

- `.env.example` contains the full set of expected app, JWT, Supabase, Starknet, admin wallet, Postgres, and rate-limit variables.
- The fallback database path uses `supabase_schema.sql` when Supabase is not configured.
- Admin wallet values in `.env.example` are development placeholders only. Do not use production private keys in local files.
- Swagger is enabled by the app bootstrap, so local API documentation should be available from the running server when the app starts successfully.

## Troubleshooting

### `npm install` fails

Confirm that Node.js and npm are installed, then retry from `legacy/veilend-backend`. Delete `node_modules` and reinstall only if the dependency tree is corrupted.

### The app cannot connect to the database

If using local Postgres, check that Postgres is running and that `DATABASE_URL` or the `PG*` variables match the local database. If using Supabase, confirm `USE_SUPABASE=true` and that the Supabase URL and server-side keys are present.

### Starknet requests fail during local testing

Start the configured Starknet devnet or update `STARKNET_RPC_URL`, `STARKNET_DEVNET_URL`, and `ADMIN_NODE_URL` to an available RPC endpoint.

### Authentication fails immediately

Set a non-empty `JWT_SECRET` in `.env`. For wallet signature flows, also confirm the request uses the same address format expected by the Starknet auth service.

### Port `3000` is already in use

Change `PORT` in `.env` or stop the process currently using the port.

## Pull Request Checklist

Before opening a backend PR, run the checks that match the change:

```bash
npm run format
npm run lint
npm run test
npm run build
```

Add `npm run test:e2e` when the change affects HTTP flows or end-to-end behavior.
