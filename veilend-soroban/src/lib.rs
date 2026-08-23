#![no_std]

mod interest;

// Re-export accrual constants so integration tests and external callers can
// use them without reaching into the private `interest` module.
pub use interest::{DEFAULT_PARAMS as INTEREST_DEFAULT_PARAMS, RATE_SCALE, SECONDS_PER_YEAR};

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, panic_with_error,
    symbol_short, Address, Bytes, Env, Symbol, Vec,
};

mod flash_loan;
mod flash_loan_receiver_example;

mod permit;
mod permit_helpers;

pub use permit::{DomainSeparator, Permit, PermitWithExtra};
pub use permit_helpers::{verify_and_consume_permit, VerifiedPermit};

#[cfg(test)]
mod test_flash_loan;

pub use flash_loan::{
    calculate_premium_rounded_up, FlashLoanReceiverClient, FlashLoanState,
    DEFAULT_FLASH_LOAN_PREMIUM_BPS, MAX_FLASH_LOAN_PREMIUM_BPS, MIN_FLASH_LOAN_PREMIUM_BPS,
};

/// Increment this only when a contract interface change requires consumers to adapt.
pub const CONTRACT_VERSION: u32 = 7;

/// Increment this only when the serialized `DataKey` or stored value layout changes.
pub const STORAGE_SCHEMA_VERSION: u32 = 5;

/// Values <= this amount after repay/withdraw are rounded to zero.
pub const DUST_THRESHOLD: i128 = 100;

/// A compact, stable identifier for the current `DataKey` storage layout.
const STORAGE_SCHEMA_ID: Symbol = symbol_short!("VLENDV5");

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
/// `AssetSupplyCap(Address)`/`AssetBorrowCap(Address): i128` (0 = unlimited),
/// `TotalDeposited(Address)`/`TotalBorrowed(Address): i128`, `Paused: bool`,
/// and `InterestState(Address): InterestState`. Instance storage additionally
/// holds `GlobalCloseFactorBps: u32`.
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
    /// Per-asset aggregate supply (deposit) ceiling, in the asset's native
    /// decimal scale. 0 = unset = unlimited.
    AssetSupplyCap(Address),
    /// Per-asset aggregate borrow ceiling, in the asset's native decimal
    /// scale. 0 = unset = unlimited.
    AssetBorrowCap(Address),
    /// Max fraction (bps) of a position's outstanding debt that may be
    /// seized in a single `liquidate` call. Default 5_000 (50%).
    GlobalCloseFactorBps,

    /// Flash loan reentrancy guard (stored in instance storage)
    ReentrancyGuard,
    /// Flash loan configuration for an asset (stored in persistent storage)
    FlashLoanState(Address),

    /// Per-asset interest-rate model parameters (kink/slope curve),
    /// including `reserve_factor_bps`. Falls back to
    /// `interest::DEFAULT_PARAMS` when not set.
    InterestParams(Address),
    /// Lifetime (monotonically increasing, never decremented) total of
    /// reserve interest ever accrued for an asset — an accounting counter
    /// for indexers, distinct from the current withdrawable balance
    /// (`AssetReserve.protocol_fees`).
    LifetimeReserveEarned(Address),
    /// Monotonically increasing permit nonce per user (persistent storage)
    PermitNonce(Address),
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

/// Per-asset interest-rate model parameters (two-slope / kink model).
///
/// All rate fields are expressed as **annual basis points** (bps).
/// 1 bps = 0.01 % per year.  The contract converts them to per-second rates
/// internally.
///
/// Storage: persistent, keyed by `DataKey::InterestParams(asset)`.
/// Missing entries fall back to `interest::DEFAULT_PARAMS`.
#[derive(Clone, Debug, Eq, PartialEq)]
#[contracttype]
pub struct InterestParams {
    /// Minimum borrow APR when utilization is zero, in annual bps.
    pub base_rate_bps: u32,
    /// Utilization at which the slope transitions from slope1 to slope2,
    /// in bps (e.g. 8_000 = 80 %).
    pub kink_util_bps: u32,
    /// APR slope below the kink, in annual bps per 100 % utilization.
    pub slope1_bps: u32,
    /// APR slope above the kink, in annual bps per 100 % utilization.
    pub slope2_bps: u32,
    /// Fraction of borrow interest redirected to protocol reserves, in bps
    /// (e.g. 1_000 = 10 %).
    pub reserve_factor_bps: u32,
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
    ReservesWithdrawn,
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
    WithdrawReserves,
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
    /// (asset, to, amount)
    WithdrawReserves(Address, Address, i128),
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

// ─── Batch Entrypoints ────────────────────────────────────────────────────────

/// Represents a single operation in a batch.
#[derive(Clone)]
#[contracttype]
pub struct BatchOperation {
    pub asset: Address,
    pub amount: i128,
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
    // 16 is retired (formerly CircuitBreakerTriggered, dead code — pause
    // semantics are fully covered by ContractPaused). Left unassigned
    // rather than reused so no stale off-chain error-code mapping silently
    // starts describing a different failure.
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
    /// Arithmetic overflow or underflow in interest accrual or index computation.
    ArithmeticOverflow = 30,
    /// Aggregate supply (deposit) cap for this asset would be exceeded.
    SupplyCapExceeded = 31,
    /// Position's health factor is at or above 1.0; nothing to liquidate.
    PositionNotLiquidatable = 32,
    /// Flash loan is not configured for this asset
    FlashLoanNotConfigured = 33,
    /// Flash loans are disabled for this asset
    FlashLoanDisabled = 34,
    /// Flash loan amount exceeds configured max bps of reserve
    FlashLoanExceedsMaxBps = 35,
    /// Flash loan receiver did not repay the required amount (principal + premium)
    FlashLoanUnderRepayment = 36,
    /// Flash loan reentrancy detected (nested flash loan on same asset)
    FlashLoanReentrancy = 37,
    /// Invalid flash loan premium (outside allowed range)
    InvalidFlashLoanPremium = 38,
    /// Invalid flash loan max bps (outside allowed range)
    InvalidFlashLoanMaxBps = 39,
    /// Interest-rate model parameters are out of the allowed bounds.
    /// See `set_interest_params` for the exact validation rules.
    InvalidInterestParams = 40,
    /// Permit signature verification failed
    InvalidSignature = 41,
    /// Permit has expired (deadline passed)
    PermitExpired = 42,
    /// Permit nonce does not match the expected value
    PermitNonceMismatch = 43,
    /// Permit chain ID does not match the contract's chain ID
    PermitChainMismatch = 44,
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

#[contractevent(topics = ["veillend", "supply_cap_set"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SupplyCapSet {
    #[topic]
    pub admin: Address,
    #[topic]
    pub asset: Address,
    pub cap: i128,
}

#[contractevent(topics = ["veillend", "borrow_cap_set"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BorrowCapSet {
    #[topic]
    pub admin: Address,
    #[topic]
    pub asset: Address,
    pub cap: i128,
}

#[contractevent(topics = ["veillend", "liquidate"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LiquidateEvent {
    #[topic]
    pub liquidator: Address,
    #[topic]
    pub user: Address,
    pub collateral_asset: Address,
    pub debt_asset: Address,
    pub repaid: i128,
    pub seized: i128,
}

#[contractevent(topics = ["veillend", "liquidation_clipped"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LiquidationClipped {
    #[topic]
    pub liquidator: Address,
    #[topic]
    pub user: Address,
    pub by_bps: u32,
}

#[contractevent(topics = ["veillend", "reserves_accrued"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ReservesAccrued {
    #[topic]
    pub asset: Address,
    pub amount: i128,
    pub new_total_reserve: i128,
}

#[contractevent(topics = ["veillend", "reserves_withdrawn"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ReservesWithdrawn {
    #[topic]
    pub asset: Address,
    #[topic]
    pub to: Address,
    pub amount: i128,
    pub executed_by: Address,
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

#[contractevent(topics = ["veillend", "interest_accrued"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct InterestAccrued {
    #[topic]
    pub asset: Address,
    pub interest_to_suppliers: i128,
    pub interest_to_borrowers: i128,
    pub supply_index_before: i128,
    pub borrow_index_before: i128,
    pub supply_index_after: i128,
    pub borrow_index_after: i128,
    pub timestamp: u64,
}

#[contractevent(topics = ["veillend", "interest_params_updated"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct InterestParamsUpdated {
    #[topic]
    pub admin: Address,
    #[topic]
    pub asset: Address,
    pub base_rate_bps: u32,
    pub kink_util_bps: u32,
    pub slope1_bps: u32,
    pub slope2_bps: u32,
    pub reserve_factor_bps: u32,
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
        Self::require_not_paused(&env);

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
        Self::require_not_paused(&env);

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
        Self::require_not_paused(&env);

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
        Self::require_not_paused(&env);
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
        Self::require_not_paused(&env);
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
        Self::require_not_paused(&env);

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
        Self::require_not_paused(&env);

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
        Self::require_not_paused(&env);

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
        let interest_state = Self::accrue_and_persist_interest(&env, &asset).state;

        // Check deposit cap
        Self::check_deposit_cap(&env, &asset, amount);
        Self::enforce_supply_cap(&env, &asset, amount);

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
        let interest_state = Self::accrue_and_persist_interest(&env, &borrow_asset).state;

        // Check borrow cap
        Self::check_borrow_cap(&env, &borrow_asset, amount);
        Self::enforce_borrow_cap(&env, &borrow_asset, amount);

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

        let interest_state = Self::accrue_and_persist_interest(&env, &asset).state;

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

        let interest_state = Self::accrue_and_persist_interest(&env, &withdrawn_asset).state;

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
        Self::require_not_paused(&env);
        Self::require_supported_asset(&env, &asset);
        let result = Self::accrue_and_persist_interest(&env, &asset);

        // The reserve-update event is only meaningful when interest actually
        // accrued. A same-timestamp (or zero-utilization) call is a pure no-op
        // and must produce no observable events for indexers.
        if result.interest_to_suppliers != 0 || result.interest_to_borrowers != 0 {
            let reserve = Self::read_asset_reserve(&env, &asset);
            Self::publish_asset_reserve_updated(
                &env,
                &asset,
                &reserve,
                ReserveUpdateKind::InterestAccrual,
            );
        }
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
        Self::require_not_paused(&env);

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
        Self::require_not_paused(&env);

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

    /// Returns the current withdrawable protocol reserve balance for
    /// `asset`. No auth required — read-only, for indexers.
    pub fn get_reserves(env: Env, asset: Address) -> i128 {
        Self::read_asset_reserve(&env, &asset).protocol_fees
    }

    /// Returns `(current_reserve_balance, lifetime_reserve_earned)` for
    /// `asset`. No auth required — read-only, for indexers.
    pub fn get_reserves_and_lifetime(env: Env, asset: Address) -> (i128, i128) {
        let current = Self::read_asset_reserve(&env, &asset).protocol_fees;
        let lifetime = Self::read_lifetime_reserve_earned(&env, &asset);
        (current, lifetime)
    }

    /// Proposes withdrawing `amount` of `asset`'s protocol reserve to `to`
    /// (timelocked). Returns the action id. Admin-only.
    ///
    /// Withdrawal is deliberately not directly callable — routing it through
    /// `propose_action`/`execute_action` (the same S11 multi-admin +
    /// timelock mechanism guarding every other critical mutation) means no
    /// single admin key can unilaterally drain accumulated reserves; a
    /// window exists for the rest of the admin set to notice and cancel a
    /// malicious or mistaken proposal before it executes.
    pub fn propose_withdraw_reserves(
        env: Env,
        admin: Address,
        asset: Address,
        to: Address,
        amount: i128,
    ) -> u64 {
        Self::require_admin(&env, &admin);
        admin.require_auth();

        Self::propose_action(
            &env,
            &admin,
            ActionKind::WithdrawReserves,
            ActionPayload::WithdrawReserves(asset, to, amount),
        )
    }

    /// Executes a previously proposed withdraw_reserves action, if its
    /// timelock has elapsed.
    pub fn execute_withdraw_reserves(env: Env, admin: Address, action_id: u64) {
        Self::require_admin(&env, &admin);
        admin.require_auth();
        Self::require_not_paused(&env);

        Self::execute_action(&env, &admin, action_id, ActionKind::WithdrawReserves);
    }

    /// Cancels a pending withdraw_reserves action.
    pub fn cancel_withdraw_reserves(env: Env, admin: Address, action_id: u64) {
        admin.require_auth();

        Self::cancel_action(&env, &admin, action_id, ActionKind::WithdrawReserves);
    }

    pub fn min_collateral_ratio_bps(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::MinCollateralRatioBps)
            .unwrap_or(15_000)
    }

    /// Sets the aggregate supply (deposit) cap for `asset`, in the asset's
    /// native decimal scale. Admin-only, immediate (not timelocked) — mirrors
    /// `set_max_protocol_fee_bps`'s pattern for operational risk parameters
    /// that need fast response. `cap == 0` means unlimited (the default).
    pub fn set_supply_cap(env: Env, admin: Address, asset: Address, cap: i128) {
        Self::require_admin(&env, &admin);
        Self::require_supported_asset(&env, &asset);
        admin.require_auth();
        Self::require_not_paused(&env);

        if cap < 0 {
            panic_with_error!(&env, VeilLendError::InvalidCap);
        }

        env.storage()
            .persistent()
            .set(&DataKey::AssetSupplyCap(asset.clone()), &cap);

        SupplyCapSet { admin, asset, cap }.publish(&env);
    }

    /// Sets the aggregate borrow cap for `asset`, in the asset's native
    /// decimal scale. Mirrors `set_supply_cap`. `cap == 0` means unlimited.
    pub fn set_borrow_cap(env: Env, admin: Address, asset: Address, cap: i128) {
        Self::require_admin(&env, &admin);
        Self::require_supported_asset(&env, &asset);
        admin.require_auth();
        Self::require_not_paused(&env);

        if cap < 0 {
            panic_with_error!(&env, VeilLendError::InvalidCap);
        }

        env.storage()
            .persistent()
            .set(&DataKey::AssetBorrowCap(asset.clone()), &cap);

        BorrowCapSet { admin, asset, cap }.publish(&env);
    }

    /// Returns the aggregate supply cap for `asset` (0 = unlimited).
    pub fn supply_cap(env: Env, asset: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::AssetSupplyCap(asset))
            .unwrap_or(0)
    }

    /// Returns the aggregate borrow cap for `asset` (0 = unlimited).
    pub fn borrow_cap(env: Env, asset: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::AssetBorrowCap(asset))
            .unwrap_or(0)
    }

    /// Sets the global liquidation close factor, in bps of a position's
    /// outstanding debt that may be seized in a single `liquidate` call.
    /// Bounded to `[1_000, 10_000]` (10%-100%). Admin-only, immediate.
    pub fn set_close_factor(env: Env, admin: Address, bps: u32) {
        Self::require_admin(&env, &admin);
        admin.require_auth();
        Self::require_not_paused(&env);

        if !(1_000..=10_000).contains(&bps) {
            panic_with_error!(&env, VeilLendError::InvalidCap);
        }

        env.storage()
            .instance()
            .set(&DataKey::GlobalCloseFactorBps, &bps);
    }

    /// Returns the current global close factor in bps (default 5_000 = 50%).
    pub fn close_factor_bps(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::GlobalCloseFactorBps)
            .unwrap_or(5_000)
    }

    /// Liquidates part (or, in a severe undercollateralization zone, all) of
    /// `user`'s `debt_asset` borrow against their `collateral_asset`
    /// collateral. The caller (`liquidator`) repays `debt_asset` on the
    /// user's behalf and receives an equal-value amount of the user's
    /// `collateral_asset` collateral (no liquidation bonus is modeled yet —
    /// see the reserve-accounting note on `withdraw`/`repay`: this contract
    /// does not move real tokens, only internal accounting).
    ///
    /// The position must currently be undercollateralized (health factor
    /// < 1.0) or the call panics with `PositionNotLiquidatable`. Below a
    /// health factor of 1.0 but at or above 0.95, at most `close_factor_bps`
    /// of the outstanding debt may be repaid in one call — a caller-supplied
    /// `repay_amount` above that ceiling is silently clipped (see
    /// `LiquidationClipped`). Below a health factor of 0.95 (severe
    /// undercollateralization, at risk of bad debt) the close factor is
    /// bypassed and the full outstanding debt may be repaid in one call.
    pub fn liquidate(
        env: Env,
        liquidator: Address,
        user: Address,
        collateral_asset: Address,
        debt_asset: Address,
        repay_amount: i128,
    ) {
        Self::require_supported_asset(&env, &collateral_asset);
        Self::require_supported_asset(&env, &debt_asset);
        Self::require_positive_amount(&env, repay_amount);
        liquidator.require_auth();

        let debt_interest_state = Self::accrue_and_persist_interest(&env, &debt_asset).state;
        let collateral_interest_state =
            Self::accrue_and_persist_interest(&env, &collateral_asset).state;

        let debt_position = interest::compute_accrued_position(
            &Self::read_position(&env, &user, &debt_asset),
            &debt_interest_state,
        );
        let collateral_position = interest::compute_accrued_position(
            &Self::read_position(&env, &user, &collateral_asset),
            &collateral_interest_state,
        );

        if debt_position.borrowed == 0 {
            panic_with_error!(&env, VeilLendError::PositionNotLiquidatable);
        }

        let collateral_ratio_bps = Self::min_collateral_ratio_bps(env.clone()) as i128;
        let collateral_price = Self::read_oracle_price(&env, &collateral_asset);
        let debt_price = Self::read_oracle_price(&env, &debt_asset);

        let collateral_value = collateral_position.deposited * collateral_price;
        let borrowed_value = debt_position.borrowed * debt_price;

        // Only undercollateralized positions (health factor < 1.0) may be
        // liquidated; this mirrors assert_collateralized's healthy condition.
        if collateral_value * 10_000 >= borrowed_value * collateral_ratio_bps {
            panic_with_error!(&env, VeilLendError::PositionNotLiquidatable);
        }

        // health_factor_bps == 10_000 at exactly the min-collateral-ratio
        // threshold; below that the position is undercollateralized.
        let health_factor_bps =
            (collateral_value * 10_000 * 10_000) / (borrowed_value * collateral_ratio_bps);

        const SEVERE_HEALTH_FACTOR_BPS: i128 = 9_500; // 0.95

        let max_repay = if health_factor_bps < SEVERE_HEALTH_FACTOR_BPS {
            debt_position.borrowed
        } else {
            let close_factor_bps = Self::close_factor_bps(env.clone()) as i128;
            (debt_position.borrowed * close_factor_bps) / 10_000
        };

        let mut actual_repay = repay_amount.min(debt_position.borrowed);
        if actual_repay > max_repay {
            let by_bps = (((actual_repay - max_repay) * 10_000) / actual_repay) as u32;
            actual_repay = max_repay;

            LiquidationClipped {
                liquidator: liquidator.clone(),
                user: user.clone(),
                by_bps,
            }
            .publish(&env);
        }

        if actual_repay <= 0 {
            panic_with_error!(&env, VeilLendError::ZeroAmount);
        }

        let seize_amount =
            ((actual_repay * debt_price) / collateral_price).min(collateral_position.deposited);

        let mut new_debt_position = debt_position;
        new_debt_position.borrowed -= actual_repay;
        let mut debt_reserve = Self::read_asset_reserve(&env, &debt_asset);
        debt_reserve.total_balance += actual_repay;
        Self::write_position(&env, &user, &debt_asset, &new_debt_position);
        Self::write_asset_reserve(&env, &debt_asset, &debt_reserve);
        let total_borrowed =
            Self::get_total_borrowed(env.clone(), debt_asset.clone()) - actual_repay;
        env.storage()
            .persistent()
            .set(&DataKey::TotalBorrowed(debt_asset.clone()), &total_borrowed);

        let mut new_collateral_position = collateral_position;
        new_collateral_position.deposited -= seize_amount;
        let mut collateral_reserve = Self::read_asset_reserve(&env, &collateral_asset);
        collateral_reserve.total_balance -= seize_amount;
        Self::write_position(&env, &user, &collateral_asset, &new_collateral_position);
        Self::write_asset_reserve(&env, &collateral_asset, &collateral_reserve);
        let total_deposited =
            Self::get_total_deposited(env.clone(), collateral_asset.clone()) - seize_amount;
        env.storage().persistent().set(
            &DataKey::TotalDeposited(collateral_asset.clone()),
            &total_deposited,
        );

        LiquidateEvent {
            liquidator,
            user,
            collateral_asset: collateral_asset.clone(),
            debt_asset: debt_asset.clone(),
            repaid: actual_repay,
            seized: seize_amount,
        }
        .publish(&env);
        Self::publish_asset_reserve_updated(
            &env,
            &debt_asset,
            &debt_reserve,
            ReserveUpdateKind::Repay,
        );
        Self::publish_asset_reserve_updated(
            &env,
            &collateral_asset,
            &collateral_reserve,
            ReserveUpdateKind::Withdraw,
        );
    }

    /// Sets the interest-rate model parameters for an asset (admin-only).
    ///
    /// Validation bounds (panic with `InvalidInterestParams` on violation):
    /// - `kink_util_bps` ∈ [1_000, 9_500]
    /// - `base_rate_bps + slope1_bps + slope2_bps` ≤ 100_000  (hard yearly ceiling ≤ 1000 % APY)
    /// - `reserve_factor_bps` ∈ [0, 5_000]  (at most 50 % of borrow interest to reserves)
    ///
    /// Accrues interest for the asset first so the rate change takes effect
    /// from the current timestamp, not retroactively.
    pub fn set_interest_params(env: Env, admin: Address, asset: Address, params: InterestParams) {
        Self::require_admin(&env, &admin);
        Self::require_supported_asset(&env, &asset);
        admin.require_auth();
        Self::require_not_paused(&env);

        // Validate kink utilization bound.
        if params.kink_util_bps < 1_000 || params.kink_util_bps > 9_500 {
            panic_with_error!(&env, VeilLendError::InvalidInterestParams);
        }
        // Hard APY ceiling: sum of all rate components ≤ 100_000 bps (1_000 % / year).
        let rate_sum = (params.base_rate_bps as u64)
            .saturating_add(params.slope1_bps as u64)
            .saturating_add(params.slope2_bps as u64);
        if rate_sum > 100_000 {
            panic_with_error!(&env, VeilLendError::InvalidInterestParams);
        }
        // Reserve factor: at most 50 %.
        if params.reserve_factor_bps > 5_000 {
            panic_with_error!(&env, VeilLendError::InvalidInterestParams);
        }

        // Accrue with the old params first so interest up to now is settled.
        Self::accrue_and_persist_interest(&env, &asset);

        env.storage()
            .persistent()
            .set(&DataKey::InterestParams(asset.clone()), &params);

        InterestParamsUpdated {
            admin,
            asset,
            base_rate_bps: params.base_rate_bps,
            kink_util_bps: params.kink_util_bps,
            slope1_bps: params.slope1_bps,
            slope2_bps: params.slope2_bps,
            reserve_factor_bps: params.reserve_factor_bps,
        }
        .publish(&env);
    }

    /// Returns the current interest-rate model parameters for an asset.
    /// Returns `DEFAULT_PARAMS` if none have been set.
    pub fn get_interest_params(env: Env, asset: Address) -> InterestParams {
        env.storage()
            .persistent()
            .get(&DataKey::InterestParams(asset))
            .unwrap_or(interest::DEFAULT_PARAMS)
    }

    /// Deposit multiple assets in a single transaction.
    ///
    /// # Authentication
    /// User authenticates once for the entire batch.
    ///
    /// # Accrual
    /// Each unique asset is accrued exactly once before any mutations.
    ///
    /// # Cap Enforcement
    /// All deposit caps are checked against final aggregated totals.
    ///
    /// # Health Factor
    /// `enforce_health_factor` is called exactly once at the end.
    ///
    /// # Events
    /// Individual deposit events are emitted for each operation.
    /// A `BatchExecuted` summary event is also emitted.
    ///
    /// # Arguments
    /// * `user` - The user performing the deposits
    /// * `operations` - Vector of (asset, amount) tuples to deposit
    ///
    /// # Panics
    /// * If any asset is not supported
    /// * If any amount is <= 0
    /// * If contract is paused
    /// * If any deposit cap would be exceeded
    /// * If final health factor is below minimum
    pub fn deposit_batch(env: Env, user: Address, operations: Vec<BatchOperation>) {
        Self::require_not_paused(&env);
        user.require_auth();

        // Deduplicate assets and accrue interest once per asset
        let unique_assets = Self::deduplicate_assets(&env, &operations);
        Self::accrue_assets_once(&env, &unique_assets);

        // Pre-validate all operations
        for op in operations.iter() {
            Self::require_supported_asset(&env, &op.asset);
            Self::require_positive_amount(&env, op.amount);
        }

        // Check caps against final aggregated totals
        Self::check_batch_deposit_caps(&env, &operations);

        // Execute each deposit
        let mut total_operations = 0u32;
        for op in operations.iter() {
            let asset = &op.asset;
            let amount = op.amount;

            // Get accrued position
            let interest_state = Self::accrue_and_persist_interest(&env, asset).state;
            let mut position = interest::compute_accrued_position(
                &Self::read_position(&env, &user, asset),
                &interest_state,
            );
            let mut reserve = Self::read_asset_reserve(&env, asset);

            position.deposited += amount;
            reserve.total_balance += amount;
            Self::write_position(&env, &user, asset, &position);
            Self::write_asset_reserve(&env, asset, &reserve);

            // Update total deposits
            let total = Self::get_total_deposited(env.clone(), asset.clone()) + amount;
            env.storage()
                .persistent()
                .set(&DataKey::TotalDeposited(asset.clone()), &total);

            // Emit individual event
            DepositEvent {
                user: user.clone(),
                asset: asset.clone(),
                amount,
            }
            .publish(&env);
            Self::publish_asset_reserve_updated(&env, asset, &reserve, ReserveUpdateKind::Deposit);

            total_operations += 1;
        }

        // A deposit only ever increases collateral, so it can never worsen
        // the user's health factor — no post-batch check is needed here.

        // Emit batch summary event
        Self::emit_batch_executed(&env, &user, "deposit_batch", total_operations);
    }

    /// Withdraw multiple assets in a single transaction.
    ///
    /// # Authentication
    /// User authenticates once for the entire batch.
    ///
    /// # Accrual
    /// Each unique asset is accrued exactly once before any mutations.
    ///
    /// # Cap Enforcement
    /// Supply caps are checked against final aggregated totals.
    ///
    /// # Health Factor
    /// `enforce_health_factor` is called exactly once at the end.
    ///
    /// # Arguments
    /// * `user` - The user performing the withdrawals
    /// * `debt_asset` - The asset used for collateral ratio calculation
    /// * `operations` - Vector of (asset, amount) tuples to withdraw
    ///
    /// # Panics
    /// * If any asset is not supported
    /// * If any amount is <= 0
    /// * If contract is paused
    /// * If withdrawal exceeds deposited balance
    /// * If final health factor is below minimum
    pub fn withdraw_batch(
        env: Env,
        user: Address,
        debt_asset: Address,
        operations: Vec<BatchOperation>,
    ) {
        // Withdraw is allowed even when paused (users can always remove collateral)
        Self::require_supported_asset(&env, &debt_asset);
        user.require_auth();

        // Deduplicate assets and accrue interest once per asset
        let unique_assets = Self::deduplicate_assets(&env, &operations);
        // Include debt_asset in accrual
        let mut all_assets = unique_assets;
        if !all_assets.contains(&debt_asset) {
            all_assets.push_back(debt_asset.clone());
        }
        Self::accrue_assets_once(&env, &all_assets);

        // Pre-validate all operations
        for op in operations.iter() {
            Self::require_supported_asset(&env, &op.asset);
            Self::require_positive_amount(&env, op.amount);
        }

        let mut total_operations = 0u32;

        // Execute each withdrawal
        for op in operations.iter() {
            let asset = &op.asset;
            let amount = op.amount;

            let interest_state = Self::accrue_and_persist_interest(&env, asset).state;
            let mut position = interest::compute_accrued_position(
                &Self::read_position(&env, &user, asset),
                &interest_state,
            );
            let mut reserve = Self::read_asset_reserve(&env, asset);

            if amount > position.deposited {
                panic_with_error!(&env, VeilLendError::InsufficientDeposit);
            }
            if amount > reserve.total_balance {
                panic_with_error!(&env, VeilLendError::InsufficientReserve);
            }

            position.deposited -= amount;
            reserve.total_balance -= amount;
            Self::write_position(&env, &user, asset, &position);
            Self::write_asset_reserve(&env, asset, &reserve);

            // Update total deposits
            let total = Self::get_total_deposited(env.clone(), asset.clone()) - amount;
            env.storage()
                .persistent()
                .set(&DataKey::TotalDeposited(asset.clone()), &total);

            // Emit individual event
            WithdrawEvent {
                user: user.clone(),
                asset: asset.clone(),
                amount,
            }
            .publish(&env);
            Self::publish_asset_reserve_updated(&env, asset, &reserve, ReserveUpdateKind::Withdraw);

            total_operations += 1;
        }

        // Single health factor check at the end, against each withdrawn asset
        Self::enforce_batch_health_factor_for_withdraw(&env, &user, &debt_asset, &operations);

        // Emit batch summary event
        Self::emit_batch_executed(&env, &user, "withdraw_batch", total_operations);
    }

    /// Borrow multiple assets in a single transaction.
    ///
    /// # Authentication
    /// User authenticates once for the entire batch.
    ///
    /// # Accrual
    /// Each unique asset is accrued exactly once before any mutations.
    ///
    /// # Cap Enforcement
    /// All borrow caps are checked against final aggregated totals.
    ///
    /// # Health Factor
    /// `enforce_health_factor` is called exactly once at the end.
    ///
    /// # Arguments
    /// * `user` - The user performing the borrows
    /// * `collateral_asset` - The asset used as collateral
    /// * `operations` - Vector of (asset, amount) tuples to borrow
    ///
    /// # Panics
    /// * If any asset is not supported
    /// * If any amount is <= 0
    /// * If contract is paused
    /// * If reserve has insufficient balance
    /// * If final health factor is below minimum
    pub fn borrow_batch(
        env: Env,
        user: Address,
        collateral_asset: Address,
        operations: Vec<BatchOperation>,
    ) {
        Self::require_not_paused(&env);
        Self::require_supported_asset(&env, &collateral_asset);
        user.require_auth();

        // Deduplicate assets and accrue interest once per asset
        let unique_assets = Self::deduplicate_assets(&env, &operations);
        let mut all_assets = unique_assets;
        if !all_assets.contains(&collateral_asset) {
            all_assets.push_back(collateral_asset.clone());
        }
        Self::accrue_assets_once(&env, &all_assets);

        // Pre-validate all operations
        for op in operations.iter() {
            Self::require_supported_asset(&env, &op.asset);
            Self::require_positive_amount(&env, op.amount);
        }

        // Check borrow caps against final aggregated totals
        Self::check_batch_borrow_caps(&env, &operations);

        let mut total_operations = 0u32;

        // Execute each borrow
        for op in operations.iter() {
            let asset = &op.asset;
            let amount = op.amount;

            let interest_state = Self::accrue_and_persist_interest(&env, asset).state;
            let mut position = interest::compute_accrued_position(
                &Self::read_position(&env, &user, asset),
                &interest_state,
            );
            let mut reserve = Self::read_asset_reserve(&env, asset);

            if amount > reserve.total_balance {
                panic_with_error!(&env, VeilLendError::InsufficientReserve);
            }

            position.borrowed += amount;
            reserve.total_balance -= amount;
            Self::write_position(&env, &user, asset, &position);
            Self::write_asset_reserve(&env, asset, &reserve);

            // Update total borrows
            let total = Self::get_total_borrowed(env.clone(), asset.clone()) + amount;
            env.storage()
                .persistent()
                .set(&DataKey::TotalBorrowed(asset.clone()), &total);

            // Emit individual event
            BorrowEvent {
                user: user.clone(),
                asset: asset.clone(),
                amount,
            }
            .publish(&env);
            Self::publish_asset_reserve_updated(&env, asset, &reserve, ReserveUpdateKind::Borrow);

            total_operations += 1;
        }

        // Single health factor check at the end, against each borrowed asset
        Self::enforce_batch_health_factor_for_borrow(&env, &user, &collateral_asset, &operations);

        // Emit batch summary event
        Self::emit_batch_executed(&env, &user, "borrow_batch", total_operations);
    }

    /// Repay multiple assets in a single transaction.
    ///
    /// # Authentication
    /// User authenticates once for the entire batch.
    ///
    /// # Accrual
    /// Each unique asset is accrued exactly once before any mutations.
    ///
    /// # Health Factor
    /// `enforce_health_factor` is called exactly once at the end.
    ///
    /// # Arguments
    /// * `user` - The user performing the repayments
    /// * `operations` - Vector of (asset, amount) tuples to repay
    ///
    /// # Panics
    /// * If any asset is not supported
    /// * If any amount is <= 0
    /// * If repayment exceeds borrowed balance
    pub fn repay_batch(env: Env, user: Address, operations: Vec<BatchOperation>) {
        // Repay is allowed even when paused (users can always reduce debt)
        user.require_auth();

        // Deduplicate assets and accrue interest once per asset
        let unique_assets = Self::deduplicate_assets(&env, &operations);
        Self::accrue_assets_once(&env, &unique_assets);

        // Pre-validate all operations
        for op in operations.iter() {
            Self::require_supported_asset(&env, &op.asset);
            Self::require_positive_amount(&env, op.amount);
        }

        let mut total_operations = 0u32;

        // Execute each repayment
        for op in operations.iter() {
            let asset = &op.asset;
            let amount = op.amount;

            let interest_state = Self::accrue_and_persist_interest(&env, asset).state;
            let mut position = interest::compute_accrued_position(
                &Self::read_position(&env, &user, asset),
                &interest_state,
            );
            let mut reserve = Self::read_asset_reserve(&env, asset);

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

            Self::write_position(&env, &user, asset, &position);
            Self::write_asset_reserve(&env, asset, &reserve);

            // Update total borrows
            let total = Self::get_total_borrowed(env.clone(), asset.clone()) - amount - dust_delta;
            env.storage()
                .persistent()
                .set(&DataKey::TotalBorrowed(asset.clone()), &total);

            // Emit individual event
            RepayEvent {
                user: user.clone(),
                asset: asset.clone(),
                amount,
            }
            .publish(&env);
            Self::publish_asset_reserve_updated(&env, asset, &reserve, ReserveUpdateKind::Repay);

            total_operations += 1;
        }

        // A repayment only ever decreases debt, so it can never worsen the
        // user's health factor — no post-batch check is needed here.

        // Emit batch summary event
        Self::emit_batch_executed(&env, &user, "repay_batch", total_operations);
    }

    // ─── Permit Entrypoints ──────────────────────────────────────────────────────

    /// Returns the domain separator for this contract instance.
    ///
    /// This is used by off-chain signers to construct the permit digest.
    pub fn get_domain_separator(env: Env) -> DomainSeparator {
        // The network id is a 32-byte hash; truncate it to 64 bits. This is only
        // used for domain separation (it is hashed alongside contract_id and
        // version into the permit digest), so it doesn't need the full 256 bits
        // of entropy to serve its purpose.
        let network_id = env.ledger().network_id().to_array();
        let mut chain_id_bytes = [0u8; 8];
        chain_id_bytes.copy_from_slice(&network_id[..8]);

        DomainSeparator {
            contract_id: env.current_contract_address(),
            version: CONTRACT_VERSION,
            chain_id: u64::from_be_bytes(chain_id_bytes),
        }
    }

    /// Gets the current permit nonce for a user.
    pub fn get_permit_nonce(env: Env, user: Address) -> u64 {
        permit::get_current_nonce(&env, &user)
    }

    /// Deposit on behalf of a user using a signed permit.
    ///
    /// # Arguments
    /// * `permit` - The signed permit structure
    /// * `signature` - The ed25519 signature (64 bytes)
    /// * `asset` - The asset to deposit
    /// * `amount` - The amount to deposit
    ///
    /// # Authentication
    /// No direct authentication is required - the permit signature verifies
    /// the user's authorization.
    ///
    /// # Panics
    /// * If the signature is invalid
    /// * If the permit is expired
    /// * If the nonce doesn't match
    /// * If the asset is not supported
    /// * If the amount is invalid
    pub fn deposit_for(env: Env, permit: Permit, signature: Bytes, asset: Address, amount: i128) {
        // Verify and consume the permit
        let domain = Self::get_domain_separator(env.clone());
        let verified =
            permit_helpers::verify_and_consume_permit(&env, &domain, &permit, &signature).unwrap();

        // Ensure the action matches
        if verified.action != Symbol::new(&env, "deposit") {
            panic_with_error!(&env, VeilLendError::InvalidSignature);
        }

        // Ensure the permit's asset matches the call parameter
        if verified.asset != asset {
            panic_with_error!(&env, VeilLendError::UnsupportedAsset);
        }
        if verified.amount != amount {
            panic_with_error!(&env, VeilLendError::InvalidAmount);
        }

        // Execute the deposit using the internal helper
        Self::do_deposit(&env, &verified.user, &asset, amount);
    }

    /// Withdraw on behalf of a user using a signed permit.
    ///
    /// # Arguments
    /// * `permit` - The signed permit structure
    /// * `signature` - The ed25519 signature (64 bytes)
    /// * `withdrawn_asset` - The asset to withdraw
    /// * `debt_asset` - The asset used for collateral ratio calculation
    /// * `amount` - The amount to withdraw
    ///
    /// # Authentication
    /// No direct authentication is required - the permit signature verifies
    /// the user's authorization.
    pub fn withdraw_for(
        env: Env,
        permit: Permit,
        signature: Bytes,
        withdrawn_asset: Address,
        debt_asset: Address,
        amount: i128,
    ) {
        let domain = Self::get_domain_separator(env.clone());
        let verified =
            permit_helpers::verify_and_consume_permit(&env, &domain, &permit, &signature).unwrap();

        if verified.action != Symbol::new(&env, "withdraw") {
            panic_with_error!(&env, VeilLendError::InvalidSignature);
        }
        if verified.asset != withdrawn_asset {
            panic_with_error!(&env, VeilLendError::UnsupportedAsset);
        }
        if verified.amount != amount {
            panic_with_error!(&env, VeilLendError::InvalidAmount);
        }

        Self::do_withdraw(&env, &verified.user, &withdrawn_asset, &debt_asset, amount);
    }

    /// Borrow on behalf of a user using a signed permit.
    ///
    /// # Arguments
    /// * `permit` - The signed permit structure
    /// * `signature` - The ed25519 signature (64 bytes)
    /// * `borrow_asset` - The asset to borrow
    /// * `collateral_asset` - The asset used as collateral
    /// * `amount` - The amount to borrow
    pub fn borrow_for(
        env: Env,
        permit: Permit,
        signature: Bytes,
        borrow_asset: Address,
        collateral_asset: Address,
        amount: i128,
    ) {
        let domain = Self::get_domain_separator(env.clone());
        let verified =
            permit_helpers::verify_and_consume_permit(&env, &domain, &permit, &signature).unwrap();

        if verified.action != Symbol::new(&env, "borrow") {
            panic_with_error!(&env, VeilLendError::InvalidSignature);
        }
        if verified.asset != borrow_asset {
            panic_with_error!(&env, VeilLendError::UnsupportedAsset);
        }
        if verified.amount != amount {
            panic_with_error!(&env, VeilLendError::InvalidAmount);
        }

        Self::do_borrow(
            &env,
            &verified.user,
            &borrow_asset,
            &collateral_asset,
            amount,
        );
    }

    /// Repay on behalf of a user using a signed permit.
    ///
    /// # Arguments
    /// * `permit` - The signed permit structure
    /// * `signature` - The ed25519 signature (64 bytes)
    /// * `asset` - The asset to repay
    /// * `amount` - The amount to repay
    pub fn repay_for(env: Env, permit: Permit, signature: Bytes, asset: Address, amount: i128) {
        let domain = Self::get_domain_separator(env.clone());
        let verified =
            permit_helpers::verify_and_consume_permit(&env, &domain, &permit, &signature).unwrap();

        if verified.action != Symbol::new(&env, "repay") {
            panic_with_error!(&env, VeilLendError::InvalidSignature);
        }
        if verified.asset != asset {
            panic_with_error!(&env, VeilLendError::UnsupportedAsset);
        }
        if verified.amount != amount {
            panic_with_error!(&env, VeilLendError::InvalidAmount);
        }

        Self::do_repay(&env, &verified.user, &asset, amount);
    }

    // ─── Internal Helpers for Permit Entrypoints ──────────────────────────────

    /// Internal deposit helper used by both direct and permit deposit.
    fn do_deposit(env: &Env, user: &Address, asset: &Address, amount: i128) {
        Self::require_not_paused(env);
        Self::require_supported_asset(env, asset);
        Self::require_positive_amount(env, amount);

        let interest_state = Self::accrue_and_persist_interest(env, asset).state;
        Self::check_deposit_cap(env, asset, amount);
        Self::enforce_supply_cap(env, asset, amount);

        let mut position = interest::compute_accrued_position(
            &Self::read_position(env, user, asset),
            &interest_state,
        );
        let mut reserve = Self::read_asset_reserve(env, asset);
        position.deposited += amount;
        reserve.total_balance += amount;
        Self::write_position(env, user, asset, &position);
        Self::write_asset_reserve(env, asset, &reserve);

        let total = Self::get_total_deposited(env.clone(), asset.clone()) + amount;
        env.storage()
            .persistent()
            .set(&DataKey::TotalDeposited(asset.clone()), &total);

        DepositEvent {
            user: user.clone(),
            asset: asset.clone(),
            amount,
        }
        .publish(env);
        Self::publish_asset_reserve_updated(env, asset, &reserve, ReserveUpdateKind::Deposit);
    }

    /// Internal withdraw helper used by both direct and permit withdraw.
    fn do_withdraw(
        env: &Env,
        user: &Address,
        withdrawn_asset: &Address,
        debt_asset: &Address,
        amount: i128,
    ) {
        Self::require_supported_asset(env, withdrawn_asset);
        Self::require_supported_asset(env, debt_asset);
        Self::require_positive_amount(env, amount);

        let interest_state = Self::accrue_and_persist_interest(env, withdrawn_asset).state;

        let mut position = interest::compute_accrued_position(
            &Self::read_position(env, user, withdrawn_asset),
            &interest_state,
        );
        let mut reserve = Self::read_asset_reserve(env, withdrawn_asset);
        if amount > position.deposited {
            panic_with_error!(env, VeilLendError::InsufficientDeposit);
        }
        if amount > reserve.total_balance {
            panic_with_error!(env, VeilLendError::InsufficientReserve);
        }

        position.deposited -= amount;
        reserve.total_balance -= amount;
        Self::assert_collateralized(
            env,
            withdrawn_asset,
            debt_asset,
            user,
            CollateralAction::Withdraw { amount },
        );
        Self::write_position(env, user, withdrawn_asset, &position);
        Self::write_asset_reserve(env, withdrawn_asset, &reserve);

        let total = Self::get_total_deposited(env.clone(), withdrawn_asset.clone()) - amount;
        env.storage()
            .persistent()
            .set(&DataKey::TotalDeposited(withdrawn_asset.clone()), &total);

        WithdrawEvent {
            user: user.clone(),
            asset: withdrawn_asset.clone(),
            amount,
        }
        .publish(env);
        Self::publish_asset_reserve_updated(
            env,
            withdrawn_asset,
            &reserve,
            ReserveUpdateKind::Withdraw,
        );
    }

    /// Internal borrow helper used by both direct and permit borrow.
    fn do_borrow(
        env: &Env,
        user: &Address,
        borrow_asset: &Address,
        collateral_asset: &Address,
        amount: i128,
    ) {
        Self::require_not_paused(env);
        Self::require_supported_asset(env, borrow_asset);
        Self::require_supported_asset(env, collateral_asset);
        Self::require_positive_amount(env, amount);

        let interest_state = Self::accrue_and_persist_interest(env, borrow_asset).state;
        Self::check_borrow_cap(env, borrow_asset, amount);
        Self::enforce_borrow_cap(env, borrow_asset, amount);

        let mut position = interest::compute_accrued_position(
            &Self::read_position(env, user, borrow_asset),
            &interest_state,
        );
        let mut reserve = Self::read_asset_reserve(env, borrow_asset);
        if amount > reserve.total_balance {
            panic_with_error!(env, VeilLendError::InsufficientReserve);
        }
        position.borrowed += amount;
        reserve.total_balance -= amount;
        Self::assert_collateralized(
            env,
            collateral_asset,
            borrow_asset,
            user,
            CollateralAction::Borrow { amount },
        );
        Self::write_position(env, user, borrow_asset, &position);
        Self::write_asset_reserve(env, borrow_asset, &reserve);

        let total = Self::get_total_borrowed(env.clone(), borrow_asset.clone()) + amount;
        env.storage()
            .persistent()
            .set(&DataKey::TotalBorrowed(borrow_asset.clone()), &total);

        BorrowEvent {
            user: user.clone(),
            asset: borrow_asset.clone(),
            amount,
        }
        .publish(env);
        Self::publish_asset_reserve_updated(env, borrow_asset, &reserve, ReserveUpdateKind::Borrow);
    }

    /// Internal repay helper used by both direct and permit repay.
    fn do_repay(env: &Env, user: &Address, asset: &Address, amount: i128) {
        Self::require_supported_asset(env, asset);
        Self::require_positive_amount(env, amount);

        let interest_state = Self::accrue_and_persist_interest(env, asset).state;

        let mut position = interest::compute_accrued_position(
            &Self::read_position(env, user, asset),
            &interest_state,
        );
        let mut reserve = Self::read_asset_reserve(env, asset);
        if amount > position.borrowed {
            panic_with_error!(env, VeilLendError::RepayTooLarge);
        }

        position.borrowed -= amount;
        reserve.total_balance += amount;

        let mut dust_delta = 0;
        if position.borrowed > 0 && position.borrowed <= DUST_THRESHOLD {
            dust_delta = position.borrowed;
            position.borrowed = 0;
        }

        Self::write_position(env, user, asset, &position);
        Self::write_asset_reserve(env, asset, &reserve);

        let total = Self::get_total_borrowed(env.clone(), asset.clone()) - amount - dust_delta;
        env.storage()
            .persistent()
            .set(&DataKey::TotalBorrowed(asset.clone()), &total);

        RepayEvent {
            user: user.clone(),
            asset: asset.clone(),
            amount,
        }
        .publish(env);
        Self::publish_asset_reserve_updated(env, asset, &reserve, ReserveUpdateKind::Repay);
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
            ActionPayload::WithdrawReserves(asset, _to, amount) => {
                Self::require_supported_asset(env, asset);
                Self::require_positive_amount(env, *amount);
                let available = Self::read_asset_reserve(env, asset).protocol_fees;
                if *amount > available {
                    panic_with_error!(env, VeilLendError::InsufficientReserve);
                }
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
            ActionPayload::WithdrawReserves(asset, to, amount) => {
                Self::apply_withdraw_reserves(env, admin, asset, to, *amount)
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

    /// Applies a validated withdraw_reserves action: debits `amount` from
    /// `asset`'s withdrawable protocol reserve (`AssetReserve.protocol_fees`
    /// and `total_balance`). `amount <= reserves[asset]` is enforced by
    /// `validate_payload` before this runs (both at propose time and again
    /// here at execute time, in case reserves shrank in between).
    ///
    /// Internal accounting only, matching every other entrypoint in this
    /// contract (deposit/borrow/repay/withdraw/flash_loan): `to` receives no
    /// real token transfer here, because this contract does not yet hold
    /// real token custody for any balance (see `flash_loan`'s repayment-model
    /// doc comment). `to` is recorded in the emitted event so an indexer
    /// or a follow-up token-custody migration can reconcile who reserves
    /// were credited to.
    fn apply_withdraw_reserves(
        env: &Env,
        admin: &Address,
        asset: &Address,
        to: &Address,
        amount: i128,
    ) {
        Self::accrue_and_persist_interest(env, asset);

        let mut reserve = Self::read_asset_reserve(env, asset);
        if amount > reserve.protocol_fees {
            panic_with_error!(env, VeilLendError::InsufficientReserve);
        }

        reserve.total_balance -= amount;
        reserve.protocol_fees -= amount;
        Self::write_asset_reserve(env, asset, &reserve);

        ReservesWithdrawn {
            asset: asset.clone(),
            to: to.clone(),
            amount,
            executed_by: admin.clone(),
        }
        .publish(env);
        Self::publish_asset_reserve_updated(
            env,
            asset,
            &reserve,
            ReserveUpdateKind::ReservesWithdrawn,
        );
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

    fn read_lifetime_reserve_earned(env: &Env, asset: &Address) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::LifetimeReserveEarned(asset.clone()))
            .unwrap_or(0)
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
    /// Returns the persisted state plus the interest amounts actually accrued,
    /// so callers can tell whether anything happened (a same-timestamp or
    /// zero-utilization call accrues nothing).
    ///
    /// Must be called before any cap check or balance mutation in every
    /// entrypoint that reads/writes reserve state, so caps are enforced
    /// against up-to-date totals and totals never drift from reality.
    fn accrue_and_persist_interest(env: &Env, asset: &Address) -> interest::AccrualResult {
        let state = Self::read_interest_state(env, asset);
        let now = env.ledger().timestamp();

        // Explicit idempotency guard: when the ledger clock has not advanced
        // since the last *persisted* accrual there is nothing to accrue. Return
        // the stored state without touching storage so repeated same-timestamp
        // calls produce no writes and no InterestAccrued events.
        //
        // The guard only applies to an already-persisted state. A missing
        // InterestState entry anchors `last_accrual_timestamp` at `now` (see
        // `read_interest_state`); on that first touch we deliberately fall
        // through and persist the anchor below, otherwise every later call
        // would keep re-anchoring to the current time and interest would never
        // accrue.
        let already_persisted = env
            .storage()
            .persistent()
            .has(&DataKey::InterestState(asset.clone()));
        if already_persisted && now <= state.last_accrual_timestamp {
            return interest::AccrualResult {
                state,
                interest_to_suppliers: 0,
                interest_to_borrowers: 0,
                dust_to_reserves: 0,
            };
        }

        let total_supplied = Self::get_total_deposited(env.clone(), asset.clone());
        let total_borrowed = Self::get_total_borrowed(env.clone(), asset.clone());

        // Load per-asset interest params; fall back to safe zero-rate defaults
        // so assets without configured params accrue no interest (backward-compat).
        let params: InterestParams = env
            .storage()
            .persistent()
            .get(&DataKey::InterestParams(asset.clone()))
            .unwrap_or(interest::DEFAULT_PARAMS);
        let reserve_factor_bps = params.reserve_factor_bps;

        let result =
            interest::compute_accrual(env, &state, &params, total_supplied, total_borrowed, now);

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

        // Truncation dust (interest_to_borrowers - interest_to_suppliers)
        // belongs to protocol reserves so the conservation invariant holds
        // exactly: every stroop borrowers pay is accounted for.
        if result.dust_to_reserves > 0 {
            let mut reserve = Self::read_asset_reserve(env, asset);
            reserve.total_balance += result.dust_to_reserves;

            // With reserve_factor_bps == 0 (the default, and every asset's
            // behavior before this reserve-accumulation feature existed)
            // this whole gap is pure integer-truncation dust: it stays
            // folded into total_balance only, exactly as before, with no
            // change to protocol_fees, the lifetime counter, or events —
            // preserving byte-for-byte backward compatibility.
            //
            // Once an asset has a nonzero reserve_factor_bps, this gap is
            // (truncation dust + the deliberate reserve-factor skim); at
            // that point it's tracked explicitly as withdrawable protocol
            // reserve so it shows up on balance sheets instead of silently
            // inflating total_balance with no corresponding claim.
            if reserve_factor_bps > 0 {
                reserve.protocol_fees += result.dust_to_reserves;
                Self::write_asset_reserve(env, asset, &reserve);

                let lifetime_reserve_earned =
                    Self::read_lifetime_reserve_earned(env, asset) + result.dust_to_reserves;
                env.storage().persistent().set(
                    &DataKey::LifetimeReserveEarned(asset.clone()),
                    &lifetime_reserve_earned,
                );

                ReservesAccrued {
                    asset: asset.clone(),
                    amount: result.dust_to_reserves,
                    new_total_reserve: reserve.protocol_fees,
                }
                .publish(env);
            } else {
                Self::write_asset_reserve(env, asset, &reserve);
            }
        }

        // Publish a per-asset interest accrual event only when interest
        // actually accrued, so indexers and portfolio dashboards can attribute
        // interest to a specific asset and ledger. Zero-interest accruals
        // (no elapsed time, or no utilization) emit nothing.
        if result.interest_to_suppliers != 0 || result.interest_to_borrowers != 0 {
            InterestAccrued {
                asset: asset.clone(),
                interest_to_suppliers: result.interest_to_suppliers,
                interest_to_borrowers: result.interest_to_borrowers,
                supply_index_before: state.supply_index,
                borrow_index_before: state.borrow_index,
                supply_index_after: result.state.supply_index,
                borrow_index_after: result.state.borrow_index,
                timestamp: now,
            }
            .publish(env);
        }

        result
    }

    /// Like `accrue_and_persist_interest`, but purely computed — does not
    /// write anything to storage. Used by read-only view functions so
    /// callers always see live, accurate current state between transactions.
    fn simulate_accrued_interest_state(env: &Env, asset: &Address) -> InterestState {
        let state = Self::read_interest_state(env, asset);
        let total_supplied = Self::get_total_deposited(env.clone(), asset.clone());
        let total_borrowed = Self::get_total_borrowed(env.clone(), asset.clone());
        let now = env.ledger().timestamp();

        let params: InterestParams = env
            .storage()
            .persistent()
            .get(&DataKey::InterestParams(asset.clone()))
            .unwrap_or(interest::DEFAULT_PARAMS);

        interest::compute_accrual(env, &state, &params, total_supplied, total_borrowed, now).state
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

    /// Panics with `ContractPaused` if the global pause flag is set.
    ///
    /// Called at the top of every entrypoint (after `require_auth`, so an
    /// unauthenticated caller still gets `Unauthorized` rather than learning
    /// pause state) that either moves value or advances protocol-wide state
    /// an admin key alone could otherwise abuse during an incident:
    /// `deposit`, `borrow` (and their batch/permit variants), `flash_loan`,
    /// `accrue_interest`, `set_oracle_price`/`execute_set_oracle_price`,
    /// `execute_configure_asset`, `execute_update_asset_caps`,
    /// `execute_set_min_collateral_ratio`, `execute_record_protocol_fee`,
    /// `execute_withdraw_reserves`, `set_max_oracle_age`,
    /// `set_oracle_max_change_bps`, `set_oracle_price_bounds`,
    /// `set_max_protocol_fee_bps`, `set_supply_cap`, `set_borrow_cap`,
    /// `set_close_factor`, `set_interest_params`, and `configure_flash_loan`.
    ///
    /// Deliberately NOT called (see the README pause table for the full
    /// rationale) by:
    /// - `repay`/`withdraw` (+ batch/permit variants) — a paused protocol
    ///   must still let users exit and reduce risk.
    /// - `liquidate` — blocking liquidations while paused would let bad debt
    ///   accumulate exactly when the protocol is most exposed.
    /// - `set_paused`, `propose_set_paused`/`execute_set_paused`/
    ///   `cancel_set_paused` — the pause switch itself must stay reachable.
    /// - `add_admin`/`remove_admin`/`set_timelock_ledgers`, and every
    ///   `propose_*`/`cancel_*` — governance/incident-response actions admins
    ///   need in order to recover (e.g. removing a compromised admin, or
    ///   cancelling a malicious pending action) must not be paused shut too.
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

    /// Enforces the admin-configured aggregate supply cap (`AssetSupplyCap`,
    /// 0 = unlimited) for `asset`. Distinct from the legacy `DepositCap`
    /// (-1 = unlimited) mechanism checked by `check_deposit_cap`; both are
    /// enforced independently.
    fn enforce_supply_cap(env: &Env, asset: &Address, amount: i128) {
        let cap: i128 = env
            .storage()
            .persistent()
            .get(&DataKey::AssetSupplyCap(asset.clone()))
            .unwrap_or(0);

        if cap == 0 {
            return;
        }

        let current_total = Self::get_total_deposited(env.clone(), asset.clone());
        if current_total + amount > cap {
            panic_with_error!(env, VeilLendError::SupplyCapExceeded);
        }
    }

    /// Enforces the admin-configured aggregate borrow cap (`AssetBorrowCap`,
    /// 0 = unlimited) for `asset`. Distinct from the legacy `BorrowCap`
    /// (-1 = unlimited) mechanism checked by `check_borrow_cap`; both are
    /// enforced independently.
    fn enforce_borrow_cap(env: &Env, asset: &Address, amount: i128) {
        let cap: i128 = env
            .storage()
            .persistent()
            .get(&DataKey::AssetBorrowCap(asset.clone()))
            .unwrap_or(0);

        if cap == 0 {
            return;
        }

        let current_total = Self::get_total_borrowed(env.clone(), asset.clone());
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

    /// Deduplicates assets from a vector of operations.
    ///
    /// # Returns
    /// A Vec<Address> containing each unique asset exactly once.
    fn deduplicate_assets(env: &Env, operations: &Vec<BatchOperation>) -> Vec<Address> {
        let mut unique: Vec<Address> = Vec::new(env);
        for op in operations.iter() {
            if !unique.contains(&op.asset) {
                unique.push_back(op.asset.clone());
            }
        }
        unique
    }

    /// Accrues interest for each asset in the list exactly once.
    ///
    /// # Idempotency
    /// If called multiple times for the same asset within the same ledger timestamp,
    /// subsequent calls are no-ops due to the idempotency guard in
    /// `accrue_and_persist_interest`.
    fn accrue_assets_once(env: &Env, assets: &Vec<Address>) {
        for asset in assets.iter() {
            Self::accrue_and_persist_interest(env, &asset);
        }
    }

    /// Checks all deposit caps against the final aggregated totals for a batch.
    ///
    /// This ensures that intermediate states that might temporarily exceed a cap
    /// are allowed as long as the final state is within the cap.
    fn check_batch_deposit_caps(env: &Env, operations: &Vec<BatchOperation>) {
        // Group amounts by asset
        let mut totals: Vec<(Address, i128)> = Vec::new(env);
        for op in operations.iter() {
            let mut found = false;
            for i in 0..totals.len() {
                let (asset, amount) = totals.get(i).unwrap();
                if asset == op.asset {
                    let new_amount = amount + op.amount;
                    totals.set(i, (op.asset.clone(), new_amount));
                    found = true;
                    break;
                }
            }
            if !found {
                totals.push_back((op.asset.clone(), op.amount));
            }
        }

        // Check each asset's final total against its cap
        for (asset, total_amount) in totals.iter() {
            // Check deposit cap
            Self::check_deposit_cap(env, &asset, total_amount);
            // Check supply cap
            Self::enforce_supply_cap(env, &asset, total_amount);
        }
    }

    /// Checks all borrow caps against the final aggregated totals for a batch.
    fn check_batch_borrow_caps(env: &Env, operations: &Vec<BatchOperation>) {
        // Group amounts by asset
        let mut totals: Vec<(Address, i128)> = Vec::new(env);
        for op in operations.iter() {
            let mut found = false;
            for i in 0..totals.len() {
                let (asset, amount) = totals.get(i).unwrap();
                if asset == op.asset {
                    let new_amount = amount + op.amount;
                    totals.set(i, (op.asset.clone(), new_amount));
                    found = true;
                    break;
                }
            }
            if !found {
                totals.push_back((op.asset.clone(), op.amount));
            }
        }

        // Check each asset's final total against its cap
        for (asset, total_amount) in totals.iter() {
            // Check borrow cap
            Self::check_borrow_cap(env, &asset, total_amount);
            // Check borrow cap (aggregate)
            Self::enforce_borrow_cap(env, &asset, total_amount);
        }
    }

    /// Enforces the collateral ratio after a batch withdrawal.
    ///
    /// Positions have already been written to storage by the time this is
    /// called, so each unique withdrawn asset is checked as collateral
    /// against `debt_asset` with a zero delta (the withdrawal is already
    /// reflected in the stored position).
    ///
    /// Unlike a single `withdraw`, which only compares the one withdrawn
    /// asset against the debt, this aggregates collateral value across every
    /// unique asset touched by the batch. This is what makes batching
    /// meaningfully different from issuing the same withdrawals as separate
    /// transactions: moving value out of one asset while another asset in
    /// the same batch still covers the debt is allowed, since only the
    /// combined final state matters.
    ///
    /// # Panics
    /// * If the aggregated collateral value of the touched assets is
    ///   insufficient to cover the debt in `debt_asset`
    fn enforce_batch_health_factor_for_withdraw(
        env: &Env,
        user: &Address,
        debt_asset: &Address,
        operations: &Vec<BatchOperation>,
    ) {
        let debt_borrowed = Self::read_accrued_position(env, user, debt_asset).borrowed;
        if debt_borrowed == 0 {
            return;
        }

        let touched_assets = Self::deduplicate_assets(env, operations);
        let mut collateral_value: i128 = 0;
        for asset in touched_assets.iter() {
            let deposited = Self::read_accrued_position(env, user, &asset).deposited;
            collateral_value += deposited * Self::read_oracle_price(env, &asset);
        }

        let debt_value = debt_borrowed * Self::read_oracle_price(env, debt_asset);
        let collateral_ratio_bps = Self::min_collateral_ratio_bps(env.clone()) as i128;
        if collateral_value * 10_000 < debt_value * collateral_ratio_bps {
            panic_with_error!(env, VeilLendError::InsufficientCollateral);
        }
    }

    /// Enforces the collateral ratio after a batch borrow.
    ///
    /// Positions have already been written to storage by the time this is
    /// called. Unlike a single `borrow`, which only compares the one
    /// borrowed asset against the collateral, this aggregates debt value
    /// across every unique asset touched by the batch and compares it
    /// against the single named collateral asset, since only the combined
    /// final state matters for a batch.
    ///
    /// # Panics
    /// * If `collateral_asset` is insufficient to cover the aggregated debt
    ///   value of the touched assets
    fn enforce_batch_health_factor_for_borrow(
        env: &Env,
        user: &Address,
        collateral_asset: &Address,
        operations: &Vec<BatchOperation>,
    ) {
        let touched_assets = Self::deduplicate_assets(env, operations);
        let mut debt_value: i128 = 0;
        for asset in touched_assets.iter() {
            let borrowed = Self::read_accrued_position(env, user, &asset).borrowed;
            debt_value += borrowed * Self::read_oracle_price(env, &asset);
        }

        if debt_value == 0 {
            return;
        }

        let collateral_deposited =
            Self::read_accrued_position(env, user, collateral_asset).deposited;
        let collateral_value =
            collateral_deposited * Self::read_oracle_price(env, collateral_asset);
        let collateral_ratio_bps = Self::min_collateral_ratio_bps(env.clone()) as i128;
        if collateral_value * 10_000 < debt_value * collateral_ratio_bps {
            panic_with_error!(env, VeilLendError::InsufficientCollateral);
        }
    }

    /// Emits a batch summary event.
    fn emit_batch_executed(env: &Env, user: &Address, operation_type: &str, operation_count: u32) {
        #[contractevent(topics = ["veillend", "batch_executed"])]
        #[derive(Clone, Debug, Eq, PartialEq)]
        struct BatchExecuted {
            #[topic]
            pub user: Address,
            #[topic]
            pub operation_type: Symbol,
            pub operation_count: u32,
            pub timestamp: u64,
        }

        let event = BatchExecuted {
            user: user.clone(),
            operation_type: Symbol::new(env, operation_type),
            operation_count,
            timestamp: env.ledger().timestamp(),
        };
        event.publish(env);
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
        assert_eq!(VeilLendError::ArithmeticOverflow as u32, 30);
        assert_eq!(VeilLendError::SupplyCapExceeded as u32, 31);
        assert_eq!(VeilLendError::PositionNotLiquidatable as u32, 32);
    }

    #[test]
    fn test_contract_metadata_identifies_current_storage_shape() {
        let metadata = VeilLendContract::contract_metadata(Env::default());

        assert_eq!(metadata.contract_version, 7);
        assert_eq!(metadata.storage_schema_version, 5);
        assert_eq!(metadata.storage_schema_id, symbol_short!("VLENDV5"));
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
            VeilLendError::ArithmeticOverflow as u32,
            VeilLendError::SupplyCapExceeded as u32,
            VeilLendError::PositionNotLiquidatable as u32,
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
