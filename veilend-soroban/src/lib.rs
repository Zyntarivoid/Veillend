#![no_std]

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, panic_with_error, Address,
    Env, String,
};

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
    AlreadyInitialized = 1,
    Unauthorized = 2,
    UnsupportedAsset = 3,
    InvalidAmount = 4,
    InsufficientCollateral = 5,
    InsufficientDeposit = 6,
    RepayTooLarge = 7,
    InvalidCollateralRatio = 8,
}

impl VeilLendError {
    pub const fn message(self) -> &'static str {
        match self {
            VeilLendError::AlreadyInitialized => "Contract has already been initialized.",
            VeilLendError::Unauthorized => "Caller is not authorized for this protocol action.",
            VeilLendError::UnsupportedAsset => "Asset is not configured as supported.",
            VeilLendError::InvalidAmount => "Amount must be greater than zero.",
            VeilLendError::InsufficientCollateral => {
                "Action would violate the minimum collateral ratio."
            }
            VeilLendError::InsufficientDeposit => "Withdraw amount exceeds deposited balance.",
            VeilLendError::RepayTooLarge => "Repay amount exceeds outstanding debt.",
            VeilLendError::InvalidCollateralRatio => {
                "Minimum collateral ratio must be at least 10000 basis points."
            }
        }
    }

    pub const fn message_for_code(code: u32) -> &'static str {
        match code {
            1 => VeilLendError::AlreadyInitialized.message(),
            2 => VeilLendError::Unauthorized.message(),
            3 => VeilLendError::UnsupportedAsset.message(),
            4 => VeilLendError::InvalidAmount.message(),
            5 => VeilLendError::InsufficientCollateral.message(),
            6 => VeilLendError::InsufficientDeposit.message(),
            7 => VeilLendError::RepayTooLarge.message(),
            8 => VeilLendError::InvalidCollateralRatio.message(),
            _ => "Unknown VeilLend error code.",
        }
    }
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
        Self::require_admin(&env, &admin);
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
        Self::require_admin(&env, &admin);

        if price <= 0 {
            panic_with_error!(&env, VeilLendError::InvalidAmount);
        }

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
            .unwrap_or_else(|| panic_with_error!(&env, VeilLendError::Unauthorized))
    }

    pub fn min_collateral_ratio_bps(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::MinCollateralRatioBps)
            .unwrap_or(15_000)
    }

    pub fn error_message(env: Env, code: u32) -> String {
        String::from_str(&env, VeilLendError::message_for_code(code))
    }
}

impl VeilLendContract {
    fn require_admin(env: &Env, admin: &Address) {
        let stored_admin = Self::admin(env.clone());
        if admin != &stored_admin {
            panic_with_error!(env, VeilLendError::Unauthorized);
        }

        admin.require_auth();
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
        if amount <= 0 {
            panic_with_error!(env, VeilLendError::InvalidAmount);
        }
    }

    fn assert_collateralized(env: &Env, _user: &Address, asset: &Address, position: &Position) {
        if position.borrowed == 0 {
            return;
        }

        let collateral_ratio_bps = Self::min_collateral_ratio_bps(env.clone()) as i128;

        // Get oracle price for the asset
        let price = env
            .storage()
            .persistent()
            .get(&DataKey::OraclePrice(asset.clone()))
            .unwrap_or(1); // Default to 1 if no price set (raw amount comparison)

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
    use soroban_sdk::testutils::Address as _;

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
    }

    #[test]
    fn test_error_messages() {
        assert_eq!(
            VeilLendError::UnsupportedAsset.message(),
            "Asset is not configured as supported."
        );
        assert_eq!(
            VeilLendError::message_for_code(VeilLendError::RepayTooLarge as u32),
            "Repay amount exceeds outstanding debt."
        );
        assert_eq!(
            VeilLendError::message_for_code(999),
            "Unknown VeilLend error code."
        );
    }

    #[test]
    fn test_error_message_contract_method() {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let contract_id = env.register(VeilLendContract, (admin, 15_000u32));
        let client = VeilLendContractClient::new(&env, &contract_id);

        assert_eq!(
            client.error_message(&4),
            String::from_str(&env, "Amount must be greater than zero.")
        );
        assert_eq!(
            client.error_message(&999),
            String::from_str(&env, "Unknown VeilLend error code.")
        );
    }
}
