# Mobile error reporting

VeilLend mobile captures render crashes through `AppErrorBoundary` and normalizes explicit reports through `src/utils/errorReporting.ts`.

## Setup

The default reporter is local-only in development: it prints a sanitized payload with the `[error-reporting]` prefix. Production builds can wire a provider such as Sentry, Bugsnag, Datadog, or an internal endpoint by calling `setErrorReporter` during app bootstrap:

```ts
import { setErrorReporter } from './src/utils/errorReporting';

setErrorReporter(async (payload) => {
  await fetch(process.env.EXPO_PUBLIC_ERROR_REPORTING_URL!, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
});
```

## Privacy guardrails

Reports are sanitized before they leave the app:

- key names that look like passwords, tokens, cookies, sessions, emails, phone numbers, wallet addresses, seed phrases, or private keys are replaced with `[redacted]`;
- message and stack strings redact bearer tokens, query-string secrets, email addresses, EVM-style addresses, and long base64-like secrets;
- stack traces are capped to the first 12 lines;
- nested metadata is depth-limited to avoid accidentally shipping large objects.

Do not attach raw request bodies, secure-store contents, mnemonic material, wallet signatures, authorization headers, cookies, or personally identifying user details. Prefer coarse tags such as `network`, `screen`, `action`, `featureFlag`, and non-sensitive status codes.

## Contributor testing

Focused unit coverage lives in `src/utils/errorReporting.test.ts` and can be run from `veilend-mobile` with:

```bash
npm test -- --test-name-pattern error
```

Run the full utility test suite with:

```bash
npm test
```
