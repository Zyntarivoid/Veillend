//! Reward-index and vesting math for the VEIL-style liquidity mining layer.
//!
//! Indexes are fixed-point with [`crate::RATE_SCALE`] (same scale as interest
//! accrual). A pool with supply speed `S` and total deposits `T` advances
//! `supply_index` by `S * elapsed * RATE_SCALE / T` each poke. A user with
//! deposit `B` then earns `B * Δindex / RATE_SCALE`.
//!
//! Accrual is snapshot-on-touch: a user who joins late is snapshotted at the
//! live index *before* their deposit is written, so they only earn from the
//! join timestamp forward.

use crate::{
    interest, ActionKind, ActionPayload, AssetRewardState, DataKey, RewardPoolFunded,
    RewardSpeedsUpdated, RewardsClaimed, RewardsRecovered, RewardsVested, UserRewardState,
    VeilLendContract, VeilLendContractArgs, VeilLendContractClient, VeilLendError, VestingGrant,
    VestingParams, RATE_SCALE,
};
use soroban_sdk::{contractimpl, panic_with_error, token::TokenClient, Address, Env, Vec};

/// Seconds in a calendar day. Used by vesting tests and as documentation for
/// the cliff / duration configuration (which are stored in seconds).
pub const SECONDS_PER_DAY: u64 = 86_400;

/// Advances per-asset reward indexes to `now` using the current aggregate
/// deposit/borrow totals. Idempotent when `now <= last_reward_ts`.
///
/// When `total_supplied == 0` (resp. borrowed) the corresponding index is
/// left unchanged but `last_reward_ts` still jumps to `now`, so a later
/// first depositor cannot harvest idle-period emissions.
pub fn compute_index_advance(
    env: &Env,
    state: &AssetRewardState,
    total_supplied: i128,
    total_borrowed: i128,
    now: u64,
) -> AssetRewardState {
    let elapsed = now.saturating_sub(state.last_reward_ts) as i128;
    if elapsed == 0 {
        return state.clone();
    }

    let mut next = state.clone();

    if state.supply_speed > 0 && total_supplied > 0 {
        let delta = state
            .supply_speed
            .checked_mul(elapsed)
            .and_then(|v| v.checked_mul(RATE_SCALE))
            .and_then(|v| v.checked_div(total_supplied))
            .unwrap_or_else(|| panic_with_error!(env, VeilLendError::ArithmeticOverflow));
        next.supply_index = state
            .supply_index
            .checked_add(delta)
            .unwrap_or_else(|| panic_with_error!(env, VeilLendError::ArithmeticOverflow));
    }

    if state.borrow_speed > 0 && total_borrowed > 0 {
        let delta = state
            .borrow_speed
            .checked_mul(elapsed)
            .and_then(|v| v.checked_mul(RATE_SCALE))
            .and_then(|v| v.checked_div(total_borrowed))
            .unwrap_or_else(|| panic_with_error!(env, VeilLendError::ArithmeticOverflow));
        next.borrow_index = state
            .borrow_index
            .checked_add(delta)
            .unwrap_or_else(|| panic_with_error!(env, VeilLendError::ArithmeticOverflow));
    }

    next.last_reward_ts = now;
    next
}

/// Folds `deposited`/`borrowed` against the index delta since the user's last
/// snapshot into `unclaimed_*`, then re-anchors the snapshots to the live
/// indexes.
///
/// A brand-new user (snapshots at 0) with a zero pre-mutation balance earns
/// nothing even if the pool index has already grown — this is what makes a
/// late joiner start from their join timestamp rather than harvesting
/// historical emissions.
pub fn accrue_from_indexes(
    env: &Env,
    user: &UserRewardState,
    asset: &AssetRewardState,
    deposited: i128,
    borrowed: i128,
) -> UserRewardState {
    let mut next = user.clone();

    if deposited > 0 {
        let delta = asset
            .supply_index
            .checked_sub(user.supply_index_snapshot)
            .unwrap_or(0);
        if delta > 0 {
            let earned = deposited
                .checked_mul(delta)
                .and_then(|v| v.checked_div(RATE_SCALE))
                .unwrap_or_else(|| panic_with_error!(env, VeilLendError::ArithmeticOverflow));
            next.unclaimed_supply = user
                .unclaimed_supply
                .checked_add(earned)
                .unwrap_or_else(|| panic_with_error!(env, VeilLendError::ArithmeticOverflow));
        }
    }

    if borrowed > 0 {
        let delta = asset
            .borrow_index
            .checked_sub(user.borrow_index_snapshot)
            .unwrap_or(0);
        if delta > 0 {
            let earned = borrowed
                .checked_mul(delta)
                .and_then(|v| v.checked_div(RATE_SCALE))
                .unwrap_or_else(|| panic_with_error!(env, VeilLendError::ArithmeticOverflow));
            next.unclaimed_borrow = user
                .unclaimed_borrow
                .checked_add(earned)
                .unwrap_or_else(|| panic_with_error!(env, VeilLendError::ArithmeticOverflow));
        }
    }

    next.supply_index_snapshot = asset.supply_index;
    next.borrow_index_snapshot = asset.borrow_index;
    next
}

/// Cliff + linear vesting.
///
/// * `elapsed < cliff` → 0
/// * `elapsed >= duration` (or `duration == 0`) → full `amount`
/// * otherwise linear from grant start: `amount * elapsed / duration`
///
/// Linear-from-start (rather than linear-from-cliff) means day 45 of a
/// 90-day vest with a 30-day cliff returns the 45/90 linear fraction, while
/// day 10 (still inside the cliff) returns zero.
pub fn compute_vested(grant: &VestingGrant, now: u64) -> i128 {
    if grant.amount <= 0 {
        return 0;
    }
    if grant.duration_seconds == 0 {
        return grant.amount;
    }
    let elapsed = now.saturating_sub(grant.start_ts);
    if elapsed < grant.cliff_seconds {
        return 0;
    }
    if elapsed >= grant.duration_seconds {
        return grant.amount;
    }
    grant.amount * (elapsed as i128) / (grant.duration_seconds as i128)
}

/// Releasable tokens on a grant (`vested - already claimed`), floored at 0.
pub fn compute_releasable(grant: &VestingGrant, now: u64) -> i128 {
    let vested = compute_vested(grant, now);
    if vested > grant.claimed {
        vested - grant.claimed
    } else {
        0
    }
}

impl VeilLendContract {
    fn empty_asset_reward_state(now: u64) -> AssetRewardState {
        AssetRewardState {
            supply_index: 0,
            borrow_index: 0,
            supply_speed: 0,
            borrow_speed: 0,
            last_reward_ts: now,
        }
    }

    fn empty_user_reward_state() -> UserRewardState {
        UserRewardState {
            supply_index_snapshot: 0,
            borrow_index_snapshot: 0,
            unclaimed_supply: 0,
            unclaimed_borrow: 0,
        }
    }

    fn read_asset_reward_state(env: &Env, asset: &Address) -> AssetRewardState {
        env.storage()
            .persistent()
            .get(&DataKey::AssetRewardState(asset.clone()))
            .unwrap_or_else(|| Self::empty_asset_reward_state(env.ledger().timestamp()))
    }

    fn write_asset_reward_state(env: &Env, asset: &Address, state: &AssetRewardState) {
        let key = DataKey::AssetRewardState(asset.clone());
        env.storage().persistent().set(&key, state);
        Self::bump_persistent(env, &key);
    }

    fn read_user_reward_state(env: &Env, user: &Address, asset: &Address) -> UserRewardState {
        env.storage()
            .persistent()
            .get(&DataKey::UserRewardState(user.clone(), asset.clone()))
            .unwrap_or_else(Self::empty_user_reward_state)
    }

    fn write_user_reward_state(
        env: &Env,
        user: &Address,
        asset: &Address,
        state: &UserRewardState,
    ) {
        let key = DataKey::UserRewardState(user.clone(), asset.clone());
        env.storage().persistent().set(&key, state);
        Self::bump_persistent(env, &key);
    }

    fn read_vesting_grants(env: &Env, user: &Address) -> Vec<VestingGrant> {
        env.storage()
            .persistent()
            .get(&DataKey::VestingGrants(user.clone()))
            .unwrap_or_else(|| Vec::new(env))
    }

    fn write_vesting_grants(env: &Env, user: &Address, grants: &Vec<VestingGrant>) {
        let key = DataKey::VestingGrants(user.clone());
        env.storage().persistent().set(&key, grants);
        Self::bump_persistent(env, &key);
    }

    fn read_vesting_params(env: &Env) -> VestingParams {
        VestingParams {
            cliff_seconds: env
                .storage()
                .instance()
                .get(&DataKey::VestingCliffSeconds)
                .unwrap_or(0),
            duration_seconds: env
                .storage()
                .instance()
                .get(&DataKey::VestingDurationSeconds)
                .unwrap_or(0),
        }
    }

    fn read_reward_token(env: &Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::RewardToken)
            .unwrap_or_else(|| panic_with_error!(env, VeilLendError::NotInitialized))
    }

    fn read_reward_pool_funded(env: &Env) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::RewardPoolFunded)
            .unwrap_or(0)
    }

    /// Advance this asset's reward indexes to the current ledger timestamp
    /// and persist them. Called from every user-touching mutation (and from
    /// `set_reward_speeds`) before any balance is rewritten.
    fn advance_reward_indexes(env: &Env, asset: &Address) {
        let state = Self::read_asset_reward_state(env, asset);
        let now = env.ledger().timestamp();
        let already = env
            .storage()
            .persistent()
            .has(&DataKey::AssetRewardState(asset.clone()));
        if already && now <= state.last_reward_ts {
            Self::bump_persistent(env, &DataKey::AssetRewardState(asset.clone()));
            return;
        }
        let total_supplied = Self::get_total_deposited(env.clone(), asset.clone());
        let total_borrowed = Self::get_total_borrowed(env.clone(), asset.clone());
        let next = compute_index_advance(env, &state, total_supplied, total_borrowed, now);
        Self::write_asset_reward_state(env, asset, &next);
    }

    /// Snapshot-on-touch: advance pool indexes, then fold this user's
    /// pre-mutation `position` into their unclaimed counters and re-anchor
    /// their snapshots. Must run after interest realization and before the
    /// position is written.
    pub(crate) fn accrue_user_rewards(
        env: &Env,
        user: &Address,
        asset: &Address,
        position: &crate::Position,
    ) {
        Self::advance_reward_indexes(env, asset);
        let asset_state = Self::read_asset_reward_state(env, asset);
        let user_state = Self::read_user_reward_state(env, user, asset);
        let updated = accrue_from_indexes(
            env,
            &user_state,
            &asset_state,
            position.deposited,
            position.borrowed,
        );
        Self::write_user_reward_state(env, user, asset, &updated);
    }

    fn simulated_asset_reward_state(env: &Env, asset: &Address) -> AssetRewardState {
        let state = Self::read_asset_reward_state(env, asset);
        let total_supplied = Self::get_total_deposited(env.clone(), asset.clone());
        let total_borrowed = Self::get_total_borrowed(env.clone(), asset.clone());
        compute_index_advance(
            env,
            &state,
            total_supplied,
            total_borrowed,
            env.ledger().timestamp(),
        )
    }

    fn simulated_user_unclaimed(env: &Env, user: &Address, asset: &Address) -> UserRewardState {
        let asset_state = Self::simulated_asset_reward_state(env, asset);
        let position = {
            let interest_state = Self::simulate_accrued_interest_state(env, asset);
            interest::compute_accrued_position(
                &Self::read_position(env, user, asset),
                &interest_state,
            )
        };
        let user_state = Self::read_user_reward_state(env, user, asset);
        accrue_from_indexes(
            env,
            &user_state,
            &asset_state,
            position.deposited,
            position.borrowed,
        )
    }

    /// Realize unclaimed rewards for `(user, asset)` into the user's
    /// unclaimed counters (persisted) and return the amount moved. Does not
    /// create a vesting grant — callers do that.
    fn realize_unclaimed_for_asset(env: &Env, user: &Address, asset: &Address) -> i128 {
        let interest_state = Self::accrue_and_persist_interest(env, asset).state;
        let position = interest::compute_accrued_position(
            &Self::read_position(env, user, asset),
            &interest_state,
        );
        Self::accrue_user_rewards(env, user, asset, &position);
        let mut user_state = Self::read_user_reward_state(env, user, asset);
        let amount = user_state
            .unclaimed_supply
            .checked_add(user_state.unclaimed_borrow)
            .unwrap_or_else(|| panic_with_error!(env, VeilLendError::ArithmeticOverflow));
        if amount > 0 {
            user_state.unclaimed_supply = 0;
            user_state.unclaimed_borrow = 0;
            Self::write_user_reward_state(env, user, asset, &user_state);
        }
        amount
    }

    fn push_vesting_grant(env: &Env, user: &Address, amount: i128) {
        let params = Self::read_vesting_params(env);
        let grant = VestingGrant {
            amount,
            claimed: 0,
            start_ts: env.ledger().timestamp(),
            cliff_seconds: params.cliff_seconds,
            duration_seconds: params.duration_seconds,
        };
        let mut grants = Self::read_vesting_grants(env, user);
        grants.push_back(grant.clone());
        Self::write_vesting_grants(env, user, &grants);

        RewardsClaimed {
            user: user.clone(),
            amount,
            grant_start_ts: grant.start_ts,
        }
        .publish(env);
    }

    fn total_releasable(env: &Env, user: &Address) -> i128 {
        let now = env.ledger().timestamp();
        let grants = Self::read_vesting_grants(env, user);
        let mut total: i128 = 0;
        for grant in grants.iter() {
            total = total
                .checked_add(compute_releasable(&grant, now))
                .unwrap_or_else(|| panic_with_error!(env, VeilLendError::ArithmeticOverflow));
        }
        total
    }

    pub(crate) fn apply_recover_rewards(env: &Env, admin: &Address, to: &Address, amount: i128) {
        let token_addr = Self::read_reward_token(env);
        let token = TokenClient::new(env, &token_addr);
        let this = env.current_contract_address();
        let balance = token.balance(&this);
        if amount > balance {
            panic_with_error!(env, VeilLendError::InsufficientReserve);
        }
        token.transfer(&this, to, &amount);

        RewardsRecovered {
            to: to.clone(),
            amount,
            executed_by: admin.clone(),
        }
        .publish(env);
    }
}

#[contractimpl]
impl VeilLendContract {
    /// Sets the VEIL-style reward token. The contract never mints this
    /// token; the admin funds it via `fund_reward_pool`. May only be
    /// changed while the pool has never been funded.
    pub fn set_reward_token(env: Env, admin: Address, token: Address) {
        Self::require_admin(&env, &admin);
        admin.require_auth();
        Self::require_not_paused(&env);

        if Self::read_reward_pool_funded(&env) > 0 {
            panic_with_error!(&env, VeilLendError::AlreadyInitialized);
        }
        env.storage().instance().set(&DataKey::RewardToken, &token);
    }

    /// Returns the configured reward token, if any.
    pub fn get_reward_token(env: Env) -> Option<Address> {
        env.storage().instance().get(&DataKey::RewardToken)
    }

    /// Sets per-asset supply/borrow reward speeds (token units per second).
    /// Accrues with the previous speeds first so the change is not
    /// retroactive. `0` disables that side.
    pub fn set_reward_speeds(
        env: Env,
        admin: Address,
        asset: Address,
        supply_speed: i128,
        borrow_speed: i128,
    ) {
        Self::require_admin(&env, &admin);
        Self::require_supported_asset(&env, &asset);
        admin.require_auth();
        Self::require_not_paused(&env);

        if supply_speed < 0 || borrow_speed < 0 {
            panic_with_error!(&env, VeilLendError::InvalidAmount);
        }

        Self::advance_reward_indexes(&env, &asset);
        let mut state = Self::read_asset_reward_state(&env, &asset);
        state.supply_speed = supply_speed;
        state.borrow_speed = borrow_speed;
        Self::write_asset_reward_state(&env, &asset, &state);

        RewardSpeedsUpdated {
            admin,
            asset,
            supply_speed,
            borrow_speed,
        }
        .publish(&env);
    }

    /// Sets the global cliff + linear vesting schedule applied to new grants.
    /// `duration_seconds == 0` means instant vest. `cliff` must be `<= duration`
    /// when duration is nonzero.
    pub fn set_vesting_params(env: Env, admin: Address, cliff_seconds: u64, duration_seconds: u64) {
        Self::require_admin(&env, &admin);
        admin.require_auth();
        Self::require_not_paused(&env);

        if duration_seconds > 0 && cliff_seconds > duration_seconds {
            panic_with_error!(&env, VeilLendError::InvalidCap);
        }

        env.storage()
            .instance()
            .set(&DataKey::VestingCliffSeconds, &cliff_seconds);
        env.storage()
            .instance()
            .set(&DataKey::VestingDurationSeconds, &duration_seconds);
    }

    pub fn get_vesting_params(env: Env) -> VestingParams {
        Self::read_vesting_params(&env)
    }

    /// Pulls `amount` of the reward token from `funder` into the contract,
    /// then asserts the contract's token balance actually increased before
    /// marking the pool funded. Credits the *observed* delta (not the
    /// requested amount) so fee-on-transfer tokens cannot inflate the
    /// funded counter.
    pub fn fund_reward_pool(env: Env, funder: Address, amount: i128) {
        Self::require_admin(&env, &funder);
        funder.require_auth();
        Self::require_not_paused(&env);
        Self::require_positive_amount(&env, amount);

        let token_addr = Self::read_reward_token(&env);
        let token = TokenClient::new(&env, &token_addr);
        let this = env.current_contract_address();
        let before = token.balance(&this);
        token.transfer(&funder, &this, &amount);
        let after = token.balance(&this);
        let received = after.saturating_sub(before);
        if received <= 0 {
            panic_with_error!(&env, VeilLendError::InsufficientReserve);
        }

        let new_total = Self::read_reward_pool_funded(&env)
            .checked_add(received)
            .unwrap_or_else(|| panic_with_error!(&env, VeilLendError::ArithmeticOverflow));
        env.storage()
            .instance()
            .set(&DataKey::RewardPoolFunded, &new_total);

        RewardPoolFunded {
            funder,
            amount: received,
            new_total_funded: new_total,
        }
        .publish(&env);
    }

    /// Cumulative amount verified as funded into the reward pool.
    pub fn get_reward_pool_funded(env: Env) -> i128 {
        Self::read_reward_pool_funded(&env)
    }

    /// Realize unclaimed rewards for `asset` into a new vesting grant.
    pub fn claim_asset(env: Env, user: Address, asset: Address) {
        user.require_auth();
        let amount = Self::realize_unclaimed_for_asset(&env, &user, &asset);
        if amount == 0 {
            panic_with_error!(&env, VeilLendError::ZeroAmount);
        }
        Self::push_vesting_grant(&env, &user, amount);
    }

    /// Realize unclaimed rewards across every supported asset into a single
    /// vesting grant.
    pub fn claim_all(env: Env, user: Address) {
        user.require_auth();
        let asset_list: Vec<Address> = env
            .storage()
            .persistent()
            .get(&DataKey::SupportedAssetList)
            .unwrap_or_else(|| Vec::new(&env));
        let mut total: i128 = 0;
        for asset in asset_list.iter() {
            let amount = Self::realize_unclaimed_for_asset(&env, &user, &asset);
            total = total
                .checked_add(amount)
                .unwrap_or_else(|| panic_with_error!(&env, VeilLendError::ArithmeticOverflow));
        }
        if total == 0 {
            panic_with_error!(&env, VeilLendError::ZeroAmount);
        }
        Self::push_vesting_grant(&env, &user, total);
    }

    /// Transfer the currently vested (but not-yet-claimed) portion of the
    /// caller's grants. Checks the contract's reward-token balance *before*
    /// mutating `claimed` counters, so an under-funded pool reverts with
    /// no grant state change.
    pub fn vest_claimable(env: Env, user: Address) {
        user.require_auth();
        let releasable = Self::total_releasable(&env, &user);
        if releasable == 0 {
            panic_with_error!(&env, VeilLendError::ZeroAmount);
        }

        let token_addr = Self::read_reward_token(&env);
        let token = TokenClient::new(&env, &token_addr);
        let this = env.current_contract_address();
        if token.balance(&this) < releasable {
            panic_with_error!(&env, VeilLendError::InsufficientReserve);
        }
        token.transfer(&this, &user, &releasable);

        let now = env.ledger().timestamp();
        let grants = Self::read_vesting_grants(&env, &user);
        let mut remaining: Vec<VestingGrant> = Vec::new(&env);
        for mut grant in grants.iter() {
            grant.claimed = compute_vested(&grant, now);
            if grant.claimed < grant.amount {
                remaining.push_back(grant);
            }
        }
        Self::write_vesting_grants(&env, &user, &remaining);

        RewardsVested {
            user,
            amount: releasable,
        }
        .publish(&env);
    }

    /// Live (simulated) unclaimed supply+borrow rewards for `(user, asset)`.
    pub fn get_unclaimed_rewards(env: Env, user: Address, asset: Address) -> i128 {
        let state = Self::simulated_user_unclaimed(&env, &user, &asset);
        state
            .unclaimed_supply
            .checked_add(state.unclaimed_borrow)
            .unwrap_or_else(|| panic_with_error!(&env, VeilLendError::ArithmeticOverflow))
    }

    /// Live (simulated) per-asset reward state, including index growth up to
    /// the current ledger timestamp.
    pub fn get_asset_reward_state(env: Env, asset: Address) -> AssetRewardState {
        Self::simulated_asset_reward_state(&env, &asset)
    }

    /// Persisted user reward counters/snapshots (not simulated). Prefer
    /// `get_unclaimed_rewards` for a live view.
    pub fn get_user_reward_state(env: Env, user: Address, asset: Address) -> UserRewardState {
        Self::read_user_reward_state(&env, &user, &asset)
    }

    /// Currently vested-but-unclaimed tokens across the user's grants.
    pub fn get_vested_claimable(env: Env, user: Address) -> i128 {
        Self::total_releasable(&env, &user)
    }

    pub fn get_vesting_grants(env: Env, user: Address) -> Vec<VestingGrant> {
        Self::read_vesting_grants(&env, &user)
    }

    /// Proposes recovering `amount` of stranded reward tokens to `to`
    /// (timelocked). Returns the action id.
    pub fn propose_recover_rewards(env: Env, admin: Address, to: Address, amount: i128) -> u64 {
        Self::require_admin(&env, &admin);
        admin.require_auth();

        Self::propose_action(
            &env,
            &admin,
            ActionKind::RecoverRewards,
            ActionPayload::RecoverRewards(to, amount),
        )
    }

    pub fn execute_recover_rewards(env: Env, admin: Address, action_id: u64) {
        Self::require_admin(&env, &admin);
        admin.require_auth();
        Self::require_not_paused(&env);

        Self::execute_action(&env, &admin, action_id, ActionKind::RecoverRewards);
    }

    pub fn cancel_recover_rewards(env: Env, admin: Address, action_id: u64) {
        admin.require_auth();
        Self::cancel_action(&env, &admin, action_id, ActionKind::RecoverRewards);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::Env;

    fn fresh_asset() -> AssetRewardState {
        AssetRewardState {
            supply_index: 0,
            borrow_index: 0,
            supply_speed: 0,
            borrow_speed: 0,
            last_reward_ts: 0,
        }
    }

    fn fresh_user() -> UserRewardState {
        UserRewardState {
            supply_index_snapshot: 0,
            borrow_index_snapshot: 0,
            unclaimed_supply: 0,
            unclaimed_borrow: 0,
        }
    }

    #[test]
    fn elapsed_zero_is_noop() {
        let env = Env::default();
        let mut state = fresh_asset();
        state.supply_speed = 10;
        let next = compute_index_advance(&env, &state, 1_000, 0, 0);
        assert_eq!(next.supply_index, 0);
        assert_eq!(next.last_reward_ts, 0);
    }

    #[test]
    fn zero_total_does_not_grow_index_but_advances_timestamp() {
        let env = Env::default();
        let mut state = fresh_asset();
        state.supply_speed = 10;
        let next = compute_index_advance(&env, &state, 0, 0, 100);
        assert_eq!(next.supply_index, 0);
        assert_eq!(next.last_reward_ts, 100);
    }

    #[test]
    fn two_equal_depositors_split_window_exactly() {
        // speed = 10 / sec, total = 2_000, elapsed = 100 → 1_000 tokens emitted.
        // Each user with 1_000 deposit earns 500.
        let env = Env::default();
        let mut state = fresh_asset();
        state.supply_speed = 10;
        let next = compute_index_advance(&env, &state, 2_000, 0, 100);
        let user = accrue_from_indexes(&env, &fresh_user(), &next, 1_000, 0);
        assert_eq!(user.unclaimed_supply, 500);
        assert_eq!(user.unclaimed_borrow, 0);
    }

    #[test]
    fn late_joiner_does_not_harvest_history() {
        let env = Env::default();
        let mut state = fresh_asset();
        state.supply_speed = 10;

        // Solo depositor of 1_000 for 100 seconds → index grows, 1_000 emitted.
        let after_solo = compute_index_advance(&env, &state, 1_000, 0, 100);
        let early = accrue_from_indexes(&env, &fresh_user(), &after_solo, 1_000, 0);
        assert_eq!(early.unclaimed_supply, 1_000);

        // Late joiner: 0 balance at poke time, so they earn nothing even though
        // the index has already grown, then get snapshotted at the live index.
        let late = accrue_from_indexes(&env, &fresh_user(), &after_solo, 0, 0);
        assert_eq!(late.unclaimed_supply, 0);
        assert_eq!(late.supply_index_snapshot, after_solo.supply_index);

        // Shared window of another 100 seconds at total 2_000.
        let after_shared = compute_index_advance(&env, &after_solo, 2_000, 0, 200);
        let late_after = accrue_from_indexes(&env, &late, &after_shared, 1_000, 0);
        assert_eq!(late_after.unclaimed_supply, 500);

        let early_after = accrue_from_indexes(&env, &early, &after_shared, 1_000, 0);
        assert_eq!(early_after.unclaimed_supply, 1_500);
    }

    #[test]
    fn vesting_cliff_linear_90_day_schedule() {
        let cliff = 30 * SECONDS_PER_DAY;
        let duration = 90 * SECONDS_PER_DAY;
        let grant = VestingGrant {
            amount: 9_000,
            claimed: 0,
            start_ts: 0,
            cliff_seconds: cliff,
            duration_seconds: duration,
        };

        // Day 10: still inside the cliff → 0.
        assert_eq!(compute_vested(&grant, 10 * SECONDS_PER_DAY), 0);
        // Day 45 of a 90-day vest: linear fraction 45/90 = 1/2.
        assert_eq!(compute_vested(&grant, 45 * SECONDS_PER_DAY), 4_500);
        // After day 91: fully vested.
        assert_eq!(compute_vested(&grant, 91 * SECONDS_PER_DAY), 9_000);
    }

    #[test]
    fn vesting_zero_duration_is_instant() {
        let grant = VestingGrant {
            amount: 100,
            claimed: 0,
            start_ts: 0,
            cliff_seconds: 0,
            duration_seconds: 0,
        };
        assert_eq!(compute_vested(&grant, 0), 100);
    }

    #[test]
    fn releasable_subtracts_already_claimed() {
        let grant = VestingGrant {
            amount: 90,
            claimed: 20,
            start_ts: 0,
            cliff_seconds: 0,
            duration_seconds: 90,
        };
        // At t=45, vested=45, claimed=20 → releasable=25.
        assert_eq!(compute_releasable(&grant, 45), 25);
        assert_eq!(compute_releasable(&grant, 10), 0); // vested 10 < claimed 20
    }

    #[test]
    fn symmetric_borrow_speed_matches_supply() {
        let env = Env::default();
        let mut state = fresh_asset();
        state.borrow_speed = 10;
        let next = compute_index_advance(&env, &state, 0, 2_000, 100);
        let user = accrue_from_indexes(&env, &fresh_user(), &next, 0, 1_000);
        assert_eq!(user.unclaimed_borrow, 500);
    }
}
