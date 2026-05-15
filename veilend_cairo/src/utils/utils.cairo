use crate::structs::structs::*;

// In your utils.cairo file
pub fn u256_pow(base: u256, exponent: u256) -> u256 {
    if exponent == 0_u256 {
        return 1_u256;
    }
    
    let mut result = base;
    let mut i = 1_u256;
    
    loop {
        if i >= exponent {
            break result;
        }
        result = result * base;
        i += 1_u256;
    }
}

pub fn calculate_compound_interest(
    principal: u256,
    rate: u256,
    time_blocks: u256
) -> u256 {
    // Simplified compound interest formula
    // In production, use fixed-point math libraries
    let rate_per_block = rate / 1000000000000000000_u256; // 1e18 for precision
    let multiplier = u256_pow((1_u256 + rate_per_block), time_blocks);
    // principal * multiplier / 10_u256 ** 18_u256
    principal * multiplier / u256_pow(10_u256, 18_u256)

}


pub fn calculate_health_factor(
    collateral_value: u256,
    debt_value: u256,
    liquidation_threshold: u256
) -> u256 {
    if debt_value == 0_u256 {
        return 1000000000000000000_u256 * 100_u256; // Max health factor
    }
    (collateral_value * liquidation_threshold) / debt_value
}

pub fn percentage_of(amount: u256, percentage: u256) -> u256 {
    (amount * percentage) / 10000_u256 // Basis points (1% = 100)
}



// Utility function to convert storage struct to response struct
pub fn reserve_config_to_response(config: ReserveConfiguration) -> ReserveConfigurationResponse {
    ReserveConfigurationResponse {
        optimal_utilization_rate: config.optimal_utilization_rate,
        base_variable_borrow_rate: config.base_variable_borrow_rate,
        variable_rate_slope1: config.variable_rate_slope1,
        variable_rate_slope2: config.variable_rate_slope2,
        loan_to_value: config.loan_to_value,
        liquidation_threshold: config.liquidation_threshold,
        liquidation_bonus: config.liquidation_bonus,
        reserve_factor: config.reserve_factor,
        a_token_address: config.a_token_address,
        variable_debt_token_address: config.variable_debt_token_address,
        is_active: config.is_active,
        is_frozen: config.is_frozen,
        borrowing_enabled: config.borrowing_enabled,
    }
}



// Utility function to convert ReserveState storage struct to response struct
pub fn reserve_state_to_response(state: ReserveState) -> ReserveStateResponse {
    ReserveStateResponse {
        total_liquidity: state.total_liquidity,
        available_liquidity: state.available_liquidity,
        total_variable_debt: state.total_variable_debt,
        liquidity_rate: state.liquidity_rate,
        variable_borrow_rate: state.variable_borrow_rate,
        liquidity_index: state.liquidity_index,
        variable_borrow_index: state.variable_borrow_index,
        last_update_timestamp: state.last_update_timestamp,
    }
}

// Utility function to convert UserReserveData storage struct to response struct
pub fn user_reserve_data_to_response(data: UserReserveData) -> UserReserveDataResponse {
    UserReserveDataResponse {
        scaled_a_token_balance: data.scaled_a_token_balance,
        scaled_variable_debt: data.scaled_variable_debt,
        is_using_as_collateral: data.is_using_as_collateral,
    }
}