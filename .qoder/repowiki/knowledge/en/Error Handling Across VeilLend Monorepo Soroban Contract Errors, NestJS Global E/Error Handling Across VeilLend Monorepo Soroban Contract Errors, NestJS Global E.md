---
kind: error_handling
name: 'Error Handling Across VeilLend Monorepo: Soroban Contract Errors, NestJS Global Exception Filter, and Mobile Crash Instrumentation'
category: error_handling
scope:
    - '**'
source_files:
    - veilend-soroban/src/lib.rs
    - veilend-backend/src/common/logging/all-exceptions.filter.ts
    - veilend-backend/src/common/logging/app-logger.service.ts
    - veilend-backend/src/common/dto/api-response.dto.ts
    - veilend-backend/src/app.module.ts
    - veilend-backend/src/main.ts
    - veilend-mobile/src/utils/errorReporting.ts
    - veilend-mobile/src/components/ErrorBoundary.tsx
    - veilend-web/src/app/dashboard/error.tsx
---

## Overview

The VeilLend monorepo implements error handling across three distinct layers — the on-chain Soroban smart contract, the NestJS backend API, and the Expo mobile client — each with its own conventions for defining, propagating, and presenting errors.

## Soroban Smart Contract (`veilend-soroban/src/lib.rs`)

**System used:** Soroban SDK `#[contracterror]` enum with explicit numeric codes, raised via `panic_with_error!`.

- A single `VeilLendError` enum defines all failure modes (AlreadyInitialized, Unauthorized, UnsupportedAsset, InvalidAmount, InsufficientCollateral, InsufficientDeposit, RepayTooLarge, InvalidCollateralRatio, NotInitialized, ZeroAmount, OraclePriceMissing, ContractPaused, DepositCapExceeded, BorrowCapExceeded, InvalidCap, CircuitBreakerTriggered, InsufficientReserve) with stable `u32` discriminants starting at 1.
- Every validation path in mutating entrypoints (`deposit`, `borrow`, `repay`, `withdraw`, `configure_asset`, `set_oracle_price`, `update_asset_caps`, `set_paused`, `record_protocol_fee`) calls helper functions (`require_supported_asset`, `require_positive_amount`, `require_not_paused`, `check_deposit_cap`, `check_borrow_cap`, `assert_collateralized`) that `panic_with_error!` with the appropriate `VeilLendError` variant. There are no `Result` returns from public entrypoints — failures abort the transaction immediately.
- Read-only helpers use `.unwrap_or(...)` to return safe defaults (e.g., caps default to -1/unlimited, totals default to 0, paused defaults to false, min collateral ratio defaults to 15_000 bps), so queries never fail.
- A dedicated test module (`test_error_codes`) asserts every variant's numeric code is unique and stable, serving as a regression guard against renumbering.
- Successful operations emit typed `#[contractevent]` structs (`DepositEvent`, `BorrowEvent`, `RepayEvent`, `WithdrawEvent`, `CapsUpdated`, `CircuitBreakerEvent`, `AssetConfigured`, `AssetReserveUpdated`) so clients can observe state changes even when callers do not inspect return values.

## NestJS Backend (`veilend-backend/src`)

**System used:** NestJS global `ExceptionFilter` + structured JSON logging with correlation IDs; DTO-based API responses.

- `AllExceptionsFilter` (`common/logging/all-exceptions.filter.ts`) is registered globally via `APP_FILTER` in `AppModule`. It catches every unhandled exception, maps `HttpException` instances to their status code (defaulting to 500), redacts sensitive fields via `redact()`, logs through `AppLoggerService`, and wraps the response in `ApiResponseDto.fail(code, message, details)` enriched with a `correlationId` from `nestjs-cls`.
- `AppLoggerService` writes structured JSON records (`timestamp`, `level`, `context`, `correlationId`, `message`, optional `trace`) to `process.stdout`; messages are passed through `redact()` to scrub secrets.
- `ValidationPipe` is configured with `whitelist: true`, `forbidNonWhitelisted: true`, `transform: true` in `main.ts`, so malformed request bodies are rejected early by NestJS before reaching controllers.
- `ApiResponseDto<T>` provides a uniform success/fail shape (`success`, `data?`, `error.code/message/details?`, `meta?`) used consistently by both successful responses (via `TransformInterceptor`) and the exception filter.
- Correlation IDs flow end-to-end: generated in CLS middleware, attached to every log line, and appended to error response `meta`.

## Expo Mobile App (`veilend-mobile/src`)

**System used:** Custom crash instrumentation module with PII scrubbing, SecureStore ring buffer, and React Error Boundaries.

- `utils/errorReporting.ts` defines `ErrorReport` (id, timestamp, severity, type, message, stack, component, metadata, platform, appVersion) and exposes `reportError`, `createErrorReport`, `classifySeverity`, `scrubPII`, `setupCrashInstrumentation`, plus persistence helpers.
- Severity classification is heuristic: messages containing "unauthorized"/"401"/"token expired" → critical; "network"/"timeout"/"econnrefused" or TypeError/ReferenceError → high; everything else → medium.
- PII scrubbing uses regex patterns targeting Stellar secret/public keys (`S...`, `G...`), Bearer tokens, and JSON fields like `authToken`, `secretKey`, `address` — replacing them with `[REDACTED]` before any storage or logging.
- Reports are persisted in a ring buffer of up to 50 entries in `expo-secure-store` under key `veilend_error_reports`, surviving app restarts.
- `setupCrashInstrumentation()` installs a global `ErrorUtils.setGlobalHandler` wrapper that forwards to the original handler while reporting via `reportError` with `isFatal` metadata.
- `components/ErrorBoundary.tsx` is a React Native `Component` that catches render-phase errors, reports them with `severity: 'high'` and component stack metadata, and renders a fallback UI showing an error ID and retry button.

## Next.js Web Dashboard (`veilend-web/src`)

**System used:** Next.js Route Segment Error Boundary.

- `app/dashboard/error.tsx` is a Next.js error boundary receiving `{ error, reset }`. It classifies errors heuristically (wallet/auth vs network vs generic) and renders a user-facing alert with an error digest ID. Errors are logged to `console.error` rather than sent to a remote service.

## Conventions Observed

- **On-chain:** All business-rule violations map one-to-one to `VeilLendError` variants; there are no ad-hoc panic strings. New error conditions must add a new enum variant with a unique `u32` code and update the `test_error_codes` assertions.
- **Backend:** Controllers should throw NestJS `HttpException` subclasses (or let domain logic throw) so the global filter can normalize responses; raw exceptions are always caught and wrapped in `ApiResponseDto.fail`.
- **Mobile:** All async errors should be funneled through `reportError` rather than swallowed; `setupCrashInstrumentation` is intended to be called once at app startup to catch unhandled rejections.
- **Cross-cutting:** Sensitive data (wallet addresses, tokens, secret keys) is explicitly redacted at the logging/reporting layer — never stripped earlier in the call chain — so developers still see context while consumers receive sanitized payloads.