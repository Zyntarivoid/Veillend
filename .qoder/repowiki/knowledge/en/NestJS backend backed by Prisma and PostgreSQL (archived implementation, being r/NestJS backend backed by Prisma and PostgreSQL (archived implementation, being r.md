---
kind: external_dependency
name: NestJS backend backed by Prisma and PostgreSQL (archived implementation, being rebuilt for Stellar)
slug: nestjs-prisma-postgresql
category: external_dependency
category_hints:
    - migration_status
    - vendor_identity
scope:
    - '**'
---

### NestJS + Prisma + PostgreSQL
- Role: Previous architecture's off-chain service handling auth (JWT/session), portfolios, assets, transactions, and an indexer that syncs Stellar/Soroban events into Postgres.
- Migration status: Root README marks this backend as "Planned Rebuild" — the archived `legacy/veilend-backend` is kept for reference while a new Stellar-native backend is being constructed. Contributors should treat `veilend-mobile/` and `veilend-soroban/` as the active workspaces unless a task explicitly points into `legacy/`.
- Integration points: Prisma schema under `prisma/schema.prisma` defines read models; Docker Compose provisions Postgres for local/dev; CI runs Prisma migrations before tests.
- No code-invisible vendor specifics beyond what manifests declare.