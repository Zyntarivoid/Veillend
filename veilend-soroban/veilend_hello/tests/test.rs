#![cfg(test)]

use soroban_sdk::{testutils::Address as _, Env, Address};
use veilend_hello::*;

#[test]
fn test_initialize() {
    let env = Env::default();
    let contract_id = env.register(VeilLendHelloContract, ());
    let client = VeilLendHelloClient::new(&env, &contract_id);

    let admin = Address::generate(&env);

    // Initialize with admin
    env.mock_all_auths();
    client.initialize(&admin);

    // Verify admin is set
    assert_eq!(client.get_admin(), admin);
}

#[test]
fn test_hello() {
    let env = Env::default();
    let contract_id = env.register(VeilLendHelloContract, ());
    let client = VeilLendHelloClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    env.mock_all_auths();
    client.initialize(&admin);

    let user = Address::generate(&env);
    let result = client.hello(&user);

    assert_eq!(result, symbol_short!("Hello!"));
}
