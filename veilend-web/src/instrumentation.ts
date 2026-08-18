/**
 * Server-startup instrumentation.
 *
 * `register()` runs once per Next.js server instance and must complete before
 * the server accepts requests, which makes it the right place for a second
 * config-validation call: `next.config.ts` covers `next build`, this covers
 * `next start` and dev-server restarts where the config module may already be
 * cached.
 *
 * Lives in `src/` (not the project root) because this app uses a `src` folder —
 * see node_modules/next/dist/docs/01-app/02-guides/instrumentation.md.
 */
export async function register() {
  // Only the Node.js runtime can read `process.env` with a dynamic key; the
  // Edge runtime inlines env vars statically, so every lookup there would miss
  // and validate the defaults instead of the real configuration.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { validateConfig } = await import("./lib/config-validation");
  validateConfig();
}
