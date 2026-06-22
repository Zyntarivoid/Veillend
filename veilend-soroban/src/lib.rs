#![no_std]

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, panic_with_error, Address,
    Env,
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
    PositionNotLiquidatable = 9,
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

#[contractevent(topics = ["veillend", "liquidation"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LiquidationEvent {
    #[topic]
    pub liquidator: Address,
    #[topic]
    pub user: Address,
    #[topic]
    pub asset: Address,
    pub repaid_amount: i128,
    pub seized_amount: i128,
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

    pub fn liquidate(env: Env, liquidator: Address, user: Address, asset: Address, amount: i128) {
        Self::require_supported_asset(&env, &asset);
        Self::require_positive_amount(&env, amount);
        liquidator.require_auth();

        let mut position = Self::read_position(&env, &user, &asset);
        if !Self::is_liquidatable(&env, &asset, &position) {
            panic_with_error!(&env, VeilLendError::PositionNotLiquidatable);
        }
        if amount > position.borrowed {
            panic_with_error!(&env, VeilLendError::RepayTooLarge);
        }

        let seized_amount = if amount > position.deposited {
            position.deposited
        } else {
            amount
        };

        position.borrowed -= amount;
        position.deposited -= seized_amount;
        Self::write_position(&env, &user, &asset, &position);

        LiquidationEvent {
            liquidator,
            user,
            asset,
            repaid_amount: amount,
            seized_amount,
        }
        .publish(&env);
    }

    pub fn is_position_liquidatable(env: Env, user: Address, asset: Address) -> bool {
        let position = Self::read_position(&env, &user, &asset);
        Self::is_liquidatable(&env, &asset, &position)
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
        if amount <= 0 {
            panic_with_error!(env, VeilLendError::InvalidAmount);
        }
    }

    fn assert_collateralized(env: &Env, _user: &Address, asset: &Address, position: &Position) {
        if position.borrowed == 0 {
            return;
        }

        if Self::is_liquidatable(env, asset, position) {
            panic_with_error!(env, VeilLendError::InsufficientCollateral);
        }
    }

    fn is_liquidatable(env: &Env, asset: &Address, position: &Position) -> bool {
        if position.borrowed == 0 {
            return false;
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

        collateral_value * 10_000 < borrowed_value * collateral_ratio_bps
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::{Address as _, EnvTestConfig};

    fn test_env() -> Env {
        Env::new_with_config(EnvTestConfig {
            capture_snapshot_at_drop: false,
        })
    }

    fn create_contract(env: &Env) -> (Address, Address, VeilLendContractClient<'_>) {
        env.mock_all_auths();

        let admin = Address::generate(env);
        let contract_id = env.register(VeilLendContract, (&admin, &15_000u32));
        let client = VeilLendContractClient::new(env, &contract_id);

        (admin, contract_id, client)
    }

    fn write_test_position(
        env: &Env,
        contract_id: &Address,
        user: &Address,
        asset: &Address,
        position: Position,
    ) {
        env.as_contract(contract_id, || {
            VeilLendContract::write_position(env, user, asset, &position);
        });
    }

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
        assert_eq!(VeilLendError::PositionNotLiquidatable as u32, 9);
    }

    #[test]
    fn test_position_liquidatable_uses_collateral_ratio() {
        let env = test_env();
        let (admin, contract_id, client) = create_contract(&env);
        let user = Address::generate(&env);
        let asset = Address::generate(&env);

        client.configure_asset(&admin, &asset, &true);
        write_test_position(
            &env,
            &contract_id,
            &user,
            &asset,
            Position {
                deposited: 100,
                borrowed: 100,
            },
        );

        assert!(client.is_position_liquidatable(&user, &asset));
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #9)")]
    fn test_healthy_position_cannot_be_liquidated() {
        let env = test_env();
        let (admin, contract_id, client) = create_contract(&env);
        let liquidator = Address::generate(&env);
        let user = Address::generate(&env);
        let asset = Address::generate(&env);

        client.configure_asset(&admin, &asset, &true);
        write_test_position(
            &env,
            &contract_id,
            &user,
            &asset,
            Position {
                deposited: 150,
                borrowed: 100,
            },
        );

        assert!(!client.is_position_liquidatable(&user, &asset));
        client.liquidate(&liquidator, &user, &asset, &25);
    }

    #[test]
    fn test_liquidation_reduces_debt_and_collateral() {
        let env = test_env();
        let (admin, contract_id, client) = create_contract(&env);
        let liquidator = Address::generate(&env);
        let user = Address::generate(&env);
        let asset = Address::generate(&env);

        client.configure_asset(&admin, &asset, &true);
        write_test_position(
            &env,
            &contract_id,
            &user,
            &asset,
            Position {
                deposited: 100,
                borrowed: 100,
            },
        );

        client.liquidate(&liquidator, &user, &asset, &40);

        assert_eq!(
            client.get_position(&user, &asset),
            Position {
                deposited: 60,
                borrowed: 60,
            }
        );
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #7)")]
    fn test_liquidation_rejects_repay_above_debt() {
        let env = test_env();
        let (admin, contract_id, client) = create_contract(&env);
        let liquidator = Address::generate(&env);
        let user = Address::generate(&env);
        let asset = Address::generate(&env);

        client.configure_asset(&admin, &asset, &true);
        write_test_position(
            &env,
            &contract_id,
            &user,
            &asset,
            Position {
                deposited: 100,
                borrowed: 100,
            },
        );

        client.liquidate(&liquidator, &user, &asset, &125);
    }
}
