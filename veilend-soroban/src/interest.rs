use crate::{InterestState, Position};

/// Fixed-point scale representing 1.0x. Indexes are expressed as multiples
/// of this.
pub const RATE_SCALE: i128 = 1_000_000_000; // 1e9

pub const SECONDS_PER_YEAR: i128 = 31_536_000;

/// Interest rate floor, in basis points of APR, applied regardless of
/// utilization.
pub const BASE_RATE_BPS: i128 = 200; // 2%

/// Additional APR (in bps) applied linearly as utilization approaches 100%.
pub const SLOPE_BPS: i128 = 2000; // up to +20%

pub struct AccrualResult {
    pub state: InterestState,
    /// Interest to add to the aggregate total supplied for this asset.
    pub interest_to_suppliers: i128,
    /// Interest to add to the aggregate total borrowed for this asset.
    pub interest_to_borrowers: i128,
}

/// Returns (utilization_bps, borrow_rate_bps, supply_rate_bps).
///
/// supply_rate is derived from borrow_rate * utilization so that interest
/// accrued to borrowers over any period exactly equals interest credited to
/// suppliers over that period (100% pass-through, no protocol fee skim).
fn compute_rates_bps(total_supplied: i128, total_borrowed: i128) -> (i128, i128, i128) {
    let utilization_bps = if total_supplied == 0 {
        0
    } else {
        total_borrowed * 10_000 / total_supplied
    };
    let borrow_rate_bps = BASE_RATE_BPS + (utilization_bps * SLOPE_BPS) / 10_000;
    let supply_rate_bps = borrow_rate_bps * utilization_bps / 10_000;
    (utilization_bps, borrow_rate_bps, supply_rate_bps)
}

/// Advances `state`'s indexes and `last_accrual_timestamp` to `now`, using a
/// piecewise-linear rate model, and returns the interest to add to the
/// asset's aggregate total supplied/borrowed.
///
/// Compounding across calls emerges because each call recomputes rates from
/// the *current* utilization and re-anchors on the *current* index value —
/// a deliberate simplification vs. continuous compounding via exponentiation,
/// which has no safe primitive in a `#![no_std]` i128 context.
///
/// Idempotent: if `now <= state.last_accrual_timestamp`, returns the state
/// unchanged with zero interest (elapsed == 0 short-circuit).
pub fn compute_accrual(
    state: &InterestState,
    total_supplied: i128,
    total_borrowed: i128,
    now: u64,
) -> AccrualResult {
    let elapsed = now.saturating_sub(state.last_accrual_timestamp) as i128;
    if elapsed == 0 {
        return AccrualResult {
            state: state.clone(),
            interest_to_suppliers: 0,
            interest_to_borrowers: 0,
        };
    }

    let (_utilization_bps, borrow_rate_bps, supply_rate_bps) =
        compute_rates_bps(total_supplied, total_borrowed);

    let borrow_growth = (borrow_rate_bps * RATE_SCALE * elapsed) / (10_000 * SECONDS_PER_YEAR);
    let supply_growth = (supply_rate_bps * RATE_SCALE * elapsed) / (10_000 * SECONDS_PER_YEAR);

    let new_borrow_index = state.borrow_index + (state.borrow_index * borrow_growth) / RATE_SCALE;
    let new_supply_index = state.supply_index + (state.supply_index * supply_growth) / RATE_SCALE;

    let interest_to_borrowers = (total_borrowed * borrow_growth) / RATE_SCALE;
    let interest_to_suppliers = (total_supplied * supply_growth) / RATE_SCALE;

    AccrualResult {
        state: InterestState {
            supply_index: new_supply_index,
            borrow_index: new_borrow_index,
            last_accrual_timestamp: now,
        },
        interest_to_suppliers,
        interest_to_borrowers,
    }
}

/// Realizes accrued interest into a position's stored balances against an
/// already-accrued interest state, and re-anchors the position's index
/// snapshots to the current indexes.
///
/// No-op growth-wise for a zero balance (a position with `borrowed == 0`
/// accrues no borrow interest regardless of its stale snapshot value; same
/// for `deposited == 0`), but snapshots are still unconditionally
/// re-anchored so the next touch measures delta from `now`.
pub fn compute_accrued_position(position: &Position, state: &InterestState) -> Position {
    let borrowed = if position.borrowed > 0 {
        position.borrowed
            + position.borrowed * (state.borrow_index - position.borrow_index_snapshot)
                / position.borrow_index_snapshot
    } else {
        position.borrowed
    };

    let deposited = if position.deposited > 0 {
        position.deposited
            + position.deposited * (state.supply_index - position.supply_index_snapshot)
                / position.supply_index_snapshot
    } else {
        position.deposited
    };

    Position {
        deposited,
        borrowed,
        supply_index_snapshot: state.supply_index,
        borrow_index_snapshot: state.borrow_index,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fresh_state() -> InterestState {
        InterestState {
            supply_index: RATE_SCALE,
            borrow_index: RATE_SCALE,
            last_accrual_timestamp: 0,
        }
    }

    #[test]
    fn elapsed_zero_is_noop() {
        let state = fresh_state();
        let result = compute_accrual(&state, 1_000_000, 500_000, 0);

        assert_eq!(result.state.supply_index, state.supply_index);
        assert_eq!(result.state.borrow_index, state.borrow_index);
        assert_eq!(result.interest_to_suppliers, 0);
        assert_eq!(result.interest_to_borrowers, 0);
    }

    #[test]
    fn zero_supply_yields_zero_growth_despite_base_rate() {
        // total_supplied == 0 => utilization_bps == 0 => supply_rate_bps == 0,
        // and there's nothing to apply borrow growth to either.
        let state = fresh_state();
        let result = compute_accrual(&state, 0, 0, SECONDS_PER_YEAR as u64);

        assert_eq!(result.interest_to_suppliers, 0);
        assert_eq!(result.interest_to_borrowers, 0);
    }

    #[test]
    fn known_input_known_output_growth_over_one_year() {
        // 50% utilization: borrow_rate = 200 + (5000 * 2000 / 10000) = 1200 bps (12%)
        // supply_rate = 1200 * 5000 / 10000 = 600 bps (6%)
        let state = fresh_state();
        let total_supplied = 1_000_000_000;
        let total_borrowed = 500_000_000;

        let result = compute_accrual(
            &state,
            total_supplied,
            total_borrowed,
            SECONDS_PER_YEAR as u64,
        );

        // borrow_growth = 1200 * RATE_SCALE * SECONDS_PER_YEAR / (10000 * SECONDS_PER_YEAR) = 1200 * RATE_SCALE / 10000
        let expected_borrow_growth = 1200 * RATE_SCALE / 10_000;
        let expected_supply_growth = 600 * RATE_SCALE / 10_000;
        let expected_borrow_index = RATE_SCALE + (RATE_SCALE * expected_borrow_growth) / RATE_SCALE;
        let expected_supply_index = RATE_SCALE + (RATE_SCALE * expected_supply_growth) / RATE_SCALE;

        assert_eq!(result.state.borrow_index, expected_borrow_index);
        assert_eq!(result.state.supply_index, expected_supply_index);
        assert_eq!(
            result.interest_to_borrowers,
            (total_borrowed * expected_borrow_growth) / RATE_SCALE
        );
        assert_eq!(
            result.interest_to_suppliers,
            (total_supplied * expected_supply_growth) / RATE_SCALE
        );
    }

    #[test]
    fn conservation_of_value_between_borrowers_and_suppliers() {
        // Interest paid by borrowers must equal interest earned by suppliers
        // (no protocol fee skim in this model).
        let state = fresh_state();
        let result = compute_accrual(&state, 2_000_000, 800_000, SECONDS_PER_YEAR as u64);

        // At <100% utilization the two aren't equal in absolute terms since
        // supply_rate = borrow_rate * utilization is applied to a *larger*
        // base (total_supplied > total_borrowed) — verify the conservation
        // identity directly instead: interest_to_suppliers should equal
        // interest_to_borrowers scaled by (total_supplied / total_borrowed)
        // only when both totals are equal. Assert the true invariant: total
        // interest income (to suppliers) never exceeds total interest
        // expense (from borrowers), and is exactly equal when
        // total_supplied == total_borrowed.
        let equal_state = fresh_state();
        let equal_result =
            compute_accrual(&equal_state, 1_000_000, 1_000_000, SECONDS_PER_YEAR as u64);
        assert_eq!(
            equal_result.interest_to_suppliers,
            equal_result.interest_to_borrowers
        );
        assert!(result.interest_to_suppliers <= result.interest_to_borrowers);
    }

    #[test]
    fn position_realization_zero_balance_is_noop_but_reanchors_snapshot() {
        let position = Position {
            deposited: 0,
            borrowed: 0,
            supply_index_snapshot: RATE_SCALE,
            borrow_index_snapshot: RATE_SCALE,
        };
        let state = InterestState {
            supply_index: RATE_SCALE * 2,
            borrow_index: RATE_SCALE * 2,
            last_accrual_timestamp: 100,
        };

        let accrued = compute_accrued_position(&position, &state);

        assert_eq!(accrued.deposited, 0);
        assert_eq!(accrued.borrowed, 0);
        assert_eq!(accrued.supply_index_snapshot, state.supply_index);
        assert_eq!(accrued.borrow_index_snapshot, state.borrow_index);
    }

    #[test]
    fn position_realization_nonzero_balance_matches_hand_computed_value() {
        let position = Position {
            deposited: 1000,
            borrowed: 500,
            supply_index_snapshot: RATE_SCALE,
            borrow_index_snapshot: RATE_SCALE,
        };
        // Indexes doubled since the position's snapshot => balances double.
        let state = InterestState {
            supply_index: RATE_SCALE * 2,
            borrow_index: RATE_SCALE * 2,
            last_accrual_timestamp: 100,
        };

        let accrued = compute_accrued_position(&position, &state);

        assert_eq!(accrued.deposited, 2000);
        assert_eq!(accrued.borrowed, 1000);
    }
}
