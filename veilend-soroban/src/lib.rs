#![no_std]

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, panic_with_error, Address,
    Env, Bytes, BytesN,
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
    InvalidCommitment = 9,
    InvalidNullifier = 10,
    ProofVerificationFailed = 11,
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

#[contractevent(topics = ["veillend", "shielded_deposit"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ShieldedDepositEvent {
    #[topic]
    pub commitment: BytesN<32>,
    #[topic]
    pub asset: Address,
    pub amount: i128,
    pub recipient: Address,
}

#[contractevent(topics = ["veillend", "shielded_withdraw"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ShieldedWithdrawEvent {
    #[topic]
    pub nullifier: BytesN<32>,
    #[topic]
    pub asset: Address,
    pub amount: i128,
    pub recipient: Address,
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

    // ==================
    // PRIVATE DEPOSIT/WITHDRAW FUNCTIONS
    // ==================

    /// Shielded Deposit: Deposit assets using a privacy commitment
    ///
    /// This function is part of the VeilLend privacy roadmap. It allows users to deposit assets
    /// using a privacy-preserving commitment. In future phases, this will verify a ZK proof
    /// that the user owns the commitment without revealing sensitive information.
    ///
    /// # Flow Assumptions (Privacy Roadmap)
    /// 1. User has already created a commitment in a shielded pool contract
    /// 2. In Phase 2, this will verify a ZK proof proving:
    ///    - The user owns the commitment
    ///    - The commitment contains the correct asset and amount
    ///    - The commitment hasn't been spent before
    /// 3. In Phase 3, this will fully integrate with a ZK-SNARK/STARK system for complete privacy
    /// 4. For now, this function maintains compatibility with the existing lending scaffold
    ///
    /// # Arguments
    /// * `commitment` - The commitment hash (32 bytes) representing the shielded deposit
    /// * `asset` - The asset address being deposited
    /// * `amount` - The amount to deposit
    /// * `recipient` - The address to receive the lending position
    pub fn deposit_shielded(
        env: Env,
        commitment: BytesN<32>,
        asset: Address,
        amount: i128,
        recipient: Address,
    ) {
        Self::require_supported_asset(&env, &asset);
        Self::require_positive_amount(&env, &amount);

        // ==================
        // FUTURE: ZK PROOF VERIFICATION (Phase 2+)
        // ==================
        // This is where we will call a verifier contract to validate the ZK proof
        // For now, we skip proof verification to maintain scaffold compatibility
        // ==================

        // Check commitment is not all zeros
        let zero_bytes = BytesN::<32>::from_array(&env, &[0u8; 32]);
        if commitment == zero_bytes {
            panic_with_error!(&env, VeilLendError::InvalidCommitment);
        }

        // Update recipient's position
        let mut position = Self::read_position(&env, &recipient, &asset);
        position.deposited += amount;
        Self::write_position(&env, &recipient, &asset, &position);

        ShieldedDepositEvent {
            commitment,
            asset,
            amount,
            recipient,
        }
        .publish(&env);
    }

    /// Shielded Withdraw: Withdraw assets using a privacy nullifier
    ///
    /// This function is part of the VeilLend privacy roadmap. It allows users to withdraw assets
    /// using a privacy-preserving nullifier. In future phases, this will verify a ZK proof
    /// that the user owns the assets without revealing sensitive information.
    ///
    /// # Flow Assumptions (Privacy Roadmap)
    /// 1. User has a lending position (from public or shielded deposit)
    /// 2. In Phase 2, this will verify a ZK proof proving:
    ///    - The user owns the lending position
    ///    - The nullifier hasn't been used before
    ///    - The Merkle proof is valid (if applicable)
    /// 3. In Phase 3, this will fully integrate with a ZK-SNARK/STARK system for complete privacy
    /// 4. For now, this function maintains compatibility with the existing lending scaffold
    ///
    /// # Arguments
    /// * `nullifier` - The nullifier hash (32 bytes) to prevent double spending
    /// * `asset` - The asset address being withdrawn
    /// * `amount` - The amount to withdraw
    /// * `recipient` - The address to receive the withdrawn assets
    /// * `user` - The user who owns the lending position (will be replaced with proof in Phase 2)
    pub fn withdraw_shielded(
        env: Env,
        nullifier: BytesN<32>,
        asset: Address,
        amount: i128,
        recipient: Address,
        user: Address,
    ) {
        Self::require_supported_asset(&env, &asset);
        Self::require_positive_amount(&env, &amount);

        // ==================
        // FUTURE: ZK PROOF VERIFICATION (Phase 2+)
        // ==================
        // This is where we will call a verifier contract to validate the ZK proof
        // For now, we require user auth to maintain scaffold compatibility
        // ==================
        user.require_auth();

        // Check nullifier is not all zeros
        let zero_bytes = BytesN::<32>::from_array(&env, &[0u8; 32]);
        if nullifier == zero_bytes {
            panic_with_error!(&env, VeilLendError::InvalidNullifier);
        }

        let mut position = Self::read_position(&env, &user, &asset);
        if amount > position.deposited {
            panic_with_error!(&env, VeilLendError::InsufficientDeposit);
        }

        position.deposited -= amount;
        Self::assert_collateralized(&env, &user, &asset, &position);
        Self::write_position(&env, &user, &asset, &position);

        ShieldedWithdrawEvent {
            nullifier,
            asset,
            amount,
            recipient,
        }
        .publish(&env);
    }

    // ==================
    // FUTURE PROOF VERIFICATION INTERFACES
    // ==================

    /// Verify a ZK proof (Reserved for future use)
    ///
    /// This interface is reserved for future ZK proof verification integration.
    /// It follows standard verifier contract patterns and will be implemented
    /// as part of the VeilLend privacy roadmap (Phase 2+).
    ///
    /// # Arguments
    /// * `proof_type` - The type of proof being verified (e.g., "deposit", "withdraw")
    /// * `proof` - The ZK proof data
    /// * `public_inputs` - The public inputs for the proof
    ///
    /// # Returns
    /// * `bool` - True if proof verifies, false otherwise
    pub fn verify_proof(env: Env, proof_type: Bytes, proof: Bytes, public_inputs: Bytes) -> bool {
        // ==================
        // FUTURE IMPLEMENTATION (Phase 2+)
        // ==================
        // This will call a dedicated verifier contract to verify the ZK proof
        // For now, returns true as a placeholder
        true
    }

    /// Set verifier contract address (Reserved for future use)
    ///
    /// This interface is reserved for future use to configure the verifier contract
    /// that will handle ZK proof verification (Phase 2+).
    pub fn set_verifier(env: Env, admin: Address, verifier: Address) {
        let stored_admin = Self::admin(env.clone());
        if admin != stored_admin {
            panic_with_error!(&env, VeilLendError::Unauthorized);
        }
        admin.require_auth();
        // FUTURE: Store verifier address in storage
    }

    // ==================
    // EXISTING FUNCTIONS
    // ==================

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
}
