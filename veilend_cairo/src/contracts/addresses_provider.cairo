// src/core/addresses_provider.cairo

#[starknet::contract]
mod VeilLendAddressesProvider {
    use starknet::{ContractAddress, ClassHash, get_caller_address};
    use starknet::storage::{StoragePointerWriteAccess, StoragePointerReadAccess};
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

    const PROXY_ADMIN_ROLE: felt252 = selector!("PROXY_ADMIN_ROLE");
    const CONFIGURATOR_ROLE: felt252 = selector!("CONFIGURATOR_ROLE");

    #[storage]
    struct Storage {
        #[substorage(v0)]
        accesscontrol: AccessControlComponent::Storage,
        #[substorage(v0)]
        src5: SRC5Component::Storage,
        #[substorage(v0)]
        upgradeable: UpgradeableComponent::Storage,

        // Core protocol addresses
        lending_pool: ContractAddress,
        lending_pool_configurator: ContractAddress,
        lending_pool_collateral_manager: ContractAddress,
        
        // Data layer
        reserve_data: ContractAddress,
        price_oracle: ContractAddress,
        
        // Privacy layer
        shielded_pool: ContractAddress,
        nullifier_registry: ContractAddress,
        
        // Token contracts
        governance_token: ContractAddress,
        fee_collector: ContractAddress,
        
        // Protocol parameters
        protocol_version: felt252,
        market_id: felt252,
        
        // Emergency admin
        emergency_admin: ContractAddress,
        
        // Pool addresses provider registry (for multiple markets)
        is_active: bool,
        creation_timestamp: u64,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        #[flat]
        AccessControlEvent: AccessControlComponent::Event,
        #[flat]
        SRC5Event: SRC5Component::Event,
        #[flat]
        UpgradeableEvent: UpgradeableComponent::Event,
        
        LendingPoolUpdated: LendingPoolUpdated,
        LendingPoolConfiguratorUpdated: LendingPoolConfiguratorUpdated,
        CollateralManagerUpdated: CollateralManagerUpdated,
        ReserveDataUpdated: ReserveDataUpdated,
        PriceOracleUpdated: PriceOracleUpdated,
        ShieldedPoolUpdated: ShieldedPoolUpdated,
        NullifierRegistryUpdated: NullifierRegistryUpdated,
        GovernanceTokenUpdated: GovernanceTokenUpdated,
        FeeCollectorUpdated: FeeCollectorUpdated,
        EmergencyAdminUpdated: EmergencyAdminUpdated,
        MarketIdUpdated: MarketIdUpdated,
        ProtocolVersionUpdated: ProtocolVersionUpdated,
    }

    #[derive(Drop, starknet::Event)]
    struct LendingPoolUpdated {
        old_address: ContractAddress,
        new_address: ContractAddress,
    }

    #[derive(Drop, starknet::Event)]
    struct LendingPoolConfiguratorUpdated {
        old_address: ContractAddress,
        new_address: ContractAddress,
    }

    #[derive(Drop, starknet::Event)]
    struct CollateralManagerUpdated {
        old_address: ContractAddress,
        new_address: ContractAddress,
    }

    #[derive(Drop, starknet::Event)]
    struct ReserveDataUpdated {
        old_address: ContractAddress,
        new_address: ContractAddress,
    }

    #[derive(Drop, starknet::Event)]
    struct PriceOracleUpdated {
        old_address: ContractAddress,
        new_address: ContractAddress,
    }

    #[derive(Drop, starknet::Event)]
    struct ShieldedPoolUpdated {
        old_address: ContractAddress,
        new_address: ContractAddress,
    }

    #[derive(Drop, starknet::Event)]
    struct NullifierRegistryUpdated {
        old_address: ContractAddress,
        new_address: ContractAddress,
    }

    #[derive(Drop, starknet::Event)]
    struct GovernanceTokenUpdated {
        old_address: ContractAddress,
        new_address: ContractAddress,
    }

    #[derive(Drop, starknet::Event)]
    struct FeeCollectorUpdated {
        old_address: ContractAddress,
        new_address: ContractAddress,
    }

    #[derive(Drop, starknet::Event)]
    struct EmergencyAdminUpdated {
        old_address: ContractAddress,
        new_address: ContractAddress,
    }

    #[derive(Drop, starknet::Event)]
    struct MarketIdUpdated {
        old_id: felt252,
        new_id: felt252,
    }

    #[derive(Drop, starknet::Event)]
    struct ProtocolVersionUpdated {
        old_version: felt252,
        new_version: felt252,
    }

    #[constructor]
    fn constructor(
        ref self: ContractState,
        admin_address: ContractAddress,
        market_id: felt252,
        protocol_version: felt252,
        emergency_admin: ContractAddress,
    ) {
        self.accesscontrol.initializer();
        self.accesscontrol._grant_role(AccessControlComponent::DEFAULT_ADMIN_ROLE, admin_address);
        self.accesscontrol._grant_role(PROXY_ADMIN_ROLE, admin_address);
        self.accesscontrol._grant_role(CONFIGURATOR_ROLE, admin_address);
        
        self.market_id.write(market_id);
        self.protocol_version.write(protocol_version);
        self.emergency_admin.write(emergency_admin);
        self.is_active.write(true);
        self.creation_timestamp.write(starknet::get_block_timestamp());
    }

    #[abi(embed_v0)]
    impl AddressesProviderImpl of IAddressesProvider<ContractState> {
        // Getters
        fn get_lending_pool(self: @ContractState) -> ContractAddress {
            self.lending_pool.read()
        }

        fn get_lending_pool_configurator(self: @ContractState) -> ContractAddress {
            self.lending_pool_configurator.read()
        }

        fn get_lending_pool_collateral_manager(self: @ContractState) -> ContractAddress {
            self.lending_pool_collateral_manager.read()
        }

        fn get_reserve_data(self: @ContractState) -> ContractAddress {
            self.reserve_data.read()
        }

        fn get_price_oracle(self: @ContractState) -> ContractAddress {
            self.price_oracle.read()
        }

        fn get_shielded_pool(self: @ContractState) -> ContractAddress {
            self.shielded_pool.read()
        }

        fn get_nullifier_registry(self: @ContractState) -> ContractAddress {
            self.nullifier_registry.read()
        }

        fn get_governance_token(self: @ContractState) -> ContractAddress {
            self.governance_token.read()
        }

        fn get_fee_collector(self: @ContractState) -> ContractAddress {
            self.fee_collector.read()
        }

        fn get_emergency_admin(self: @ContractState) -> ContractAddress {
            self.emergency_admin.read()
        }

        fn get_market_id(self: @ContractState) -> felt252 {
            self.market_id.read()
        }

        fn get_protocol_version(self: @ContractState) -> felt252 {
            self.protocol_version.read()
        }

        fn is_protocol_active(self: @ContractState) -> bool {
            self.is_active.read()
        }

        fn get_creation_timestamp(self: @ContractState) -> u64 {
            self.creation_timestamp.read()
        }

        // Setters with role checks
        fn set_lending_pool(ref self: ContractState, new_address: ContractAddress) {
            self._check_configurator();
            assert!(!new_address.is_zero(), "Invalid address");
            
            let old_address = self.lending_pool.read();
            self.lending_pool.write(new_address);
            
            self.emit(Event::LendingPoolUpdated(LendingPoolUpdated {
                old_address,
                new_address,
            }));
        }

        fn set_lending_pool_configurator(ref self: ContractState, new_address: ContractAddress) {
            self._check_configurator();
            assert!(!new_address.is_zero(), "Invalid address");
            
            let old_address = self.lending_pool_configurator.read();
            self.lending_pool_configurator.write(new_address);
            
            self.emit(Event::LendingPoolConfiguratorUpdated(LendingPoolConfiguratorUpdated {
                old_address,
                new_address,
            }));
        }

        fn set_lending_pool_collateral_manager(ref self: ContractState, new_address: ContractAddress) {
            self._check_configurator();
            assert!(!new_address.is_zero(), "Invalid address");
            
            let old_address = self.lending_pool_collateral_manager.read();
            self.lending_pool_collateral_manager.write(new_address);
            
            self.emit(Event::CollateralManagerUpdated(CollateralManagerUpdated {
                old_address,
                new_address,
            }));
        }

        fn set_reserve_data(ref self: ContractState, new_address: ContractAddress) {
            self._check_configurator();
            assert!(!new_address.is_zero(), "Invalid address");
            
            let old_address = self.reserve_data.read();
            self.reserve_data.write(new_address);
            
            self.emit(Event::ReserveDataUpdated(ReserveDataUpdated {
                old_address,
                new_address,
            }));
        }

        fn set_price_oracle(ref self: ContractState, new_address: ContractAddress) {
            self._check_configurator();
            assert!(!new_address.is_zero(), "Invalid address");
            
            let old_address = self.price_oracle.read();
            self.price_oracle.write(new_address);
            
            self.emit(Event::PriceOracleUpdated(PriceOracleUpdated {
                old_address,
                new_address,
            }));
        }

        fn set_shielded_pool(ref self: ContractState, new_address: ContractAddress) {
            self._check_configurator();
            assert!(!new_address.is_zero(), "Invalid address");
            
            let old_address = self.shielded_pool.read();
            self.shielded_pool.write(new_address);
            
            self.emit(Event::ShieldedPoolUpdated(ShieldedPoolUpdated {
                old_address,
                new_address,
            }));
        }

        fn set_nullifier_registry(ref self: ContractState, new_address: ContractAddress) {
            self._check_configurator();
            assert!(!new_address.is_zero(), "Invalid address");
            
            let old_address = self.nullifier_registry.read();
            self.nullifier_registry.write(new_address);
            
            self.emit(Event::NullifierRegistryUpdated(NullifierRegistryUpdated {
                old_address,
                new_address,
            }));
        }

        fn set_governance_token(ref self: ContractState, new_address: ContractAddress) {
            self._check_configurator();
            assert!(!new_address.is_zero(), "Invalid address");
            
            let old_address = self.governance_token.read();
            self.governance_token.write(new_address);
            
            self.emit(Event::GovernanceTokenUpdated(GovernanceTokenUpdated {
                old_address,
                new_address,
            }));
        }

        fn set_fee_collector(ref self: ContractState, new_address: ContractAddress) {
            self._check_configurator();
            assert!(!new_address.is_zero(), "Invalid address");
            
            let old_address = self.fee_collector.read();
            self.fee_collector.write(new_address);
            
            self.emit(Event::FeeCollectorUpdated(FeeCollectorUpdated {
                old_address,
                new_address,
            }));
        }

        fn set_emergency_admin(ref self: ContractState, new_address: ContractAddress) {
            self._check_proxy_admin();
            assert!(!new_address.is_zero(), "Invalid address");
            
            let old_address = self.emergency_admin.read();
            self.emergency_admin.write(new_address);
            
            self.emit(Event::EmergencyAdminUpdated(EmergencyAdminUpdated {
                old_address,
                new_address,
            }));
        }

        fn set_market_id(ref self: ContractState, new_id: felt252) {
            self._check_proxy_admin();
            
            let old_id = self.market_id.read();
            self.market_id.write(new_id);
            
            self.emit(Event::MarketIdUpdated(MarketIdUpdated {
                old_id,
                new_id,
            }));
        }

        fn set_protocol_version(ref self: ContractState, new_version: felt252) {
            self._check_proxy_admin();
            
            let old_version = self.protocol_version.read();
            self.protocol_version.write(new_version);
            
            self.emit(Event::ProtocolVersionUpdated(ProtocolVersionUpdated {
                old_version,
                new_version,
            }));
        }

        fn deactivate_protocol(ref self: ContractState) {
            self._check_emergency_admin();
            
            self.is_active.write(false);
        }

        fn activate_protocol(ref self: ContractState) {
            self._check_proxy_admin();
            
            self.is_active.write(true);
        }
    }

    #[abi(embed_v0)]
    impl AddressesProviderViewImpl of IAddressesProviderView<ContractState> {
        fn get_all_addresses(self: @ContractState) -> AllAddresses {
            AllAddresses {
                lending_pool: self.lending_pool.read(),
                lending_pool_configurator: self.lending_pool_configurator.read(),
                lending_pool_collateral_manager: self.lending_pool_collateral_manager.read(),
                reserve_data: self.reserve_data.read(),
                price_oracle: self.price_oracle.read(),
                shielded_pool: self.shielded_pool.read(),
                nullifier_registry: self.nullifier_registry.read(),
                governance_token: self.governance_token.read(),
                fee_collector: self.fee_collector.read(),
                emergency_admin: self.emergency_admin.read(),
            }
        }

        fn get_address_by_string(self: @ContractState, identifier: felt252) -> ContractAddress {
            match identifier {
                id if id == selector!("LENDING_POOL") => self.lending_pool.read(),
                id if id == selector!("LENDING_POOL_CONFIGURATOR") => self.lending_pool_configurator.read(),
                id if id == selector!("COLLATERAL_MANAGER") => self.lending_pool_collateral_manager.read(),
                id if id == selector!("RESERVE_DATA") => self.reserve_data.read(),
                id if id == selector!("PRICE_ORACLE") => self.price_oracle.read(),
                id if id == selector!("SHIELDED_POOL") => self.shielded_pool.read(),
                id if id == selector!("NULLIFIER_REGISTRY") => self.nullifier_registry.read(),
                id if id == selector!("GOVERNANCE_TOKEN") => self.governance_token.read(),
                id if id == selector!("FEE_COLLECTOR") => self.fee_collector.read(),
                id if id == selector!("EMERGENCY_ADMIN") => self.emergency_admin.read(),
                _ => ContractAddress::zero(),
            }
        }
    }

    #[generate_trait]
    impl InternalFunctions of InternalFunctionsTrait {
        fn _check_configurator(ref self: ContractState) {
            let caller = get_caller_address();
            assert!(
                self.accesscontrol.has_role(CONFIGURATOR_ROLE, caller) ||
                self.accesscontrol.has_role(PROXY_ADMIN_ROLE, caller) ||
                self.accesscontrol.has_role(AccessControlComponent::DEFAULT_ADMIN_ROLE, caller),
                "Caller is not configurator"
            );
        }

        fn _check_proxy_admin(ref self: ContractState) {
            let caller = get_caller_address();
            assert!(
                self.accesscontrol.has_role(PROXY_ADMIN_ROLE, caller) ||
                self.accesscontrol.has_role(AccessControlComponent::DEFAULT_ADMIN_ROLE, caller),
                "Caller is not proxy admin"
            );
        }

        fn _check_emergency_admin(ref self: ContractState) {
            let caller = get_caller_address();
            let emergency_admin = self.emergency_admin.read();
            
            assert!(
                caller == emergency_admin ||
                self.accesscontrol.has_role(PROXY_ADMIN_ROLE, caller) ||
                self.accesscontrol.has_role(AccessControlComponent::DEFAULT_ADMIN_ROLE, caller),
                "Caller is not emergency admin"
            );
        }
    }

    #[abi(embed_v0)]
    impl UpgradeableImpl of IUpgradeable<ContractState> {
        fn upgrade(ref self: ContractState, new_class_hash: ClassHash) {
            self._check_proxy_admin();
            self.upgradeable.upgrade(new_class_hash);
        }
    }
}

// Interface definitions - add to interfaces.cairo
#[starknet::interface]
trait IAddressesProvider<TContractState> {
    // Getters
    fn get_lending_pool(self: @TContractState) -> ContractAddress;
    fn get_lending_pool_configurator(self: @TContractState) -> ContractAddress;
    fn get_lending_pool_collateral_manager(self: @TContractState) -> ContractAddress;
    fn get_reserve_data(self: @TContractState) -> ContractAddress;
    fn get_price_oracle(self: @TContractState) -> ContractAddress;
    fn get_shielded_pool(self: @TContractState) -> ContractAddress;
    fn get_nullifier_registry(self: @TContractState) -> ContractAddress;
    fn get_governance_token(self: @TContractState) -> ContractAddress;
    fn get_fee_collector(self: @TContractState) -> ContractAddress;
    fn get_emergency_admin(self: @TContractState) -> ContractAddress;
    fn get_market_id(self: @TContractState) -> felt252;
    fn get_protocol_version(self: @TContractState) -> felt252;
    fn is_protocol_active(self: @TContractState) -> bool;
    fn get_creation_timestamp(self: @TContractState) -> u64;
    
    // Setters
    fn set_lending_pool(ref self: TContractState, new_address: ContractAddress);
    fn set_lending_pool_configurator(ref self: TContractState, new_address: ContractAddress);
    fn set_lending_pool_collateral_manager(ref self: TContractState, new_address: ContractAddress);
    fn set_reserve_data(ref self: TContractState, new_address: ContractAddress);
    fn set_price_oracle(ref self: TContractState, new_address: ContractAddress);
    fn set_shielded_pool(ref self: TContractState, new_address: ContractAddress);
    fn set_nullifier_registry(ref self: TContractState, new_address: ContractAddress);
    fn set_governance_token(ref self: TContractState, new_address: ContractAddress);
    fn set_fee_collector(ref self: TContractState, new_address: ContractAddress);
    fn set_emergency_admin(ref self: TContractState, new_address: ContractAddress);
    fn set_market_id(ref self: TContractState, new_id: felt252);
    fn set_protocol_version(ref self: TContractState, new_version: felt252);
    fn deactivate_protocol(ref self: TContractState);
    fn activate_protocol(ref self: TContractState);
}

#[starknet::interface]
trait IAddressesProviderView<TContractState> {
    fn get_all_addresses(self: @TContractState) -> AllAddresses;
    fn get_address_by_string(self: @TContractState, identifier: felt252) -> ContractAddress;
}

// Struct definitions - add to structs.cairo
#[derive(Drop, Serde)]
struct AllAddresses {
    lending_pool: ContractAddress,
    lending_pool_configurator: ContractAddress,
    lending_pool_collateral_manager: ContractAddress,
    reserve_data: ContractAddress,
    price_oracle: ContractAddress,
    shielded_pool: ContractAddress,
    nullifier_registry: ContractAddress,
    governance_token: ContractAddress,
    fee_collector: ContractAddress,
    emergency_admin: ContractAddress,
}