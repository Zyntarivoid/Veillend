# VeilLend Mobile

## Error reporting and crash instrumentation

The app installs client-side error instrumentation in `App.tsx`:

- `installGlobalErrorHandler()` captures uncaught JavaScript errors from React Native's global handler.
- `ErrorBoundary` catches render crashes and shows a safe retry screen.
- Recoverable wallet setup errors call `reportError()` before showing user-facing copy.

Reports are sanitized in `src/utils/errorReporting.ts` before they are logged or sent to a custom reporter. The sanitizer redacts sensitive keys such as `authToken`, `authorization`, `password`, `secret`, `seed`, `signature`, `token`, and `mnemonic`. It also redacts Stellar public or secret keys, bearer tokens, and long hex strings from free-form messages and stack traces.

By default, sanitized reports are written to the development console only. To send reports to a production backend or third-party service, configure one reporter during app startup:

```ts
import { configureErrorReporting } from './src/utils/errorReporting';

configureErrorReporting(async (report) => {
  await fetch('https://example.com/mobile-errors', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(report),
  });
});
```

Do not attach raw wallet secrets, auth tokens, signatures, or imported secret-key input to `metadata`. If extra context is needed, pass coarse values such as screen name, action name, feature flag, or sanitized error code.
