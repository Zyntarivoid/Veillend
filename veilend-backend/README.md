# VeilLend Backend

NestJS API for VeilLend on Stellar/Soroban: wallet auth, portfolios, assets, protocol config, transaction history, and on-chain indexing.

## Prerequisites

| Tool | Version | Notes |
| :--- | :--- | :--- |
| Node.js | **20+** | Matches CI (`20.x`) |
| npm | 10+ | Ships with Node |
| PostgreSQL | **16+** | Or use Docker Compose |
| Docker Compose | optional | Recommended for first-time setup |

## Quick start (Docker Compose)

```bash
cd veilend-backend

# Start Postgres + API
docker compose up -d

# Follow logs
docker compose logs -f backend

# Seed demo data (optional)
docker compose exec backend npx prisma db seed

# Tear down (keep DB volume)
docker compose down

# Tear down and wipe DB volume
docker compose down -v
```

- API: **http://localhost:3000**
- Health: `curl http://localhost:3000/health`

## Quick start (local Node + local Postgres)

```bash
cd veilend-backend

# 1. Environment
cp .env.example .env
# Edit DATABASE_URL / JWT_SECRET as needed

# 2. Install
npm install

# 3. Prisma client + migrations (Postgres must already be running)
npx prisma generate
npx prisma migrate deploy

# 4. Optional seed
npm run seed

# 5. Dev server (watch mode)
npm run start:dev
```

## Environment variables

See [`.env.example`](./.env.example) for a complete template. Important keys:

| Variable | Required | Default / example | Purpose |
| :--- | :---: | :--- | :--- |
| `PORT` | no | `3000` | HTTP listen port |
| `DATABASE_URL` | **yes** | `postgresql://…/veilend` | Prisma Postgres connection |
| `JWT_SECRET` | **yes** (prod) | `change_me_in_production` | Signs session JWTs |
| `STELLAR_NETWORK` | no | `testnet` | Label for health / config |
| `STELLAR_HORIZON_URL` | no | Horizon testnet URL | Account / history reads |
| `STELLAR_SOROBAN_RPC_URL` | no | Soroban testnet RPC | Contract RPC |
| `STELLAR_NETWORK_PASSPHRASE` | no | Test SDF Network… | Signature verification |
| `STELLAR_CONTRACT_ID` | no | placeholder `C…` | Indexer target contract |
| `STELLAR_INDEXER_START_LEDGER` | no | `1` | Indexer bootstrap ledger |
| `STELLAR_INDEXER_POLL_INTERVAL_MS` | no | `5000` | Indexer poll interval |
| `THROTTLE_TTL` / `THROTTLE_LIMIT` | no | `60000` / `100` | Global rate limit |
| `AUTH_THROTTLE_*` | no | `60000` / `5` | Auth-route rate limit |
| `ERROR_MONITORING_WEBHOOK` | no | _(empty)_ | Optional 5xx webhook |

Docker Compose injects a working `DATABASE_URL` and `JWT_SECRET` for you.

## npm scripts (match `package.json`)

| Command | What it does |
| :--- | :--- |
| `npm run start` | Start once (compiled via Nest CLI) |
| `npm run start:dev` | Watch mode for local development |
| `npm run start:prod` | `node dist/main` after `npm run build` |
| `npm run build` | Compile TypeScript → `dist/` |
| `npm run lint` | ESLint with `--fix` |
| `npm test` | Jest unit tests |
| `npm run test:e2e` | E2E suite (`test/jest-e2e.json`; needs Postgres) |
| `npm run test:cov` | Unit tests with coverage |
| `npm run seed` | `ts-node prisma/seed.ts` |
| `npm run validate-contracts` | Static check of `veilend.spec.json` vs indexer |
| `npm run sync-contracts` | Placeholder refresh hook for contract artifacts |

## Module layout

| Module | Path | Responsibility |
| :--- | :--- | :--- |
| Auth | `src/auth` | Wallet signature login, JWT sessions, RBAC — see [`SESSION.md`](./SESSION.md) |
| Portfolios | `src/portfolios` | Wallet-scoped balances / positions for dashboards |
| Assets | `src/assets` | Supported asset registry and metadata |
| Transactions | `src/transactions` | History / activity reads |
| Indexer | `src/indexer` | Ledger event ingestion into Postgres |
| Admin | `src/admin` | Protocol admin operations |
| Protocol | `src/protocol` | Public protocol config + risk params |
| Common | `src/common` | DTOs, logging, interceptors, contract specs |

### DTO & response conventions

- Controllers use Nest `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`, `transform`).
- Success bodies are typically wrapped as `ApiResponseDto<T>`: `{ success, data, meta }`.
- List endpoints use `PageOptionsDto` / `PageDto` / `PageMetaDto` when paginated.

### Contract sync

- `npm run validate-contracts` — fail CI if indexer handlers drift from `src/common/contracts/veilend.spec.json`
- `npm run sync-contracts` — documented refresh entrypoint for contributors

## Troubleshooting

### `P1001: Can't reach database server` / Prisma connection errors

- Confirm Postgres is up: `docker compose ps` or `pg_isready -h localhost -p 5432`
- Match `DATABASE_URL` user/password/db name to your instance  
  Compose defaults: `postgresql://veilend:veilend@localhost:5432/veilend`
- From inside the backend container, host is `postgres` not `localhost`

### `Environment variable not found: DATABASE_URL`

- You skipped copying the template: `cp .env.example .env`
- Nest/Prisma load `.env` from `veilend-backend/` — run commands from that directory

### `Migration failed` / schema out of date

```bash
npx prisma generate
npx prisma migrate deploy
```

If developing a new migration locally:

```bash
npx prisma migrate dev --name describe_change
```

### Port 3000 already in use

- Change `PORT` in `.env`, or stop the other process
- Compose maps host `3000:3000` — adjust `docker-compose.yml` ports if needed

### Auth / JWT failures (`Unauthorized`)

- Ensure `JWT_SECRET` is identical across restarts (changing it invalidates all tokens)
- Confirm the client sends `Authorization: Bearer <token>` from `POST /auth/verify`

### Horizon / portfolio empty or slow

- Testnet Horizon outages return soft empty balances; check `STELLAR_HORIZON_URL`
- Unfunded accounts correctly return empty portfolios (not 500)

### Unit tests pass but E2E fails

- E2E needs a live Postgres and a valid `DATABASE_URL`
- Prefer Compose Postgres + `npm run test:e2e` from the host with  
  `DATABASE_URL=postgresql://veilend:veilend@localhost:5432/veilend`

### Docker build fails on Prisma

- Build context must be `veilend-backend/` (Dockerfile expects `package.json` + `prisma/` there)
- Run `docker compose build --no-cache backend` after lockfile changes

### Lint / format CI noise

```bash
npm run lint
npx prettier --check "src/**/*.ts" "test/**/*.ts"
```

## CI pipeline

Every PR runs **VeilLend Backend CI**:

| Job | Steps |
| :--- | :--- |
| Lint, Build & Test | `npm ci` → `prisma generate` → lint → build → unit tests → contract validation |
| E2E Tests | Postgres service → migrate → `npm run test:e2e` |
| Docker Build | Image build smoke test |

## Related docs

- Session lifecycle: [`SESSION.md`](./SESSION.md)
- Indexer notes: [`INDEXER.md`](./INDEXER.md)
- Root monorepo overview: [`../README.md`](../README.md)
