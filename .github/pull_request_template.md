## Summary

<!-- Briefly explain what changed and why. Link the related issue. -->

Closes #

## Backend impact

<!-- Check every area touched by this PR. -->

- [ ] Auth / wallet signatures / RBAC
- [ ] Portfolios / health factor / position aggregation
- [ ] Assets / token metadata / reserve configuration
- [ ] Transactions / Soroban simulation / history
- [ ] Indexer / Stellar ledger events
- [ ] Admin configuration / risk controls
- [ ] API contracts / DTO validation / pagination
- [ ] CI / tooling / contributor workflow
- [ ] No backend runtime impact

## Verification

<!-- Paste the commands you ran and their results. Mark anything not applicable. -->

- [ ] `cd veilend-backend && npm run lint`
- [ ] `cd veilend-backend && npm run test`
- [ ] `cd veilend-backend && npm run build`
- [ ] Documentation or API examples updated when behavior changed
- [ ] Not applicable: documentation/template-only change

## Tests and fixtures

<!-- Describe new or updated tests, seed data, mocks, snapshots, or why tests were not required. -->

## Security and privacy checklist

- [ ] No secrets, private keys, seed phrases, JWTs, cookies, API keys, or production credentials are committed.
- [ ] Logs and errors avoid leaking wallet signatures, raw tokens, private memos, or user PII.
- [ ] New endpoints or jobs preserve authorization boundaries and cannot read or mutate another user's data.
- [ ] Inputs are validated with DTOs/pipes or equivalent guards before business logic runs.
- [ ] External calls, indexer work, queues, or retry loops include reasonable failure handling and abuse resistance.
- [ ] Database/schema changes include a migration or a documented rollout plan.
- [ ] Security-sensitive behavior is covered by focused tests or a clear manual verification note.

## Documentation

<!-- Note README, API, environment, deployment, or contributor docs updated by this PR. -->

## Reviewer notes

<!-- Mention known limitations, follow-up work, or checks reviewers should prioritize. -->
