use starknet::ContractAddress;

#[derive(Drop, starknet::Store, Serde, Clone)]
pub struct ReserveConfiguration {
    // Interest rate parameters
    pub optimal_utilization_rate: u256,  // in RAY (1e27)
    pub base_variable_borrow_rate: u256, // in RAY
    pub variable_rate_slope1: u256,      // in RAY
    pub variable_rate_slope2: u256,      // in RAY
    
    // Collateral parameters
    pub loan_to_value: u256,             // in basis points (100% = 10000)
    pub liquidation_threshold: u256,     // in basis points
    pub liquidation_bonus: u256,         // in basis points
    
    // Reserve factors
    pub reserve_factor: u256,            // in basis points
    
    // Token addresses
    pub a_token_address: ContractAddress,
    pub variable_debt_token_address: ContractAddress,
    
    // Flags
    pub is_active: bool,
    pub is_frozen: bool,
    pub borrowing_enabled: bool,
}


#[derive(Drop, Serde, Clone)]
pub struct ReserveConfigurationResponse {
    // Interest rate parameters
    pub optimal_utilization_rate: u256,  // in RAY (1e27)
    pub base_variable_borrow_rate: u256, // in RAY
    pub variable_rate_slope1: u256,      // in RAY
    pub variable_rate_slope2: u256,      // in RAY
    
    // Collateral parameters
    pub loan_to_value: u256,             // in basis points (100% = 10000)
    pub liquidation_threshold: u256,     // in basis points
    pub liquidation_bonus: u256,         // in basis points
    
    // Reserve factors
    pub reserve_factor: u256,            // in basis points
    
    // Token addresses
    pub a_token_address: ContractAddress,
    pub variable_debt_token_address: ContractAddress,
    
    // Flags
    pub is_active: bool,
    pub is_frozen: bool,
    pub borrowing_enabled: bool,
}


#[derive(Drop, starknet::Store, Serde, Clone)]
pub struct ReserveState {
    // Liquidity metrics
    pub total_liquidity: u256,
    pub available_liquidity: u256,
    pub total_variable_debt: u256,
    
    // Interest rate metrics
    pub liquidity_rate: u256,        // in RAY
    pub variable_borrow_rate: u256,  // in RAY
    pub liquidity_index: u256,       // in RAY
    pub variable_borrow_index: u256, // in RAY
    
    // Timestamps
    pub last_update_timestamp: u64,
}


#[derive(Drop, Serde, Clone)]
pub struct ReserveStateResponse {
    // Liquidity metrics
    pub total_liquidity: u256,
    pub available_liquidity: u256,
    pub total_variable_debt: u256,
    
    // Interest rate metrics
    pub liquidity_rate: u256,        // in RAY
    pub variable_borrow_rate: u256,  // in RAY
    pub liquidity_index: u256,       // in RAY
    pub variable_borrow_index: u256, // in RAY
    
    // Timestamps
    pub last_update_timestamp: u64,
}


#[derive(Drop, starknet::Store, Serde, Clone)]
pub struct UserReserveData {
    // Token balances
    pub scaled_a_token_balance: u256,
    pub scaled_variable_debt: u256,
    
    // Flags
    pub is_using_as_collateral: bool,
}


#[derive(Drop, Serde, Clone)]
pub struct UserReserveDataResponse {
    // Token balances
    pub scaled_a_token_balance: u256,
    pub scaled_variable_debt: u256,
    
    // Flags
    pub is_using_as_collateral: bool,
}


#[derive(Drop, Serde, Clone, starknet::Store)]
pub struct Commitment {
    pub amount: u256,
    pub asset: ContractAddress,
    pub depositor: ContractAddress,
    pub leaf_index: u64,
    pub timestamp: u64,
    pub is_spent: bool,
}

#[derive(Drop, Serde, Clone)]
pub struct MerkleProof {
    pub leaf: felt252,
    pub path_elements: Array<felt252>,
    pub path_indices: Array<u8>,
    pub root: felt252,
}
