#![no_std]

mod interest;

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, panic_with_error,
    symbol_short, Address, Env, Symbol,
};

/// Increment this only when a contract interface change requires consumers to adapt.
pub const CONTRACT_VERSION: u32 = 3;

/// Increment this only when the serialized `DataKey` or stored value layout changes.
pub const STORAGE_SCHEMA_VERSION: u32 = 2;

/// A compact, stable identifier for the current `DataKey` storage layout.
const STORAGE_SCHEMA_ID: Symbol = symbol_short!("VLENDV2");

// --- Persistent / instance TTL bump policy ---------------------------------
// Network ledgers are ~5s; 17_280 ledgers ≈ 1 day. Values are conservative
// defaults for a lending protocol: extend when remaining lifetime drops below
// ~7 days, and restore lifetime to ~30 days. Adjust with network limits if the
// protocol later needs longer retention windows.
//
// `extend_ttl(threshold, extend_to)` only spends resources when current TTL
// is below `threshold`; otherwise it is a no-op.

/// Ledgers per day (approx, 5s close time).
pub const LEDGERS_PER_DAY: u32 = 17_280;
/// Extend when remaining TTL is below this many ledgers (~7 days).
pub const INSTANCE_TTL_THRESHOLD: u32 = 7 * LEDGERS_PER_DAY;
/// Target remaining TTL after an instance bump (~30 days).
pub const INSTANCE_TTL_EXTEND_TO: u32 = 30 * LEDGERS_PER_DAY;
/// Extend persistent protocol keys when remaining TTL is below ~7 days.
pub const PERSISTENT_TTL_THRESHOLD: u32 = 7 * LEDGERS_PER_DAY;
/// Target remaining TTL after a persistent key bump (~30 days).
pub const PERSISTENT_TTL_EXTEND_TO: u32 = 30 * LEDGERS_PER_DAY;

/// Queryable metadata describing the contract interface and its storage layout.
#[derive(Clone, Debug, Eq, PartialEq)]
#[contracttype]
pub struct ContractMetadata {
    pub contract_version: u32,
    pub storage_schema_version: u32,
    pub storage_schema_id: Symbol,
}

/// Keys and value shapes that make up storage schema `VLENDV2`.
///
/// Instance storage: `Admin: Address`, `MinCollateralRatioBps: u32`.
/// Persistent storage: `SupportedAsset(Address): bool`,
/// `Position(Address, Address): Position`, `OraclePrice(Address): i128`,
/// `DepositCap(Address)`/`BorrowCap(Address): i128`,
/// `TotalDeposited(Address)`/`TotalBorrowed(Address): i128`, `Paused: bool`,
/// and `InterestState(Address): InterestState`.
#[derive(Clone)]
#[contracttype]
pub enum DataKey {
    Admin,
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
        if env.storage().instance().has(&DataKey::Admin) {
            panic_with_error!(&env, VeilLendError::AlreadyInitialized);
        }
        if min_collateral_ratio_bps < 10_000 {
            panic_with_error!(&env, VeilLendError::InvalidCollateralRatio);
        }

        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage()
            .instance()
            .set(&DataKey::MinCollateralRatioBps, &min_collateral_ratio_bps);
        Self::extend_instance_ttl(&env);

        // Initialize circuit breaker as not paused
        let paused_key = DataKey::Paused;
        env.storage().persistent().set(&paused_key, &false);
        Self::extend_persistent_ttl(&env, &paused_key);
    }

    pub fn configure_asset(env: Env, admin: Address, asset: Address, supported: bool) {
        let stored_admin = Self::admin(env.clone());
        if admin != stored_admin {
            panic_with_error!(&env, VeilLendError::Unauthorized);
        }

        admin.require_auth();
        let support_key = DataKey::SupportedAsset(asset.clone());
        env.storage().persistent().set(&support_key, &supported);
        Self::extend_persistent_ttl(&env, &support_key);
        Self::extend_instance_ttl(&env);

        // Initialize caps to unlimited (-1) when adding new asset
        if supported {
            for (key, value) in [
                (DataKey::DepositCap(asset.clone()), -1i128),
                (DataKey::BorrowCap(asset.clone()), -1i128),
                (DataKey::TotalDeposited(asset.clone()), 0i128),
                (DataKey::TotalBorrowed(asset.clone()), 0i128),
            ] {
                env.storage().persistent().set(&key, &value);
                Self::extend_persistent_ttl(&env, &key);
            }
        }

        AssetConfigured {
            admin,
            asset: asset.clone(),
            supported,
        }
        .publish(&env);

        if supported {
            let reserve = Self::read_asset_reserve(&env, &asset);
            Self::write_asset_reserve(&env, &asset, &reserve);
            Self::publish_asset_reserve_updated(
                &env,
                &asset,
                &reserve,
                ReserveUpdateKind::ConfigureAsset,
            );
        }
    }

    /// Set the oracle price for a supported asset (admin only)
    ///
    /// This function allows the admin to set the price of an asset as reported by an oracle.
    /// The price is used in collateral calculations to determine borrowing power.
    ///
    /// # Arguments
    /// * `admin` - The admin address (must match stored admin)
    /// * `asset` - The asset address to set the price for
    /// * `price` - The oracle price (must be positive, in base units e.g., cents)
    pub fn set_oracle_price(env: Env, admin: Address, asset: Address, price: i128) {
        let stored_admin = Self::admin(env.clone());
        if admin != stored_admin {
            panic_with_error!(&env, VeilLendError::Unauthorized);
        }

        if price <= 0 {
            panic_with_error!(&env, VeilLendError::InvalidAmount);
        }

        admin.require_auth();
        let key = DataKey::OraclePrice(asset.clone());
        env.storage().persistent().set(&key, &price);
        Self::extend_persistent_ttl(&env, &key);
        Self::extend_instance_ttl(&env);
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

    /// Update per-asset deposit and borrow caps (admin only)
    ///
    /// Sets the maximum total deposits and borrows allowed for a specific asset.
    /// A value of -1 means unlimited (no cap).
    ///
    /// # Arguments
    /// * `admin` - The admin address (must match stored admin)
    /// * `asset` - The asset address to update caps for
    /// * `deposit_cap` - Maximum total deposits allowed (-1 for unlimited)
    /// * `borrow_cap` - Maximum total borrows allowed (-1 for unlimited)
    pub fn update_asset_caps(
        env: Env,
        admin: Address,
        asset: Address,
        deposit_cap: i128,
        borrow_cap: i128,
    ) {
        let stored_admin = Self::admin(env.clone());
        if admin != stored_admin {
            panic_with_error!(&env, VeilLendError::Unauthorized);
        }

        // Validate caps: must be -1 (unlimited) or positive
        if deposit_cap != -1 && deposit_cap <= 0 {
            panic_with_error!(&env, VeilLendError::InvalidCap);
        }
        if borrow_cap != -1 && borrow_cap <= 0 {
            panic_with_error!(&env, VeilLendError::InvalidCap);
        }

        // Ensure asset is supported
        Self::require_supported_asset(&env, &asset);

        admin.require_auth();

        let deposit_key = DataKey::DepositCap(asset.clone());
        let borrow_key = DataKey::BorrowCap(asset.clone());
        env.storage().persistent().set(&deposit_key, &deposit_cap);
        env.storage().persistent().set(&borrow_key, &borrow_cap);
        Self::extend_persistent_ttl(&env, &deposit_key);
        Self::extend_persistent_ttl(&env, &borrow_key);
        Self::extend_instance_ttl(&env);

        CapsUpdated {
            admin,
            asset,
            deposit_cap,
            borrow_cap,
        }
        .publish(&env);
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

    /// Toggle circuit breaker (pause/unpause the contract)
    ///
    /// When paused, all deposit and borrow operations are blocked.
    /// Withdraw and repay operations remain available.
    ///
    /// # Arguments
    /// * `admin` - The admin address (must match stored admin)
    /// * `paused` - true to pause, false to unpause
    pub fn set_paused(env: Env, admin: Address, paused: bool) {
        let stored_admin = Self::admin(env.clone());
        if admin != stored_admin {
            panic_with_error!(&env, VeilLendError::Unauthorized);
        }

        admin.require_auth();
        let key = DataKey::Paused;
        env.storage().persistent().set(&key, &paused);
        Self::extend_persistent_ttl(&env, &key);
        Self::extend_instance_ttl(&env);

        CircuitBreakerEvent { admin, paused }.publish(&env);
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
        Self::write_total_deposited(&env, &asset, total);

        DepositEvent {
            user,
            asset: asset.clone(),
            amount,
        }
        .publish(&env);
        Self::publish_asset_reserve_updated(&env, &asset, &reserve, ReserveUpdateKind::Deposit);
    }

    pub fn borrow(env: Env, user: Address, asset: Address, amount: i128) {
        Self::require_not_paused(&env);
        Self::require_supported_asset(&env, &asset);
        Self::require_positive_amount(&env, amount);
        user.require_auth();

        // Accrue interest first so both the cap check below and the totals
        // we write reflect up-to-date, time-aware values.
        let interest_state = Self::accrue_and_persist_interest(&env, &asset);

        // Check borrow cap
        Self::check_borrow_cap(&env, &asset, amount);

        let mut position = interest::compute_accrued_position(
            &Self::read_position(&env, &user, &asset),
            &interest_state,
        );
        let mut reserve = Self::read_asset_reserve(&env, &asset);
        if amount > reserve.total_balance {
            panic_with_error!(&env, VeilLendError::InsufficientReserve);
        }
        position.borrowed += amount;
        reserve.total_balance -= amount;
        Self::assert_collateralized(&env, &user, &asset, &position);
        Self::write_position(&env, &user, &asset, &position);
        Self::write_asset_reserve(&env, &asset, &reserve);

        // Update total borrows
        let total = Self::get_total_borrowed(env.clone(), asset.clone()) + amount;
        Self::write_total_borrowed(&env, &asset, total);

        BorrowEvent {
            user,
            asset: asset.clone(),
            amount,
        }
        .publish(&env);
        Self::publish_asset_reserve_updated(&env, &asset, &reserve, ReserveUpdateKind::Borrow);
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
        Self::write_position(&env, &user, &asset, &position);
        Self::write_asset_reserve(&env, &asset, &reserve);

        // Update total borrows
        let total = Self::get_total_borrowed(env.clone(), asset.clone()) - amount;
        Self::write_total_borrowed(&env, &asset, total);

        RepayEvent {
            user,
            asset: asset.clone(),
            amount,
        }
        .publish(&env);
        Self::publish_asset_reserve_updated(&env, &asset, &reserve, ReserveUpdateKind::Repay);
    }

    pub fn withdraw(env: Env, user: Address, asset: Address, amount: i128) {
        // Withdraw is allowed even when paused (users can always remove collateral)
        Self::require_supported_asset(&env, &asset);
        Self::require_positive_amount(&env, amount);
        user.require_auth();

        let interest_state = Self::accrue_and_persist_interest(&env, &asset);

        let mut position = interest::compute_accrued_position(
            &Self::read_position(&env, &user, &asset),
            &interest_state,
        );
        let mut reserve = Self::read_asset_reserve(&env, &asset);
        if amount > position.deposited {
            panic_with_error!(&env, VeilLendError::InsufficientDeposit);
        }
        if amount > reserve.total_balance {
            panic_with_error!(&env, VeilLendError::InsufficientReserve);
        }

        position.deposited -= amount;
        reserve.total_balance -= amount;
        Self::assert_collateralized(&env, &user, &asset, &position);
        Self::write_position(&env, &user, &asset, &position);
        Self::write_asset_reserve(&env, &asset, &reserve);

        // Update total deposits
        let total = Self::get_total_deposited(env.clone(), asset.clone()) - amount;
        Self::write_total_deposited(&env, &asset, total);

        WithdrawEvent {
            user,
            asset: asset.clone(),
            amount,
        }
        .publish(&env);
        Self::publish_asset_reserve_updated(&env, &asset, &reserve, ReserveUpdateKind::Withdraw);
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

    pub fn record_protocol_fee(env: Env, admin: Address, asset: Address, amount: i128) {
        let stored_admin = Self::admin(env.clone());
        if admin != stored_admin {
            panic_with_error!(&env, VeilLendError::Unauthorized);
        }

        Self::require_supported_asset(&env, &asset);
        Self::require_positive_amount(&env, amount);
        admin.require_auth();

        // Keep the interest clock fresh even on admin-only fee recording.
        Self::accrue_and_persist_interest(&env, &asset);

        let mut reserve = Self::read_asset_reserve(&env, &asset);
        reserve.total_balance += amount;
        reserve.protocol_fees += amount;
        Self::write_asset_reserve(&env, &asset, &reserve);
        Self::publish_asset_reserve_updated(&env, &asset, &reserve, ReserveUpdateKind::FeeAccrual);
    }

    pub fn admin(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::Admin)
            .unwrap_or_else(|| panic_with_error!(&env, VeilLendError::NotInitialized))
    }

    pub fn min_collateral_ratio_bps(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::MinCollateralRatioBps)
            .unwrap_or(15_000)
    }

    /// Keep-alive: bump the contract instance TTL when it is below threshold.
    ///
    /// Callable by anyone — extending TTL is not privileged and prevents the
    /// instance (admin + config) from archiving between user interactions.
    pub fn bump_instance_ttl(env: Env) {
        Self::extend_instance_ttl(&env);
    }

    /// Keep-alive: bump persistent keys tied to an asset (support flag, caps,
    /// totals, reserve, interest state, oracle price when present).
    pub fn bump_asset_storage_ttl(env: Env, asset: Address) {
        Self::extend_instance_ttl(&env);
        Self::extend_asset_keys_ttl(&env, &asset);
    }

    /// Keep-alive: bump a user's position entry for `(user, asset)`.
    pub fn bump_position_ttl(env: Env, user: Address, asset: Address) {
        Self::extend_instance_ttl(&env);
        let key = DataKey::Position(user, asset);
        if env.storage().persistent().has(&key) {
            Self::extend_persistent_ttl(&env, &key);
        }
    }
}

impl VeilLendContract {
    /// Extend instance storage when remaining TTL drops below the threshold.
    fn extend_instance_ttl(env: &Env) {
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_EXTEND_TO);
    }

    /// Extend a single persistent key when remaining TTL is below threshold.
    fn extend_persistent_ttl(env: &Env, key: &DataKey) {
        env.storage().persistent().extend_ttl(
            key,
            PERSISTENT_TTL_THRESHOLD,
            PERSISTENT_TTL_EXTEND_TO,
        );
    }

    /// Bump the set of persistent keys that define an asset's protocol state.
    fn extend_asset_keys_ttl(env: &Env, asset: &Address) {
        let keys = [
            DataKey::SupportedAsset(asset.clone()),
            DataKey::AssetReserve(asset.clone()),
            DataKey::DepositCap(asset.clone()),
            DataKey::BorrowCap(asset.clone()),
            DataKey::TotalDeposited(asset.clone()),
            DataKey::TotalBorrowed(asset.clone()),
            DataKey::InterestState(asset.clone()),
            DataKey::OraclePrice(asset.clone()),
        ];
        for key in keys.iter() {
            if env.storage().persistent().has(key) {
                Self::extend_persistent_ttl(env, key);
            }
        }
        // Circuit breaker is protocol-global but cheap to keep alive alongside assets.
        let paused = DataKey::Paused;
        if env.storage().persistent().has(&paused) {
            Self::extend_persistent_ttl(env, &paused);
        }
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
        let key = DataKey::AssetReserve(asset.clone());
        env.storage().persistent().set(&key, reserve);
        Self::extend_persistent_ttl(env, &key);
        Self::extend_instance_ttl(env);
    }

    fn write_total_deposited(env: &Env, asset: &Address, total: i128) {
        let key = DataKey::TotalDeposited(asset.clone());
        env.storage().persistent().set(&key, &total);
        Self::extend_persistent_ttl(env, &key);
    }

    fn write_total_borrowed(env: &Env, asset: &Address, total: i128) {
        let key = DataKey::TotalBorrowed(asset.clone());
        env.storage().persistent().set(&key, &total);
        Self::extend_persistent_ttl(env, &key);
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

    fn write_position(env: &Env, user: &Address, asset: &Address, position: &Position) {
        let key = DataKey::Position(user.clone(), asset.clone());
        env.storage().persistent().set(&key, position);
        Self::extend_persistent_ttl(env, &key);
        Self::extend_instance_ttl(env);
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
        let key = DataKey::InterestState(asset.clone());
        env.storage().persistent().set(&key, state);
        Self::extend_persistent_ttl(env, &key);
        Self::extend_instance_ttl(env);
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
            Self::write_total_deposited(env, asset, total_supplied + result.interest_to_suppliers);
        }
        if result.interest_to_borrowers != 0 {
            Self::write_total_borrowed(env, asset, total_borrowed + result.interest_to_borrowers);
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

    fn assert_collateralized(env: &Env, _user: &Address, asset: &Address, position: &Position) {
        if position.borrowed == 0 {
            return;
        }

        let collateral_ratio_bps = Self::min_collateral_ratio_bps(env.clone()) as i128;

        // Get oracle price for the asset — fail explicitly if not set
        let price: i128 = env
            .storage()
            .persistent()
            .get(&DataKey::OraclePrice(asset.clone()))
            .unwrap_or_else(|| panic_with_error!(env, VeilLendError::OraclePriceMissing));

        // Calculate collateral value using oracle price
        let collateral_value = position.deposited * price;
        let borrowed_value = position.borrowed * price;

        if collateral_value * 10_000 < borrowed_value * collateral_ratio_bps {
            panic_with_error!(env, VeilLendError::InsufficientCollateral);
        }
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
    }

    #[test]
    fn test_contract_metadata_identifies_current_storage_shape() {
        let metadata = VeilLendContract::contract_metadata(Env::default());

        assert_eq!(metadata.contract_version, 3);
        assert_eq!(metadata.storage_schema_version, 2);
        assert_eq!(metadata.storage_schema_id, symbol_short!("VLENDV2"));
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
