feat(indexer): index accrued interest and parameter tracking with associated schema updates and utility math.

## Summary

This PR addresses the correctness bug where continuous on-chain debt growth was not reflected in backend API responses. It updates the indexer to process `interest_accrued`, `asset_reserve_updated`, and `interest_params_updated` events. Two new Prisma models (`AssetInterestState` and `AssetInterestParams`) track the continuous market state and configuration parameters for each asset.

Positions are now "index-adjusted": the `PortfoliosService` dynamically computes accrued debt on-the-fly using the contract's own math applied to the new `borrowIndexSnapshot` and `supplyIndexSnapshot` before surfacing balances or health factors. 

A new `MarketsModule` and `GET /markets` API are introduced to expose per-asset utilization, liquidity, and continuous compounding APY rates derived from the tracked parameters.

Closes #418

## Scope

- [x] Backend/API or indexing
- [ ] Soroban contract
- [ ] Mobile app
- [ ] Web app
- [ ] Documentation or contributor process

## Validation

- [x] Tests were added or updated for changed behavior.
- [x] Relevant local test command passed. (ran `npx jest src/common/utils/interest-math.spec.ts src/indexer/indexer-replay.spec.ts`)
- [ ] Documentation was updated where contributor or API behavior changed.

## Security and data handling

- [x] Wallet/session/auth changes preserve existing access controls.
- [x] User data, secrets, and payment-related values are not logged or exposed.
- [x] Error responses avoid leaking private implementation details.
- [ ] Not applicable for this PR.

## Reviewer notes

- **Migration**: This PR introduces a Prisma schema change adding `AssetInterestState` and `AssetInterestParams`. A database migration will run automatically on deployment.
- **Backfill**: To backfill missing interest records for existing assets and correctly establish snapshots for historical positions, an admin must trigger `POST /indexer/replay`. The replay endpoint gracefully clears legacy state and idempotenly recreates the updated indexer snapshots.
- **Monitoring**: Unhandled contract events are now counted and tracked. They can be viewed at `GET /indexer/status` under `unhandledEventTopics`.
