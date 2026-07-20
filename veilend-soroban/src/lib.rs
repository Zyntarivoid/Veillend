#![no_std]

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, panic_with_error,
    symbol_short, Address, Env, Symbol,
};

/// Increment this only when a contract interface change requires consumers to adapt.
pub const CONTRACT_VERSION: u32 = 1;

/// Increment this only when the serialized `DataKey` or stored value layout changes.
pub const STORAGE_SCHEMA_VERSION: u32 = 1;

/// A compact, stable identifier for the current `DataKey` storage layout.
const STORAGE_SCHEMA_ID: Symbol = symbol_short!("VLENDV1");

/// Queryable metadata describing the contract interface and its storage layout.
#[derive(Clone, Debug, Eq, PartialEq)]
#[contracttype]
pub struct ContractMetadata {
    pub contract_version: u32,
    pub storage_schema_version: u32,
    pub storage_schema_id: Symbol,
}

/// Keys and value shapes that make up storage schema `VLENDV1`.
///
/// Instance storage: `Admin: Address`, `MinCollateralRatioBps: u32`.
/// Persistent storage: `SupportedAsset(Address): bool`,
/// `Position(Address, Address): Position`, and `OraclePrice(Address): i128`.
#[derive(Clone)]
#[contracttype]
pub enum DataKey {
    Admin,
    MinCollateralRatioBps,
    SupportedAsset(Address),
    Position(Address, Address),
    OraclePrice(Address),
}

#[derive(Clone, Debug, Eq, PartialEq)]
#[contracttype]
pub struct Position {
    pub deposited: i128,
    pub borrowed: i128,
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
    }

    pub fn configure_asset(env: Env, admin: Address, asset: Address, supported: bool) {
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
        env.storage()
            .persistent()
            .set(&DataKey::OraclePrice(asset.clone()), &price);
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

    // This scaffold tracks protocol state first; token transfers and privacy proofs
    // can be layered on top once the Stellar asset integrations are finalized.
    pub fn deposit(env: Env, user: Address, asset: Address, amount: i128) {
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

    pub fn borrow(env: Env, user: Address, asset: Address, amount: i128) {
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

impl VeilLendContract {
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

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, testutils::Env as _};

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
    fn test_contract_metadata_identifies_current_storage_shape() {
        let metadata = VeilLendContract::contract_metadata(Env::default());

        assert_eq!(metadata.contract_version, 1);
        assert_eq!(metadata.storage_schema_version, 1);
        assert_eq!(metadata.storage_schema_id, symbol_short!("VLENDV1"));
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

    #[test]
    fn test_initialize() {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000_u32));
        let client = VeilLendContractClient::new(&env, &contract_id);

        assert_eq!(client.admin(), admin);
        assert_eq!(client.min_collateral_ratio_bps(), 15_000);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #1)")]
    fn test_initialize_twice() {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000_u32));
        
        // Trying to initialize again should fail
        VeilLendContract::__constructor(env, admin.clone(), 20_000);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #8)")]
    fn test_constructor_rejects_invalid_min_collateral_ratio() {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let _contract_id = env.register(VeilLendContract, (admin, 9_999_u32));
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #2)")]
    fn test_configure_asset_rejects_unauthorized_admin() {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let unauthorized = Address::generate(&env);
        let asset = Address::generate(&env);
        let contract_id = env.register(VeilLendContract, (admin, 15_000_u32));
        let client = VeilLendContractClient::new(&env, &contract_id);

        client.configure_asset(&unauthorized, &asset, &true);
    }

    #[test]
    fn test_supported_asset_reads_default_false_and_updates_after_configuration() {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let asset = Address::generate(&env);
        let other_asset = Address::generate(&env);
        let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000_u32));
        let client = VeilLendContractClient::new(&env, &contract_id);

        assert!(!client.is_asset_supported(&asset));
        assert!(!client.is_asset_supported(&other_asset));

        client.configure_asset(&admin, &asset, &true);

        assert!(client.is_asset_supported(&asset));
        assert!(!client.is_asset_supported(&other_asset));

        client.configure_asset(&admin, &asset, &false);

        assert!(!client.is_asset_supported(&asset));
    }

    #[test]
    fn test_set_oracle_price() {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let asset = Address::generate(&env);
        let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000_u32));
        let client = VeilLendContractClient::new(&env, &contract_id);

        assert_eq!(client.get_oracle_price(&asset), None);
        client.set_oracle_price(&admin, &asset, &100);
        assert_eq!(client.get_oracle_price(&asset), Some(100));
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #4)")]
    fn test_set_oracle_price_invalid_price() {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let asset = Address::generate(&env);
        let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000_u32));
        let client = VeilLendContractClient::new(&env, &contract_id);

        client.set_oracle_price(&admin, &asset, &0);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #2)")]
    fn test_set_oracle_price_unauthorized() {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let unauthorized = Address::generate(&env);
        let asset = Address::generate(&env);
        let contract_id = env.register(VeilLendContract, (admin, 15_000_u32));
        let client = VeilLendContractClient::new(&env, &contract_id);

        client.set_oracle_price(&unauthorized, &asset, &100);
    }

    #[test]
    fn test_get_oracle_price_not_set() {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let asset = Address::generate(&env);
        let contract_id = env.register(VeilLendContract, (admin, 15_000_u32));
        let client = VeilLendContractClient::new(&env, &contract_id);

        assert_eq!(client.get_oracle_price(&asset), None);
    }

    #[test]
    fn test_min_collateral_ratio() {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let contract_id = env.register(VeilLendContract, (admin.clone(), 20_000_u32));
        let client = VeilLendContractClient::new(&env, &contract_id);

        assert_eq!(client.min_collateral_ratio_bps(), 20_000);
    }

    #[test]
    fn test_oracle_price() {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let asset = Address::generate(&env);
        let user = Address::generate(&env);
        let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000_u32));
        let client = VeilLendContractClient::new(&env, &contract_id);

        client.configure_asset(&admin, &asset, &true);
        client.set_oracle_price(&admin, &asset, &100);
        client.deposit(&user, &asset, &1000);
        client.borrow(&user, &asset, &500);

        let position = client.get_position(&user, &asset);
        assert_eq!(position.deposited, 1000);
        assert_eq!(position.borrowed, 500);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #5)")]
    fn test_borrow_exceeds_oracle_collateral_limit() {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let asset = Address::generate(&env);
        let user = Address::generate(&env);
        let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000_u32));
        let client = VeilLendContractClient::new(&env, &contract_id);

        client.configure_asset(&admin, &asset, &true);
        client.set_oracle_price(&admin, &asset, &100);
        client.deposit(&user, &asset, &1000);
        client.borrow(&user, &asset, &700);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #5)")]
    fn test_withdraw_exceeds_oracle_collateral_limit() {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let asset = Address::generate(&env);
        let user = Address::generate(&env);
        let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000_u32));
        let client = VeilLendContractClient::new(&env, &contract_id);

        client.configure_asset(&admin, &asset, &true);
        client.set_oracle_price(&admin, &asset, &100);
        client.deposit(&user, &asset, &1000);
        client.borrow(&user, &asset, &500);
        client.withdraw(&user, &asset, &400);
    }



    #[test]
    #[should_panic(expected = "Error(Contract, #3)")]
    fn test_deposit_unsupported_asset() {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let asset = Address::generate(&env);
        let user = Address::generate(&env);
        let contract_id = env.register(VeilLendContract, (admin, 15_000_u32));
        let client = VeilLendContractClient::new(&env, &contract_id);

        client.deposit(&user, &asset, &1000);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #10)")]
    fn test_deposit_zero_amount() {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let asset = Address::generate(&env);
        let user = Address::generate(&env);
        let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000_u32));
        let client = VeilLendContractClient::new(&env, &contract_id);

        client.configure_asset(&admin, &asset, &true);
        client.deposit(&user, &asset, &0);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #4)")]
    fn test_deposit_negative_amount() {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let asset = Address::generate(&env);
        let user = Address::generate(&env);
        let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000_u32));
        let client = VeilLendContractClient::new(&env, &contract_id);

        client.configure_asset(&admin, &asset, &true);
        client.deposit(&user, &asset, &-100);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #6)")]
    fn test_withdraw_insufficient_deposit() {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let asset = Address::generate(&env);
        let user = Address::generate(&env);
        let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000_u32));
        let client = VeilLendContractClient::new(&env, &contract_id);

        client.configure_asset(&admin, &asset, &true);
        client.set_oracle_price(&admin, &asset, &100);
        client.deposit(&user, &asset, &500);
        client.withdraw(&user, &asset, &600);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #9)")]
    fn test_not_initialized_admin() {
        let env = Env::default();
        let contract_id = env.register_contract(VeilLendContract);
        let client = VeilLendContractClient::new(&env, &contract_id);
        client.admin();
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #11)")]
    fn test_borrow_oracle_price_missing() {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let asset = Address::generate(&env);
        let user = Address::generate(&env);
        let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000_u32));
        let client = VeilLendContractClient::new(&env, &contract_id);

        client.configure_asset(&admin, &asset, &true);
        client.deposit(&user, &asset, &1000);
        client.borrow(&user, &asset, &500);
    }

    #[test]
    fn test_repay_normal() {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let asset = Address::generate(&env);
        let user = Address::generate(&env);
        let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000_u32));
        let client = VeilLendContractClient::new(&env, &contract_id);

        client.configure_asset(&admin, &asset, &true);
        client.set_oracle_price(&admin, &asset, &100);
        client.deposit(&user, &asset, &1000);
        client.borrow(&user, &asset, &500);
        client.repay(&user, &asset, &300);

        let position = client.get_position(&user, &asset);
        assert_eq!(position.deposited, 1000);
        assert_eq!(position.borrowed, 200);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #7)")]
    fn test_repay_too_large() {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let asset = Address::generate(&env);
        let user = Address::generate(&env);
        let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000_u32));
        let client = VeilLendContractClient::new(&env, &contract_id);

        client.configure_asset(&admin, &asset, &true);
        client.set_oracle_price(&admin, &asset, &100);
        client.deposit(&user, &asset, &1000);
        client.borrow(&user, &asset, &500);
        client.repay(&user, &asset, &600);
    }
}
