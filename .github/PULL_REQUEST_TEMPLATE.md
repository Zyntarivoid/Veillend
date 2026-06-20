## Summary

- 

## Backend scope

- [ ] Change is limited to `legacy/veilend-backend` or clearly explains any cross-workspace impact.
- [ ] The affected controller, service, module, script, config file, or documentation page is named above.
- [ ] The PR links the related issue with `Closes #...` when applicable.

## Validation

Run the checks that match the change and mark the ones completed:

- [ ] `npm run format`
- [ ] `npm run lint`
- [ ] `npm run test`
- [ ] `npm run test:e2e`
- [ ] `npm run build`
- [ ] Manual check described below
- [ ] Not run locally; reason is explained below

Validation notes:

```text

```

## Documentation

- [ ] README, setup notes, or API docs were updated when behavior changed.
- [ ] New environment variables are documented in `.env.example` or related docs.
- [ ] No documentation update needed because this is test-only or internal cleanup.

## Security-sensitive changes

- [ ] No secrets, private keys, seed phrases, or production credentials are committed.
- [ ] Auth, wallet, admin, database, migration, or API exposure impact is described when relevant.
- [ ] Development-only placeholder values are clearly marked as unsafe for production.
- [ ] User data, logs, and error messages do not expose sensitive values.

## Reviewer notes

