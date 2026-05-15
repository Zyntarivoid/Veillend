#[starknet::contract]
mod ShieldedPool {
    use starknet::{
        ContractAddress, 
        ClassHash, 
        get_caller_address, 
        get_contract_address,
        get_block_timestamp
    };
    use starknet::storage::{
        Map, 
        Vec,
        // VecTrait,
        MutableVecTrait,
        StorageMapReadAccess, 
        StorageMapWriteAccess,
        StoragePointerReadAccess,
        StoragePointerWriteAccess
    };
    
    use core::poseidon::PoseidonTrait;
    use core::hash::HashStateTrait;
    use core::poseidon::HashState;

    use openzeppelin_access::accesscontrol::AccessControlComponent;
    use openzeppelin::introspection::src5::SRC5Component;
    use openzeppelin::upgrades::UpgradeableComponent;
    use openzeppelin::upgrades::interface::IUpgradeable;
    use openzeppelin::security::reentrancyguard::ReentrancyGuardComponent;
    use openzeppelin::security::pausable::PausableComponent;

    use openzeppelin::token::erc20::interface::{IERC20Dispatcher, IERC20DispatcherTrait};

    use core::num::traits::Zero;


    use crate::event_structs::event_structs::*;
    use crate::structs::structs::*;
    use crate::interfaces::interfaces::IShieldedPool;

    component!(path: AccessControlComponent, storage: accesscontrol, event: AccessControlEvent);
    component!(path: SRC5Component, storage: src5, event: SRC5Event);
    component!(path: UpgradeableComponent, storage: upgradeable, event: UpgradeableEvent);
    component!(path: ReentrancyGuardComponent, storage: reentrancyguard, event: ReentrancyGuardEvent);
    component!(path: PausableComponent, storage: pausable, event: PausableEvent);


    #[abi(embed_v0)]
    impl AccessControlImpl = AccessControlComponent::AccessControlImpl<ContractState>;
    impl AccessControlInternalImpl = AccessControlComponent::InternalImpl<ContractState>;

    impl UpgradeableInternalImpl = UpgradeableComponent::InternalImpl<ContractState>;
    impl ReentrancyGuardInternalImpl = ReentrancyGuardComponent::InternalImpl<ContractState>;

    #[abi(embed_v0)]
    impl PausableImpl = PausableComponent::PausableImpl<ContractState>;
    impl PausableInternalImpl = PausableComponent::InternalImpl<ContractState>;

    const GUARDIAN_ROLE: felt252 = selector!("GUARDIAN_ROLE");
    const PAUSER_ROLE: felt252 = selector!("PAUSER_ROLE");

    #[storage]
    struct Storage {
        #[substorage(v0)]
        accesscontrol: AccessControlComponent::Storage,
        #[substorage(v0)]
        src5: SRC5Component::Storage,
        #[substorage(v0)]
        upgradeable: UpgradeableComponent::Storage,
        #[substorage(v0)]
        reentrancyguard: ReentrancyGuardComponent::Storage,
        #[substorage(v0)]
        pausable: PausableComponent::Storage,

        // Commitments: commitment_hash -> Commitment data
        commitments: Map<felt252, Commitment>,
        
        // Nullifiers: nullifier -> used (true/false)
        nullifiers: Map<felt252, bool>,
        
        // Merkle tree (simplified incremental merkle tree)
        merkle_root: felt252,
        merkle_tree: Map<u64, felt252>,
        next_leaf_index: u64,
        tree_depth: u32,
        
        // Asset management
        supported_assets: Vec<ContractAddress>,
        asset_supported: Map<ContractAddress, bool>,
        total_shielded_per_asset: Map<ContractAddress, u256>,
        
        // Protocol parameters
        min_deposit_amount: u256,
        max_deposit_amount: u256,
        deposit_fee_basis_points: u16, // 100 = 1%
        fee_collector: ContractAddress,
        
        // Security
        emergency_withdrawal_enabled: bool,
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
        #[flat]
        ReentrancyGuardEvent: ReentrancyGuardComponent::Event,
        #[flat]
        PausableEvent: PausableComponent::Event,
        
        ShieldedDeposit: ShieldedDeposit,
        ShieldedWithdrawal: ShieldedWithdrawal,
        MerkleRootUpdated: MerkleRootUpdated,
        AssetAdded: AssetAdded,
        AssetRemoved: AssetRemoved,
        EmergencyWithdrawal: EmergencyWithdrawal,
    }

   
    #[constructor]
    fn constructor(
        ref self: ContractState,
        admin_address: ContractAddress,
        guardian_address: ContractAddress,
        fee_collector: ContractAddress,
        tree_depth: u32,
        min_deposit: u256,
        max_deposit: u256,
        deposit_fee: u16,
    ) {
        self.accesscontrol.initializer();
        self.accesscontrol._grant_role(AccessControlComponent::DEFAULT_ADMIN_ROLE, admin_address);
        self.accesscontrol._grant_role(GUARDIAN_ROLE, guardian_address);
        self.accesscontrol._grant_role(PAUSER_ROLE, guardian_address);
                
        self.fee_collector.write(fee_collector);
        self.tree_depth.write(tree_depth);
        self.min_deposit_amount.write(min_deposit);
        self.max_deposit_amount.write(max_deposit);
        self.deposit_fee_basis_points.write(deposit_fee);
        
        self.merkle_root.write(0_felt252);
        self.next_leaf_index.write(0_u64);
        self.emergency_withdrawal_enabled.write(false);
    }

    #[abi(embed_v0)]
    impl ShieldedPoolImpl of IShieldedPool<ContractState> {
        fn deposit_shielded(
            ref self: ContractState,
            commitment: felt252,
            asset: ContractAddress,
            amount: u256,
        ) {
            
            self.pausable.assert_not_paused();
            self.reentrancyguard.start();

            // Validate inputs
            assert!(commitment != 0_felt252, "Invalid commitment");
            assert!(amount >= self.min_deposit_amount.read(), "Amount below minimum");
            assert!(amount <= self.max_deposit_amount.read(), "Amount above maximum");
            assert!(self.asset_supported.read(asset), "Asset not supported");
            
            // Check commitment doesn't already exist
            let existing = self.commitments.read(commitment);
            assert!(existing.amount == 0_u256, "Commitment already exists");

            let caller = get_caller_address();
            let contract_address = get_contract_address();

            // Transfer tokens from user
            let token_dispatcher: IERC20Dispatcher = IERC20Dispatcher { contract_address: asset };
            
            let balance = token_dispatcher.balance_of(caller);
            assert!(balance >= amount, "Insufficient balance");
            
            let allowance = token_dispatcher.allowance(caller, contract_address);
            assert!(allowance >= amount, "Insufficient allowance");
            
            let success = token_dispatcher.transfer_from(caller, contract_address, amount);
            assert!(success, "Transfer failed");

            // Store commitment
            let leaf_index = self.next_leaf_index.read();
            let commitment_data = Commitment {
                amount,
                asset,
                depositor: caller,
                leaf_index,
                timestamp: get_block_timestamp(),
                is_spent: false,
            };
            self.commitments.write(commitment, commitment_data);

            // Update merkle tree
            self._insert_merkle_leaf(commitment);

            // Update total shielded balance
            let current_total = self.total_shielded_per_asset.read(asset);
            self.total_shielded_per_asset.write(asset, current_total + amount);

            self.emit(Event::ShieldedDeposit(ShieldedDeposit {
                commitment,
                asset,
                amount,
                depositor: caller,
                leaf_index,
                timestamp: get_block_timestamp(),
            }));

            self.reentrancyguard.end();
        }

        fn withdraw_shielded(
            ref self: ContractState,
            nullifier: felt252,
            recipient: ContractAddress,
            asset: ContractAddress,
            amount: u256,
            merkle_proof: Array<felt252>,
            path_indices: Array<u8>,
        ) {

            self.pausable.assert_not_paused();
            self.reentrancyguard.start();

            // Validate inputs
            assert!(nullifier != 0_felt252, "Invalid nullifier");
            assert!(!recipient.is_zero(), "Invalid recipient");
            assert!(amount > 0_u256, "Amount must be greater than 0");
            assert!(self.asset_supported.read(asset), "Asset not supported");

            // Check nullifier hasn't been used
            assert!(!self.nullifiers.read(nullifier), "Nullifier already used");

            // Reconstruct commitment from nullifier (in production, this comes from ZK proof)
            // For now, we'll use a simple mapping - in production, this would be verified by ZK proof
            let commitment = self._nullifier_to_commitment(nullifier);
            let commitment_data = self.commitments.read(commitment);
            
            assert!(commitment_data.amount >= amount, "Insufficient shielded balance");
            assert!(!commitment_data.is_spent, "Commitment already spent");
            assert!(commitment_data.asset == asset, "Asset mismatch");

            // Verify merkle proof (simplified - in production use full ZK verification)
            let root = self.merkle_root.read();
            let is_valid = self._verify_merkle_proof(
                commitment, 
                merkle_proof, 
                path_indices, 
                root,
                commitment_data.leaf_index
            );
            assert!(is_valid, "Invalid merkle proof");

            // Calculate fee
            let fee = self._calculate_fee(amount);
            let amount_after_fee = amount - fee;

            // Mark nullifier as used
            self.nullifiers.write(nullifier, true);
            
            // Mark commitment as spent
            let mut updated_commitment = commitment_data;
            updated_commitment.is_spent = true;
            self.commitments.write(commitment, updated_commitment);

            // Update total shielded balance
            let current_total = self.total_shielded_per_asset.read(asset);
            self.total_shielded_per_asset.write(asset, current_total - amount);

            // Transfer tokens to recipient
            let token_dispatcher = IERC20Dispatcher { contract_address: asset };
            
            // Send fee to collector
            if fee > 0_u256 {
                token_dispatcher.transfer(self.fee_collector.read(), fee);
            }
            
            // Send remaining amount to recipient
            token_dispatcher.transfer(recipient, amount_after_fee);

            self.emit(ShieldedWithdrawal {
                nullifier,
                recipient,
                asset,
                amount: amount_after_fee,
                fee,
                timestamp: get_block_timestamp(),
            });

            self.reentrancyguard.end();
        }

        fn verify_proof(
            self: @ContractState,
            proof: Array<felt252>,
            public_inputs: Array<felt252>,
        ) -> bool {
            // In production, this would call a dedicated verifier contract
            // For now, return true for testing
            // This should be replaced with actual ZK-SNARK verification
            true
        }

        fn get_commitment(self: @ContractState, commitment_hash: felt252) -> (u256, ContractAddress, bool) {
            let data = self.commitments.read(commitment_hash);
            (data.amount, data.asset, data.is_spent)
        }

        fn is_nullifier_used(self: @ContractState, nullifier: felt252) -> bool {
            self.nullifiers.read(nullifier)
        }

        fn get_merkle_root(self: @ContractState) -> felt252 {
            self.merkle_root.read()
        }

        fn get_next_leaf_index(self: @ContractState) -> u64 {
            self.next_leaf_index.read()
        }

        fn get_total_shielded(self: @ContractState, asset: ContractAddress) -> u256 {
            self.total_shielded_per_asset.read(asset)
        }

        fn add_supported_asset(ref self: ContractState, asset: ContractAddress) {
            self._check_guardian();
            
            assert!(!self.asset_supported.read(asset), "Asset already supported");
            
            self.asset_supported.write(asset, true);
            self.supported_assets.push(asset);
            
            self.emit(AssetAdded { asset });
        }

        fn remove_supported_asset(ref self: ContractState, asset: ContractAddress) {
            self._check_guardian();
            
            assert!(self.asset_supported.read(asset), "Asset not supported");
            
            self.asset_supported.write(asset, false);
            
            // Note: In production, you'd also remove from the vector
            // This requires more complex vector manipulation
            
            self.emit(AssetRemoved { asset });
        }

        fn set_deposit_limits(
            ref self: ContractState,
            min_amount: u256,
            max_amount: u256,
        ) {
            self._check_guardian();
            
            assert!(max_amount >= min_amount, "Invalid limits");
            
            self.min_deposit_amount.write(min_amount);
            self.max_deposit_amount.write(max_amount);
        }

        fn set_deposit_fee(ref self: ContractState, fee_basis_points: u16) {
            self._check_guardian();
            
            assert!(fee_basis_points <= 1000, "Fee too high"); // Max 10%
            
            self.deposit_fee_basis_points.write(fee_basis_points);
        }

        fn set_fee_collector(ref self: ContractState, new_collector: ContractAddress) {
            self._check_guardian();
            
            assert!(!new_collector.is_zero(), "Invalid address");
            
            self.fee_collector.write(new_collector);
        }

        fn enable_emergency_withdrawal(ref self: ContractState, enabled: bool) {
            self._check_guardian();
            
            self.emergency_withdrawal_enabled.write(enabled);
        }

        fn emergency_withdraw(
            ref self: ContractState,
            asset: ContractAddress,
            recipient: ContractAddress,
            amount: u256,
        ) {
            self._check_guardian();
            
            assert!(self.emergency_withdrawal_enabled.read(), "Emergency withdrawal not enabled");
            assert!(!recipient.is_zero(), "Invalid recipient");
            
            let token_dispatcher = IERC20Dispatcher { contract_address: asset };
            let contract_balance = token_dispatcher.balance_of(get_contract_address());
            assert!(contract_balance >= amount, "Insufficient balance");
            
            token_dispatcher.transfer(recipient, amount);
            
            self.emit(EmergencyWithdrawal {
                recipient,
                asset,
                amount,
            });
        }
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
      

        fn _check_guardian(ref self: ContractState) {
            let caller = get_caller_address();
            assert!(
                self.accesscontrol.has_role(GUARDIAN_ROLE, caller) ||
                self.accesscontrol.has_role(AccessControlComponent::DEFAULT_ADMIN_ROLE, caller),
                "Caller is not guardian"
            );
        }

        fn _check_pauser(ref self: ContractState) {
            let caller = get_caller_address();
            assert!(
                self.accesscontrol.has_role(PAUSER_ROLE, caller) ||
                self.accesscontrol.has_role(GUARDIAN_ROLE, caller) ||
                self.accesscontrol.has_role(AccessControlComponent::DEFAULT_ADMIN_ROLE, caller),
                "Caller cannot pause"
            );
        }

        fn _insert_merkle_leaf(ref self: ContractState, leaf: felt252) {
            let current_root = self.merkle_root.read();
            let next_index = self.next_leaf_index.read();
            
            // Store leaf
            self.merkle_tree.write(next_index, leaf);
            
            // Calculate new root (simplified - in production use incremental merkle tree)
            // This is a placeholder for actual merkle tree implementation
            let _poseidon: HashState = PoseidonTrait::new();
            let _inputs: Array<felt252> = array![current_root, leaf, next_index.into()];
            // let new_root = poseidon.hash(inputs);
            let new_root = PoseidonTrait::new()
                            .update(current_root)
                            .update(leaf)
                            .update(next_index.into())
                            .finalize();
            
            self.merkle_root.write(new_root);
            self.next_leaf_index.write(next_index + 1);
            
            self.emit(MerkleRootUpdated {
                old_root: current_root,
                new_root,
                leaf_index: next_index,
            });
        }

        fn _verify_merkle_proof(
            self: @ContractState,
            leaf: felt252,
            proof: Array<felt252>,
            path_indices: Array<u8>,
            expected_root: felt252,
            leaf_index: u64,
        ) -> bool {
            // Simplified merkle proof verification
            // In production, this would verify against the actual merkle tree
            
            let mut computed_hash = leaf;
            let proof_len = proof.len();
            let indices_len = path_indices.len();
            
            assert!(proof_len == indices_len, "Invalid proof length");
            assert!(proof_len == self.tree_depth.read(), "Invalid proof depth");
            
            let _poseidon: HashState = PoseidonTrait::new();
            
    
                for i in 0..proof_len {
                    let sibling = *proof.at(i);
                    let direction = *path_indices.at(i);
                    
                    // Create a new Poseidon instance for each hash
                    if direction == 0_u8 {
                        // Leaf is left sibling
                        computed_hash = PoseidonTrait::new()
                            .update(computed_hash)
                            .update(sibling)
                            .finalize();
                    } else {
                        // Leaf is right sibling
                        computed_hash = PoseidonTrait::new()
                            .update(sibling)
                            .update(computed_hash)
                            .finalize();
                    }
                };
            
            computed_hash == expected_root
        }


        fn _nullifier_to_commitment(self: @ContractState, nullifier: felt252) -> felt252 {
            // In production, this would be derived from ZK proof
            // For demo, use Poseidon hash
            PoseidonTrait::new()
                .update(nullifier)
                .finalize()
        }

        fn _calculate_fee(self: @ContractState, amount: u256) -> u256 {
            let fee_basis = self.deposit_fee_basis_points.read();
            if fee_basis == 0_u16 {
                return 0_u256;
            }
            (amount * fee_basis.into()) / 10000_u256
        }
    }

    #[abi(embed_v0)]
    impl UpgradeableImpl of IUpgradeable<ContractState> {
        fn upgrade(ref self: ContractState, new_class_hash: ClassHash) {
            self._check_guardian();
            self.upgradeable.upgrade(new_class_hash);
        }
    }
}
