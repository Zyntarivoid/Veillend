#![no_std]

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, panic_with_error, Address,
    Env,
};

// ─── Storage keys ────────────────────────────────────────────────────────────

#[derive(Clone)]
#[contracttype]
pub enum DataKey {
    Admin,
    MinCollateralRatioBps,
    SupportedAsset(Address),
    /// Per-asset borrow cap (maximum total protocol-level borrow, in base units).
    AssetBorrowCap(Address),
    /// Per-asset deposit cap (maximum total protocol-level deposit, in base units).
    AssetDepositCap(Address),
    Position(Address, Address),
    OraclePrice(Address),
    /// Accumulated unclaimed protocol fee in base units for an asset.
    ProtocolFee(Address),
    /// Stored as `true` when the contract is paused.
    Paused,
}

// ─── Types ───────────────────────────────────────────────────────────────────

#[derive(Clone, Debug, Eq, PartialEq)]
#[contracttype]
pub struct Position {
    pub deposited: i128,
    pub borrowed: i128,
}

/// Per-asset caps set by the admin.
#[derive(Clone, Debug, Eq, PartialEq)]
#[contracttype]
pub struct AssetCaps {
    /// Maximum protocol-wide deposit for this asset (0 = uncapped).
    pub deposit_cap: i128,
    /// Maximum protocol-wide borrow for this asset (0 = uncapped).
    pub borrow_cap: i128,
}

// ─── Errors ──────────────────────────────────────────────────────────────────

/// All contract error codes (unique `u32` values, `#[contracterror]`).
///
/// ## Pause-aware entrypoints
///
/// The following table shows which entrypoints are checked by
/// [`require_not_paused`](VeilLendContract::set_paused) and which are
/// intentionally left unchecked so users can always exit their positions:
///
/// | Entrypoint           | Pause-checked | Rationale                                 |
/// |----------------------|:-------------:|-------------------------------------------|
/// | `__constructor`      | ✗             | One-shot initialiser, not state-mutating  |
/// | `set_paused`         | ✗             | The pause switch itself must stay usable  |
/// | `configure_asset`    | ✓             | Admin mutation — frozen during incidents  |
/// | `update_asset_caps`  | ✓             | Admin mutation — frozen during incidents  |
/// | `set_oracle_price`   | ✓             | Admin mutation — frozen during incidents  |
/// | `record_protocol_fee`| ✓             | Accrual mutation — frozen during incidents|
/// | `accrue_interest`    | ✓             | Permissionless accrual — frozen during incidents so the debt clock stops |
/// | `deposit`            | ✓             | New capital inflow — paused during incidents |
/// | `borrow`             | ✓             | New debt — paused during incidents        |
/// | `repay`              | ✗             | Users must always be able to reduce debt  |
/// | `withdraw`           | ✗             | Users must always be able to exit         |
///
/// Gaps marked ✗ on `repay`/`withdraw` are **intentional**: locking users in
/// would be worse than allowing controlled exits during an incident.
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
}

// ─── Events ──────────────────────────────────────────────────────────────────

#[contractevent(topics = ["veillend", "asset_configured"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AssetConfigured {
    #[topic]
    pub admin: Address,
    #[topic]
    pub asset: Address,
    pub supported: bool,
}

#[contractevent(topics = ["veillend", "asset_caps_updated"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AssetCapsUpdated {
    #[topic]
    pub admin: Address,
    #[topic]
    pub asset: Address,
    pub deposit_cap: i128,
    pub borrow_cap: i128,
}

#[contractevent(topics = ["veillend", "oracle_price_set"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct OraclePriceSet {
    #[topic]
    pub admin: Address,
    #[topic]
    pub asset: Address,
    pub price: i128,
}

#[contractevent(topics = ["veillend", "protocol_fee_recorded"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProtocolFeeRecorded {
    #[topic]
    pub admin: Address,
    #[topic]
    pub asset: Address,
    pub fee_amount: i128,
    pub total_accumulated: i128,
}

#[contractevent(topics = ["veillend", "interest_accrued"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct InterestAccrued {
    #[topic]
    pub asset: Address,
    pub interest_bps: u32,
}

#[contractevent(topics = ["veillend", "paused"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PausedEvent {
    #[topic]
    pub admin: Address,
    pub paused: bool,
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

// ─── Contract ────────────────────────────────────────────────────────────────

#[contract]
pub struct VeilLendContract;

#[contractimpl]
impl VeilLendContract {
    // ── Lifecycle ────────────────────────────────────────────────────────────

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
    }

    // ── Pause control (set_paused is itself NOT pause-checked) ───────────────

    /// Pause or unpause the contract (admin only).
    ///
    /// `set_paused` is deliberately **not** guarded by `require_not_paused`
    /// so the admin can always regain control during an incident.
    ///
    /// See the [`VeilLendError`] doc-table for which entrypoints are paused.
    pub fn set_paused(env: Env, admin: Address, paused: bool) {
        let stored_admin = Self::admin(env.clone());
        if admin != stored_admin {
            panic_with_error!(&env, VeilLendError::Unauthorized);
        }
        admin.require_auth();

        env.storage().instance().set(&DataKey::Paused, &paused);
        PausedEvent { admin, paused }.publish(&env);
    }

    /// Return `true` while the contract is paused.
    pub fn is_paused(env: Env) -> bool {
        env.storage()
            .instance()
            .get(&DataKey::Paused)
            .unwrap_or(false)
    }

    // ── Admin mutators (all pause-checked) ───────────────────────────────────

    /// Configure (add or remove) support for an asset (admin only, pause-checked).
    ///
    /// Blocked while the contract is paused so an attacker who has compromised
    /// the admin key cannot reconfigure assets while the pause banner claims
    /// the system is frozen.
    pub fn configure_asset(env: Env, admin: Address, asset: Address, supported: bool) {
        Self::require_not_paused(&env);

        let stored_admin = Self::admin(env.clone());
        if admin != stored_admin {
            panic_with_error!(&env, VeilLendError::Unauthorized);
        }

        admin.require_auth();
        env.storage()
            .persistent()
            .set(&DataKey::SupportedAsset(asset.clone()), &supported);
        AssetConfigured {
            admin,
            asset,
            supported,
        }
        .publish(&env);
    }

    /// Update per-asset borrow/deposit caps (admin only, pause-checked).
    ///
    /// Pass `0` for either cap to indicate "uncapped".
    /// Blocked while the contract is paused for the same reason as
    /// [`configure_asset`](Self::configure_asset).
    pub fn update_asset_caps(
        env: Env,
        admin: Address,
        asset: Address,
        deposit_cap: i128,
        borrow_cap: i128,
    ) {
        Self::require_not_paused(&env);

        let stored_admin = Self::admin(env.clone());
        if admin != stored_admin {
            panic_with_error!(&env, VeilLendError::Unauthorized);
        }
        if deposit_cap < 0 {
            panic_with_error!(&env, VeilLendError::InvalidAmount);
        }
        if borrow_cap < 0 {
            panic_with_error!(&env, VeilLendError::InvalidAmount);
        }

        admin.require_auth();
        env.storage()
            .persistent()
            .set(&DataKey::AssetDepositCap(asset.clone()), &deposit_cap);
        env.storage()
            .persistent()
            .set(&DataKey::AssetBorrowCap(asset.clone()), &borrow_cap);
        AssetCapsUpdated {
            admin,
            asset,
            deposit_cap,
            borrow_cap,
        }
        .publish(&env);
    }

    /// Return the caps currently configured for an asset.
    pub fn get_asset_caps(env: Env, asset: Address) -> AssetCaps {
        AssetCaps {
            deposit_cap: env
                .storage()
                .persistent()
                .get(&DataKey::AssetDepositCap(asset.clone()))
                .unwrap_or(0),
            borrow_cap: env
                .storage()
                .persistent()
                .get(&DataKey::AssetBorrowCap(asset.clone()))
                .unwrap_or(0),
        }
    }

    /// Set the oracle price for a supported asset (admin only, pause-checked).
    ///
    /// Blocked while the contract is paused so an attacker cannot manipulate
    /// oracle prices while the protocol appears frozen.
    ///
    /// # Arguments
    /// * `admin`  - The admin address (must match stored admin)
    /// * `asset`  - The asset address to set the price for
    /// * `price`  - The oracle price (must be positive, in base units e.g., cents)
    pub fn set_oracle_price(env: Env, admin: Address, asset: Address, price: i128) {
        Self::require_not_paused(&env);

        let stored_admin = Self::admin(env.clone());
        if admin != stored_admin {
            panic_with_error!(&env, VeilLendError::Unauthorized);
        }

        if price <= 0 {
            panic_with_error!(&env, VeilLendError::InvalidAmount);
        }

        admin.require_auth();
        env.storage()
            .persistent()
            .set(&DataKey::OraclePrice(asset.clone()), &price);
        OraclePriceSet { admin, asset, price }.publish(&env);
    }

    /// Get the oracle price for an asset.
    ///
    /// Returns the oracle price for the specified asset if set, otherwise `None`.
    ///
    /// # Arguments
    /// * `asset` - The asset address to get the price for
    ///
    /// # Returns
    /// * `Option<i128>` - The oracle price if set, None otherwise
    pub fn get_oracle_price(env: Env, asset: Address) -> Option<i128> {
        env.storage().persistent().get(&DataKey::OraclePrice(asset))
    }

    /// Record accumulated protocol fees for an asset (admin only, pause-checked).
    ///
    /// Increments the stored fee counter for the asset by `fee_amount` and emits
    /// a `protocol_fee_recorded` event. This entrypoint is pause-checked so fee
    /// accrual cannot be manipulated while the protocol is frozen.
    ///
    /// # Arguments
    /// * `admin`      - The admin address (must match stored admin)
    /// * `asset`      - The asset to record fees for
    /// * `fee_amount` - The additional fee to record (must be positive)
    pub fn record_protocol_fee(env: Env, admin: Address, asset: Address, fee_amount: i128) {
        Self::require_not_paused(&env);

        let stored_admin = Self::admin(env.clone());
        if admin != stored_admin {
            panic_with_error!(&env, VeilLendError::Unauthorized);
        }
        if fee_amount <= 0 {
            panic_with_error!(&env, VeilLendError::InvalidAmount);
        }

        admin.require_auth();

        let current: i128 = env
            .storage()
            .persistent()
            .get(&DataKey::ProtocolFee(asset.clone()))
            .unwrap_or(0);
        let total_accumulated = current + fee_amount;
        env.storage()
            .persistent()
            .set(&DataKey::ProtocolFee(asset.clone()), &total_accumulated);

        ProtocolFeeRecorded {
            admin,
            asset,
            fee_amount,
            total_accumulated,
        }
        .publish(&env);
    }

    /// Get accumulated protocol fees for an asset.
    pub fn get_protocol_fee(env: Env, asset: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::ProtocolFee(asset))
            .unwrap_or(0)
    }

    /// Advance per-asset interest accrual (permissionless, pause-checked).
    ///
    /// Applies a simple flat interest `interest_bps` (basis points) to all
    /// borrowers of the asset by recording the rate. This is a scaffold — a
    /// full implementation would iterate individual positions or use a global
    /// borrow index. It is pause-checked so the debt clock stops during a
    /// freeze, preventing unfair interest accumulation while users cannot act.
    ///
    /// # Arguments
    /// * `asset`        - The asset to accrue interest for
    /// * `interest_bps` - Interest rate in basis points (must be > 0)
    pub fn accrue_interest(env: Env, asset: Address, interest_bps: u32) {
        Self::require_not_paused(&env);

        if interest_bps == 0 {
            panic_with_error!(&env, VeilLendError::ZeroAmount);
        }

        // Scaffold: emitting the event is the on-chain record of an accrual
        // tick. Off-chain indexers or a future borrow-index migration will
        // consume this event to apply per-position interest.
        InterestAccrued { asset, interest_bps }.publish(&env);
    }

    // ── User actions (deposit/borrow pause-checked; repay/withdraw NOT) ──────

    /// Deposit an asset into the protocol (pause-checked).
    ///
    /// Blocked while paused to halt new capital inflows during an incident.
    // This scaffold tracks protocol state first; token transfers and privacy proofs
    // can be layered on top once the Stellar asset integrations are finalized.
    pub fn deposit(env: Env, user: Address, asset: Address, amount: i128) {
        Self::require_not_paused(&env);
        Self::require_supported_asset(&env, &asset);
        Self::require_positive_amount(&env, amount);
        user.require_auth();

        let mut position = Self::read_position(&env, &user, &asset);
        position.deposited += amount;
        Self::write_position(&env, &user, &asset, &position);

        DepositEvent {
            user,
            asset,
            amount,
        }
        .publish(&env);
    }

    /// Borrow against deposited collateral (pause-checked).
    ///
    /// Blocked while paused to prevent new debt creation during an incident.
    pub fn borrow(env: Env, user: Address, asset: Address, amount: i128) {
        Self::require_not_paused(&env);
        Self::require_supported_asset(&env, &asset);
        Self::require_positive_amount(&env, amount);
        user.require_auth();

        let mut position = Self::read_position(&env, &user, &asset);
        position.borrowed += amount;
        Self::assert_collateralized(&env, &user, &asset, &position);
        Self::write_position(&env, &user, &asset, &position);

        BorrowEvent {
            user,
            asset,
            amount,
        }
        .publish(&env);
    }

    /// Repay outstanding debt (intentionally NOT pause-checked).
    ///
    /// Users must always be able to reduce their debt even while the contract
    /// is paused. Blocking repay would trap users in leveraged positions during
    /// exactly the incident scenarios where pausing is most likely.
    pub fn repay(env: Env, user: Address, asset: Address, amount: i128) {
        Self::require_supported_asset(&env, &asset);
        Self::require_positive_amount(&env, amount);
        user.require_auth();

        let mut position = Self::read_position(&env, &user, &asset);
        if amount > position.borrowed {
            panic_with_error!(&env, VeilLendError::RepayTooLarge);
        }

        position.borrowed -= amount;
        Self::write_position(&env, &user, &asset, &position);

        RepayEvent {
            user,
            asset,
            amount,
        }
        .publish(&env);
    }

    /// Withdraw deposited collateral (intentionally NOT pause-checked).
    ///
    /// Users must always be able to exit their positions. Blocking withdrawals
    /// during a pause would be worse than allowing controlled exits, and could
    /// constitute loss-of-funds for honest users caught in an incident.
    pub fn withdraw(env: Env, user: Address, asset: Address, amount: i128) {
        Self::require_supported_asset(&env, &asset);
        Self::require_positive_amount(&env, amount);
        user.require_auth();

        let mut position = Self::read_position(&env, &user, &asset);
        if amount > position.deposited {
            panic_with_error!(&env, VeilLendError::InsufficientDeposit);
        }

        position.deposited -= amount;
        Self::assert_collateralized(&env, &user, &asset, &position);
        Self::write_position(&env, &user, &asset, &position);

        WithdrawEvent {
            user,
            asset,
            amount,
        }
        .publish(&env);
    }

    // ── Read-only accessors ───────────────────────────────────────────────────

    pub fn get_position(env: Env, user: Address, asset: Address) -> Position {
        Self::read_position(&env, &user, &asset)
    }

    pub fn is_asset_supported(env: Env, asset: Address) -> bool {
        env.storage()
            .persistent()
            .get(&DataKey::SupportedAsset(asset))
            .unwrap_or(false)
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
}

// ─── Private helpers ─────────────────────────────────────────────────────────

impl VeilLendContract {
    /// Panic with [`VeilLendError::ContractPaused`] if the contract is paused.
    ///
    /// Called at the **top** of every state-mutating entrypoint that should be
    /// frozen during an incident (see the pause table in [`VeilLendError`]).
    /// `set_paused` itself is intentionally excluded.
    fn require_not_paused(env: &Env) {
        let paused: bool = env
            .storage()
            .instance()
            .get(&DataKey::Paused)
            .unwrap_or(false);
        if paused {
            panic_with_error!(env, VeilLendError::ContractPaused);
        }
    }

    fn read_position(env: &Env, user: &Address, asset: &Address) -> Position {
        env.storage()
            .persistent()
            .get(&DataKey::Position(user.clone(), asset.clone()))
            .unwrap_or(Position {
                deposited: 0,
                borrowed: 0,
            })
    }

    fn write_position(env: &Env, user: &Address, asset: &Address, position: &Position) {
        env.storage()
            .persistent()
            .set(&DataKey::Position(user.clone(), asset.clone()), position);
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

// ─── Tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::{Address, Env};

    // ── Helpers ──────────────────────────────────────────────────────────────

    /// Set up a fresh environment with the contract registered and initialised.
    /// Returns `(env, contract_id, admin_address, asset_address)`.
    fn setup() -> (Env, Address, Address, Address) {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let asset = Address::generate(&env);

        // Pass constructor args via env.register so the Soroban-generated client
        // can call them through the normal contract dispatch path.
        let contract_id = env.register(VeilLendContract, (&admin, 15_000_u32));
        let client = VeilLendContractClient::new(&env, &contract_id);

        client.configure_asset(&admin, &asset, &true);
        client.set_oracle_price(&admin, &asset, &100);

        (env, contract_id, admin, asset)
    }

    /// Return a client bound to the given env/contract.
    fn client<'a>(
        env: &'a Env,
        contract_id: &'a Address,
    ) -> VeilLendContractClient<'a> {
        VeilLendContractClient::new(env, contract_id)
    }

    // ── Unit tests (error codes and pure logic) ───────────────────────────────

    #[test]
    fn test_position_creation() {
        let position = Position {
            deposited: 1000,
            borrowed: 500,
        };
        assert_eq!(position.deposited, 1000);
        assert_eq!(position.borrowed, 500);
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
    }

    #[test]
    fn test_error_variants_are_unique() {
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
        ];
        let mut sorted = codes.to_vec();
        sorted.sort();
        sorted.dedup();
        assert_eq!(sorted.len(), codes.len(), "Duplicate error codes detected");
    }

    #[test]
    fn test_zero_amount_distinct_from_invalid() {
        assert_ne!(
            VeilLendError::ZeroAmount as u32,
            VeilLendError::InvalidAmount as u32,
            "ZeroAmount and InvalidAmount must be distinct error codes"
        );
    }

    #[test]
    fn test_not_initialized_distinct_from_unauthorized() {
        assert_ne!(
            VeilLendError::NotInitialized as u32,
            VeilLendError::Unauthorized as u32,
            "NotInitialized and Unauthorized must be distinct error codes"
        );
    }

    // ── Host tests: initialisation ────────────────────────────────────────────

    #[test]
    fn test_initialize() {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let contract_id = env.register(VeilLendContract, (&admin, 15_000_u32));
        let c = VeilLendContractClient::new(&env, &contract_id);

        assert_eq!(c.admin(), admin);
        assert_eq!(c.min_collateral_ratio_bps(), 15_000);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #8)")]
    fn test_min_collateral_ratio() {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        // Passing a ratio below 10_000 (100%) must panic with InvalidCollateralRatio
        env.register(VeilLendContract, (&admin, 9_999_u32));
    }

    // ── Host tests: configure_asset (pause-checked) ───────────────────────────

    #[test]
    fn test_configure_asset() {
        let (env, cid, _admin, asset) = setup();
        let c = client(&env, &cid);
        assert!(c.is_asset_supported(&asset));
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #12)")]
    fn test_configure_asset_blocked_while_paused() {
        let (env, cid, admin, _) = setup();
        let c = client(&env, &cid);
        let new_asset = Address::generate(&env);

        c.set_paused(&admin, &true);
        // Must panic with ContractPaused (code 12)
        c.configure_asset(&admin, &new_asset, &true);
    }

    // ── Host tests: update_asset_caps (pause-checked) ─────────────────────────

    #[test]
    fn test_update_asset_caps() {
        let (env, cid, admin, asset) = setup();
        let c = client(&env, &cid);

        c.update_asset_caps(&admin, &asset, &1_000_000, &500_000);
        let caps = c.get_asset_caps(&asset);
        assert_eq!(caps.deposit_cap, 1_000_000);
        assert_eq!(caps.borrow_cap, 500_000);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #12)")]
    fn test_update_asset_caps_blocked_while_paused() {
        let (env, cid, admin, asset) = setup();
        let c = client(&env, &cid);

        c.set_paused(&admin, &true);
        // Must panic with ContractPaused (code 12)
        c.update_asset_caps(&admin, &asset, &1_000_000, &500_000);
    }

    // ── Host tests: set_oracle_price (pause-checked) ──────────────────────────

    #[test]
    fn test_oracle_price() {
        let (env, cid, admin, asset) = setup();
        let c = client(&env, &cid);

        c.set_oracle_price(&admin, &asset, &200);
        assert_eq!(c.get_oracle_price(&asset), Some(200));
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #12)")]
    fn test_set_oracle_price_blocked_while_paused() {
        let (env, cid, admin, asset) = setup();
        let c = client(&env, &cid);

        c.set_paused(&admin, &true);
        // Must panic with ContractPaused (code 12)
        c.set_oracle_price(&admin, &asset, &999);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #2)")]
    fn test_set_oracle_price_unauthorized() {
        let (env, cid, _, asset) = setup();
        let c = client(&env, &cid);
        let not_admin = Address::generate(&env);

        c.set_oracle_price(&not_admin, &asset, &100);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #4)")]
    fn test_set_oracle_price_invalid_price() {
        let (env, cid, admin, asset) = setup();
        let c = client(&env, &cid);

        c.set_oracle_price(&admin, &asset, &0);
    }

    #[test]
    fn test_get_oracle_price_not_set() {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let asset = Address::generate(&env);
        let contract_id = env.register(VeilLendContract, (&admin, 15_000_u32));
        let c = VeilLendContractClient::new(&env, &contract_id);

        assert_eq!(c.get_oracle_price(&asset), None);
    }

    // ── Host tests: record_protocol_fee (pause-checked) ───────────────────────

    #[test]
    fn test_record_protocol_fee() {
        let (env, cid, admin, asset) = setup();
        let c = client(&env, &cid);

        c.record_protocol_fee(&admin, &asset, &500);
        assert_eq!(c.get_protocol_fee(&asset), 500);

        c.record_protocol_fee(&admin, &asset, &250);
        assert_eq!(c.get_protocol_fee(&asset), 750);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #12)")]
    fn test_record_protocol_fee_blocked_while_paused() {
        let (env, cid, admin, asset) = setup();
        let c = client(&env, &cid);

        c.set_paused(&admin, &true);
        // Must panic with ContractPaused (code 12)
        c.record_protocol_fee(&admin, &asset, &500);
    }

    // ── Host tests: accrue_interest (pause-checked) ───────────────────────────

    #[test]
    fn test_accrue_interest() {
        let (env, cid, _, asset) = setup();
        let c = client(&env, &cid);

        // Should not panic when unpaused
        c.accrue_interest(&asset, &100);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #12)")]
    fn test_accrue_interest_blocked_while_paused() {
        let (env, cid, admin, asset) = setup();
        let c = client(&env, &cid);

        c.set_paused(&admin, &true);
        // Must panic with ContractPaused (code 12)
        c.accrue_interest(&asset, &100);
    }

    // ── Host tests: deposit (pause-checked) ───────────────────────────────────

    #[test]
    fn test_deposit() {
        let (env, cid, _, asset) = setup();
        let c = client(&env, &cid);
        let user = Address::generate(&env);

        c.deposit(&user, &asset, &1_000);
        assert_eq!(c.get_position(&user, &asset).deposited, 1_000);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #12)")]
    fn test_deposit_blocked_while_paused() {
        let (env, cid, admin, asset) = setup();
        let c = client(&env, &cid);
        let user = Address::generate(&env);

        c.set_paused(&admin, &true);
        // Must panic with ContractPaused (code 12)
        c.deposit(&user, &asset, &1_000);
    }

    // ── Host tests: borrow (pause-checked) ────────────────────────────────────

    #[test]
    fn test_borrow_with_oracle_price() {
        let (env, cid, _, asset) = setup();
        let c = client(&env, &cid);
        let user = Address::generate(&env);

        c.deposit(&user, &asset, &2_000);
        c.borrow(&user, &asset, &1_000);
        let pos = c.get_position(&user, &asset);
        assert_eq!(pos.deposited, 2_000);
        assert_eq!(pos.borrowed, 1_000);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #12)")]
    fn test_borrow_blocked_while_paused() {
        let (env, cid, admin, asset) = setup();
        let c = client(&env, &cid);
        let user = Address::generate(&env);

        c.deposit(&user, &asset, &2_000);
        c.set_paused(&admin, &true);
        // Must panic with ContractPaused (code 12)
        c.borrow(&user, &asset, &1_000);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #5)")]
    fn test_borrow_exceeds_oracle_collateral_limit() {
        let (env, cid, _, asset) = setup();
        let c = client(&env, &cid);
        let user = Address::generate(&env);

        c.deposit(&user, &asset, &1_000);
        // Trying to borrow more than collateral allows (150% ratio required)
        c.borrow(&user, &asset, &900);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #5)")]
    fn test_withdraw_exceeds_oracle_collateral_limit() {
        let (env, cid, _, asset) = setup();
        let c = client(&env, &cid);
        let user = Address::generate(&env);

        c.deposit(&user, &asset, &2_000);
        c.borrow(&user, &asset, &1_000);
        // Withdrawing 1500 would drop collateral below minimum ratio
        c.withdraw(&user, &asset, &1_500);
    }

    // ── Host tests: repay/withdraw succeed while paused (intentional gaps) ────

    #[test]
    fn test_repay_succeeds_while_paused() {
        let (env, cid, admin, asset) = setup();
        let c = client(&env, &cid);
        let user = Address::generate(&env);

        c.deposit(&user, &asset, &2_000);
        c.borrow(&user, &asset, &1_000);

        // Pause the contract
        c.set_paused(&admin, &true);
        assert!(c.is_paused());

        // repay must succeed even while paused
        c.repay(&user, &asset, &500);
        assert_eq!(c.get_position(&user, &asset).borrowed, 500);
    }

    #[test]
    fn test_withdraw_succeeds_while_paused() {
        let (env, cid, admin, asset) = setup();
        let c = client(&env, &cid);
        let user = Address::generate(&env);

        c.deposit(&user, &asset, &2_000);

        // Pause the contract
        c.set_paused(&admin, &true);
        assert!(c.is_paused());

        // withdraw must succeed even while paused
        c.withdraw(&user, &asset, &1_000);
        assert_eq!(c.get_position(&user, &asset).deposited, 1_000);
    }

    // ── Host test: set_paused itself is never blocked ─────────────────────────

    #[test]
    fn test_set_paused_and_unpause() {
        let (env, cid, admin, _) = setup();
        let c = client(&env, &cid);

        assert!(!c.is_paused());

        c.set_paused(&admin, &true);
        assert!(c.is_paused());

        // Admin can always unpause
        c.set_paused(&admin, &false);
        assert!(!c.is_paused());
    }

    // ── Host test: oracle_price_default_to_one (legacy compatibility) ─────────

    #[test]
    fn test_oracle_price_default_to_one() {
        // Price defaults to missing (None), not to 1 — this test documents
        // the explicit "no silent default" policy.
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let asset = Address::generate(&env);
        let contract_id = env.register(VeilLendContract, (&admin, 15_000_u32));
        let c = VeilLendContractClient::new(&env, &contract_id);

        assert_eq!(c.get_oracle_price(&asset), None);
    }
}
