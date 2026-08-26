---
kind: configuration_system
name: NestJS ConfigModule with class-validator schemas and per-app .env configuration
category: configuration_system
scope:
    - '**'
source_files:
    - veilend-backend/src/config/config.module.ts
    - veilend-backend/src/config/validation.ts
    - veilend-backend/src/config/app.config.ts
    - veilend-backend/src/config/indexer.config.ts
    - veilend-backend/src/config/auth.config.ts
    - veilend-backend/src/config/app-config.service.ts
    - veilend-backend/.env.example
    - veilend-web/src/lib/config-validation.ts
    - veilend-web/.env.example
    - veilend-mobile/.env.example
    - veilend-mobile/.env
---

## What system/approach is used

The monorepo uses a layered, environment-variable-driven configuration system built around three patterns:

1. **Backend (NestJS)** — `@nestjs/config` (`ConfigModule.forRoot`) with runtime validation via `class-transformer` + `class-validator`. Each logical config group is a TypeScript class decorated with validators; a shared `validateConfig()` helper in `src/config/validation.ts` deserializes env vars into the class and throws on mismatch.
2. **Web (Next.js)** — A hand-rolled startup validator in `src/lib/config-validation.ts` that reads `process.env`, applies built-in defaults, validates types/ranges, and caches the result via a module-scoped `_config` singleton exposed through `getConfig()`.
3. **Mobile (Expo/React Native)** — Plain `.env` / `.env.example` files consumed at runtime by React Native's `react-native-dotenv` / Expo config; feature toggles are read directly from `process.env`.

All three layers load configuration exclusively from environment variables — no YAML/JSON config files are parsed at runtime.

## Key files and packages

- `veilend-backend/src/config/config.module.ts` — Registers Nest `ConfigModule` globally, wires validation for `AppConfig`, `IndexerConfig`, `AuthConfig`, and logs a redacted merged config.
- `veilend-backend/src/config/validation.ts` — `validateConfig<T>()` (plainToClass + validateSync) and `redactConfig()` (masks keys containing SECRET/KEY/TOKEN/PRIVATE).
- `veilend-backend/src/config/app.config.ts` — `PORT` schema (`IsInt`, `Min(1)`).
- `veilend-backend/src/config/indexer.config.ts` — `STELLAR_CONTRACT_ID`, `STELLAR_INDEXER_START_LEDGER`, `STELLAR_INDEXER_POLL_INTERVAL_MS` schemas.
- `veilend-backend/src/config/auth.config.ts` — `JWT_SECRET` schema.
- `veilend-backend/src/config/stellar.config.ts` — Legacy static loader returning `horizonUrl` from `HORIZON_URL` (not wired into the validated pipeline).
- `veilend-backend/src/config/app-config.service.ts` — Typed getters (`port`, `stellar`, `indexer`, `auth`) wrapping `ConfigService.get()` with sensible defaults.
- `veilend-backend/.env.example` — Documents required env vars (`THROTTLE_*`, `AUTH_THROTTLE_*`, `DATABASE_URL`, `JWT_SECRET`).
- `veilend-web/src/lib/config-validation.ts` — Startup validator for `NEXT_PUBLIC_STELLAR_NETWORK`, `NEXT_PUBLIC_HORIZON_URL`, `NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE`, `NEXT_PUBLIC_API_URL`; enforces allowed networks, URL format, non-empty passphrase, and caches results.
- `veilend-web/.env.example` — Documents all Next.js public env vars and deployment notes.
- `veilend-mobile/.env` and `veilend-mobile/.env.example` — Mobile-only env vars (`API_URL_WEB`, `API_URL_MOBILE`, `STELLAR_*`, `USE_MOCKS`, `ENABLE_SECURE_STORE`, `APP_ENV`, optional `ANALYTICS_KEY`, `SENTRY_DSN`).

## Architecture and conventions

- **Per-domain config classes**: Each concern (app, indexer, auth) has its own class defining shape + constraints; `ConfigModule` composes them into one merged config object.
- **Strict validation at boot**: `validateSync` runs with `skipMissingProperties: false` and `whitelist: true`, so any unknown or missing property causes the process to throw before serving requests.
- **Typed accessors over raw env**: Consumers inject `AppConfigService` and call typed getters (`config.stellar`, `config.indexer`, `config.auth`, `config.port`) rather than reading `process.env` directly.
- **Safe defaults everywhere**: Every getter/schema provides a default value (e.g. `testnet` network, `localhost:3000` API URL, `dev_secret` JWT), allowing local dev without `.env` files.
- **Secrets redaction in logs**: `redactConfig()` masks any key whose name contains `SECRET`, `KEY`, `TOKEN`, or `PRIVATE` when logging the merged config after validation.
- **Frontend env isolation**: The web app uses `NEXT_PUBLIC_`-prefixed variables (documented in `.env.example` comments) which Next.js inlines at build time; server-side config is validated once and cached.
- **Feature flags as env vars**: Both mobile (`USE_MOCKS`, `ENABLE_SECURE_STORE`) and backend (throttle TTL/limit) expose toggles via environment variables rather than a centralized feature-flag service.

## Conventions and constraints

- **Environment variables are the single source of truth** — no runtime config files are loaded; everything comes from `.env` / `.env.local` / platform-provided env.
- **Every configurable value must have a validator and a default** — new settings should be added as a field on an existing config class with appropriate decorators (`IsString`, `IsInt`, `Min`, `IsOptional`) and a corresponding getter in `AppConfigService`.
- **Unknown env keys are rejected** — `whitelist: true` in both the backend validation and global `ValidationPipe` means extra/unrecognized properties cause startup failures.
- **Stellar network values are constrained** — the web app restricts `NEXT_PUBLIC_STELLAR_NETWORK` to `testnet | mainnet | futurenet`; the backend defaults to `testnet`.
- **URLs are validated** — Horizon and API URLs must parse as valid `http:` / `https:` URLs.
- **Secrets must not be committed** — `.env.example` files document variable names only; actual secrets live in `.env` / `.env.local` / CI secrets, and `.gitignore` excludes them.
- **Startup-time failure mode** — invalid configuration throws immediately (backend during `ConfigModule` validation, web during `validateConfig()`), preventing silent misconfiguration.