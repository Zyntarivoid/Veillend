use crate::{InterestParams, InterestState, Position, VeilLendError};
use soroban_sdk::{panic_with_error, Env};

/// Fixed-point scale representing 1.0x. Indexes are expressed as multiples
/// of this.
pub const RATE_SCALE: i128 = 1_000_000_000; // 1e9

pub const SECONDS_PER_YEAR: i128 = 31_536_000;

/// Safe defaults applied when no `InterestParams` have been configured for an
/// asset. All rates are zero so existing tests with zero-accrual expectations
/// remain green without any migration step.
pub const DEFAULT_PARAMS: InterestParams = InterestParams {
    base_rate_bps: 0,
    kink_util_bps: 8_000,
    slope1_bps: 0,
    slope2_bps: 0,
    reserve_factor_bps: 1_000,
};

pub struct AccrualResult {
    pub state: InterestState,
    /// Interest to add to the aggregate total supplied for this asset.
    pub interest_to_suppliers: i128,
    /// Interest to add to the aggregate total borrowed for this asset.
    pub interest_to_borrowers: i128,
    /// Truncation dust: interest_to_borrowers - interest_to_suppliers.
    /// This must be added to protocol reserves so the conservation invariant
    /// holds exactly.
    pub dust_to_reserves: i128,
}

/// Returns utilization in basis points (0–10_000).
///
/// Defined as `total_borrowed * 10_000 / total_supplied`.
/// Returns 0 when `total_supplied == 0` (no liquidity — utilization is
/// meaningless and we default to zero to avoid division by zero).
/// Clamped to 10_000 to guard against rounding or stale state.
pub fn utilization_ratio(env: &Env, total_supplied: i128, total_borrowed: i128) -> u32 {
    if total_supplied == 0 {
        return 0;
    }
    let util = total_borrowed
        .checked_mul(10_000)
        .and_then(|v| v.checked_div(total_supplied))
        .unwrap_or_else(|| panic_with_error!(env, VeilLendError::MathOverflow));
    util.min(10_000) as u32
}

/// Computes the **annual** borrow rate in basis points using the classic
/// two-slope (kink) formula.
///
/// Formula (all values in annual bps):
/// ```
/// if util <= kink:
///     annual = base + slope1 × util / 10_000
/// else:
///     annual = base + slope1 × kink / 10_000
///                   + slope2 × (util − kink) / 10_000
/// ```
///
/// Returns annual bps (not per-second) to avoid lossy integer truncation
/// before the elapsed-seconds multiplication in `compute_accrual`.
pub fn borrow_rate_bps_per_second(
    env: &Env,
    params: &InterestParams,
    utilization_bps: u32,
) -> i128 {
    let util = utilization_bps as i128;
    let base = params.base_rate_bps as i128;
    let kink = params.kink_util_bps as i128;
    let slope1 = params.slope1_bps as i128;
    let slope2 = params.slope2_bps as i128;

    // NOTE: We return annual bps here. The name is kept for API compatibility.
    // Callers (compute_accrual) fold the SECONDS_PER_YEAR denominator into the
    // growth factor computation to avoid intermediate integer truncation to zero.
    if util <= kink {
        slope1
            .checked_mul(util)
            .and_then(|v| v.checked_div(10_000))
            .and_then(|v| v.checked_add(base))
            .unwrap_or_else(|| panic_with_error!(env, VeilLendError::MathOverflow))
    } else {
        let kink_piece = slope1
            .checked_mul(kink)
            .and_then(|v| v.checked_div(10_000))
            .unwrap_or_else(|| panic_with_error!(env, VeilLendError::MathOverflow));
        let excess_piece = slope2
            .checked_mul(util - kink)
            .and_then(|v| v.checked_div(10_000))
            .unwrap_or_else(|| panic_with_error!(env, VeilLendError::MathOverflow));
        base.checked_add(kink_piece)
            .and_then(|v| v.checked_add(excess_piece))
            .unwrap_or_else(|| panic_with_error!(env, VeilLendError::MathOverflow))
    }
}

/// Computes the **annual** supply rate in basis points.
///
/// supply_rate = borrow_rate × utilization × (10_000 − reserve_factor) / 10_000²
pub fn supply_rate_bps_per_second(
    env: &Env,
    params: &InterestParams,
    utilization_bps: u32,
    borrow_rate_per_second: i128,
) -> i128 {
    let util = utilization_bps as i128;
    let pass_through = (10_000i128 - params.reserve_factor_bps as i128).max(0);

    borrow_rate_per_second
        .checked_mul(util)
        .and_then(|v| v.checked_mul(pass_through))
        .and_then(|v| v.checked_div(10_000 * 10_000))
        .unwrap_or_else(|| panic_with_error!(env, VeilLendError::MathOverflow))
}

/// Advances `state`'s indexes and `last_accrual_timestamp` to `now`, using the
/// per-asset kink interest-rate model, and returns the interest to add to the
/// asset's aggregate total supplied/borrowed.
///
/// When no `InterestParams` have been stored for an asset, callers should pass
/// `&interest::DEFAULT_PARAMS` so existing tests with zero accrual expectations
/// continue to pass without a migration step.
///
/// Idempotent: if `now <= state.last_accrual_timestamp`, returns the state
/// unchanged with zero interest (elapsed == 0 short-circuit).
pub fn compute_accrual(
    env: &Env,
    state: &InterestState,
    params: &InterestParams,
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
            dust_to_reserves: 0,
        };
    }

    let utilization_bps = utilization_ratio(env, total_supplied, total_borrowed);
    // These return annual bps (not per-second) to avoid lossy truncation.
    let borrow_rate_annual = borrow_rate_bps_per_second(env, params, utilization_bps);
    let supply_rate_annual =
        supply_rate_bps_per_second(env, params, utilization_bps, borrow_rate_annual);

    // Growth factors fold the SECONDS_PER_YEAR denominator here so integer
    // division happens last, preserving precision:
    // growth = annual_bps × elapsed × RATE_SCALE / (10_000 × SECONDS_PER_YEAR)
    let denominator = 10_000i128
        .checked_mul(SECONDS_PER_YEAR)
        .unwrap_or_else(|| panic_with_error!(env, VeilLendError::MathOverflow));

    let borrow_growth = borrow_rate_annual
        .checked_mul(elapsed)
        .and_then(|v| v.checked_mul(RATE_SCALE))
        .and_then(|v| v.checked_div(denominator))
        .unwrap_or_else(|| panic_with_error!(env, VeilLendError::MathOverflow));
    let supply_growth = supply_rate_annual
        .checked_mul(elapsed)
        .and_then(|v| v.checked_mul(RATE_SCALE))
        .and_then(|v| v.checked_div(denominator))
        .unwrap_or_else(|| panic_with_error!(env, VeilLendError::MathOverflow));

    let new_borrow_index = state
        .borrow_index
        .checked_mul(borrow_growth)
        .and_then(|v| v.checked_div(RATE_SCALE))
        .and_then(|v| v.checked_add(state.borrow_index))
        .unwrap_or_else(|| panic_with_error!(env, VeilLendError::MathOverflow));
    let new_supply_index = state
        .supply_index
        .checked_mul(supply_growth)
        .and_then(|v| v.checked_div(RATE_SCALE))
        .and_then(|v| v.checked_add(state.supply_index))
        .unwrap_or_else(|| panic_with_error!(env, VeilLendError::MathOverflow));

    let interest_to_borrowers = total_borrowed
        .checked_mul(borrow_growth)
        .and_then(|v| v.checked_div(RATE_SCALE))
        .unwrap_or_else(|| panic_with_error!(env, VeilLendError::MathOverflow));
    let interest_to_suppliers = total_supplied
        .checked_mul(supply_growth)
        .and_then(|v| v.checked_div(RATE_SCALE))
        .unwrap_or_else(|| panic_with_error!(env, VeilLendError::MathOverflow));

    let dust_to_reserves = interest_to_borrowers
        .checked_sub(interest_to_suppliers)
        .unwrap_or_else(|| panic_with_error!(env, VeilLendError::MathOverflow));

    AccrualResult {
        state: InterestState {
            supply_index: new_supply_index,
            borrow_index: new_borrow_index,
            last_accrual_timestamp: now,
        },
        interest_to_suppliers,
        interest_to_borrowers,
        dust_to_reserves,
    }
}

/// Realizes accrued interest into a position's stored balances against an
/// already-accrued interest state, and re-anchors the position's index
/// snapshots to the current indexes.
///
/// No-op growth-wise for a zero balance, but snapshots are still
/// unconditionally re-anchored so the next touch measures delta from `now`.
///
/// If a position has a zero or negative snapshot index (defensive guard
/// against corrupt initializer state), the position is returned unchanged
/// to avoid division-by-zero panics.
pub fn compute_accrued_position(position: &Position, state: &InterestState) -> Position {
    if position.borrow_index_snapshot <= 0 || position.supply_index_snapshot <= 0 {
        return position.clone();
    }

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
    use soroban_sdk::Env;

    fn fresh_state() -> InterestState {
        InterestState {
            supply_index: RATE_SCALE,
            borrow_index: RATE_SCALE,
            last_accrual_timestamp: 0,
        }
    }

    // ── utilization_ratio ────────────────────────────────────────────────────

    #[test]
    fn utilization_zero_supply_returns_zero() {
        let env = Env::default();
        assert_eq!(utilization_ratio(&env, 0, 0), 0);
        assert_eq!(utilization_ratio(&env, 0, 1_000), 0);
    }

    #[test]
    fn utilization_half_is_5000_bps() {
        let env = Env::default();
        assert_eq!(utilization_ratio(&env, 1_000_000, 500_000), 5_000);
    }

    #[test]
    fn utilization_full_is_10000_bps() {
        let env = Env::default();
        assert_eq!(utilization_ratio(&env, 1_000_000, 1_000_000), 10_000);
    }

    #[test]
    fn utilization_clamped_at_10000() {
        // Borrowed > supplied guard: must not panic, must clamp.
        let env = Env::default();
        assert_eq!(utilization_ratio(&env, 1_000, 2_000), 10_000);
    }

    // ── borrow_rate_bps_per_second ────────────────────────────────────────────

    #[test]
    fn borrow_rate_all_zero_params_is_zero() {
        let env = Env::default();
        assert_eq!(borrow_rate_bps_per_second(&env, &DEFAULT_PARAMS, 5_000), 0);
    }

    #[test]
    fn borrow_rate_below_kink_uses_slope1_only() {
        let env = Env::default();
        // kink=8000, slope1=2000 bps/year, util=5000
        // annual = 0 + 2000 * 5000 / 10000 = 1000 bps/year
        let params = InterestParams {
            base_rate_bps: 0,
            kink_util_bps: 8_000,
            slope1_bps: 2_000,
            slope2_bps: 0,
            reserve_factor_bps: 0,
        };
        let rate = borrow_rate_bps_per_second(&env, &params, 5_000);
        // Function now returns annual bps directly.
        assert_eq!(rate, 1_000);
    }

    #[test]
    fn borrow_rate_above_kink_uses_both_slopes() {
        let env = Env::default();
        // kink=8000, slope1=2000, slope2=4000, util=9000
        // annual = 0 + 2000*8000/10000 + 4000*1000/10000 = 1600 + 400 = 2000 bps/year
        let params = InterestParams {
            base_rate_bps: 0,
            kink_util_bps: 8_000,
            slope1_bps: 2_000,
            slope2_bps: 4_000,
            reserve_factor_bps: 0,
        };
        let rate = borrow_rate_bps_per_second(&env, &params, 9_000);
        assert_eq!(rate, 2_000);
    }

    #[test]
    fn borrow_rate_base_rate_always_present() {
        let env = Env::default();
        // With util=0, rate should equal base_rate.
        let params = InterestParams {
            base_rate_bps: 200,
            kink_util_bps: 8_000,
            slope1_bps: 1_000,
            slope2_bps: 0,
            reserve_factor_bps: 0,
        };
        let rate = borrow_rate_bps_per_second(&env, &params, 0);
        assert_eq!(rate, 200);
    }

    // ── compute_accrual ───────────────────────────────────────────────────────

    #[test]
    fn elapsed_zero_is_noop() {
        let env = Env::default();
        let state = fresh_state();
        let result = compute_accrual(&env, &state, &DEFAULT_PARAMS, 1_000_000, 500_000, 0);
        assert_eq!(result.state.supply_index, state.supply_index);
        assert_eq!(result.state.borrow_index, state.borrow_index);
        assert_eq!(result.interest_to_suppliers, 0);
        assert_eq!(result.interest_to_borrowers, 0);
    }

    #[test]
    fn zero_supply_yields_zero_growth_with_default_params() {
        let env = Env::default();
        let state = fresh_state();
        let result = compute_accrual(&env, &state, &DEFAULT_PARAMS, 0, 0, SECONDS_PER_YEAR as u64);
        assert_eq!(result.interest_to_suppliers, 0);
        assert_eq!(result.interest_to_borrowers, 0);
    }

    #[test]
    fn default_params_yield_zero_accrual_for_one_year() {
        // DEFAULT_PARAMS has all rates == 0; existing snapshot expectations are met.
        let env = Env::default();
        let state = fresh_state();
        let result = compute_accrual(
            &env,
            &state,
            &DEFAULT_PARAMS,
            1_000_000_000,
            500_000_000,
            SECONDS_PER_YEAR as u64,
        );
        assert_eq!(result.interest_to_suppliers, 0);
        assert_eq!(result.interest_to_borrowers, 0);
        assert_eq!(result.state.supply_index, RATE_SCALE);
        assert_eq!(result.state.borrow_index, RATE_SCALE);
    }

    #[test]
    fn kink_model_accrues_nonzero_above_kink() {
        // kink=8000, slope1=2000, slope2=4000, util=9000 → annual borrow = 2000 bps
        let env = Env::default();
        let params = InterestParams {
            base_rate_bps: 0,
            kink_util_bps: 8_000,
            slope1_bps: 2_000,
            slope2_bps: 4_000,
            reserve_factor_bps: 0,
        };
        let state = fresh_state();
        let total_supplied: i128 = 1_000_000_000;
        let total_borrowed: i128 = 900_000_000; // 90% util

        let result = compute_accrual(
            &env,
            &state,
            &params,
            total_supplied,
            total_borrowed,
            SECONDS_PER_YEAR as u64,
        );

        // annual borrow rate = 2000 bps; elapsed = SECONDS_PER_YEAR
        // growth = annual * elapsed * RATE_SCALE / (10_000 * SECONDS_PER_YEAR)
        //        = 2000 * RATE_SCALE / 10_000
        let denominator = 10_000i128 * SECONDS_PER_YEAR;
        let borrow_growth = 2_000i128 * SECONDS_PER_YEAR * RATE_SCALE / denominator;
        // supply_rate_annual = borrow_rate * util * pass_through / 10_000^2
        //                    = 2000 * 9000 * 10000 / 100_000_000 = 1800
        let supply_rate_annual = 2_000i128 * 9_000 * 10_000 / (10_000 * 10_000);
        let supply_growth = supply_rate_annual * SECONDS_PER_YEAR * RATE_SCALE / denominator;

        assert_eq!(
            result.interest_to_borrowers,
            total_borrowed * borrow_growth / RATE_SCALE
        );
        assert_eq!(
            result.interest_to_suppliers,
            total_supplied * supply_growth / RATE_SCALE
        );
        assert!(result.interest_to_borrowers >= result.interest_to_suppliers);
    }

    #[test]
    fn reserve_factor_reduces_supplier_share() {
        let env = Env::default();
        let base = InterestParams {
            base_rate_bps: 0,
            kink_util_bps: 8_000,
            slope1_bps: 2_000,
            slope2_bps: 4_000,
            reserve_factor_bps: 0,
        };
        let with_reserve = InterestParams {
            reserve_factor_bps: 1_000,
            ..base.clone()
        };

        let state = fresh_state();
        // Large balances so interest * RATE_SCALE / denominator > 0 after integer division.
        let total_supplied: i128 = 1_000_000_000_000;
        let total_borrowed: i128 = 900_000_000_000; // 90 % util

        let r_base = compute_accrual(
            &env,
            &state,
            &base,
            total_supplied,
            total_borrowed,
            SECONDS_PER_YEAR as u64,
        );
        let r_with = compute_accrual(
            &env,
            &state,
            &with_reserve,
            total_supplied,
            total_borrowed,
            SECONDS_PER_YEAR as u64,
        );

        assert!(
            r_base.interest_to_suppliers > 0,
            "base case must produce non-zero supplier interest"
        );
        assert!(
            r_with.interest_to_suppliers < r_base.interest_to_suppliers,
            "reserve factor must reduce supplier share: with={} base={}",
            r_with.interest_to_suppliers,
            r_base.interest_to_suppliers
        );
        assert_eq!(
            r_with.interest_to_borrowers, r_base.interest_to_borrowers,
            "reserve factor must not change borrower interest"
        );
    }

    #[test]
    fn conservation_equal_totals_zero_reserve_factor() {
        // total_supplied == total_borrowed (100% util), reserve_factor=0
        // → supply_rate_annual = borrow_rate * 10000 * 10000 / 10000^2 = borrow_rate
        // Both sides applied to equal totals → equal interest
        let env = Env::default();
        let params = InterestParams {
            base_rate_bps: 100,
            kink_util_bps: 8_000,
            slope1_bps: 2_000,
            slope2_bps: 4_000,
            reserve_factor_bps: 0,
        };
        let state = fresh_state();
        let result = compute_accrual(
            &env,
            &state,
            &params,
            1_000_000_000,
            1_000_000_000,
            SECONDS_PER_YEAR as u64,
        );
        assert_eq!(result.interest_to_suppliers, result.interest_to_borrowers);
    }

    #[test]
    fn position_realization_zero_balance_reanchors_snapshot() {
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
        let state = InterestState {
            supply_index: RATE_SCALE * 2,
            borrow_index: RATE_SCALE * 2,
            last_accrual_timestamp: 100,
        };
        let accrued = compute_accrued_position(&position, &state);
        assert_eq!(accrued.deposited, 2000);
        assert_eq!(accrued.borrowed, 1000);
    }

    #[test]
    fn zero_snapshot_returns_position_unchanged() {
        let position = Position {
            deposited: 500,
            borrowed: 250,
            supply_index_snapshot: 0,
            borrow_index_snapshot: 0,
        };
        let state = InterestState {
            supply_index: RATE_SCALE * 2,
            borrow_index: RATE_SCALE * 2,
            last_accrual_timestamp: 100,
        };
        let accrued = compute_accrued_position(&position, &state);
        assert_eq!(accrued.deposited, 500);
        assert_eq!(accrued.borrowed, 250);
    }

    #[test]
    #[should_panic(expected = "Contract, #30")]
    fn overflow_elapsed_100_years() {
        let env = Env::default();
        // Extremely large indexes so borrow_index * borrow_growth overflows i128.
        // With slope1=2000, elapsed=100y: growth = 2000 * RATE_SCALE / 10_000 = 2e8.
        // borrow_index * 2e8 / RATE_SCALE = (i128::MAX/3) * 2e8 / 1e9 overflows.
        let state = InterestState {
            supply_index: i128::MAX / 3,
            borrow_index: i128::MAX / 3,
            last_accrual_timestamp: 0,
        };
        let params = InterestParams {
            base_rate_bps: 0,
            kink_util_bps: 8_000,
            slope1_bps: 2_000,
            slope2_bps: 0,
            reserve_factor_bps: 0,
        };
        // 100 years elapsed; growth = 2000 * 100 * RATE_SCALE / 10_000 = 2e10.
        // new_borrow_index = borrow_index * 2e10 / RATE_SCALE + borrow_index → overflow.
        let now: u64 = SECONDS_PER_YEAR as u64 * 100;
        let _ = compute_accrual(&env, &state, &params, 1_000_000, 500_000, now);
    }
}
