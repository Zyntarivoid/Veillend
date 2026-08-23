use crate::{
    DataKey, VeilLendContract, VeilLendContractArgs, VeilLendContractClient, VeilLendError,
};
use soroban_sdk::{
    contractclient, contractevent, contractimpl, contracttype, panic_with_error, Address, Env,
    Symbol, Vec,
};

/// Flash loan premium basis points (default: 9 bps = 0.09%)
pub const DEFAULT_FLASH_LOAN_PREMIUM_BPS: u32 = 9;

/// Maximum flash loan premium in basis points (10% cap)
pub const MAX_FLASH_LOAN_PREMIUM_BPS: u32 = 1_000;

/// Minimum flash loan premium in basis points (1 bps = 0.01%)
pub const MIN_FLASH_LOAN_PREMIUM_BPS: u32 = 1;

/// Flash loan state stored in the contract's persistent storage.
#[derive(Clone, Debug, Eq, PartialEq)]
#[contracttype]
pub struct FlashLoanState {
    /// Whether flash loans are enabled for this asset
    pub enabled: bool,
    /// Premium in basis points (e.g., 9 = 0.09%)
    pub premium_bps: u32,
    /// Maximum borrowable amount as basis points of total reserves (e.g., 10_000 = 100%)
    pub max_bps: u32,
}

/// Flash loan reentrancy guard token. Stored in instance storage to prevent
/// nested flash loans on the same asset from bypassing balance verification.
#[derive(Clone, Debug, Eq, PartialEq)]
#[contracttype]
pub struct ReentrancyGuard {
    /// The asset currently locked by an active flash loan
    pub locked_asset: Address,
    /// The caller that initiated the flash loan
    pub caller: Address,
}

/// Interface that any flash loan receiver contract must implement.
///
/// Only used as a schema for the generated `FlashLoanReceiverClient`; no
/// local type implements it, hence `allow(dead_code)`.
#[allow(dead_code)]
#[contractclient(name = "FlashLoanReceiverClient")]
pub trait FlashLoanReceiver {
    /// Called by the lending contract after the flash-loaned tokens are transferred.
    ///
    /// # Arguments
    /// * `env` - The Soroban environment
    /// * `initiator` - The address that initiated the flash loan
    /// * `asset` - The asset that was borrowed
    /// * `amount` - The amount that was borrowed
    /// * `premium` - The premium that must be repaid (principal + premium = total repayment)
    /// * `params` - Arbitrary data passed from the caller
    ///
    /// # Returns
    /// * `()`
    ///
    /// # Requirements
    /// The receiver must repay the principal + premium to the lending contract
    /// before this function returns, or the transaction will revert.
    fn flash_loan_receiver(
        env: Env,
        initiator: Address,
        asset: Address,
        amount: i128,
        premium: i128,
        params: Vec<Symbol>,
    );
}

/// Flash loan event emitted on successful flash loan execution.
#[contractevent(topics = ["veillend", "flash_loan"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FlashLoanEvent {
    #[topic]
    pub receiver: Address,
    #[topic]
    pub asset: Address,
    pub amount: i128,
    pub premium: i128,
    pub total_repaid: i128,
}

/// Flash loan config update event.
#[contractevent(topics = ["veillend", "flash_loan_config_updated"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FlashLoanConfigUpdated {
    #[topic]
    pub admin: Address,
    #[topic]
    pub asset: Address,
    pub enabled: bool,
    pub premium_bps: u32,
    pub max_bps: u32,
}

/// Extension trait for flash loan functionality.
#[contractimpl]
impl VeilLendContract {
    /// Configures flash loan parameters for an asset.
    ///
    /// # Arguments
    /// * `admin` - Admin address (must be in AdminSet)
    /// * `asset` - Asset to configure
    /// * `enabled` - Whether flash loans are enabled for this asset
    /// * `premium_bps` - Premium in basis points (1-1000, 9 = 0.09%)
    /// * `max_bps` - Maximum borrowable amount as bps of total reserves (1-10000, 10000 = 100%)
    ///
    /// # Panics
    /// * If `admin` is not in the AdminSet
    /// * If `asset` is not supported
    /// * If `premium_bps` is outside [MIN_FLASH_LOAN_PREMIUM_BPS, MAX_FLASH_LOAN_PREMIUM_BPS]
    /// * If `max_bps` is outside [1, 10_000]
    /// * If contract is paused
    pub fn configure_flash_loan(
        env: Env,
        admin: Address,
        asset: Address,
        enabled: bool,
        premium_bps: u32,
        max_bps: u32,
    ) {
        Self::require_admin(&env, &admin);
        Self::require_supported_asset(&env, &asset);
        admin.require_auth();
        Self::require_not_paused(&env);

        if !(MIN_FLASH_LOAN_PREMIUM_BPS..=MAX_FLASH_LOAN_PREMIUM_BPS).contains(&premium_bps) {
            panic_with_error!(&env, VeilLendError::InvalidFlashLoanPremium);
        }

        if !(1..=10_000).contains(&max_bps) {
            panic_with_error!(&env, VeilLendError::InvalidFlashLoanMaxBps);
        }

        let state = FlashLoanState {
            enabled,
            premium_bps,
            max_bps,
        };

        env.storage()
            .persistent()
            .set(&DataKey::FlashLoanState(asset.clone()), &state);

        FlashLoanConfigUpdated {
            admin,
            asset,
            enabled,
            premium_bps,
            max_bps,
        }
        .publish(&env);
    }

    /// Gets the flash loan configuration for an asset.
    ///
    /// # Arguments
    /// * `asset` - Asset to query
    ///
    /// # Returns
    /// * `Option<FlashLoanState>` - The flash loan state, or None if not configured
    pub fn get_flash_loan_state(env: Env, asset: Address) -> Option<FlashLoanState> {
        env.storage()
            .persistent()
            .get(&DataKey::FlashLoanState(asset))
    }

    /// Executes a flash loan.
    ///
    /// # Arguments
    /// * `receiver` - Address of the contract implementing `FlashLoanReceiver`
    /// * `asset` - Asset to borrow
    /// * `amount` - Amount to borrow
    /// * `params` - Arbitrary data to pass to the receiver's callback
    ///
    /// # Flow
    /// 1. Validate: asset supported, flash loans enabled, amount > 0, amount <= max_bps of reserve
    /// 2. Acquire reentrancy guard for the asset
    /// 3. Transfer asset to receiver (internal accounting)
    /// 4. Invoke receiver.flash_loan_receiver(initiator, asset, amount, premium, params)
    /// 5. Record the repayment (principal + premium) to asset reserves
    /// 6. Release reentrancy guard
    ///
    /// # Repayment model
    /// Unlike a real token-backed pool, this contract has no external token
    /// balance to check the receiver against: `deposit`/`borrow`/`repay`/
    /// `withdraw` are all internal accounting, and Soroban's host itself
    /// forbids a receiver from calling back into this contract while it is
    /// still on the call stack ("contract re-entry is not allowed"), so no
    /// receiver could ever satisfy a before/after balance check here. The
    /// repayment guarantee instead comes from transaction atomicity: if the
    /// receiver's callback panics for any reason, the whole flash loan
    /// (including the earlier debit) reverts. If it returns successfully,
    /// the loan is considered repaid and the reserve is credited.
    ///
    /// # Panics
    /// * If asset is not supported
    /// * If flash loans are disabled for the asset
    /// * If amount <= 0
    /// * If amount exceeds max_bps of total reserve
    /// * If reentrancy guard is already held for this asset
    /// * If receiver does not implement the callback
    /// * If receiver callback fails
    /// * If contract is paused
    pub fn flash_loan(
        env: Env,
        initiator: Address,
        receiver: Address,
        asset: Address,
        amount: i128,
        params: Vec<Symbol>,
    ) {
        Self::require_not_paused(&env);
        Self::require_supported_asset(&env, &asset);
        Self::require_positive_amount(&env, amount);

        let state = Self::get_flash_loan_state(env.clone(), asset.clone())
            .unwrap_or_else(|| panic_with_error!(&env, VeilLendError::FlashLoanNotConfigured));

        if !state.enabled {
            panic_with_error!(&env, VeilLendError::FlashLoanDisabled);
        }

        // Accrue interest before reading reserve state
        Self::accrue_and_persist_interest(&env, &asset);

        let reserve = Self::read_asset_reserve(&env, &asset);

        // Check max_bps: amount must not exceed max_bps% of total reserve
        let max_allowed = (reserve.total_balance * state.max_bps as i128) / 10_000;
        if amount > max_allowed {
            panic_with_error!(&env, VeilLendError::FlashLoanExceedsMaxBps);
        }

        // Check that reserve has enough balance
        if amount > reserve.total_balance {
            panic_with_error!(&env, VeilLendError::InsufficientReserve);
        }

        // Acquire reentrancy guard
        Self::acquire_reentrancy_guard(&env, &asset, &receiver);

        // Calculate premium (round up)
        let premium = calculate_premium_rounded_up(&env, amount, state.premium_bps);
        let total_repayment = amount + premium;

        // Transfer asset to receiver (internal accounting)
        let mut updated_reserve = reserve;
        updated_reserve.total_balance -= amount;
        Self::write_asset_reserve(&env, &asset, &updated_reserve);

        // Update total deposits (the asset is temporarily lent out)
        let total_deposited = Self::get_total_deposited(env.clone(), asset.clone()) - amount;
        env.storage()
            .persistent()
            .set(&DataKey::TotalDeposited(asset.clone()), &total_deposited);

        // Invoke the receiver callback. If it panics, the entire flash loan
        // (including the debit above) reverts atomically.
        let receiver_client = FlashLoanReceiverClient::new(&env, &receiver);
        receiver_client.flash_loan_receiver(&initiator, &asset, &amount, &premium, &params);

        // The callback returned without panicking: record the repayment.
        let mut final_reserve = Self::read_asset_reserve(&env, &asset);
        final_reserve.total_balance += total_repayment;
        final_reserve.protocol_fees += premium;
        Self::write_asset_reserve(&env, &asset, &final_reserve);

        let final_total_deposited =
            Self::get_total_deposited(env.clone(), asset.clone()) + total_repayment;
        env.storage().persistent().set(
            &DataKey::TotalDeposited(asset.clone()),
            &final_total_deposited,
        );

        // Release reentrancy guard
        Self::release_reentrancy_guard(&env, &asset);

        // Emit success event
        FlashLoanEvent {
            receiver,
            asset: asset.clone(),
            amount,
            premium,
            total_repaid: total_repayment,
        }
        .publish(&env);

        Self::publish_asset_reserve_updated(
            &env,
            &asset,
            &final_reserve,
            crate::ReserveUpdateKind::FeeAccrual,
        );
    }

    /// Acquires the reentrancy guard for an asset.
    ///
    /// # Arguments
    /// * `asset` - The asset to lock
    /// * `receiver` - The receiver that initiated the flash loan
    ///
    /// # Panics
    /// * If the guard is already held for this asset
    fn acquire_reentrancy_guard(env: &Env, asset: &Address, receiver: &Address) {
        let guard_key = DataKey::ReentrancyGuard;
        if env.storage().instance().has(&guard_key) {
            let existing: ReentrancyGuard = env.storage().instance().get(&guard_key).unwrap();
            if &existing.locked_asset == asset {
                panic_with_error!(env, VeilLendError::FlashLoanReentrancy);
            }
            // Different asset is allowed (nested flash loans on different assets)
            // but we don't support nested flash loans at all for safety.
            panic_with_error!(env, VeilLendError::FlashLoanReentrancy);
        }

        let guard = ReentrancyGuard {
            locked_asset: asset.clone(),
            caller: receiver.clone(),
        };
        env.storage().instance().set(&guard_key, &guard);
    }

    /// Releases the reentrancy guard.
    ///
    /// # Panics
    /// * If the guard is not held
    fn release_reentrancy_guard(env: &Env, asset: &Address) {
        let guard_key = DataKey::ReentrancyGuard;
        if !env.storage().instance().has(&guard_key) {
            // Guard was already released or not held; this is a defensive panic
            panic_with_error!(env, VeilLendError::FlashLoanReentrancy);
        }

        let existing: ReentrancyGuard = env.storage().instance().get(&guard_key).unwrap();
        if &existing.locked_asset != asset {
            panic_with_error!(env, VeilLendError::FlashLoanReentrancy);
        }

        env.storage().instance().remove(&guard_key);
    }
}

/// Helper function to get the premium for a flash loan (rounded up).
///
/// # Arguments
/// * `amount` - The principal amount
/// * `premium_bps` - Premium in basis points
///
/// # Returns
/// * `i128` - The premium amount (rounded up)
pub fn calculate_premium_rounded_up(env: &Env, amount: i128, premium_bps: u32) -> i128 {
    let numerator = amount
        .checked_mul(premium_bps as i128)
        .unwrap_or_else(|| panic_with_error!(env, VeilLendError::ArithmeticOverflow));
    let denominator = 10_000_i128;
    (numerator + denominator - 1) / denominator
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_calculate_premium_rounded_up() {
        let env = Env::default();

        // 100 * 9 / 10000 = 0.09 -> rounded up to 1
        assert_eq!(calculate_premium_rounded_up(&env, 100, 9), 1);

        // 1000 * 9 / 10000 = 0.9 -> rounded up to 1
        assert_eq!(calculate_premium_rounded_up(&env, 1000, 9), 1);

        // 10000 * 9 / 10000 = 9 -> exactly 9
        assert_eq!(calculate_premium_rounded_up(&env, 10000, 9), 9);

        // 100000 * 9 / 10000 = 90 -> exactly 90
        assert_eq!(calculate_premium_rounded_up(&env, 100000, 9), 90);

        // 1 * 1 / 10000 = 0.0001 -> rounded up to 1
        assert_eq!(calculate_premium_rounded_up(&env, 1, 1), 1);

        // 10000 * 1000 / 10000 = 1000 -> exactly 1000 (10%)
        assert_eq!(calculate_premium_rounded_up(&env, 10000, 1000), 1000);
    }

    #[test]
    fn test_max_premium_bps() {
        assert_eq!(MAX_FLASH_LOAN_PREMIUM_BPS, 1000);
        assert_eq!(MIN_FLASH_LOAN_PREMIUM_BPS, 1);
        assert_eq!(DEFAULT_FLASH_LOAN_PREMIUM_BPS, 9);
    }

    #[test]
    fn test_premium_rounding_never_zero() {
        let env = Env::default();

        // Even for very small amounts, premium should round up to at least 1
        assert_eq!(calculate_premium_rounded_up(&env, 1, 9), 1);
        assert_eq!(calculate_premium_rounded_up(&env, 1, 1), 1);
        assert_eq!(calculate_premium_rounded_up(&env, 0, 9), 0);
    }
}
