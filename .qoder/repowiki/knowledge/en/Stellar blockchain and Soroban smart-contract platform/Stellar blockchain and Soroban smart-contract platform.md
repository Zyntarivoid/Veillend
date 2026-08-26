---
kind: external_dependency
name: Stellar blockchain and Soroban smart-contract platform
slug: stellar-soroban
category: external_dependency
category_hints:
    - vendor_identity
    - client_constraint
scope:
    - '**'
---

### Stellar / Soroban
- Integration points:
  - Backend: `@stellar/stellar-sdk` + Horizon client (`src/stellar/horizon.service.ts`, `src/config/stellar.config.ts`) reads ledger events and balances; the indexer module persists protocol state to Postgres via Prisma.
  - Mobile: `@stellar/stellar-base` signs transactions and interacts with the network; environment variables `STELLAR_NETWORK`, `STELLAR_HORIZON_URL` select testnet/mainnet/futurenet.
  - Web: `@stellar/freighter-api` drives wallet login/signing; `NEXT_PUBLIC_STELLAR_NETWORK` and `NEXT_PUBLIC_HORIZON_URL` configure the target network.
- Client constraint: All three frontends must keep `STELLAR_NETWORK` / `NEXT_PUBLIC_STELLAR_NETWORK` in sync with the Horizon endpoint and passphrase; mismatched networks cause silent failures at signing time.
- Verify exact SDK methods against official Stellar/Soroban docs.