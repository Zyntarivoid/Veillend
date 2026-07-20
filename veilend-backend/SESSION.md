# Wallet Session Lifecycle

This describes how clients authenticate with a Stellar wallet, inspect their active session, and revoke it.

---

## 🔑 Authentication Flow

1. **`POST /auth/nonce`** — client submits a `walletAddress` and receives a one-time nonce to sign.
2. Client signs the nonce with their Stellar wallet.
3. **`POST /auth/verify`** — client submits `walletAddress`, `nonce`, and `signature`. On a valid signature the server:
   - Finds or creates a `User` row for the wallet address.
   - Signs a JWT (`walletAddress` claim, 7-day expiry).
   - Persists a `Session` row (`userId`, `token`, `expiresAt`) in the database.
   - Returns `{ accessToken }`.
4. Client includes `Authorization: Bearer <accessToken>` on subsequent requests.

## 🔍 Session Introspection

**`GET /auth/session`** *(requires `Authorization: Bearer <token>`)*

Returns the authenticated wallet context for the presented token:

```json
{
  "walletAddress": "GABC...",
  "sessionId": "c3f1...",
  "expiresAt": "2026-07-26T11:10:07.000Z"
}
```

On every authenticated request, the JWT strategy verifies the token's signature and expiry, then confirms a matching `Session` row still exists in the database. If the row is missing (revoked) or its `expiresAt` has passed, the request is rejected with `401 Unauthorized`.

## 🚪 Logout / Revoke

**`POST /auth/logout`** *(requires `Authorization: Bearer <token>`)*

Deletes the `Session` row backing the presented token, immediately invalidating it — any further request with that same token receives `401 Unauthorized`, even though the JWT itself is still cryptographically valid until its natural expiry.

```json
{ "revoked": true }
```

Revocation is scoped to a single session (`jti`-equivalent: the `Session.token` row), not the whole wallet — a wallet with multiple concurrent sessions (e.g. logged in on two devices) can revoke one without affecting the others. Logout is idempotent: calling it twice with the same token, or a token whose session was already revoked, still returns `{ "revoked": true }`.

## ⚙️ Notes

- Every authenticated route (including `/admin/*`, which uses the same `JwtAuthGuard`) now requires an active database session, not just a validly-signed token. Revoking a session therefore also signs the wallet out of admin routes.
- The JWT secret is read from the `JWT_SECRET` environment variable (falls back to a `dev_secret` default outside of production — set `JWT_SECRET` explicitly in any real deployment).
- Session persistence requires `DATABASE_URL` to be configured for the Prisma-backed Postgres connection (see `.env.example`).
