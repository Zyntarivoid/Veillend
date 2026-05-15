#[starknet::contract]
pub mod InterestToken {
use openzeppelin::access::ownable::OwnableComponent;
    use openzeppelin::token::erc20::{ERC20Component, ERC20HooksEmptyImpl};
    use openzeppelin::upgrades::UpgradeableComponent;
    use openzeppelin::upgrades::interface::IUpgradeable;
    use openzeppelin::security::reentrancyguard::ReentrancyGuardComponent;
    use openzeppelin::security::pausable::PausableComponent;
    use openzeppelin_access::accesscontrol::AccessControlComponent;
    use openzeppelin::introspection::src5::SRC5Component;


    use starknet::{ 
        ContractAddress, 
        ClassHash,
        get_caller_address,
        get_block_timestamp
    };
    // use starknet::storage::{
    //     StoragePointerWriteAccess,
    //     StoragePointerReadAccess
    // };

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

    use crate::interfaces::interfaces::IInterestToken;
    use crate::event_structs::event_structs::*;
    use crate::utils::utils::*;


    component!(path: ERC20Component, storage: erc20, event: ERC20Event);
    component!(path: OwnableComponent, storage: ownable, event: OwnableEvent);
    component!(path: UpgradeableComponent, storage: upgradeable, event: UpgradeableEvent);
    component!(path: AccessControlComponent, storage: accesscontrol, event: AccessControlEvent);
    component!(path: SRC5Component, storage: src5, event: SRC5Event);
    component!(path: ReentrancyGuardComponent, storage: reentrancyguard, event: ReentrancyGuardEvent);
    component!(path: PausableComponent, storage: pausable, event: PausableEvent);

   

    #[abi(embed_v0)]
    impl ERC20Impl = ERC20Component::ERC20Impl<ContractState>;

    #[abi(embed_v0)]
    impl ERC20CamelOnlyImpl = ERC20Component::ERC20CamelOnlyImpl<ContractState>;
    impl ERC20InternalImpl = ERC20Component::InternalImpl<ContractState>;

    #[abi(embed_v0)]
    impl OwnableImpl = OwnableComponent::OwnableImpl<ContractState>;
    impl InternalIMpl = OwnableComponent::InternalImpl<ContractState>;

    impl UpgradeableInternalImpl = UpgradeableComponent::InternalImpl<ContractState>;

    #[abi(embed_v0)]
    impl AccessControlImpl = AccessControlComponent::AccessControlImpl<ContractState>;
    impl AccessControlInternalImpl = AccessControlComponent::InternalImpl<ContractState>;
    
    impl ReentrancyGuardInternalImpl = ReentrancyGuardComponent::InternalImpl<ContractState>;

    #[abi(embed_v0)]
    impl PausableImpl = PausableComponent::PausableImpl<ContractState>;
    impl PausableInternalImpl = PausableComponent::InternalImpl<ContractState>;



    const ADMIN_ROLE: felt252 = selector!("ADMIN_ROLE");


    

    #[storage]
    struct Storage {
        #[substorage(v0)]
        erc20: ERC20Component::Storage,
        #[substorage(v0)]
        ownable: OwnableComponent::Storage,
        #[substorage(v0)]
        upgradeable: UpgradeableComponent::Storage,
        #[substorage(v0)]
        accesscontrol: AccessControlComponent::Storage,
        #[substorage(v0)]
        src5: SRC5Component::Storage,
        #[substorage(v0)]
        reentrancyguard: ReentrancyGuardComponent::Storage,
        #[substorage(v0)]
        pausable: PausableComponent::Storage,



        underlying_asset: ContractAddress,
        lending_pool: ContractAddress,
        total_supply_scaled: u256,
        scaled_balance: Map<ContractAddress, u256>,
        liquidity_index: u256,
        last_update_timestamp: u64,
       
        max_supply: u256,
        decimals: u8
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        #[flat]
        ERC20Event: ERC20Component::Event,
        #[flat]
        OwnableEvent: OwnableComponent::Event,
        #[flat]
        UpgradeableEvent: UpgradeableComponent::Event,
        #[flat]
        AccessControlEvent: AccessControlComponent::Event,
        #[flat]
        SRC5Event: SRC5Component::Event,
        #[flat]
        ReentrancyGuardEvent: ReentrancyGuardComponent::Event,
        #[flat]
        PausableEvent: PausableComponent::Event,

        Mint: Mint,
        Burn: Burn,
        IndexUpdated: IndexUpdated,
    }

    #[constructor]
    fn constructor(
        ref self: ContractState,
        name: ByteArray,     
        symbol: ByteArray,     
        decimals: u8,        
        initial_supply: u256,
        max_supply: u256,
        owner: ContractAddress
    ) {        
        self.ownable.initializer(owner);
        self.max_supply.write(max_supply);
        self.erc20.initializer(name, symbol);
        self.erc20.mint(owner, initial_supply);

        self.accesscontrol.initializer();
        self.accesscontrol._grant_role(AccessControlComponent::DEFAULT_ADMIN_ROLE, owner);
        self.accesscontrol._grant_role(ADMIN_ROLE, owner);
    }

    pub impl InterestTokenImpl of IInterestToken<ContractState> {

        // fn _mint(ref self: ContractState, recipient: ContractAddress, amount: u256) {
        //     self.erc20.mint(recipient, amount);
        // }

        fn _mint(
            ref self: ContractState,
            on_behalf_of: ContractAddress,
            amount: u256,
        ) {
            self.reentrancyguard.start();
            
            let caller = get_caller_address();
            let lending_pool = self.lending_pool.read();
            assert!(caller == lending_pool, "Only lending pool can mint");

            self._update_index();
            let current_index = self.liquidity_index.read();
            
            let scaled_amount = (amount * u256_pow(10_u256, 27_u256)) / current_index;
            
            // Update scaled balance
            let current_scaled = self.scaled_balance.read(on_behalf_of);
            self.scaled_balance.write(on_behalf_of, current_scaled + scaled_amount);
            
            // Update total supply
            let current_total_scaled = self.total_supply_scaled.read();
            self.total_supply_scaled.write(current_total_scaled + scaled_amount);

            // Mint ERC20 tokens for compatibility
            self.erc20.mint(on_behalf_of, amount);

            self.emit(Mint {
                caller,
                on_behalf_of,
                amount,
                index: current_index,
            });

            self.reentrancyguard.end();
        }


        // fn _burn(ref self: ContractState, account: ContractAddress, amount: u256) {
        //     self.erc20.burn(account, amount);
        // }

        fn _burn(
            ref self: ContractState,
            from: ContractAddress,
            amount: u256,
        ) {
            self.reentrancyguard.start();
            
            let caller = get_caller_address();
            let lending_pool = self.lending_pool.read();
            assert!(caller == lending_pool, "Only lending pool can burn");

            self._update_index();
            let current_index = self.liquidity_index.read();
            
            let scaled_amount = (amount * u256_pow(10_u256, 27_u256)) / current_index;
            
            // Update scaled balance
            let current_scaled = self.scaled_balance.read(from);
            assert!(current_scaled >= scaled_amount, "Insufficient scaled balance");
            self.scaled_balance.write(from, current_scaled - scaled_amount);
            
            // Update total supply
            let current_total_scaled = self.total_supply_scaled.read();
            assert!(current_total_scaled >= scaled_amount, "Insufficient total scaled supply");
            self.total_supply_scaled.write(current_total_scaled - scaled_amount);

            // Burn ERC20 tokens for compatibility
            self.erc20.burn(from, amount);

            self.emit(Burn {
                caller,
                on_behalf_of: from,
                amount,
                index: current_index,
            });

            self.reentrancyguard.end();
        }

        fn scaled_balance_of(self: @ContractState, user: ContractAddress) -> u256 {
            self.scaled_balance.read(user)
        }

        fn get_scaled_total_supply(self: @ContractState) -> u256 {
            self.total_supply_scaled.read()
        }

        fn get_liquidity_index(self: @ContractState) -> u256 {
            self.liquidity_index.read()
        }

        fn set_liquidity_index(
            ref self: ContractState,
            new_index: u256
        ) {
            let caller = get_caller_address();
            let lending_pool = self.lending_pool.read();
            assert!(caller == lending_pool, "Only lending pool can update index");

            let old_index = self.liquidity_index.read();
            self.liquidity_index.write(new_index);
            self.last_update_timestamp.write(get_block_timestamp());

            self.emit(IndexUpdated {
                old_index,
                new_index,
                timestamp: get_block_timestamp(),
            });
        }

        fn get_underlying_asset(self: @ContractState) -> ContractAddress {
            self.underlying_asset.read()
        }

        fn get_lending_pool(self: @ContractState) -> ContractAddress {
            self.lending_pool.read()
        }


    }


    #[abi(embed_v0)]
    impl UpgradeableImpl of IUpgradeable<ContractState> {
        fn upgrade(ref self: ContractState, new_class_hash: ClassHash) {

            self.ownable.assert_only_owner();

            self.upgradeable.upgrade(new_class_hash);
        }
    }

    
    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn _set_decimals(ref self: ContractState, decimals: u8) {
            self.ownable.assert_only_owner();
            self.decimals.write(decimals);
        }

        fn _read_decimals(self: @ContractState) -> u8 {
            self.ownable.assert_only_owner();
            self.decimals.read()
        }

        fn _update_index(ref self: ContractState) {
            let current_time = get_block_timestamp();
            let last_update = self.last_update_timestamp.read();
            
            if current_time > last_update {
                // In production, this would be called by LendingPool with calculated rate
                // For now, we just update timestamp
                self.last_update_timestamp.write(current_time);
            }
        }

        fn _convert_to_actual(self: @ContractState, scaled_amount: u256) -> u256 {
            let index = self.liquidity_index.read();
            (scaled_amount * index) / ( u256_pow(10_u256, 27_u256))
        }

        fn _convert_to_scaled(self: @ContractState, actual_amount: u256) -> u256 {
            let index = self.liquidity_index.read();
            (actual_amount * ( u256_pow(10_u256, 27_u256))) / index
        }
    }   
}