#[starknet::contract]
mod ReserveData {
use starknet::{ 
        ContractAddress,
        ClassHash,
        get_caller_address,
        get_block_timestamp,
    };
    
    use starknet::storage::{
        Map,
        StorageMapReadAccess,
        StorageMapWriteAccess,
        // StoragePointerWriteAccess,
        // StoragePointerReadAccess
    };

    use crate::enums::enums::*;
    use crate::structs::structs::*;
    use crate::interfaces::interfaces::*;
    use crate::event_structs::event_structs::*;
    use crate::utils::utils::*;


    use openzeppelin_access::accesscontrol::AccessControlComponent;
    use openzeppelin::introspection::src5::SRC5Component;
    use openzeppelin::upgrades::UpgradeableComponent;
    use openzeppelin::upgrades::interface::IUpgradeable;


    component!(path: AccessControlComponent, storage: accesscontrol, event: AccessControlEvent);
    component!(path: SRC5Component, storage: src5, event: SRC5Event);
    component!(path: UpgradeableComponent, storage: upgradeable, event: UpgradeableEvent);


    #[abi(embed_v0)]
    impl AccessControlImpl = AccessControlComponent::AccessControlImpl<ContractState>;
    impl AccessControlInternalImpl = AccessControlComponent::InternalImpl<ContractState>;


    impl UpgradeableInternalImpl = UpgradeableComponent::InternalImpl<ContractState>;



    const ADMIN_ROLE: felt252 = selector!("ADMIN_ROLE");






    #[storage]
    pub struct Storage {

        #[substorage(v0)]
        accesscontrol: AccessControlComponent::Storage,
        #[substorage(v0)]
        src5: SRC5Component::Storage,
        #[substorage(v0)]
        upgradeable: UpgradeableComponent::Storage,


        // Reserve configuration
        reserve_config: Map<ContractAddress, ReserveConfiguration>,
        
        // Reserve state
        reserve_state: Map<ContractAddress, ReserveState>,
        
        // User positions
        user_reserve_data: Map<(ContractAddress, ContractAddress), UserReserveData>,
    }


    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {

        #[flat]
        AccessControlEvent: AccessControlComponent::Event,
        #[flat]
        SRC5Event: SRC5Component::Event,
        #[flat]
        UpgradeableEvent: UpgradeableComponent::Event,


        ReserveConfigurationUpdated: ReserveConfigurationUpdated,
        ReserveStateUpdated: ReserveStateUpdated,
        UserReserveDataUpdated: UserReserveDataUpdated
       
    }



    #[constructor]
    fn constructor(
        ref self: ContractState,
        admin_address: ContractAddress,
    ) {

        self.accesscontrol.initializer();
        self.accesscontrol._grant_role(AccessControlComponent::DEFAULT_ADMIN_ROLE, admin_address);
        self.accesscontrol._grant_role(ADMIN_ROLE, admin_address);
    }

   

    #[abi(embed_v0)]
    pub impl ReserveDataImpl of IReserveData<ContractState> {

        fn set_reserve_config(
            ref self: ContractState,
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
        ) {
            let config: ReserveConfiguration = ReserveConfiguration {
                optimal_utilization_rate,
                base_variable_borrow_rate,
                variable_rate_slope1,
                variable_rate_slope2,
                loan_to_value,
                liquidation_threshold,
                liquidation_bonus,
                reserve_factor,
                a_token_address,
                variable_debt_token_address,
                is_active,
                is_frozen,
                borrowing_enabled,
            };
            
            self.reserve_config.write(asset, config);
            
            let reserve_configuration_updated_event: ReserveConfigurationUpdated = ReserveConfigurationUpdated {
                asset,
                optimal_utilization_rate,
                base_variable_borrow_rate,
                variable_rate_slope1,
                variable_rate_slope2,
                loan_to_value,
                liquidation_threshold,
                liquidation_bonus,
                reserve_factor,
                a_token_address,
                variable_debt_token_address,
                is_active,
                is_frozen,
                borrowing_enabled,
            };
            
            self.emit(reserve_configuration_updated_event);
        }

        fn get_reserve_config(self: @ContractState, asset: ContractAddress) -> ReserveConfigurationResponse {
            let config: ReserveConfiguration = self.reserve_config.read(asset);
            reserve_config_to_response(config)
        }

        fn set_reserve_state(
            ref self: ContractState,
            asset: ContractAddress,
            total_liquidity: u256,
            available_liquidity: u256,
            total_variable_debt: u256,
            liquidity_rate: u256,
            variable_borrow_rate: u256,
            liquidity_index: u256,
            variable_borrow_index: u256,
        ) {

            let current_time: u64 = get_block_timestamp();

            let state: ReserveState = ReserveState {
                total_liquidity,
                available_liquidity,
                total_variable_debt,
                liquidity_rate,
                variable_borrow_rate,
                liquidity_index,
                variable_borrow_index,
                last_update_timestamp: current_time,
            };
            
            self.reserve_state.write(asset, state);
            
            let reserve_state_updated_event: ReserveStateUpdated = ReserveStateUpdated {
                asset,
                total_liquidity,
                available_liquidity,
                total_variable_debt,
                liquidity_rate,
                variable_borrow_rate,
                liquidity_index,
                variable_borrow_index,
                last_update_timestamp: current_time
            };

            self.emit(reserve_state_updated_event);
        }

        fn get_reserve_state(self: @ContractState, asset: ContractAddress) -> ReserveStateResponse {
            let state: ReserveState = self.reserve_state.read(asset);
            reserve_state_to_response(state)
        }
    
        fn set_user_reserve_data(
            ref self: ContractState,
            user: ContractAddress,
            asset: ContractAddress,
            scaled_a_token_balance: u256,
            scaled_variable_debt: u256,
            is_using_as_collateral: bool
        ) {
            let data: UserReserveData = UserReserveData {
                scaled_a_token_balance,
                scaled_variable_debt,
                is_using_as_collateral,
            };
            
            self.user_reserve_data.write((user, asset), data);

            let user_reserve_data_updated_event: UserReserveDataUpdated = UserReserveDataUpdated {
                user,
                asset,
                scaled_a_token_balance,
                scaled_variable_debt,
                is_using_as_collateral,
            };
            
            self.emit(user_reserve_data_updated_event);
        }

        fn get_user_reserve_data(
            self: @ContractState,
            user: ContractAddress,
            asset: ContractAddress
        ) -> UserReserveDataResponse {
            let data: UserReserveData = self.user_reserve_data.read((user, asset));
            user_reserve_data_to_response(data)
        }
    }

    #[abi(embed_v0)]
    impl UpgradeableImpl of IUpgradeable<ContractState> {
        fn upgrade(ref self: ContractState, new_class_hash: ClassHash) {

            let caller: ContractAddress = get_caller_address();

            assert!(self.accesscontrol.has_role(ADMIN_ROLE, caller), "AccessControl: Caller is not the Admin");

            self.upgradeable.upgrade(new_class_hash);
        }
    }
}
  