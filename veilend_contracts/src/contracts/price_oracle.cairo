#[starknet::contract]
mod PriceOracle {
    use starknet::{
        ContractAddress, 
        ClassHash, 
        get_caller_address,
        get_block_timestamp
    };
    use starknet::storage::{
        Map,
        // Vec,
        // VecTrait,
        // MutableVecTrait,
        StorageMapReadAccess,
        StorageMapWriteAccess,
        StoragePointerReadAccess,
        StoragePointerWriteAccess,
        // StoragePathEntry
    };
    use openzeppelin_access::accesscontrol::AccessControlComponent;
    use openzeppelin::introspection::src5::SRC5Component;
    use openzeppelin::upgrades::UpgradeableComponent;
    use openzeppelin::upgrades::interface::IUpgradeable;

    use crate::interfaces::interfaces::*;
    use crate::event_structs::event_structs::*;
    use crate::enums::enums::*;

    component!(path: AccessControlComponent, storage: accesscontrol, event: AccessControlEvent);
    component!(path: SRC5Component, storage: src5, event: SRC5Event);
    component!(path: UpgradeableComponent, storage: upgradeable, event: UpgradeableEvent);

    #[abi(embed_v0)]
    impl AccessControlImpl = AccessControlComponent::AccessControlImpl<ContractState>;
    impl AccessControlInternalImpl = AccessControlComponent::InternalImpl<ContractState>;

    impl UpgradeableInternalImpl = UpgradeableComponent::InternalImpl<ContractState>;

    const ORACLE_ADMIN_ROLE: felt252 = selector!("ORACLE_ADMIN_ROLE");
    const PRICE_FEEDER_ROLE: felt252 = selector!("PRICE_FEEDER_ROLE");

    #[storage]
    struct Storage {
        #[substorage(v0)]
        accesscontrol: AccessControlComponent::Storage,
        #[substorage(v0)]
        src5: SRC5Component::Storage,
        #[substorage(v0)]
        upgradeable: UpgradeableComponent::Storage,

        // Asset price storage (in USD with 18 decimals)
        prices: Map<ContractAddress, u256>,
        
        // Price sources (external oracle addresses like Pragma, Chainlink)
        price_sources: Map<ContractAddress, ContractAddress>,
        
        // Timestamp of last price update
        last_update_timestamps: Map<ContractAddress, u64>,
        
        // Price staleness threshold (in seconds)
        price_staleness_threshold: u64,
        
        // Base currency (typically USD)
        base_currency: felt252,
        
        // Decimals for price representation (18 by default)
        price_decimals: u8,
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
        
        PriceUpdated: PriceUpdated,
        PriceSourceSet: PriceSourceSet,
        StalenessThresholdUpdated: StalenessThresholdUpdated,
    }


    #[constructor]
    fn constructor(
        ref self: ContractState,
        admin_address: ContractAddress,
        base_currency: felt252,
        price_decimals: u8,
        staleness_threshold: u64,
    ) {
        self.accesscontrol.initializer();
        self.accesscontrol._grant_role(AccessControlComponent::DEFAULT_ADMIN_ROLE, admin_address);
        self.accesscontrol._grant_role(ORACLE_ADMIN_ROLE, admin_address);
        
        self.base_currency.write(base_currency);
        self.price_decimals.write(price_decimals);
        self.price_staleness_threshold.write(staleness_threshold);
    }

    #[abi(embed_v0)]
    impl PriceOracleImpl of IPriceOracle<ContractState> {
        fn get_price(self: @ContractState, asset: ContractAddress) -> u256 {
            let price = self.prices.read(asset);
            assert!(price > 0_u256, "Price not available for asset");
            
            // Check staleness
            let last_update = self.last_update_timestamps.read(asset);
            let current_time = get_block_timestamp();
            let threshold = self.price_staleness_threshold.read();
            
            assert!(
                current_time - last_update <= threshold,
                "Price is stale"
            );
            
            price
        }

        fn get_price_safe(self: @ContractState, asset: ContractAddress) -> (u256, bool) {
            let price = self.prices.read(asset);
            if price == 0_u256 {
                return (0_u256, false);
            }
            
            let last_update = self.last_update_timestamps.read(asset);
            let current_time = get_block_timestamp();
            let threshold = self.price_staleness_threshold.read();
            
            let is_fresh = current_time - last_update <= threshold;
            
            (price, is_fresh)
        }

        fn get_prices(
            self: @ContractState, 
            assets: Array<ContractAddress>
        ) -> Array<u256> {

            let mut prices: Array<u256> = ArrayTrait::new();
            let len: u32 = assets.len();
            
            for i in 0..len {
                let asset: ContractAddress = *assets.at(i);
                let price: u256 = self.get_price(asset);
                prices.append(price);
            }
         
            prices
        }

        fn set_price(
            ref self: ContractState,
            asset: ContractAddress,
            price: u256,
        ) {
            self._check_price_feeder();
            assert!(price > 0_u256, "Price must be greater than 0");
            
            let _old_price: u256 = self.prices.read(asset);
            self.prices.write(asset, price);
            
            let timestamp: u64 = get_block_timestamp();
            self.last_update_timestamps.write(asset, timestamp);
            
            self.emit(PriceUpdated {
                asset,
                price,
                timestamp,
                updater: get_caller_address(),
            });
        }

        fn set_prices(
            ref self: ContractState,
            assets: Array<ContractAddress>,
            prices: Array<u256>,
        ) {
            self._check_price_feeder();
            
            let assets_len: u32 = assets.len();
            let prices_len: u32 = prices.len();
            assert!(assets_len == prices_len, "Arrays length mismatch");
            
         
            for i in 0..assets_len {

                let asset: ContractAddress = *assets.at(i);
                let price: u256 = *prices.at(i);
                assert!(price > 0_u256, "Price must be greater than 0");
                
                self.prices.write(asset, price);
                let timestamp: u64 = get_block_timestamp();
                self.last_update_timestamps.write(asset, timestamp);
                
                self.emit(PriceUpdated {
                    asset,
                    price,
                    timestamp,
                    updater: get_caller_address(),
                });

            }
                
        }

        fn get_price_source(self: @ContractState, asset: ContractAddress) -> ContractAddress {
            self.price_sources.read(asset)
        }

        fn set_price_source(
            ref self: ContractState,
            asset: ContractAddress,
            source: ContractAddress,
        ) {
            self._check_oracle_admin();
            
            self.price_sources.write(asset, source);
            
            self.emit(PriceSourceSet {
                asset,
                source,
            });
        }

        fn get_price_decimals(self: @ContractState) -> u8 {
            self.price_decimals.read()
        }

        fn get_base_currency(self: @ContractState) -> felt252 {
            self.base_currency.read()
        }

        fn get_staleness_threshold(self: @ContractState) -> u64 {
            self.price_staleness_threshold.read()
        }

        fn set_staleness_threshold(ref self: ContractState, new_threshold: u64) {
            self._check_oracle_admin();
            
            let old_threshold = self.price_staleness_threshold.read();
            self.price_staleness_threshold.write(new_threshold);
            
            self.emit(StalenessThresholdUpdated {
                old_threshold,
                new_threshold,
            });
        }

        fn get_last_update_timestamp(self: @ContractState, asset: ContractAddress) -> u64 {
            self.last_update_timestamps.read(asset)
        }

        fn is_price_fresh(self: @ContractState, asset: ContractAddress) -> bool {
            let last_update = self.last_update_timestamps.read(asset);
            if last_update == 0_u64 {
                return false;
            }
            
            let current_time = starknet::get_block_timestamp();
            let threshold = self.price_staleness_threshold.read();
            
            current_time - last_update <= threshold
        }
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn _check_oracle_admin(ref self: ContractState) {
            let caller: ContractAddress = get_caller_address();
            assert!(
                self.accesscontrol.has_role(ORACLE_ADMIN_ROLE, caller),
                "Caller is not oracle admin"
            );
        }

        fn _check_price_feeder(ref self: ContractState) {
            let caller: ContractAddress = get_caller_address();
            assert!(
                self.accesscontrol.has_role(PRICE_FEEDER_ROLE, caller) ||
                self.accesscontrol.has_role(ORACLE_ADMIN_ROLE, caller),
                "Caller is not price feeder"
            );
        }

        fn grant_price_feeder_role(ref self: ContractState, account: ContractAddress) {
            self._check_oracle_admin();
            self.accesscontrol.grant_role(PRICE_FEEDER_ROLE, account);
        }

        fn revoke_price_feeder_role(ref self: ContractState, account: ContractAddress) {
            self._check_oracle_admin();
            self.accesscontrol.revoke_role(PRICE_FEEDER_ROLE, account);
        }

        fn is_price_feeder(self: @ContractState, account: ContractAddress) -> bool {
            self.accesscontrol.has_role(PRICE_FEEDER_ROLE, account)
        }

        fn grant_oracle_admin_role(ref self: ContractState, account: ContractAddress) {
            self._check_oracle_admin();
            self.accesscontrol.grant_role(ORACLE_ADMIN_ROLE, account);
        }

        fn revoke_oracle_admin_role(ref self: ContractState, account: ContractAddress) {
            self._check_oracle_admin();
            self.accesscontrol.revoke_role(ORACLE_ADMIN_ROLE, account);
        }

        fn is_oracle_admin(self: @ContractState, account: ContractAddress) -> bool {
            self.accesscontrol.has_role(ORACLE_ADMIN_ROLE, account)
        }
    }


    #[abi(embed_v0)]
    impl UpgradeableImpl of IUpgradeable<ContractState> {
        fn upgrade(ref self: ContractState, new_class_hash: ClassHash) {
            self._check_oracle_admin();
            self.upgradeable.upgrade(new_class_hash);
        }
    }
}
