use starknet::ContractAddress;

use crate::structs::structs::*;
use crate::enums::enums::*;


// #[starknet::interface]
// pub trait IPriceOracle<TContractState> {
//     fn get_price(self: @TContractState, asset: ContractAddress) -> u256;
//     fn get_prices(self: @TContractState, assets: Array<ContractAddress>) -> Array<u256>;
// }


#[starknet::interface]
pub trait ILendingPool<TContractState> {
    fn deposit(
        ref self: TContractState,
        asset: ContractAddress,
        amount: u256,
        on_behalf_of: ContractAddress
    );
    fn withdraw(
        ref self: TContractState,
        asset: ContractAddress,
        amount: u256,
        to: ContractAddress
    );
    fn borrow(
        ref self: TContractState,
        asset: ContractAddress,
        amount: u256,
        interest_rate_mode: u8,
        on_behalf_of: ContractAddress
    );
    fn repay(
        ref self: TContractState,
        asset: ContractAddress,
        amount: u256,
        interest_rate_mode: u8,
        on_behalf_of: ContractAddress
    );
    fn get_user_account_data(
        self: @TContractState,
        user: ContractAddress
    ) -> (u256, u256, u256, u256, u256, u8);
}


#[starknet::interface]
pub trait IReserveData<TContractState> {
    fn set_reserve_config(
        ref self: TContractState,
        asset: ContractAddress,
        optimal_utilization_rate: u256,
        base_variable_borrow_rate: u256,
        variable_rate_slope1: u256,
        variable_rate_slope2: u256,
        loan_to_value: u256,
        liquidation_threshold: u256,
        liquidation_bonus: u256,
        reserve_factor: u256,
        a_token_address: ContractAddress,
        variable_debt_token_address: ContractAddress,
        is_active: bool,
        is_frozen: bool,
        borrowing_enabled: bool
    );
    
    fn get_reserve_config(
        self: @TContractState,
        asset: ContractAddress
    ) -> ReserveConfigurationResponse;

    fn set_reserve_state(
        ref self: TContractState,
        asset: ContractAddress,
        total_liquidity: u256,
        available_liquidity: u256,
        total_variable_debt: u256,
        liquidity_rate: u256,
        variable_borrow_rate: u256,
        liquidity_index: u256,
        variable_borrow_index: u256,
    );
    fn get_reserve_state(self: @TContractState, asset: ContractAddress) -> ReserveStateResponse;

    fn set_user_reserve_data(
        ref self: TContractState,
        user: ContractAddress,
        asset: ContractAddress,
        scaled_a_token_balance: u256,
        scaled_variable_debt: u256,
        is_using_as_collateral: bool
    );

    fn get_user_reserve_data(
        self: @TContractState,
        user: ContractAddress,
        asset: ContractAddress
    ) -> UserReserveDataResponse;
}



#[starknet::interface]
pub trait IInterestToken<TContractState> {
    fn _mint(ref self: TContractState, on_behalf_of: ContractAddress, amount: u256);
    fn _burn(ref self: TContractState, from: ContractAddress, amount: u256);
    fn scaled_balance_of(self: @TContractState, user: ContractAddress) -> u256;
    fn get_scaled_total_supply(self: @TContractState) -> u256;
    fn get_liquidity_index(self: @TContractState) -> u256;
    fn set_liquidity_index(ref self: TContractState, new_index: u256);
    fn get_underlying_asset(self: @TContractState) -> ContractAddress;
    fn get_lending_pool(self: @TContractState) -> ContractAddress;
}


#[starknet::interface]
pub trait IPriceOracle<TContractState> {
    fn get_price(self: @TContractState, asset: ContractAddress) -> u256;
    fn get_price_safe(self: @TContractState, asset: ContractAddress) -> (u256, bool);
    fn get_prices(self: @TContractState, assets: Array<ContractAddress>) -> Array<u256>;
    fn set_price(ref self: TContractState, asset: ContractAddress, price: u256);
    fn set_prices(ref self: TContractState, assets: Array<ContractAddress>, prices: Array<u256>);
    fn get_price_source(self: @TContractState, asset: ContractAddress) -> ContractAddress;
    fn set_price_source(ref self: TContractState, asset: ContractAddress, source: ContractAddress);
    fn get_price_decimals(self: @TContractState) -> u8;
    fn get_base_currency(self: @TContractState) -> felt252;
    fn get_staleness_threshold(self: @TContractState) -> u64;
    fn set_staleness_threshold(ref self: TContractState, new_threshold: u64);
    fn get_last_update_timestamp(self: @TContractState, asset: ContractAddress) -> u64;
    fn is_price_fresh(self: @TContractState, asset: ContractAddress) -> bool;
}



// Interface definitions - add to interfaces.cairo
#[starknet::interface]
pub trait IShieldedPool<TContractState> {
    fn deposit_shielded(
        ref self: TContractState,
        commitment: felt252,
        asset: ContractAddress,
        amount: u256,
    );
    fn withdraw_shielded(
        ref self: TContractState,
        nullifier: felt252,
        recipient: ContractAddress,
        asset: ContractAddress,
        amount: u256,
        merkle_proof: Array<felt252>,
        path_indices: Array<u8>,
    );
    fn verify_proof(
        self: @TContractState,
        proof: Array<felt252>,
        public_inputs: Array<felt252>,
    ) -> bool;
    fn get_commitment(self: @TContractState, commitment_hash: felt252) -> (u256, ContractAddress, bool);
    fn is_nullifier_used(self: @TContractState, nullifier: felt252) -> bool;
    fn get_merkle_root(self: @TContractState) -> felt252;
    fn get_next_leaf_index(self: @TContractState) -> u64;
    fn get_total_shielded(self: @TContractState, asset: ContractAddress) -> u256;

    fn add_supported_asset(ref self: TContractState, asset: ContractAddress);
    fn remove_supported_asset(ref self: TContractState, asset: ContractAddress);
    fn set_deposit_limits(ref self: TContractState, min_amount: u256, max_amount: u256);
    fn set_deposit_fee(ref self: TContractState, fee_basis_points: u16);
    fn set_fee_collector(ref self: TContractState, new_collector: ContractAddress);
    fn enable_emergency_withdrawal(ref self: TContractState, enabled: bool);
    fn emergency_withdraw(ref self: TContractState, asset: ContractAddress, recipient: ContractAddress, amount: u256);

}

