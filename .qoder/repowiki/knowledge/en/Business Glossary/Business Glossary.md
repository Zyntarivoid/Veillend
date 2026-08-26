---
kind: business_term
name: Business Glossary
category: business_term
scope:
    - '**'
---

### VeilLend
- Definition：The project's privacy-first decentralized lending protocol built on Stellar/Soroban, enabling deposit, borrow, and repay with X-Ray ZK proof-based shielded transactions.
- Aliases：veillend、Veillend

### X-Ray Privacy
- Definition：The project's branding for its zero-knowledge privacy layer that masks balances and positions during lending actions on Stellar.
- Aliases：X-Ray ZK proofs、privacy mode

### Shielded Pool
- Definition：A protocol component (present in both legacy and current backends under `src/shielded-pool/`) that handles privacy-preserving commitment/nullifier flows for lending actions.
- Aliases：shielded pool

### Indexer
- Definition：The backend subsystem that listens to Stellar and Soroban ledger events, parses on-chain activity, and synchronizes protocol state into the local Postgres database for frontend consumption.
- Aliases：indexer service、event indexer

### Protocol Status Banners
- Definition：UI banners surfaced by the mobile app to communicate wallet disconnects, Stellar network mismatches, and stale protocol sync state, each with recovery actions.
- Aliases：protocol status banner

### Lending Modals
- Definition：The Deposit, Borrow, and Repay modal screens in the mobile app that perform amount validation, MAX shortcuts, and loading-state gating for lending actions.
- Aliases：lending modals、lending screens

### Available to Borrow
- Definition：The store-derived borrowing limit value used by the Borrow screen to validate input amounts and power the MAX shortcut.
- Aliases：borrow limit、availableToBorrow

### Circuit Breaker
- Definition：A protocol-level pause mechanism that disables all state-changing functions when activated; callers receive a `ContractPaused` error.
- Aliases：contract paused、pause
