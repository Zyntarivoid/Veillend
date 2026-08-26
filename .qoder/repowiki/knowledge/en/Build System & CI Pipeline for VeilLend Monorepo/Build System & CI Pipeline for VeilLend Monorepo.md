---
kind: build_system
name: Build System & CI Pipeline for VeilLend Monorepo
category: build_system
scope:
    - '**'
source_files:
    - Cargo.toml
    - veilend-soroban/Cargo.toml
    - veilend-soroban/rust-toolchain.toml
    - .github/workflows/soroban-ci.yml
    - .github/workflows/veilend-backend.yml
    - .github/workflows/web-ci.yml
    - .github/workflows/mobile-ci.yml
    - veilend-backend/Dockerfile
    - veilend-backend/docker-compose.yml
    - veilend-backend/package.json
    - veilend-web/package.json
    - veilend-mobile/package.json
    - veilend-mobile/eas.json
    - vercel.json
---

## Overview

VeilLend is a monorepo containing four independently built artifacts — a Soroban smart contract (Rust), a NestJS backend API, a Next.js web dashboard, and an Expo mobile app. Build orchestration is split across per-package `package.json` scripts, a Cargo workspace, GitHub Actions workflows, Docker, and Vercel/EAS deployment configs. There is no single top-level Makefile; each subsystem owns its own build.

## Rust / Soroban Contract (`veilend-soroban`)

- **Workspace**: Root `Cargo.toml` declares a workspace with member `veilend-soroban`, explicitly excluding the legacy `veilend_hello` crate. A custom `[profile.release]` sets `opt-level = "z"`, `lto = true`, `panic = "abort"`, `strip = "symbols"`, and `overflow-checks = true`; a sibling `release-with-logs` profile inherits it but re-enables debug assertions.
- **Toolchain pinning**: `rust-toolchain.toml` pins channel `1.88.0` and registers wasm targets `wasm32-unknown-unknown` and `wasm32v1-none`. The CI workflow mirrors this by installing toolchain `1.88.0` with `rustfmt` and `clippy` components.
- **Contract artifact**: Built via `cargo build --target wasm32-unknown-unknown --release` then finalized with `stellar contract build` (Stellar CLI `23.0.1`, installed in CI). Dependencies are locked via `--locked` everywhere in CI.
- **Tests**: Unit tests run on `x86_64-unknown-linux-gnu`; integration tests live under `tests/integration.rs`.
- **Formatting/lint**: Enforced in CI via `cargo fmt --all -- --check` and `cargo clippy --locked --all-targets -- -D warnings`.

## NestJS Backend (`veilend-backend`)

- **Build tooling**: `nest build` (Nest CLI) produces `dist/`. TypeScript compilation uses `tsconfig.build.json` alongside `tsconfig.json`.
- **Prisma**: Schema lives in `prisma/schema.prisma`; migrations under `prisma/migrations/`. The Docker production stage runs `npx prisma generate` after `npm ci --omit=dev`.
- **Docker**: Multi-stage `Dockerfile` (Node 20 Alpine):
  - Stage 1 (`deps`): installs all deps + copies `prisma/`.
  - Stage 2 (`build`): copies source and runs `nest build`.
  - Stage 3 (`production`): non-root user `appuser`, exposes port 3000, healthcheck against `/health`, entrypoint `docker-entrypoint.sh` which runs migrations before `node dist/main`.
- **Local dev**: `docker-compose.yml` spins up `postgres:16-alpine` with healthcheck and the backend depending on it being healthy. Default env includes `DATABASE_URL`, `JWT_SECRET`, `STELLAR_NETWORK=testnet`, Horizon/Soroban RPC URLs, and throttle settings.
- **Testing**: Jest unit tests (`src/**/*.spec.ts`) and separate e2e suite (`test/jest-e2e.json`). Coverage collected to `./coverage`.
- **Lint/format**: ESLint config at root of package; Prettier configured via `.prettierrc`.

## Next.js Web (`veilend-web`)

- **Scripts**: `next dev` / `next build` / `next start`; `tsc --noEmit` for type checking; Vitest for tests (`vitest run`).
- **Deployment**: `vercel.json` rewrites all routes to `/index.html`, indicating a client-side router deployed to Vercel.
- **CI** (`.github/workflows/web-ci.yml`): Node 22, caches `package-lock.json`, runs `type-check`, `lint`, `build` on push to `main` or PRs touching `veilend-web/**`.

## Expo Mobile (`veilend-mobile`)

- **Scripts**: `expo start`, platform-specific `android`/`ios`/`web`; `expo-doctor` for validation; `tsx --test` for unit tests.
- **EAS builds**: `eas.json` defines `development`, `preview`, and `production` build profiles with `autoIncrement` for production and `NPM_CONFIG_LEGACY_PEER_DEPS=true` to resolve peer dependency conflicts.
- **CI** (`.github/workflows/mobile-ci.yml`): Node 22, `npm ci --legacy-peer-deps`, type check via `tsc --noEmit`, validates Expo config, runs `expo doctor`.

## GitHub Actions (per-package pipelines)

| Workflow | Trigger | Key steps |
|---|---|---|
| `soroban-ci.yml` | Push to `main` / PRs touching `veilend-soroban/**` | rust-toolchain 1.88.0, `cargo fmt`, `cargo clippy -D warnings`, `cargo test`, `cargo build --release --target wasm32-unknown-unknown`, install Stellar CLI 23.0.1, `stellar contract build` |
| `veilend-backend.yml` | Any change under `veilend-backend/**` | Node 20.x matrix, `npm ci`, `npm run lint`, `npm run build`, `npm run test` |
| `web-ci.yml` | Push to `main` / PRs touching `veilend-web/**` | Node 22, `npm ci`, `npm run type-check`, `npm run lint`, `npm run build` |
| `mobile-ci.yml` | Push to `main` / PRs touching `veilend-mobile/**` | Node 22, `npm ci --legacy-peer-deps`, `tsc --noEmit`, `expo config --type public`, `npm run doctor` |

All workflows use `concurrency` groups keyed by `${{ github.ref }}` with `cancel-in-progress: true` to avoid duplicate runs.

## Deployment Targets

- **Backend**: Containerized via Docker (multi-stage, non-root user, Prisma generated at runtime); deployable anywhere that runs Node 20 Alpine. No explicit push-to-registry step in CI — images must be pushed by an external pipeline.
- **Web**: Deployed to Vercel using `vercel.json` routing rewrite.
- **Mobile**: EAS build profiles for development, preview, and production submissions.
- **Contract**: Compiled to WASM via `stellar contract build`; artifact produced in CI but not uploaded as a release artifact in the visible workflows.

## Cross-cutting Conventions

- Dependency locking: Rust uses `--locked` everywhere; Node packages lock via `package-lock.json` and `npm ci`.
- Toolchain pinning: Rust version pinned in both `rust-toolchain.toml` and CI; Node versions pinned per workflow (20 for backend, 22 for web/mobile).
- Per-package isolation: Each subsystem has its own CI job, working directory, and cache key scoped to its `package-lock.json` / Cargo workspace.
- Linting enforced as a gate: `cargo clippy -D warnings`, ESLint, and `cargo fmt --check` fail the build.
- Environment variables are externalized via `.env.example` files per package and injected through Docker Compose / CI environment blocks rather than checked in.