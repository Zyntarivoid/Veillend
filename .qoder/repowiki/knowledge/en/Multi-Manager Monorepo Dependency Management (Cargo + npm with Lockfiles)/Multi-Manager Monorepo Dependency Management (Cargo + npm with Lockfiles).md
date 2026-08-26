---
kind: dependency_management
name: Multi-Manager Monorepo Dependency Management (Cargo + npm with Lockfiles)
category: dependency_management
scope:
    - '**'
source_files:
    - Cargo.toml
    - Cargo.lock
    - veilend-soroban/Cargo.toml
    - veilend-soroban/rust-toolchain.toml
    - veilend-backend/package.json
    - veilend-backend/package-lock.json
    - veilend-backend/prisma/schema.prisma
    - veilend-backend/prisma/migration_lock.toml
    - veilend-web/package.json
    - veilend-web/package-lock.json
    - veilend-mobile/package.json
    - veilend-mobile/package-lock.json
---

## Overview

The VeilLend monorepo manages dependencies across four distinct subsystems using two package managers — Cargo for Rust (Soroban smart contract) and npm for JavaScript/TypeScript projects (NestJS backend, Next.js web dashboard, Expo mobile app). There is no top-level `package.json` workspace; each subproject declares its own dependencies independently.

## Rust / Soroban Contract (`veilend-soroban`)

- **Workspace**: A root `Cargo.toml` defines a `[workspace]` with `members = ["veilend-soroban"]` and excludes the sample `veilend_hello` crate. The resolver is set to `resolver = "2"`.
- **Lockfile**: `Cargo.lock` at the repo root pins every transitive dependency to exact versions from `registry+https://github.com/rust-lang/crates.io-index`, ensuring reproducible builds.
- **Toolchain pinning**: `veilend-soroban/rust-toolchain.toml` pins the toolchain to channel `1.88.0` with explicit components (`rustc`, `cargo`, `rustfmt`, `clippy`) and targets (`wasm32-unknown-unknown`, `wasm32v1-none`).
- **Contract dependency**: The contract depends on `soroban-sdk = "=23.5.3"` — an exact-pinned version (note the `=` prefix), used both in `[dependencies]` and `[dev-dependencies]` with the `testutils` feature enabled.
- **Release profile**: The workspace `Cargo.toml` configures a hardened release profile: `opt-level = z`, `overflow-checks = true`, `panic = abort`, `lto = true`, `strip = symbols`, `codegen-units = 1`, and a `release-with-logs` variant that re-enables debug assertions.
- **Publishing**: The contract crate sets `publish = false`, so it is not published to crates.io.

## JavaScript / TypeScript Projects

Each of the three JS/TS projects uses npm with a lockfile:

### Backend (`veilend-backend/package.json`)
- NestJS 11.x application with Prisma client 5.22.x, `@stellar/stellar-sdk` 15.x, Redis client, JWT/passport auth, class-validator/class-transformer for DTO validation.
- Dev tooling: ESLint 9, Prettier 3, Jest 29, ts-jest, ts-node, TypeScript 5.7.
- Scripts include `build`, `start:prod`, `lint`, `test`, `test:e2e`, `seed`, and a custom `validate-contracts` script that runs `scripts/validate-contract-spec.ts` against `src/common/contracts/veilend.spec.json`.
- Prisma schema lives under `prisma/schema.prisma` with migrations tracked in `prisma/migrations/` and a `migration_lock.toml`.

### Web Dashboard (`veilend-web/package.json`)
- Next.js 16.2.9 with React 19.2.4, Tailwind CSS v4, Radix UI, shadcn/ui, Vitest 3 for testing.
- Stellar integration via `@stellar/freighter-api` 6.x and `@stellar/stellar-sdk` 16.x.

### Mobile App (`veilend-mobile/package.json`)
- Expo ~54.0.36 with React Native 0.81.5, React 19.1.0, Zustand state management.
- Navigation via `@react-navigation/native` 7.x, styling via NativeWind 2.x and Tailwind CSS 3.x.
- Stellar SDK via `@stellar/stellar-base` 12.x.

## Lockfiles and Reproducibility

- **npm lockfiles**: Each project ships a `package-lock.json` (backend, web, mobile), pinning exact resolved versions for deterministic installs.
- **Cargo lockfile**: A single `Cargo.lock` at the repository root covers the entire workspace.
- No vendoring strategy is used — all dependencies are fetched from public registries (crates.io, npm registry).
- No private registries, `.npmrc`, or `GOPRIVATE` configuration was found anywhere in the repo.

## Cross-Cutting Conventions

- **Exact vs caret versions**: The Soroban contract pins `soroban-sdk` exactly (`=23.5.3`) to guarantee ABI stability for on-chain code. JS dependencies generally use caret ranges (`^x.y.z`), allowing minor/patch updates within the major version.
- **No shared workspace for JS**: Unlike the Rust workspace, there is no `pnpm-workspace.yaml`, `lerna.json`, or `nx.json`; each JS project is independent and must be built/deployed separately.
- **Prisma as a build-time dependency**: Prisma CLI (`prisma` package) is declared as a runtime dependency alongside `@prisma/client`, enabling migration execution at deploy time via the `seed` script.
- **Contract spec sync**: The backend's `sync-contracts` script echoes that contracts are synced via `src/common/contracts/veilend.spec.json`, indicating a manual or scripted process to keep the backend's generated types in sync with the Soroban contract output.
- **Dockerized backend**: The backend includes a `Dockerfile` and `docker-compose.yml`, relying on the lockfile-based install for reproducible container images.