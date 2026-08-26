---
kind: logging_system
name: NestJS Structured JSON Logging with Correlation IDs and Redaction
category: logging_system
scope:
    - '**'
source_files:
    - veilend-backend/src/common/logging/app-logger.service.ts
    - veilend-backend/src/common/logging/logging.interceptor.ts
    - veilend-backend/src/common/logging/all-exceptions.filter.ts
    - veilend-backend/src/common/logging/correlation-id.util.ts
    - veilend-backend/src/common/logging/redact.util.ts
    - veilend-backend/src/app.module.ts
    - veilend-backend/src/main.ts
---

## What system/approach is used

The VeilLend backend (NestJS) implements a custom structured logging system built on top of NestJS's `LoggerService` interface. Instead of using a third-party logger framework, the application writes one JSON object per line to `process.stdout`, designed for consumption by external log aggregators (e.g., cloud platform log pipelines). Each log record carries a correlation ID that propagates across an entire HTTP request via `nestjs-cls` (Context Local Storage), enabling end-to-end request tracing.

## Key files and packages

- `veilend-backend/src/common/logging/app-logger.service.ts` — Custom `LoggerService` implementation providing `log`, `error`, `warn`, `debug`, `verbose` methods; serializes records as JSON to stdout.
- `veilend-backend/src/common/logging/logging.interceptor.ts` — Global `NestInterceptor` that logs incoming/outgoing HTTP requests with method, URL, status code, and elapsed time in milliseconds.
- `veilend-backend/src/common/logging/all-exceptions.filter.ts` — Global `ExceptionFilter` (`@Catch()`) that logs unhandled exceptions with stack traces and returns a uniform error response including the correlation ID.
- `veilend-backend/src/common/logging/correlation-id.util.ts` — Extracts or generates a UUID-based correlation ID from `x-correlation-id` / `x-request-id` headers; validates format via regex before accepting.
- `veilend-backend/src/common/logging/redact.util.ts` — Recursive redaction utility that replaces sensitive keys (`password`, `token`, `accesstoken`, `refreshtoken`, `secret`, `apikey`, `authorization`, `signature`, `nonce`, `jwt`) with `[REDACTED]`, and masks `Bearer ...` authorization strings.
- `veilend-backend/src/app.module.ts` — Registers `ClsModule.forRoot` with global middleware that mounts CLS, generates IDs, and injects the correlation ID into response headers; registers `LoggingInterceptor` and `AllExceptionsFilter` as global providers via `APP_INTERCEPTOR` / `APP_FILTER` tokens.
- `veilend-backend/src/main.ts` — Bootstraps NestJS with `bufferLogs: true` and installs the custom `AppLoggerService` as the global logger via `app.useLogger()`.

## Architecture and conventions

**Structured log record shape.** Every emitted record is a flat JSON object with these fields:
- `timestamp`: ISO-8601 string from `new Date().toISOString()`
- `level`: one of `log`, `error`, `warn`, `debug`, `verbose`
- `context`: optional string indicating the subsystem (e.g. `HTTP`, `ExceptionFilter`)
- `correlationId`: UUID pulled from CLS if active, otherwise `undefined`
- `message`: sanitized message — strings pass through unchanged; objects are recursively redacted via `redact()`
- `trace`: optional stack trace included only on `error` calls

**Request lifecycle logging.** The `LoggingInterceptor` wraps every controller handler:
- On entry: `--> GET /path` at level `log` with context `HTTP`
- On success: `<-- GET /path 200 12ms` at level `log`
- On error path: `<-x GET /path 12ms` at level `warn`

**Global exception handling.** `AllExceptionsFilter` catches all exceptions, logs them at `error` level with the stack trace and context `ExceptionFilter`, then responds with a standardized `ApiResponseDto.fail(...)` payload that includes the correlation ID in its `meta` field so clients can correlate errors with their request logs.

**Correlation ID propagation.** `nestjs-cls` is configured globally in `AppModule` with `middleware.mount = true` and `middleware.generateId = true`. The ID generator calls `extractOrGenerateCorrelationId(req)`, which accepts an incoming `x-correlation-id` or `x-request-id` header if it matches a UUID regex; otherwise a fresh `crypto.randomUUID()` is generated. The same ID is written back to the response header `x-correlation-id` via the CLS setup hook, enabling client-side echo and downstream service correlation.

**Sensitive data redaction.** The `redact()` utility walks plain objects up to depth 5, replacing any key whose lowercase form is in `SENSITIVE_KEYS` with `[REDACTED]`, and transforms `Authorization: Bearer ...` values to `Bearer [REDACTED]`. This is applied automatically to non-string messages logged via `AppLoggerService` and to exception responses in `AllExceptionsFilter`.

**Log levels.** Five levels are supported (`debug`, `verbose`, `info/log`, `warn`, `error`). There is no runtime log-level filter — all levels are emitted to stdout. Consumers are expected to filter by level externally.

## Conventions and constraints

- All application logging goes through `AppLoggerService` (registered as Nest's global logger); direct `console.log` usage is not part of the logging strategy.
- Log output is line-delimited JSON to `process.stdout`; no file sinks or rotating writers are implemented in this repository.
- Every HTTP request is traced end-to-end via the correlation ID, which appears in both request logs and error responses.
- Sensitive fields are never emitted raw: the `SENSITIVE_KEYS` set in `redact.util.ts` is the single source of truth for what gets redacted, and new secrets should be added there rather than handled ad hoc.
- Context strings are used to identify the emitting subsystem (e.g. `HTTP`, `ExceptionFilter`); business services are expected to pass a meaningful context when calling the logger.
- Stack traces are attached only on `error` calls via the `trace` parameter; other levels do not include stack information.