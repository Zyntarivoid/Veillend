---
kind: external_dependency
name: Freighter Stellar wallet used for web authentication and transaction signing
slug: freighter-wallet
category: external_dependency
category_hints:
    - vendor_identity
    - auth_protocol
scope:
    - '**'
---

### Freighter Wallet
- Role: The web app authenticates users by requesting cryptographic signatures from the Freighter browser extension (`@stellar/freighter-api`).
- Integration point: Web workspace declares `@stellar/freighter-api`; the README recommends Freighter as the Stellar wallet for development.
- Auth shape: wallet-based signature verification is used instead of password sessions for on-chain actions; secrets never leave the user's wallet.
- Verify exact API calls against the Freighter extension documentation.