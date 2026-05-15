use starknet::ContractAddress;
use crate::enums::enums::*;



#[derive(Drop, starknet::Event)]
pub struct ReserveConfigurationUpdated {
    pub asset: ContractAddress,
    pub optimal_utilization_rate: u256,
    pub base_variable_borrow_rate: u256,
    pub variable_rate_slope1: u256,
    pub variable_rate_slope2: u256,
    pub loan_to_value: u256,
    pub liquidation_threshold: u256,
    pub liquidation_bonus: u256,
    pub reserve_factor: u256,
    pub a_token_address: ContractAddress,
    pub variable_debt_token_address: ContractAddress,
    pub is_active: bool,
    pub is_frozen: bool,
    pub borrowing_enabled: bool,
}

#[derive(Drop, starknet::Event)]
pub struct ReserveStateUpdated {
    pub asset: ContractAddress,
    pub total_liquidity: u256,
    pub available_liquidity: u256,
    pub total_variable_debt: u256,
    pub liquidity_rate: u256,
    pub variable_borrow_rate: u256,
    pub liquidity_index: u256,
    pub variable_borrow_index: u256,
    pub last_update_timestamp: u64,
}

#[derive(Drop, starknet::Event)]
pub struct UserReserveDataUpdated {
    pub user: ContractAddress,
    pub asset: ContractAddress,
    pub scaled_a_token_balance: u256,
    pub scaled_variable_debt: u256,
    pub is_using_as_collateral: bool,
}



#[derive(Drop, starknet::Event)]
pub struct Deposit {
    pub reserve: ContractAddress,
    pub user: ContractAddress,
    pub on_behalf_of: ContractAddress,
    pub amount: u256,
    pub referral_code: u16,
}

#[derive(Drop, starknet::Event)]
pub struct Withdraw {
    pub reserve: ContractAddress,
    pub user: ContractAddress,
    pub to: ContractAddress,
    pub amount: u256,
}

#[derive(Drop, starknet::Event)]
pub struct Borrow {
    pub reserve: ContractAddress,
    pub user: ContractAddress,
    pub on_behalf_of: ContractAddress,
    pub amount: u256,
    pub interest_rate_mode: u8,
    pub borrow_rate: u256,
    pub referral_code: u16,
}

#[derive(Drop, starknet::Event)]
pub struct Repay {
    pub reserve: ContractAddress,
    pub user: ContractAddress,
    pub repayer: ContractAddress,
    pub amount: u256,
    pub use_a_tokens: bool,
}

#[derive(Drop, starknet::Event)]
pub struct ReserveDataUpdated {
    pub reserve: ContractAddress,
    pub liquidity_rate: u256,
    pub stable_borrow_rate: u256,
    pub variable_borrow_rate: u256,
    pub liquidity_index: u256,
    pub variable_borrow_index: u256,
}


#[derive(Drop, starknet::Event)]
pub struct Mint {
    pub caller: ContractAddress,
    pub on_behalf_of: ContractAddress,
    pub amount: u256,
    pub index: u256,
}

#[derive(Drop, starknet::Event)]
pub struct Burn {
    pub caller: ContractAddress,
    pub on_behalf_of: ContractAddress,
    pub amount: u256,
    pub index: u256,
}

#[derive(Drop, starknet::Event)]
pub struct IndexUpdated {
    pub old_index: u256,
    pub new_index: u256,
    pub timestamp: u64,
}



#[derive(Drop, starknet::Event)]
pub struct PriceUpdated {
    pub asset: ContractAddress,
    pub price: u256,
    pub timestamp: u64,
    pub updater: ContractAddress,
}

#[derive(Drop, starknet::Event)]
pub struct PriceSourceSet {
    pub asset: ContractAddress,
    pub source: ContractAddress,
}

#[derive(Drop, starknet::Event)]
pub struct StalenessThresholdUpdated {
    pub old_threshold: u64,
    pub new_threshold: u64,
}


#[derive(Drop, starknet::Event)]
pub struct ShieldedDeposit {
    pub commitment: felt252,
    pub asset: ContractAddress,
    pub amount: u256,
    pub depositor: ContractAddress,
    pub leaf_index: u64,
    pub timestamp: u64,
}

#[derive(Drop, starknet::Event)]
pub struct ShieldedWithdrawal {
    pub nullifier: felt252,
    pub recipient: ContractAddress,
    pub asset: ContractAddress,
    pub amount: u256,
    pub fee: u256,
    pub timestamp: u64,
}

#[derive(Drop, starknet::Event)]
pub struct MerkleRootUpdated {
    pub old_root: felt252,
    pub new_root: felt252,
    pub leaf_index: u64,
}

#[derive(Drop, starknet::Event)]
pub struct AssetAdded {
    pub asset: ContractAddress,
}

#[derive(Drop, starknet::Event)]
pub struct AssetRemoved {
    pub asset: ContractAddress,
}

#[derive(Drop, starknet::Event)]
pub struct EmergencyWithdrawal {
    pub recipient: ContractAddress,
    pub asset: ContractAddress,
    pub amount: u256,
}

#[derive(Drop, starknet::Event)]
pub struct Paused {
    pub caller: ContractAddress,
}

#[derive(Drop, starknet::Event)]
pub struct Unpaused {
    pub caller: ContractAddress,
}

