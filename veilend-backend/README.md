# VeilLend Backend

This repository contains the VeilLend backend — a NestJS API server that integrates with Starknet smart contracts (Cairo) and persists user data using Supabase (or a local Postgres fallback). It provides wallet-based authentication (nonce + signature + JWT), Starknet helpers, and controllers/services that mirror the on-chain contract methods for lending, shielded transfers, price oracles, reserves, and governance.

**Quick start**

- **Clone & install:**

```bash
cd veilend-backend
npm install
```

- **Dev server (with Supabase or local Postgres + Starknet devnet running):**

```bash
# Copy example env
cp .env.example .env
# Edit .env to set SUPABASE_URL/SUPABASE_KEY or DATABASE_URL
npm run start:dev
```

**Local dev notes**
- For on-chain testing run a Starknet devnet (default RPC: `http://127.0.0.1:5050`).
- If you do not use Supabase, the backend will automatically connect to the `DATABASE_URL` Postgres and apply `supabase_schema.sql` on startup.
- Admin signing keys in `.env` are for development only. Use a secure signer (KMS/HSM) in production.

**Environment variables**
- **App**: `NODE_ENV`, `PORT`, `LOG_LEVEL`
- **Auth**: `JWT_SECRET`, `JWT_EXPIRES_IN` (optional)
- **Supabase**: `SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `USE_SUPABASE`
- **Starknet**: `STARKNET_RPC_URL`, `STARKNET_DEVNET_URL`
- **Admin wallet (dev only)**: `ADMIN_NODE_URL`, `ADMIN_WALLET_ADDRESS`, `ADMIN_PRIVATE_KEY`
- **Postgres fallback**: `DATABASE_URL`, `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`

See the example file: [.env.example](.env.example)

**Key features**
- Wallet-auth: nonce generation, typed-data signature verification (Starknet), JWT issuance.
- Starknet service: ABI loader, calldata compiler, account instantiate + execute transaction helpers, and parsed event output.
- Contract modules scaffolded to mirror on-chain contracts: ShieldedPool, LendingPool, PriceOracle, ReserveData, AddressesProvider, InterestToken, Governance.
- Postgres fallback adapter that executes `supabase_schema.sql` on startup when Supabase is not configured.

**Folder structure (important files)**

- **Project root**
  - **.env.example** - example environment variables
  - **supabase_schema.sql** - SQL schema applied to local Postgres fallback
  - **package.json**

- **src/**
  - **app.module.ts** - application module and registered feature modules
  - **main.ts** - app bootstrap, Swagger, global validation
  - **starknet/**
    - **starknet.module.ts** - Nest module for Starknet helpers
    - **starknet.service.ts** - ABI loader, calldata compiler, account helpers, `executeTransaction()` (returns `{ txHash, receipt, events }`)
  - **auth/**
    - **auth.module.ts** - Jwt config via ConfigService
    - **auth.service.ts** - nonce generation, signature verification, login JWT
    - **auth.controller.ts** - auth endpoints
  - **supabase/**
    - **supabase.module.ts**
    - **supabase.service.ts** - Supabase client or Postgres fallback adapter (runs `supabase_schema.sql` on startup)
  - **users/**, **transactions/**, **positions/** - business models using Supabase or Postgres fallback
  - **shielded-pool/**, **lending-pool/**, **price-oracle/**, **reserve-data/**, **addresses-provider/**, **interest-token/**, **governance/**
    - Each module contains `*.module.ts`, `*.service.ts`, `*.controller.ts` and `dto/` for write operations

See the app module: [src/app.module.ts](src/app.module.ts)

**APIs (high-level)**
- `POST /auth/nonce` — generate nonce for a wallet address
- `POST /auth/verify` — verify typed-data signature and issue JWT
- Contract read endpoints (GET) under `/lending-pool`, `/shielded-pool`, `/price-oracle`, etc.
- Contract write endpoints (POST) under respective controllers (require admin signing or authenticated flows depending on your setup). Write endpoints return parsed events when available.

**Database & Migrations**
- The repository contains `supabase_schema.sql` (idempotent CREATE IF NOT EXISTS statements). If Supabase is not configured, the backend will connect to `DATABASE_URL` and execute the SQL on startup.
- For production, prefer a migration tool (recommended): `node-pg-migrate`, `Prisma Migrate`, Flyway, or a CI-run SQL migration job. I can add one if desired.

**Testing**
- Unit tests use Jest. Run:

```bash
npm run test
```

**Security & production notes**
- Never store production private keys in `.env`. Use a secure signing service (AWS KMS, Azure Key Vault, HashiCorp Vault, or an HSM).
- Use `SUPABASE_SERVICE_ROLE_KEY` only on the server side; rotate regularly.
- Harden CORS and auth strategies when exposing APIs publicly.

**Next steps / Improvements**
- Add integration tests that mock Starknet provider and simulate transactions/events.
- Add Swagger decorators across controllers for full API documentation (Swagger is enabled in `main.ts`).
- Integrate a robust migration system and CI pre-deploy checks.
- Replace dev admin-signer with a signer service (KMS) and implement RBAC for admin endpoints.

If you'd like, I can now:
- Run local `npm install` and `npm run build`/`test` (I can run in your environment or provide commands),
- Add full Swagger decorators for all controllers,
- Add a migration tool and CI scripts.

---
Generated by assistant — reach out if you want the README extended with API examples or a contributor guide.
<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

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

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
