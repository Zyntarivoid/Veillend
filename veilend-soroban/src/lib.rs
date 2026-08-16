#![no_std]

mod interest;

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, panic_with_error,
    symbol_short, Address, Env, Symbol, Vec,
};

/// Increment this only when a contract interface change requires consumers to adapt.
pub const CONTRACT_VERSION: u32 = 4;

/// Increment this only when the serialized `DataKey` or stored value layout changes.
pub const STORAGE_SCHEMA_VERSION: u32 = 3;

/// Values <= this amount after repay/withdraw are rounded to zero.
pub const DUST_THRESHOLD: i128 = 100;

/// A compact, stable identifier for the current `DataKey` storage layout.
const STORAGE_SCHEMA_ID: Symbol = symbol_short!("VLENDV3");

/// Default delay (in ledgers) before a proposed privileged action becomes
/// executable. ~5 minutes on Futurenet.
pub const DEFAULT_TIMELOCK_LEDGERS: u32 = 50;

/// Hard floor for the admin-configurable timelock.
pub const MIN_TIMELOCK_LEDGERS: u32 = 1;

/// Hard ceiling for the admin-configurable timelock.
pub const MAX_TIMELOCK_LEDGERS: u32 = 100_000;

/// Queryable metadata describing the contract interface and its storage layout.
#[derive(Clone, Debug, Eq, PartialEq)]
#[contracttype]
pub struct ContractMetadata {
    pub contract_version: u32,
    pub storage_schema_version: u32,
    pub storage_schema_id: Symbol,
}

/// Keys and value shapes that make up storage schema `VLENDV3`.
///
/// Instance storage: `AdminSet: Vec<Address>`, `MinCollateralRatioBps: u32`,
/// `TimelockLedgers: u32`, `NextActionId: u64`,
/// `PendingAction(u64): PendingAction`.
/// Persistent storage: `SupportedAsset(Address): bool`,
/// `Position(Address, Address): Position`, `OraclePrice(Address): i128`,
/// `DepositCap(Address)`/`BorrowCap(Address): i128`,
/// `TotalDeposited(Address)`/`TotalBorrowed(Address): i128`, `Paused: bool`,
/// and `InterestState(Address): InterestState`.
#[derive(Clone)]
#[contracttype]
pub enum DataKey {
    /// The set of privileged addresses; any one of them may act as admin.
    AdminSet,
    /// Timelock delay in ledgers applied to privileged mutations.
    TimelockLedgers,
    /// Monotonic counter that allocates pending-action ids.
    NextActionId,
    /// A proposed, not-yet-executed privileged action, keyed by its id.
    PendingAction(u64),
    MinCollateralRatioBps,
    SupportedAsset(Address),
    AssetReserve(Address),
    Position(Address, Address),
    OraclePrice(Address),
    /// Per-asset deposit cap (max total deposits for this asset)
    DepositCap(Address),
    /// Per-asset borrow cap (max total borrows for this asset)
    BorrowCap(Address),
    /// Total deposited amount for an asset across all users
    TotalDeposited(Address),
    /// Total borrowed amount for an asset across all users
    TotalBorrowed(Address),
    /// Circuit breaker state - paused or not
    Paused,
    /// Time-based interest accrual indexes for an asset
    InterestState(Address),
    /// Timestamp when oracle price was last updated for an asset
    OracleLastUpdated(Address),
    /// Previous oracle price for volatility checking
    OraclePrevPrice(Address),
    /// Maximum allowed price change in basis points per update
    OracleMaxChangeBps(Address),
    /// Minimum allowed oracle price for an asset
    OracleMinPrice(Address),
    /// Maximum allowed oracle price for an asset
    OracleMaxPrice(Address),
    /// Protocol-wide maximum oracle age in seconds
    MaxOracleAge,
    /// Admin-configured upper bound on single-call protocol fees, in bps.
    /// 0 (default / never set) means the bound is disabled.
    MaxProtocolFeeBps,
}

#[derive(Clone, Debug, Eq, PartialEq)]
#[contracttype]
pub struct Position {
    pub deposited: i128,
    pub borrowed: i128,
    /// interest.rs `supply_index` at this position's last realization
    pub supply_index_snapshot: i128,
    /// interest.rs `borrow_index` at this position's last realization
    pub borrow_index_snapshot: i128,
}

/// Time-based interest accrual state for one asset. See `interest.rs` for
/// the accrual math. `supply_index`/`borrow_index` are fixed-point
/// (interest::RATE_SCALE = 1.0x).
#[derive(Clone, Debug, Eq, PartialEq)]
#[contracttype]
pub struct InterestState {
    pub supply_index: i128,
    pub borrow_index: i128,
    pub last_accrual_timestamp: u64,
}

#[derive(Clone, Debug, Eq, PartialEq)]
#[contracttype]
pub struct AssetCaps {
    pub deposit_cap: i128,
    pub borrow_cap: i128,
}

#[derive(Clone, Debug, Eq, PartialEq)]
#[contracttype]
pub struct AssetReserve {
    pub total_balance: i128,
    pub protocol_fees: i128,
}

#[derive(Clone, Debug, Eq, PartialEq)]
#[contracttype]
pub enum ReserveUpdateKind {
    ConfigureAsset,
    Deposit,
    Borrow,
    Repay,
    Withdraw,
    FeeAccrual,
    InterestAccrual,
}

/// The class of privileged mutation a pending action will perform. Used to
/// route `execute_*`/`cancel_*` calls to the matching proposal.
#[derive(Clone, Debug, Eq, PartialEq)]
#[contracttype]
pub enum ActionKind {
    ConfigureAsset,
    SetOraclePrice,
    UpdateAssetCaps,
    SetMinCollateralRatio,
    SetPaused,
    RecordProtocolFee,
}

/// The arguments captured when a privileged action is proposed. Stored in
/// full (rather than as a hash) so `execute_*` can apply exactly what was
/// proposed without trusting call-supplied parameters.
#[derive(Clone, Debug, Eq, PartialEq)]
#[contracttype]
pub enum ActionPayload {
    ConfigureAsset(Address, bool),
    SetOraclePrice(Address, i128),
    UpdateAssetCaps(Address, i128, i128),
    SetMinCollateralRatio(u32),
    SetPaused(bool),
    RecordProtocolFee(Address, i128),
}

/// A proposed privileged action awaiting its timelock window.
#[derive(Clone, Debug, Eq, PartialEq)]
#[contracttype]
pub struct PendingAction {
    pub kind: ActionKind,
    pub payload: ActionPayload,
    /// First ledger sequence at which this action may be executed.
    pub executable_at_ledger: u32,
    pub proposer: Address,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum VeilLendError {
    /// Contract has already been initialized
    AlreadyInitialized = 1,
    /// Caller is not the admin
    Unauthorized = 2,
    /// Asset is not supported by the protocol
    UnsupportedAsset = 3,
    /// Amount must be positive (non-zero)
    InvalidAmount = 4,
    /// Collateral ratio below minimum after operation
    InsufficientCollateral = 5,
    /// Withdraw amount exceeds deposited balance
    InsufficientDeposit = 6,
    /// Repay amount exceeds outstanding borrowed balance
    RepayTooLarge = 7,
    /// Minimum collateral ratio is below 100% (10_000 bps)
    InvalidCollateralRatio = 8,
    /// Contract has not been initialized yet
    NotInitialized = 9,
    /// Amount of zero is not allowed
    ZeroAmount = 10,
    /// Oracle price not configured for the asset
    OraclePriceMissing = 11,
    /// Operation blocked: contract is paused
    ContractPaused = 12,
    /// Deposit cap would be exceeded
    DepositCapExceeded = 13,
    /// Borrow cap would be exceeded
    BorrowCapExceeded = 14,
    /// Invalid cap value (must be positive or -1 for unlimited)
    InvalidCap = 15,
    /// Circuit breaker triggered - asset temporarily paused
    CircuitBreakerTriggered = 16,
    /// Reserve balance is too low for the requested action
    InsufficientReserve = 17,
    /// Pending action's timelock window has not elapsed yet
    TimelockNotReady = 18,
    /// No pending action with the given id (or wrong kind)
    UnknownAction = 19,
    /// Cannot remove the last remaining admin
    LastAdminRequired = 20,
    /// Timelock value is outside the allowed range
    InvalidTimelock = 21,
    /// Pausing requires a timelocked proposal (use propose/execute)
    TimelockRequired = 22,
    /// Oracle price is stale (exceeded maximum age)
    OraclePriceStale = 23,
    /// Oracle price change exceeds maximum allowed change
    OraclePriceChangeExceedsLimit = 24,
    /// Oracle price is below minimum allowed price
    OraclePriceBelowMin = 25,
    /// Oracle price is above maximum allowed price
    OraclePriceAboveMax = 26,
    /// Cannot disable an asset that still has active deposited or borrowed balances.
    /// Disabling such an asset would permanently trap user funds because every
    /// lending entrypoint calls require_supported_asset.
    AssetHasActivePositions = 27,
    /// Proposed cap is below the current outstanding total for that asset.
    /// Setting a cap below the live total creates an immediately-violated
    /// invariant and could block users from repaying or withdrawing.
    CapBelowOutstanding = 28,
    /// The requested protocol fee exceeds the admin-configured max_protocol_fee_bps
    /// limit. Without this bound an admin could drain user funds disguised as fees.
    ProtocolFeeExceedsLimit = 29,
}

#[contractevent(topics = ["veillend", "asset_configured"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AssetConfigured {
    #[topic]
    pub admin: Address,
    #[topic]
    pub asset: Address,
    pub supported: bool,
}

#[contractevent(topics = ["veillend", "deposit"], data_format = "single-value")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DepositEvent {
    #[topic]
    pub user: Address,
    #[topic]
    pub asset: Address,
    pub amount: i128,
}

#[contractevent(topics = ["veillend", "borrow"], data_format = "single-value")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BorrowEvent {
    #[topic]
    pub user: Address,
    #[topic]
    pub asset: Address,
    pub amount: i128,
}

#[contractevent(topics = ["veillend", "repay"], data_format = "single-value")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RepayEvent {
    #[topic]
    pub user: Address,
    #[topic]
    pub asset: Address,
    pub amount: i128,
}

#[contractevent(topics = ["veillend", "withdraw"], data_format = "single-value")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct WithdrawEvent {
    #[topic]
    pub user: Address,
    #[topic]
    pub asset: Address,
    pub amount: i128,
}

#[contractevent(topics = ["veillend", "caps_updated"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CapsUpdated {
    #[topic]
    pub admin: Address,
    #[topic]
    pub asset: Address,
    pub deposit_cap: i128,
    pub borrow_cap: i128,
}

#[contractevent(topics = ["veillend", "circuit_breaker"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CircuitBreakerEvent {
    #[topic]
    pub admin: Address,
    pub paused: bool,
}

#[contractevent(topics = ["veillend", "asset_reserve_updated"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AssetReserveUpdated {
    #[topic]
    pub asset: Address,
    pub total_balance: i128,
    pub protocol_fees: i128,
    pub kind: ReserveUpdateKind,
}

#[contractevent(topics = ["veillend", "admin_added"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AdminAdded {
    #[topic]
    pub admin: Address,
    #[topic]
    pub new_admin: Address,
}

#[contractevent(topics = ["veillend", "admin_removed"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AdminRemoved {
    #[topic]
    pub admin: Address,
    #[topic]
    pub removed: Address,
}

#[contractevent(topics = ["veillend", "action_proposed"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ActionProposed {
    #[topic]
    pub proposer: Address,
    pub action_id: u64,
    pub kind: ActionKind,
    pub executable_at_ledger: u32,
}

#[contractevent(topics = ["veillend", "action_executed"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ActionExecuted {
    #[topic]
    pub executor: Address,
    pub action_id: u64,
    pub kind: ActionKind,
}

#[contractevent(topics = ["veillend", "action_cancelled"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ActionCancelled {
    #[topic]
    pub canceller: Address,
    pub action_id: u64,
    pub kind: ActionKind,
}

#[contractevent(topics = ["veillend", "timelock_updated"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TimelockUpdated {
    #[topic]
    pub admin: Address,
    pub ledgers: u32,
}

#[contract]
pub struct VeilLendContract;

#[contractimpl]
impl VeilLendContract {
    /// Returns the interface and storage metadata for this deployed contract shape.
    ///
    /// Clients should read this before assuming a storage layout during migrations.
    pub fn contract_metadata(_env: Env) -> ContractMetadata {
        ContractMetadata {
            contract_version: CONTRACT_VERSION,
            storage_schema_version: STORAGE_SCHEMA_VERSION,
            storage_schema_id: STORAGE_SCHEMA_ID,
        }
    }

    pub fn __constructor(env: Env, admin: Address, min_collateral_ratio_bps: u32) {
        // Authenticate first, before any storage read or write, so random
        // callers cannot probe initialization state without signing as the
        // admin they claim to be.
        admin.require_auth();

        if env.storage().instance().has(&DataKey::AdminSet) {
            panic_with_error!(&env, VeilLendError::AlreadyInitialized);
        }
        if min_collateral_ratio_bps < 10_000 {
            panic_with_error!(&env, VeilLendError::InvalidCollateralRatio);
        }

        // Founding admin is written into a single-element AdminSet. Subsequent
        // admins are added via `add_admin`.
        let mut admins = Vec::new(&env);
        admins.push_back(admin);
        env.storage().instance().set(&DataKey::AdminSet, &admins);

        env.storage()
            .instance()
            .set(&DataKey::MinCollateralRatioBps, &min_collateral_ratio_bps);
        env.storage()
            .instance()
            .set(&DataKey::TimelockLedgers, &DEFAULT_TIMELOCK_LEDGERS);
        env.storage().instance().set(&DataKey::NextActionId, &0u64);

        // Initialize circuit breaker as not paused
        env.storage().persistent().set(&DataKey::Paused, &false);
    }

    /// Adds `new_admin` to the admin set. Callable only by a current admin.
    pub fn add_admin(env: Env, caller: Address, new_admin: Address) {
        Self::require_admin(&env, &caller);
        caller.require_auth();

        let mut admins = Self::read_admin_set(&env);
        if !admins.contains(&new_admin) {
            admins.push_back(new_admin.clone());
            Self::write_admin_set(&env, &admins);
        }

        AdminAdded {
            admin: caller,
            new_admin,
        }
        .publish(&env);
    }

    /// Removes `to_remove` from the admin set. Callable only by a current
    /// admin. Panics if the set would drop to length 0 (prevents lockout).
    pub fn remove_admin(env: Env, caller: Address, to_remove: Address) {
        Self::require_admin(&env, &caller);
        caller.require_auth();

        let admins = Self::read_admin_set(&env);
        if admins.len() <= 1 {
            panic_with_error!(&env, VeilLendError::LastAdminRequired);
        }
        if !admins.contains(&to_remove) {
            panic_with_error!(&env, VeilLendError::Unauthorized);
        }

        let mut remaining = Vec::new(&env);
        for admin in admins.iter() {
            if admin != to_remove {
                remaining.push_back(admin);
            }
        }
        Self::write_admin_set(&env, &remaining);

        AdminRemoved {
            admin: caller,
            removed: to_remove,
        }
        .publish(&env);
    }

    /// Returns the current admin set.
    pub fn get_admins(env: Env) -> Vec<Address> {
        Self::read_admin_set(&env)
    }

    /// Sets the timelock delay (in ledgers) applied to privileged mutations.
    /// Admin-only. Bounded to `[MIN_TIMELOCK_LEDGERS, MAX_TIMELOCK_LEDGERS]`.
    pub fn set_timelock_ledgers(env: Env, admin: Address, ledgers: u32) {
        Self::require_admin(&env, &admin);
        admin.require_auth();

        if !(MIN_TIMELOCK_LEDGERS..=MAX_TIMELOCK_LEDGERS).contains(&ledgers) {
            panic_with_error!(&env, VeilLendError::InvalidTimelock);
        }

        env.storage()
            .instance()
            .set(&DataKey::TimelockLedgers, &ledgers);

        TimelockUpdated { admin, ledgers }.publish(&env);
    }

    /// Returns the current timelock delay in ledgers.
    pub fn get_timelock_ledgers(env: Env) -> u32 {
        Self::timelock_ledgers(&env)
    }

    /// Returns the pending action with the given id, if any.
    pub fn get_pending_action(env: Env, action_id: u64) -> Option<PendingAction> {
        env.storage()
            .instance()
            .get(&DataKey::PendingAction(action_id))
    }

    /// Proposes configuring an asset (timelocked). Returns the action id.
    pub fn propose_configure_asset(
        env: Env,
        admin: Address,
        asset: Address,
        supported: bool,
    ) -> u64 {
        Self::require_admin(&env, &admin);
        admin.require_auth();

        Self::propose_action(
            &env,
            &admin,
            ActionKind::ConfigureAsset,
            ActionPayload::ConfigureAsset(asset, supported),
        )
    }

    /// Executes a previously proposed configure_asset action, if its timelock
    /// has elapsed.
    pub fn execute_configure_asset(env: Env, admin: Address, action_id: u64) {
        Self::require_admin(&env, &admin);
        admin.require_auth();

        Self::execute_action(&env, &admin, action_id, ActionKind::ConfigureAsset);
    }

    /// Cancels a pending configure_asset action.
    pub fn cancel_configure_asset(env: Env, admin: Address, action_id: u64) {
        admin.require_auth();

        Self::cancel_action(&env, &admin, action_id, ActionKind::ConfigureAsset);
    }

    /// Proposes setting the oracle price for an asset (timelocked). Returns
    /// the action id.
    pub fn propose_set_oracle_price(env: Env, admin: Address, asset: Address, price: i128) -> u64 {
        Self::require_admin(&env, &admin);
        admin.require_auth();

        Self::propose_action(
            &env,
            &admin,
            ActionKind::SetOraclePrice,
            ActionPayload::SetOraclePrice(asset, price),
        )
    }

    /// Executes a previously proposed set_oracle_price action.
    pub fn execute_set_oracle_price(env: Env, admin: Address, action_id: u64) {
        Self::require_admin(&env, &admin);
        admin.require_auth();

        Self::execute_action(&env, &admin, action_id, ActionKind::SetOraclePrice);
    }

    /// Cancels a pending set_oracle_price action.
    pub fn cancel_set_oracle_price(env: Env, admin: Address, action_id: u64) {
        admin.require_auth();

        Self::cancel_action(&env, &admin, action_id, ActionKind::SetOraclePrice);
    }

    /// Get the oracle price for an asset
    ///
    /// Returns the oracle price for the specified asset if set, otherwise None.
    ///
    /// # Arguments
    /// * `asset` - The asset address to get the price for
    ///
    /// # Returns
    /// * `Option<i128>` - The oracle price if set, None otherwise
    pub fn get_oracle_price(env: Env, asset: Address) -> Option<i128> {
        env.storage().persistent().get(&DataKey::OraclePrice(asset))
    }

    /// Sets the oracle price for an asset directly (admin only)
    ///
    /// Validates price bounds and max change limits before updating.
    pub fn set_oracle_price(env: Env, admin: Address, asset: Address, price: i128) {
        Self::require_admin(&env, &admin);
        Self::require_supported_asset(&env, &asset);
        admin.require_auth();

        Self::apply_set_oracle_price(&env, &asset, price);
    }

    /// Get the oracle price with age in seconds
    ///
    /// Returns both the oracle price and how many seconds ago it was last updated.
    pub fn get_oracle_price_with_age(env: Env, asset: Address) -> Option<(i128, u64)> {
        let price = env
            .storage()
            .persistent()
            .get(&DataKey::OraclePrice(asset.clone()))?;
        let last_updated = env
            .storage()
            .persistent()
            .get(&DataKey::OracleLastUpdated(asset.clone()))
            .unwrap_or(0);
        let now = env.ledger().timestamp();
        let age = now.saturating_sub(last_updated);
        Some((price, age))
    }

    /// Set the protocol-wide maximum oracle age (admin only)
    pub fn set_max_oracle_age(env: Env, admin: Address, seconds: u64) {
        Self::require_admin(&env, &admin);
        admin.require_auth();
        env.storage()
            .instance()
            .set(&DataKey::MaxOracleAge, &seconds);
    }

    /// Get the protocol-wide maximum oracle age
    pub fn get_max_oracle_age(env: Env) -> u64 {
        env.storage()
            .instance()
            .get(&DataKey::MaxOracleAge)
            .unwrap_or(86400)
    }

    /// Set maximum allowed price change per update for an asset (admin only)
    pub fn set_oracle_max_change_bps(env: Env, admin: Address, asset: Address, max_bps: u32) {
        Self::require_admin(&env, &admin);
        Self::require_supported_asset(&env, &asset);
        admin.require_auth();
        env.storage()
            .persistent()
            .set(&DataKey::OracleMaxChangeBps(asset.clone()), &max_bps);
    }

    /// Get maximum allowed price change per update for an asset
    pub fn get_oracle_max_change_bps(env: Env, asset: Address) -> u32 {
        env.storage()
            .persistent()
            .get(&DataKey::OracleMaxChangeBps(asset))
            .unwrap_or(0)
    }

    /// Set absolute price bounds for an asset (admin only)
    pub fn set_oracle_price_bounds(env: Env, admin: Address, asset: Address, min: i128, max: i128) {
        Self::require_admin(&env, &admin);
        Self::require_supported_asset(&env, &asset);
        admin.require_auth();

        env.storage()
            .persistent()
            .set(&DataKey::OracleMinPrice(asset.clone()), &min);
        env.storage()
            .persistent()
            .set(&DataKey::OracleMaxPrice(asset.clone()), &max);
    }

    /// Get absolute price bounds for an asset
    pub fn get_oracle_price_bounds(env: Env, asset: Address) -> (i128, i128) {
        let min = env
            .storage()
            .persistent()
            .get(&DataKey::OracleMinPrice(asset.clone()))
            .unwrap_or(0);
        let max = env
            .storage()
            .persistent()
            .get(&DataKey::OracleMaxPrice(asset))
            .unwrap_or(i128::MAX);
        (min, max)
    }

    /// Proposes updating per-asset deposit and borrow caps (timelocked).
    /// Returns the action id.
    pub fn propose_update_asset_caps(
        env: Env,
        admin: Address,
        asset: Address,
        deposit_cap: i128,
        borrow_cap: i128,
    ) -> u64 {
        Self::require_admin(&env, &admin);
        admin.require_auth();

        Self::propose_action(
            &env,
            &admin,
            ActionKind::UpdateAssetCaps,
            ActionPayload::UpdateAssetCaps(asset, deposit_cap, borrow_cap),
        )
    }

    /// Executes a previously proposed update_asset_caps action.
    pub fn execute_update_asset_caps(env: Env, admin: Address, action_id: u64) {
        Self::require_admin(&env, &admin);
        admin.require_auth();

        Self::execute_action(&env, &admin, action_id, ActionKind::UpdateAssetCaps);
    }

    /// Cancels a pending update_asset_caps action.
    pub fn cancel_update_asset_caps(env: Env, admin: Address, action_id: u64) {
        admin.require_auth();

        Self::cancel_action(&env, &admin, action_id, ActionKind::UpdateAssetCaps);
    }

    /// Get the current caps for an asset
    ///
    /// # Arguments
    /// * `asset` - The asset address to get caps for
    ///
    /// # Returns
    /// * `AssetCaps` - Struct containing deposit_cap and borrow_cap (-1 for unlimited)
    pub fn get_asset_caps(env: Env, asset: Address) -> AssetCaps {
        let deposit_cap = env
            .storage()
            .persistent()
            .get(&DataKey::DepositCap(asset.clone()))
            .unwrap_or(-1);
        let borrow_cap = env
            .storage()
            .persistent()
            .get(&DataKey::BorrowCap(asset.clone()))
            .unwrap_or(-1);

        AssetCaps {
            deposit_cap,
            borrow_cap,
        }
    }

    /// Proposes updating the minimum collateral ratio (timelocked). Returns
    /// the action id.
    pub fn propose_set_min_collateral_ratio(
        env: Env,
        admin: Address,
        min_collateral_ratio_bps: u32,
    ) -> u64 {
        Self::require_admin(&env, &admin);
        admin.require_auth();

        Self::propose_action(
            &env,
            &admin,
            ActionKind::SetMinCollateralRatio,
            ActionPayload::SetMinCollateralRatio(min_collateral_ratio_bps),
        )
    }

    /// Executes a previously proposed set_min_collateral_ratio action.
    pub fn execute_set_min_collateral_ratio(env: Env, admin: Address, action_id: u64) {
        Self::require_admin(&env, &admin);
        admin.require_auth();

        Self::execute_action(&env, &admin, action_id, ActionKind::SetMinCollateralRatio);
    }

    /// Cancels a pending set_min_collateral_ratio action.
    pub fn cancel_set_min_collateral_ratio(env: Env, admin: Address, action_id: u64) {
        admin.require_auth();

        Self::cancel_action(&env, &admin, action_id, ActionKind::SetMinCollateralRatio);
    }

    /// Get total deposited amount for an asset
    ///
    /// # Arguments
    /// * `asset` - The asset address to get total deposits for
    ///
    /// # Returns
    /// * `i128` - Total deposited amount
    pub fn get_total_deposited(env: Env, asset: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::TotalDeposited(asset))
            .unwrap_or(0)
    }

    /// Get total borrowed amount for an asset
    ///
    /// # Arguments
    /// * `asset` - The asset address to get total borrows for
    ///
    /// # Returns
    /// * `i128` - Total borrowed amount
    pub fn get_total_borrowed(env: Env, asset: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::TotalBorrowed(asset))
            .unwrap_or(0)
    }

    /// Unpauses the contract immediately. Pausing is timelocked and must go
    /// through `propose_set_paused`/`execute_set_paused`; unpausing is exempt
    /// from the timelock so incident response can recover quickly.
    ///
    /// # Arguments
    /// * `admin` - A current admin address
    /// * `paused` - must be `false`; passing `true` panics with `TimelockRequired`
    pub fn set_paused(env: Env, admin: Address, paused: bool) {
        Self::require_admin(&env, &admin);
        admin.require_auth();

        if paused {
            panic_with_error!(&env, VeilLendError::TimelockRequired);
        }

        Self::apply_set_paused(&env, &admin, false);
    }

    /// Proposes pausing the contract (timelocked). Returns the action id.
    pub fn propose_set_paused(env: Env, admin: Address) -> u64 {
        Self::require_admin(&env, &admin);
        admin.require_auth();

        Self::propose_action(
            &env,
            &admin,
            ActionKind::SetPaused,
            ActionPayload::SetPaused(true),
        )
    }

    /// Executes a previously proposed pause action.
    pub fn execute_set_paused(env: Env, admin: Address, action_id: u64) {
        Self::require_admin(&env, &admin);
        admin.require_auth();

        Self::execute_action(&env, &admin, action_id, ActionKind::SetPaused);
    }

    /// Cancels a pending pause action.
    pub fn cancel_set_paused(env: Env, admin: Address, action_id: u64) {
        admin.require_auth();

        Self::cancel_action(&env, &admin, action_id, ActionKind::SetPaused);
    }

    /// Check if the contract is paused
    ///
    /// # Returns
    /// * `bool` - true if paused, false otherwise
    pub fn is_paused(env: Env) -> bool {
        env.storage()
            .persistent()
            .get(&DataKey::Paused)
            .unwrap_or(false)
    }

    // This scaffold tracks protocol state first; token transfers and privacy proofs
    // can be layered on top once the Stellar asset integrations are finalized.
    pub fn deposit(env: Env, user: Address, asset: Address, amount: i128) {
        Self::require_not_paused(&env);
        Self::require_supported_asset(&env, &asset);
        Self::require_positive_amount(&env, amount);
        user.require_auth();

        // Accrue interest first so both the cap check below and the totals
        // we write reflect up-to-date, time-aware values.
        let interest_state = Self::accrue_and_persist_interest(&env, &asset);

        // Check deposit cap
        Self::check_deposit_cap(&env, &asset, amount);

        let mut position = interest::compute_accrued_position(
            &Self::read_position(&env, &user, &asset),
            &interest_state,
        );
        let mut reserve = Self::read_asset_reserve(&env, &asset);
        position.deposited += amount;
        reserve.total_balance += amount;
        Self::write_position(&env, &user, &asset, &position);
        Self::write_asset_reserve(&env, &asset, &reserve);

        // Update total deposits
        let total = Self::get_total_deposited(env.clone(), asset.clone()) + amount;
        env.storage()
            .persistent()
            .set(&DataKey::TotalDeposited(asset.clone()), &total);

        DepositEvent {
            user,
            asset: asset.clone(),
            amount,
        }
        .publish(&env);
        Self::publish_asset_reserve_updated(&env, &asset, &reserve, ReserveUpdateKind::Deposit);
    }

    pub fn borrow(
        env: Env,
        user: Address,
        borrow_asset: Address,
        collateral_asset: Address,
        amount: i128,
    ) {
        Self::require_not_paused(&env);
        Self::require_supported_asset(&env, &borrow_asset);
        Self::require_supported_asset(&env, &collateral_asset);
        Self::require_positive_amount(&env, amount);
        user.require_auth();

        // Accrue interest first so both the cap check below and the totals
        // we write reflect up-to-date, time-aware values.
        let interest_state = Self::accrue_and_persist_interest(&env, &borrow_asset);

        // Check borrow cap
        Self::check_borrow_cap(&env, &borrow_asset, amount);

        let mut position = interest::compute_accrued_position(
            &Self::read_position(&env, &user, &borrow_asset),
            &interest_state,
        );
        let mut reserve = Self::read_asset_reserve(&env, &borrow_asset);
        if amount > reserve.total_balance {
            panic_with_error!(&env, VeilLendError::InsufficientReserve);
        }
        position.borrowed += amount;
        reserve.total_balance -= amount;
        Self::assert_collateralized(
            &env,
            &collateral_asset,
            &borrow_asset,
            &user,
            CollateralAction::Borrow { amount },
        );
        Self::write_position(&env, &user, &borrow_asset, &position);
        Self::write_asset_reserve(&env, &borrow_asset, &reserve);

        // Update total borrows
        let total = Self::get_total_borrowed(env.clone(), borrow_asset.clone()) + amount;
        env.storage()
            .persistent()
            .set(&DataKey::TotalBorrowed(borrow_asset.clone()), &total);

        BorrowEvent {
            user,
            asset: borrow_asset.clone(),
            amount,
        }
        .publish(&env);
        Self::publish_asset_reserve_updated(
            &env,
            &borrow_asset,
            &reserve,
            ReserveUpdateKind::Borrow,
        );
    }

    pub fn repay(env: Env, user: Address, asset: Address, amount: i128) {
        // Repay is allowed even when paused (users can always reduce debt)
        Self::require_supported_asset(&env, &asset);
        Self::require_positive_amount(&env, amount);
        user.require_auth();

        let interest_state = Self::accrue_and_persist_interest(&env, &asset);

        let mut position = interest::compute_accrued_position(
            &Self::read_position(&env, &user, &asset),
            &interest_state,
        );
        let mut reserve = Self::read_asset_reserve(&env, &asset);
        if amount > position.borrowed {
            panic_with_error!(&env, VeilLendError::RepayTooLarge);
        }

        position.borrowed -= amount;
        reserve.total_balance += amount;

        let mut dust_delta = 0;
        if position.borrowed > 0 && position.borrowed <= DUST_THRESHOLD {
            dust_delta = position.borrowed;
            position.borrowed = 0;
        }

        Self::write_position(&env, &user, &asset, &position);
        Self::write_asset_reserve(&env, &asset, &reserve);

        // Update total borrows
        let total = Self::get_total_borrowed(env.clone(), asset.clone()) - amount - dust_delta;
        env.storage()
            .persistent()
            .set(&DataKey::TotalBorrowed(asset.clone()), &total);

        RepayEvent {
            user,
            asset: asset.clone(),
            amount,
        }
        .publish(&env);
        Self::publish_asset_reserve_updated(&env, &asset, &reserve, ReserveUpdateKind::Repay);
    }

    pub fn withdraw(
        env: Env,
        user: Address,
        withdrawn_asset: Address,
        debt_asset: Address,
        amount: i128,
    ) {
        // Withdraw is allowed even when paused (users can always remove collateral)
        Self::require_supported_asset(&env, &withdrawn_asset);
        Self::require_supported_asset(&env, &debt_asset);
        Self::require_positive_amount(&env, amount);
        user.require_auth();

        let interest_state = Self::accrue_and_persist_interest(&env, &withdrawn_asset);

        let mut position = interest::compute_accrued_position(
            &Self::read_position(&env, &user, &withdrawn_asset),
            &interest_state,
        );
        let mut reserve = Self::read_asset_reserve(&env, &withdrawn_asset);
        if amount > position.deposited {
            panic_with_error!(&env, VeilLendError::InsufficientDeposit);
        }
        if amount > reserve.total_balance {
            panic_with_error!(&env, VeilLendError::InsufficientReserve);
        }

        position.deposited -= amount;
        reserve.total_balance -= amount;
        Self::assert_collateralized(
            &env,
            &withdrawn_asset,
            &debt_asset,
            &user,
            CollateralAction::Withdraw { amount },
        );
        Self::write_position(&env, &user, &withdrawn_asset, &position);
        Self::write_asset_reserve(&env, &withdrawn_asset, &reserve);

        // Update total deposits
        let total = Self::get_total_deposited(env.clone(), withdrawn_asset.clone()) - amount;
        env.storage()
            .persistent()
            .set(&DataKey::TotalDeposited(withdrawn_asset.clone()), &total);

        WithdrawEvent {
            user,
            asset: withdrawn_asset.clone(),
            amount,
        }
        .publish(&env);
        Self::publish_asset_reserve_updated(
            &env,
            &withdrawn_asset,
            &reserve,
            ReserveUpdateKind::Withdraw,
        );
    }

    /// Returns a user's position with any interest accrued since their last
    /// interaction simulated in, without persisting anything. The official
    /// on-chain indexes only advance when a mutating entrypoint (deposit,
    /// borrow, repay, withdraw, or accrue_interest) is called.
    pub fn get_position(env: Env, user: Address, asset: Address) -> Position {
        let state = Self::simulate_accrued_interest_state(&env, &asset);
        interest::compute_accrued_position(&Self::read_position(&env, &user, &asset), &state)
    }

    pub fn get_asset_reserve(env: Env, asset: Address) -> AssetReserve {
        Self::require_supported_asset(&env, &asset);
        Self::read_asset_reserve(&env, &asset)
    }

    /// Returns this asset's time-based interest accrual state (indexes and
    /// last-accrual timestamp) with interest simulated up to the current
    /// ledger time, without persisting anything.
    pub fn get_interest_state(env: Env, asset: Address) -> InterestState {
        Self::simulate_accrued_interest_state(&env, &asset)
    }

    /// Forces a reserve-level interest accrual and persists it, without
    /// touching any individual position. Callable by anyone — accrual is a
    /// pure function of elapsed time and current state, not a privileged
    /// action.
    pub fn accrue_interest(env: Env, asset: Address) {
        Self::require_supported_asset(&env, &asset);
        Self::accrue_and_persist_interest(&env, &asset);

        let reserve = Self::read_asset_reserve(&env, &asset);
        Self::publish_asset_reserve_updated(
            &env,
            &asset,
            &reserve,
            ReserveUpdateKind::InterestAccrual,
        );
    }

    pub fn is_asset_supported(env: Env, asset: Address) -> bool {
        env.storage()
            .persistent()
            .get(&DataKey::SupportedAsset(asset))
            .unwrap_or(false)
    }

    /// Proposes recording a protocol fee for an asset (timelocked). Returns
    /// the action id.
    pub fn propose_record_protocol_fee(
        env: Env,
        admin: Address,
        asset: Address,
        amount: i128,
    ) -> u64 {
        Self::require_admin(&env, &admin);
        admin.require_auth();

        Self::propose_action(
            &env,
            &admin,
            ActionKind::RecordProtocolFee,
            ActionPayload::RecordProtocolFee(asset, amount),
        )
    }

    /// Executes a previously proposed record_protocol_fee action.
    pub fn execute_record_protocol_fee(env: Env, admin: Address, action_id: u64) {
        Self::require_admin(&env, &admin);
        admin.require_auth();

        Self::execute_action(&env, &admin, action_id, ActionKind::RecordProtocolFee);
    }

    /// Cancels a pending record_protocol_fee action.
    pub fn cancel_record_protocol_fee(env: Env, admin: Address, action_id: u64) {
        admin.require_auth();

        Self::cancel_action(&env, &admin, action_id, ActionKind::RecordProtocolFee);
    }

    /// Sets the maximum protocol fee that may be recorded in a single
    /// `record_protocol_fee` call, expressed as basis points of the asset's
    /// net reserve (total_balance − protocol_fees).
    ///
    /// - `bps = 0` (the default if this function is never called) **disables**
    ///   the bound entirely, preserving backward-compatible behaviour for any
    ///   deployment that has not opted in to fee caps.
    /// - Maximum settable value is 5000 (50 %).  Values above 5000 are rejected
    ///   with `InvalidCap` (reusing the existing cap-validation error rather than
    ///   introducing a new code for a closely related concept).
    ///
    /// This is an immediate (non-timelocked) admin-only setter, matching the
    /// same pattern as `set_timelock_ledgers`.
    pub fn set_max_protocol_fee_bps(env: Env, admin: Address, bps: u32) {
        Self::require_admin(&env, &admin);
        admin.require_auth();

        // 5000 bps = 50%; anything higher is treated as misconfiguration.
        // InvalidCap is reused here (rather than a new error code) because this
        // is semantically identical to setting an invalid asset cap: both are
        // admin-supplied bounds that fall outside the allowed range.
        const MAX_FEE_BPS: u32 = 5_000;
        if bps > MAX_FEE_BPS {
            panic_with_error!(&env, VeilLendError::InvalidCap);
        }

        env.storage()
            .instance()
            .set(&DataKey::MaxProtocolFeeBps, &bps);
    }

    pub fn min_collateral_ratio_bps(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::MinCollateralRatioBps)
            .unwrap_or(15_000)
    }
}

/// Describes the pending mutation being validated against the cross-asset
/// collateral ratio. `assert_collateralized` reads both positions from
/// storage and applies this delta before computing the ratio.
enum CollateralAction {
    /// A borrow of `amount` is about to increase the debt position.
    Borrow { amount: i128 },
    /// A withdraw of `amount` is about to decrease the collateral position.
    Withdraw { amount: i128 },
}

impl VeilLendContract {
    fn read_admin_set(env: &Env) -> Vec<Address> {
        env.storage()
            .instance()
            .get(&DataKey::AdminSet)
            .unwrap_or_else(|| Vec::new(env))
    }

    fn write_admin_set(env: &Env, admins: &Vec<Address>) {
        env.storage().instance().set(&DataKey::AdminSet, admins);
    }

    /// Panics with `Unauthorized` if `caller` is not in the admin set.
    fn require_admin(env: &Env, caller: &Address) {
        if !Self::read_admin_set(env).contains(caller) {
            panic_with_error!(env, VeilLendError::Unauthorized);
        }
    }

    fn timelock_ledgers(env: &Env) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::TimelockLedgers)
            .unwrap_or(DEFAULT_TIMELOCK_LEDGERS)
    }

    /// Allocates and returns the next action id (a monotonic counter).
    fn next_action_id(env: &Env) -> u64 {
        let id: u64 = env
            .storage()
            .instance()
            .get(&DataKey::NextActionId)
            .unwrap_or(0);
        env.storage()
            .instance()
            .set(&DataKey::NextActionId, &(id + 1));
        id
    }

    fn read_pending_action(env: &Env, action_id: u64) -> PendingAction {
        env.storage()
            .instance()
            .get(&DataKey::PendingAction(action_id))
            .unwrap_or_else(|| panic_with_error!(env, VeilLendError::UnknownAction))
    }

    /// Validates a proposed payload's parameters, failing fast at propose time
    /// (and re-checked at execute time in case state changed in between).
    fn validate_payload(env: &Env, payload: &ActionPayload) {
        match payload {
            ActionPayload::ConfigureAsset(_, _) => {}
            ActionPayload::SetOraclePrice(_, price) => {
                if *price <= 0 {
                    panic_with_error!(env, VeilLendError::InvalidAmount);
                }
            }
            ActionPayload::UpdateAssetCaps(asset, deposit_cap, borrow_cap) => {
                if *deposit_cap != -1 && *deposit_cap <= 0 {
                    panic_with_error!(env, VeilLendError::InvalidCap);
                }
                if *borrow_cap != -1 && *borrow_cap <= 0 {
                    panic_with_error!(env, VeilLendError::InvalidCap);
                }
                Self::require_supported_asset(env, asset);
            }
            ActionPayload::SetMinCollateralRatio(bps) => {
                if *bps < 10_000 {
                    panic_with_error!(env, VeilLendError::InvalidCollateralRatio);
                }
            }
            ActionPayload::SetPaused(_) => {}
            ActionPayload::RecordProtocolFee(asset, amount) => {
                Self::require_supported_asset(env, asset);
                Self::require_positive_amount(env, *amount);
            }
        }
    }

    /// Stores a validated pending action and returns its id.
    fn propose_action(env: &Env, admin: &Address, kind: ActionKind, payload: ActionPayload) -> u64 {
        Self::validate_payload(env, &payload);

        let action_id = Self::next_action_id(env);
        let executable_at_ledger = env
            .ledger()
            .sequence()
            .saturating_add(Self::timelock_ledgers(env));

        let pending = PendingAction {
            kind: kind.clone(),
            payload,
            executable_at_ledger,
            proposer: admin.clone(),
        };
        env.storage()
            .instance()
            .set(&DataKey::PendingAction(action_id), &pending);

        ActionProposed {
            proposer: admin.clone(),
            action_id,
            kind,
            executable_at_ledger,
        }
        .publish(env);

        action_id
    }

    /// Applies a pending action whose kind matches `expected_kind`, after
    /// verifying the timelock window has elapsed. Removes the action on success.
    fn execute_action(env: &Env, admin: &Address, action_id: u64, expected_kind: ActionKind) {
        let pending = Self::read_pending_action(env, action_id);
        if pending.kind != expected_kind {
            panic_with_error!(env, VeilLendError::UnknownAction);
        }
        if env.ledger().sequence() < pending.executable_at_ledger {
            panic_with_error!(env, VeilLendError::TimelockNotReady);
        }

        let PendingAction {
            kind,
            payload,
            proposer,
            ..
        } = pending;

        Self::apply_action(env, &proposer, &payload);
        env.storage()
            .instance()
            .remove(&DataKey::PendingAction(action_id));

        ActionExecuted {
            executor: admin.clone(),
            action_id,
            kind,
        }
        .publish(env);
    }

    /// Cancels a pending action whose kind matches `expected_kind`. Callable
    /// by the original proposer or any current admin.
    fn cancel_action(env: &Env, admin: &Address, action_id: u64, expected_kind: ActionKind) {
        let pending = Self::read_pending_action(env, action_id);
        if pending.kind != expected_kind {
            panic_with_error!(env, VeilLendError::UnknownAction);
        }

        let is_admin = Self::read_admin_set(env).contains(admin);
        if !is_admin && &pending.proposer != admin {
            panic_with_error!(env, VeilLendError::Unauthorized);
        }

        env.storage()
            .instance()
            .remove(&DataKey::PendingAction(action_id));

        ActionCancelled {
            canceller: admin.clone(),
            action_id,
            kind: pending.kind,
        }
        .publish(env);
    }

    /// Validates and applies a pending action's payload.
    fn apply_action(env: &Env, admin: &Address, payload: &ActionPayload) {
        Self::validate_payload(env, payload);

        match payload {
            ActionPayload::ConfigureAsset(asset, supported) => {
                Self::apply_configure_asset(env, admin, asset, *supported)
            }
            ActionPayload::SetOraclePrice(asset, price) => {
                Self::apply_set_oracle_price(env, asset, *price)
            }
            ActionPayload::UpdateAssetCaps(asset, deposit_cap, borrow_cap) => {
                Self::apply_update_asset_caps(env, admin, asset, *deposit_cap, *borrow_cap)
            }
            ActionPayload::SetMinCollateralRatio(bps) => {
                Self::apply_set_min_collateral_ratio(env, *bps)
            }
            ActionPayload::SetPaused(paused) => Self::apply_set_paused(env, admin, *paused),
            ActionPayload::RecordProtocolFee(asset, amount) => {
                Self::apply_record_protocol_fee(env, asset, *amount)
            }
        }
    }

    fn apply_configure_asset(env: &Env, admin: &Address, asset: &Address, supported: bool) {
        // Guard: refuse to disable an asset that still has active user balances.
        // If we allowed this, every lending entrypoint would call
        // require_supported_asset and immediately panic, permanently trapping
        // any funds deposited or borrowed against this asset.
        if !supported {
            let total_deposited = Self::get_total_deposited(env.clone(), asset.clone());
            let total_borrowed = Self::get_total_borrowed(env.clone(), asset.clone());
            if total_deposited != 0 || total_borrowed != 0 {
                panic_with_error!(env, VeilLendError::AssetHasActivePositions);
            }
        }

        env.storage()
            .persistent()
            .set(&DataKey::SupportedAsset(asset.clone()), &supported);

        // Initialize caps to unlimited (-1) when adding new asset, preserving existing caps
        if supported {
            if !env
                .storage()
                .persistent()
                .has(&DataKey::DepositCap(asset.clone()))
            {
                env.storage()
                    .persistent()
                    .set(&DataKey::DepositCap(asset.clone()), &-1i128);
            }
            if !env
                .storage()
                .persistent()
                .has(&DataKey::BorrowCap(asset.clone()))
            {
                env.storage()
                    .persistent()
                    .set(&DataKey::BorrowCap(asset.clone()), &-1i128);
            }

            // Initialize totals to 0, preserving existing totals
            if !env
                .storage()
                .persistent()
                .has(&DataKey::TotalDeposited(asset.clone()))
            {
                env.storage()
                    .persistent()
                    .set(&DataKey::TotalDeposited(asset.clone()), &0i128);
            }
            if !env
                .storage()
                .persistent()
                .has(&DataKey::TotalBorrowed(asset.clone()))
            {
                env.storage()
                    .persistent()
                    .set(&DataKey::TotalBorrowed(asset.clone()), &0i128);
            }
        }

        AssetConfigured {
            admin: admin.clone(),
            asset: asset.clone(),
            supported,
        }
        .publish(env);

        if supported {
            let reserve = Self::read_asset_reserve(env, asset);
            Self::write_asset_reserve(env, asset, &reserve);
            Self::publish_asset_reserve_updated(
                env,
                asset,
                &reserve,
                ReserveUpdateKind::ConfigureAsset,
            );
        }
    }

    fn apply_set_oracle_price(env: &Env, asset: &Address, price: i128) {
        if price < 0 {
            panic_with_error!(env, VeilLendError::InvalidAmount);
        }

        // Get current price for volatility checking
        let current_price_opt = env
            .storage()
            .persistent()
            .get::<DataKey, i128>(&DataKey::OraclePrice(asset.clone()));

        // Check max change if configured (before bounds, check against current price)
        if let Some(max_change_bps) = env
            .storage()
            .persistent()
            .get::<DataKey, u32>(&DataKey::OracleMaxChangeBps(asset.clone()))
        {
            if max_change_bps > 0 {
                if let Some(current_price) = current_price_opt {
                    if current_price > 0 {
                        let change = if price > current_price {
                            price - current_price
                        } else {
                            current_price - price
                        };
                        let change_bps = (change * 10_000) / current_price;
                        if change_bps > max_change_bps as i128 {
                            panic_with_error!(env, VeilLendError::OraclePriceChangeExceedsLimit);
                        }
                    }
                }
            }
        }

        // Check absolute price bounds if configured (after volatility check)
        if let Some(min_price) = env
            .storage()
            .persistent()
            .get::<DataKey, i128>(&DataKey::OracleMinPrice(asset.clone()))
        {
            if price < min_price {
                panic_with_error!(env, VeilLendError::OraclePriceBelowMin);
            }
        }

        if let Some(max_price) = env
            .storage()
            .persistent()
            .get::<DataKey, i128>(&DataKey::OracleMaxPrice(asset.clone()))
        {
            if price > max_price {
                panic_with_error!(env, VeilLendError::OraclePriceAboveMax);
            }
        }

        // Store previous price for audit trail
        if let Some(current_price) = current_price_opt {
            env.storage()
                .persistent()
                .set(&DataKey::OraclePrevPrice(asset.clone()), &current_price);
        }

        // Set the new price
        env.storage()
            .persistent()
            .set(&DataKey::OraclePrice(asset.clone()), &price);

        // Update timestamp
        let now = env.ledger().timestamp();
        env.storage()
            .persistent()
            .set(&DataKey::OracleLastUpdated(asset.clone()), &now);
    }

    fn apply_update_asset_caps(
        env: &Env,
        admin: &Address,
        asset: &Address,
        deposit_cap: i128,
        borrow_cap: i128,
    ) {
        // Guard: refuse to set a cap below the current outstanding total.
        // Setting deposit_cap < total_deposited (or borrow_cap < total_borrowed)
        // creates an immediately-violated invariant: the protocol would report
        // that users have more outstanding than the cap allows, and could block
        // repayments or withdrawals indirectly.  -1 is the "unlimited" sentinel
        // and is always allowed regardless of outstanding totals.
        if deposit_cap != -1 {
            let total_deposited = Self::get_total_deposited(env.clone(), asset.clone());
            if deposit_cap < total_deposited {
                panic_with_error!(env, VeilLendError::CapBelowOutstanding);
            }
        }
        if borrow_cap != -1 {
            let total_borrowed = Self::get_total_borrowed(env.clone(), asset.clone());
            if borrow_cap < total_borrowed {
                panic_with_error!(env, VeilLendError::CapBelowOutstanding);
            }
        }

        env.storage()
            .persistent()
            .set(&DataKey::DepositCap(asset.clone()), &deposit_cap);
        env.storage()
            .persistent()
            .set(&DataKey::BorrowCap(asset.clone()), &borrow_cap);

        CapsUpdated {
            admin: admin.clone(),
            asset: asset.clone(),
            deposit_cap,
            borrow_cap,
        }
        .publish(env);
    }

    fn apply_set_min_collateral_ratio(env: &Env, min_collateral_ratio_bps: u32) {
        env.storage()
            .instance()
            .set(&DataKey::MinCollateralRatioBps, &min_collateral_ratio_bps);
    }

    fn apply_set_paused(env: &Env, admin: &Address, paused: bool) {
        env.storage().persistent().set(&DataKey::Paused, &paused);

        CircuitBreakerEvent {
            admin: admin.clone(),
            paused,
        }
        .publish(env);
    }

    fn apply_record_protocol_fee(env: &Env, asset: &Address, amount: i128) {
        // Keep the interest clock fresh even on admin-only fee recording.
        Self::accrue_and_persist_interest(env, asset);

        let mut reserve = Self::read_asset_reserve(env, asset);

        // Guard: if the admin has configured a max_protocol_fee_bps cap, enforce
        // it.  A value of 0 (the default) means the bound is disabled, preserving
        // backward-compatible behaviour for deployments that never call
        // set_max_protocol_fee_bps.  Without this guard an admin could record
        // arbitrarily large "fees" that drain the net reserve and effectively
        // steal deposited user funds.
        let max_bps: u32 = env
            .storage()
            .instance()
            .get(&DataKey::MaxProtocolFeeBps)
            .unwrap_or(0);
        if max_bps != 0 {
            let net_reserve = reserve.total_balance - reserve.protocol_fees;
            let max_allowed = net_reserve * max_bps as i128 / 10_000;
            if amount > max_allowed {
                panic_with_error!(env, VeilLendError::ProtocolFeeExceedsLimit);
            }
        }

        reserve.total_balance += amount;
        reserve.protocol_fees += amount;
        Self::write_asset_reserve(env, asset, &reserve);
        Self::publish_asset_reserve_updated(env, asset, &reserve, ReserveUpdateKind::FeeAccrual);
    }

    fn read_asset_reserve(env: &Env, asset: &Address) -> AssetReserve {
        env.storage()
            .persistent()
            .get(&DataKey::AssetReserve(asset.clone()))
            .unwrap_or(AssetReserve {
                total_balance: 0,
                protocol_fees: 0,
            })
    }

    fn write_asset_reserve(env: &Env, asset: &Address, reserve: &AssetReserve) {
        env.storage()
            .persistent()
            .set(&DataKey::AssetReserve(asset.clone()), reserve);
    }

    fn publish_asset_reserve_updated(
        env: &Env,
        asset: &Address,
        reserve: &AssetReserve,
        kind: ReserveUpdateKind,
    ) {
        AssetReserveUpdated {
            asset: asset.clone(),
            total_balance: reserve.total_balance,
            protocol_fees: reserve.protocol_fees,
            kind,
        }
        .publish(env);
    }

    fn read_position(env: &Env, user: &Address, asset: &Address) -> Position {
        env.storage()
            .persistent()
            .get(&DataKey::Position(user.clone(), asset.clone()))
            .unwrap_or(Position {
                deposited: 0,
                borrowed: 0,
                supply_index_snapshot: interest::RATE_SCALE,
                borrow_index_snapshot: interest::RATE_SCALE,
            })
    }

    fn read_interest_state(env: &Env, asset: &Address) -> InterestState {
        env.storage()
            .persistent()
            .get(&DataKey::InterestState(asset.clone()))
            .unwrap_or(InterestState {
                supply_index: interest::RATE_SCALE,
                borrow_index: interest::RATE_SCALE,
                last_accrual_timestamp: env.ledger().timestamp(),
            })
    }

    fn write_interest_state(env: &Env, asset: &Address, state: &InterestState) {
        env.storage()
            .persistent()
            .set(&DataKey::InterestState(asset.clone()), state);
    }

    /// Accrues time-based interest for `asset`'s reserve, persisting the
    /// updated interest indexes and applying accrued interest to the
    /// aggregate `TotalDeposited`/`TotalBorrowed` totals. Does not touch any
    /// individual position — callers that need a specific position's
    /// balances to reflect accrual must additionally realize that position
    /// via `interest::compute_accrued_position` against the returned state.
    ///
    /// Must be called before any cap check or balance mutation in every
    /// entrypoint that reads/writes reserve state, so caps are enforced
    /// against up-to-date totals and totals never drift from reality.
    fn accrue_and_persist_interest(env: &Env, asset: &Address) -> InterestState {
        let state = Self::read_interest_state(env, asset);
        let total_supplied = Self::get_total_deposited(env.clone(), asset.clone());
        let total_borrowed = Self::get_total_borrowed(env.clone(), asset.clone());
        let now = env.ledger().timestamp();

        let result = interest::compute_accrual(&state, total_supplied, total_borrowed, now);

        Self::write_interest_state(env, asset, &result.state);
        if result.interest_to_suppliers != 0 {
            env.storage().persistent().set(
                &DataKey::TotalDeposited(asset.clone()),
                &(total_supplied + result.interest_to_suppliers),
            );

            // Interest owed to suppliers is a new claim on the reserve, so the
            // reserve's tracked balance must grow to back it. Borrow-side
            // interest (below) is debt growth, not new reserve tokens, so it
            // must NOT be added to total_balance.
            let mut reserve = Self::read_asset_reserve(env, asset);
            reserve.total_balance += result.interest_to_suppliers;
            Self::write_asset_reserve(env, asset, &reserve);
        }
        if result.interest_to_borrowers != 0 {
            env.storage().persistent().set(
                &DataKey::TotalBorrowed(asset.clone()),
                &(total_borrowed + result.interest_to_borrowers),
            );
        }

        result.state
    }

    /// Like `accrue_and_persist_interest`, but purely computed — does not
    /// write anything to storage. Used by read-only view functions so
    /// callers always see live, accurate current state between transactions.
    fn simulate_accrued_interest_state(env: &Env, asset: &Address) -> InterestState {
        let state = Self::read_interest_state(env, asset);
        let total_supplied = Self::get_total_deposited(env.clone(), asset.clone());
        let total_borrowed = Self::get_total_borrowed(env.clone(), asset.clone());
        let now = env.ledger().timestamp();

        interest::compute_accrual(&state, total_supplied, total_borrowed, now).state
    }

    fn write_position(env: &Env, user: &Address, asset: &Address, position: &Position) {
        if position.deposited == 0 && position.borrowed == 0 {
            env.storage()
                .persistent()
                .remove(&DataKey::Position(user.clone(), asset.clone()));
        } else {
            env.storage()
                .persistent()
                .set(&DataKey::Position(user.clone(), asset.clone()), position);
        }
    }

    fn require_supported_asset(env: &Env, asset: &Address) {
        let is_supported = env
            .storage()
            .persistent()
            .get(&DataKey::SupportedAsset(asset.clone()))
            .unwrap_or(false);

        if !is_supported {
            panic_with_error!(env, VeilLendError::UnsupportedAsset);
        }
    }

    fn require_positive_amount(env: &Env, amount: i128) {
        if amount == 0 {
            panic_with_error!(env, VeilLendError::ZeroAmount);
        }
        if amount < 0 {
            panic_with_error!(env, VeilLendError::InvalidAmount);
        }
    }

    fn require_not_paused(env: &Env) {
        let paused: bool = env
            .storage()
            .persistent()
            .get(&DataKey::Paused)
            .unwrap_or(false);
        if paused {
            panic_with_error!(env, VeilLendError::ContractPaused);
        }
    }

    fn check_deposit_cap(env: &Env, asset: &Address, amount: i128) {
        let cap = env
            .storage()
            .persistent()
            .get(&DataKey::DepositCap(asset.clone()))
            .unwrap_or(-1);

        // -1 means unlimited
        if cap == -1 {
            return;
        }

        let current_total = env
            .storage()
            .persistent()
            .get(&DataKey::TotalDeposited(asset.clone()))
            .unwrap_or(0);

        if current_total + amount > cap {
            panic_with_error!(env, VeilLendError::DepositCapExceeded);
        }
    }

    fn check_borrow_cap(env: &Env, asset: &Address, amount: i128) {
        let cap = env
            .storage()
            .persistent()
            .get(&DataKey::BorrowCap(asset.clone()))
            .unwrap_or(-1);

        // -1 means unlimited
        if cap == -1 {
            return;
        }

        let current_total = env
            .storage()
            .persistent()
            .get(&DataKey::TotalBorrowed(asset.clone()))
            .unwrap_or(0);

        if current_total + amount > cap {
            panic_with_error!(env, VeilLendError::BorrowCapExceeded);
        }
    }

    /// Validates a user's post-action cross-asset collateral health.
    ///
    /// `collateral_asset` and `debt_asset` may differ: the collateral value
    /// is `deposited(collateral_asset) × price(collateral_asset)` and the
    /// debt value is `borrowed(debt_asset) × price(debt_asset)`. The ratio
    /// `collateral_value / debt_value` must be ≥ `min_collateral_ratio_bps`.
    ///
    /// Both positions are read from storage (with interest simulated in) and
    /// then `action_delta` is applied, so the caller may invoke this before
    /// persisting its own mutation.
    fn assert_collateralized(
        env: &Env,
        collateral_asset: &Address,
        debt_asset: &Address,
        user: &Address,
        action_delta: CollateralAction,
    ) {
        let collateral_position = Self::read_accrued_position(env, user, collateral_asset);
        let debt_position = Self::read_accrued_position(env, user, debt_asset);

        let mut collateral_deposited = collateral_position.deposited;
        let mut debt_borrowed = debt_position.borrowed;

        match action_delta {
            CollateralAction::Borrow { amount } => debt_borrowed += amount,
            CollateralAction::Withdraw { amount } => collateral_deposited -= amount,
        }

        if debt_borrowed == 0 {
            return;
        }

        let collateral_ratio_bps = Self::min_collateral_ratio_bps(env.clone()) as i128;

        // Fetch the oracle price for BOTH assets independently; a missing or
        // stale price on either side is a hard failure.
        let collateral_price = Self::read_oracle_price(env, collateral_asset);
        let debt_price = Self::read_oracle_price(env, debt_asset);

        let collateral_value = collateral_deposited * collateral_price;
        let borrowed_value = debt_borrowed * debt_price;

        if collateral_value * 10_000 < borrowed_value * collateral_ratio_bps {
            panic_with_error!(env, VeilLendError::InsufficientCollateral);
        }
    }

    /// Reads a position with interest accrued up to the current ledger time
    /// simulated in, without persisting anything.
    fn read_accrued_position(env: &Env, user: &Address, asset: &Address) -> Position {
        let state = Self::simulate_accrued_interest_state(env, asset);
        interest::compute_accrued_position(&Self::read_position(env, user, asset), &state)
    }

    /// Returns an asset's oracle price, panicking with `OraclePriceMissing`
    /// if unset and `OraclePriceStale` if it has exceeded `MaxOracleAge`.
    fn read_oracle_price(env: &Env, asset: &Address) -> i128 {
        // Get oracle price for the asset — fail explicitly if not set
        let price: i128 = env
            .storage()
            .persistent()
            .get(&DataKey::OraclePrice(asset.clone()))
            .unwrap_or_else(|| panic_with_error!(env, VeilLendError::OraclePriceMissing));

        // Check price staleness
        if let Some(last_updated) = env
            .storage()
            .persistent()
            .get::<DataKey, u64>(&DataKey::OracleLastUpdated(asset.clone()))
        {
            let now = env.ledger().timestamp();
            let max_age = env
                .storage()
                .instance()
                .get(&DataKey::MaxOracleAge)
                .unwrap_or(86400u64);

            if now.saturating_sub(last_updated) > max_age {
                panic_with_error!(env, VeilLendError::OraclePriceStale);
            }
        }

        price
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_position_creation() {
        let position = Position {
            deposited: 1000,
            borrowed: 500,
            supply_index_snapshot: interest::RATE_SCALE,
            borrow_index_snapshot: interest::RATE_SCALE,
        };
        assert_eq!(position.deposited, 1000);
        assert_eq!(position.borrowed, 500);
    }

    #[test]
    fn test_asset_reserve_creation() {
        let reserve = AssetReserve {
            total_balance: 1000,
            protocol_fees: 25,
        };
        assert_eq!(reserve.total_balance, 1000);
        assert_eq!(reserve.protocol_fees, 25);
    }

    #[test]
    fn test_error_codes() {
        assert_eq!(VeilLendError::AlreadyInitialized as u32, 1);
        assert_eq!(VeilLendError::Unauthorized as u32, 2);
        assert_eq!(VeilLendError::UnsupportedAsset as u32, 3);
        assert_eq!(VeilLendError::InvalidAmount as u32, 4);
        assert_eq!(VeilLendError::InsufficientCollateral as u32, 5);
        assert_eq!(VeilLendError::InsufficientDeposit as u32, 6);
        assert_eq!(VeilLendError::RepayTooLarge as u32, 7);
        assert_eq!(VeilLendError::InvalidCollateralRatio as u32, 8);
        assert_eq!(VeilLendError::NotInitialized as u32, 9);
        assert_eq!(VeilLendError::ZeroAmount as u32, 10);
        assert_eq!(VeilLendError::OraclePriceMissing as u32, 11);
        assert_eq!(VeilLendError::ContractPaused as u32, 12);
        assert_eq!(VeilLendError::DepositCapExceeded as u32, 13);
        assert_eq!(VeilLendError::BorrowCapExceeded as u32, 14);
        assert_eq!(VeilLendError::InvalidCap as u32, 15);
        assert_eq!(VeilLendError::CircuitBreakerTriggered as u32, 16);
        assert_eq!(VeilLendError::InsufficientReserve as u32, 17);
        assert_eq!(VeilLendError::TimelockNotReady as u32, 18);
        assert_eq!(VeilLendError::UnknownAction as u32, 19);
        assert_eq!(VeilLendError::LastAdminRequired as u32, 20);
        assert_eq!(VeilLendError::InvalidTimelock as u32, 21);
        assert_eq!(VeilLendError::TimelockRequired as u32, 22);
        assert_eq!(VeilLendError::OraclePriceStale as u32, 23);
        assert_eq!(VeilLendError::OraclePriceChangeExceedsLimit as u32, 24);
        assert_eq!(VeilLendError::OraclePriceBelowMin as u32, 25);
        assert_eq!(VeilLendError::OraclePriceAboveMax as u32, 26);
        assert_eq!(VeilLendError::AssetHasActivePositions as u32, 27);
        assert_eq!(VeilLendError::CapBelowOutstanding as u32, 28);
        assert_eq!(VeilLendError::ProtocolFeeExceedsLimit as u32, 29);
    }

    #[test]
    fn test_contract_metadata_identifies_current_storage_shape() {
        let metadata = VeilLendContract::contract_metadata(Env::default());

        assert_eq!(metadata.contract_version, 4);
        assert_eq!(metadata.storage_schema_version, 3);
        assert_eq!(metadata.storage_schema_id, symbol_short!("VLENDV3"));
    }

    #[test]
    fn test_error_variants_are_unique() {
        // Ensure no two variants share the same code
        let codes = [
            VeilLendError::AlreadyInitialized as u32,
            VeilLendError::Unauthorized as u32,
            VeilLendError::UnsupportedAsset as u32,
            VeilLendError::InvalidAmount as u32,
            VeilLendError::InsufficientCollateral as u32,
            VeilLendError::InsufficientDeposit as u32,
            VeilLendError::RepayTooLarge as u32,
            VeilLendError::InvalidCollateralRatio as u32,
            VeilLendError::NotInitialized as u32,
            VeilLendError::ZeroAmount as u32,
            VeilLendError::OraclePriceMissing as u32,
            VeilLendError::ContractPaused as u32,
            VeilLendError::DepositCapExceeded as u32,
            VeilLendError::BorrowCapExceeded as u32,
            VeilLendError::InvalidCap as u32,
            VeilLendError::CircuitBreakerTriggered as u32,
            VeilLendError::InsufficientReserve as u32,
            VeilLendError::TimelockNotReady as u32,
            VeilLendError::UnknownAction as u32,
            VeilLendError::LastAdminRequired as u32,
            VeilLendError::InvalidTimelock as u32,
            VeilLendError::TimelockRequired as u32,
            VeilLendError::OraclePriceStale as u32,
            VeilLendError::OraclePriceChangeExceedsLimit as u32,
            VeilLendError::OraclePriceBelowMin as u32,
            VeilLendError::OraclePriceAboveMax as u32,
            VeilLendError::AssetHasActivePositions as u32,
            VeilLendError::CapBelowOutstanding as u32,
            VeilLendError::ProtocolFeeExceedsLimit as u32,
        ];
        let mut sorted = codes.to_vec();
        sorted.sort();
        sorted.dedup();
        assert_eq!(sorted.len(), codes.len(), "Duplicate error codes detected");
    }

    #[test]
    fn test_zero_amount_distinct_from_invalid() {
        // Zero and negative amounts should produce different errors
        assert_ne!(
            VeilLendError::ZeroAmount as u32,
            VeilLendError::InvalidAmount as u32,
            "ZeroAmount and InvalidAmount must be distinct error codes"
        );
    }

    #[test]
    fn test_not_initialized_distinct_from_unauthorized() {
        // NotInitialized and Unauthorized serve different purposes
        assert_ne!(
            VeilLendError::NotInitialized as u32,
            VeilLendError::Unauthorized as u32,
            "NotInitialized and Unauthorized must be distinct error codes"
        );
    }
}
