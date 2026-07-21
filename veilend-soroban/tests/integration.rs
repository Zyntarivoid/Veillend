#![cfg(test)]

fn main() {}

#[test]
fn test_initialize_contract() {
    let env = Env::default();
    let contract_id = env.register(VeilLendContract, ());
    let client = VeilLendContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    env.mock_all_auths();

    client.__constructor(&admin, &15_000);

    assert_eq!(client.admin(), admin);
    assert_eq!(client.min_collateral_ratio_bps(), 15_000);
    assert_eq!(client.is_paused(), false);
}

#[test]
fn test_configure_asset() {
    let env = Env::default();
    let contract_id = env.register(VeilLendContract, ());
    let client = VeilLendContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let asset = Address::generate(&env);

    env.mock_all_auths();
    client.__constructor(&admin, &15_000);
    client.configure_asset(&admin, &asset, &true);

    assert_eq!(client.is_asset_supported(&asset), true);

    let caps = client.get_asset_caps(&asset);
    assert_eq!(caps.deposit_cap, -1);
    assert_eq!(caps.borrow_cap, -1);

    assert_eq!(client.get_total_deposited(&asset), 0);
    assert_eq!(client.get_total_borrowed(&asset), 0);
}

#[test]
fn test_update_asset_caps() {
    let env = Env::default();
    let contract_id = env.register(VeilLendContract, ());
    let client = VeilLendContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let asset = Address::generate(&env);
    let user = Address::generate(&env);

    env.mock_all_auths();
    client.__constructor(&admin, &15_000);
    client.configure_asset(&admin, &asset, &true);
    client.set_oracle_price(&admin, &asset, &100);

    // Set caps
    client.update_asset_caps(&admin, &asset, &1000, &500);

    let caps = client.get_asset_caps(&asset);
    assert_eq!(caps.deposit_cap, 1000);
    assert_eq!(caps.borrow_cap, 500);

    // Test deposit cap
    client.deposit(&user, &asset, &500);
    assert_eq!(client.get_total_deposited(&asset), 500);

    // This should succeed (500 + 500 = 1000, at cap)
    client.deposit(&user, &asset, &500);
    assert_eq!(client.get_total_deposited(&asset), 1000);

    // This should fail (exceeds cap)
    let result = std::panic::catch_unwind(|| {
        client.deposit(&user, &asset, &1);
    });
    assert!(result.is_err());

    // Test borrow cap
    client.borrow(&user, &asset, &500);
    assert_eq!(client.get_total_borrowed(&asset), 500);

    let result = std::panic::catch_unwind(|| {
        client.borrow(&user, &asset, &1);
    });
    assert!(result.is_err());
}

#[test]
fn test_circuit_breaker_pause() {
    let env = Env::default();
    let contract_id = env.register(VeilLendContract, ());
    let client = VeilLendContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let asset = Address::generate(&env);
    let user = Address::generate(&env);

    env.mock_all_auths();
    client.__constructor(&admin, &15_000);
    client.configure_asset(&admin, &asset, &true);
    client.set_oracle_price(&admin, &asset, &100);

    // Pause the contract
    client.set_paused(&admin, &true);
    assert_eq!(client.is_paused(), true);

    // Deposit should fail
    let result = std::panic::catch_unwind(|| {
        client.deposit(&user, &asset, &100);
    });
    assert!(result.is_err());

    // Borrow should fail
    let result = std::panic::catch_unwind(|| {
        client.borrow(&user, &asset, &100);
    });
    assert!(result.is_err());

    // First do deposit and borrow while unpaused
    client.set_paused(&admin, &false);
    client.deposit(&user, &asset, &1000);
    client.borrow(&user, &asset, &500);
    client.set_paused(&admin, &true);

    // Repay should still work (user can reduce debt)
    client.repay(&user, &asset, &500);
    assert_eq!(client.get_total_borrowed(&asset), 0);

    // Withdraw should still work (user can remove collateral)
    client.withdraw(&user, &asset, &1000);
    assert_eq!(client.get_total_deposited(&asset), 0);
}

#[test]
fn test_circuit_breaker_unauthorized() {
    let env = Env::default();
    let contract_id = env.register(VeilLendContract, ());
    let client = VeilLendContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let attacker = Address::generate(&env);

    env.mock_all_auths();
    client.__constructor(&admin, &15_000);

    // Attacker tries to pause
    let result = std::panic::catch_unwind(|| {
        client.set_paused(&attacker, &true);
    });
    assert!(result.is_err());

    // Should still be unpaused
    assert_eq!(client.is_paused(), false);
}

#[test]
fn test_deposit_and_borrow_with_caps() {
    let env = Env::default();
    let contract_id = env.register(VeilLendContract, ());
    let client = VeilLendContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let asset = Address::generate(&env);
    let user1 = Address::generate(&env);
    let user2 = Address::generate(&env);

    env.mock_all_auths();
    client.__constructor(&admin, &15_000);
    client.configure_asset(&admin, &asset, &true);
    client.set_oracle_price(&admin, &asset, &100);

    // Set caps
    client.update_asset_caps(&admin, &asset, &2000, &1000);

    // User1 deposits 1000
    client.deposit(&user1, &asset, &1000);
    assert_eq!(client.get_total_deposited(&asset), 1000);

    // User2 deposits 1000 (now at 2000 cap)
    client.deposit(&user2, &asset, &1000);
    assert_eq!(client.get_total_deposited(&asset), 2000);

    // User2 tries to deposit more - should fail
    let result = std::panic::catch_unwind(|| {
        client.deposit(&user2, &asset, &1);
    });
    assert!(result.is_err());

    // User1 borrows 500
    client.borrow(&user1, &asset, &500);
    assert_eq!(client.get_total_borrowed(&asset), 500);

    // User2 borrows 500 (now at 1000 cap)
    client.borrow(&user2, &asset, &500);
    assert_eq!(client.get_total_borrowed(&asset), 1000);

    // User2 tries to borrow more - should fail
    let result = std::panic::catch_unwind(|| {
        client.borrow(&user2, &asset, &1);
    });
    assert!(result.is_err());
}

#[test]
fn test_unlimited_caps() {
    let env = Env::default();
    let contract_id = env.register(VeilLendContract, ());
    let client = VeilLendContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let asset = Address::generate(&env);
    let user = Address::generate(&env);

    env.mock_all_auths();
    client.__constructor(&admin, &15_000);
    client.configure_asset(&admin, &asset, &true);
    client.set_oracle_price(&admin, &asset, &100);

    // Set caps to unlimited (-1)
    client.update_asset_caps(&admin, &asset, &-1, &-1);

    // Should be able to deposit large amounts
    client.deposit(&user, &asset, &1000000);
    assert_eq!(client.get_total_deposited(&asset), 1000000);

    // Should be able to borrow large amounts (if collateral allows)
    client.borrow(&user, &asset, &500000);
    assert_eq!(client.get_total_borrowed(&asset), 500000);
}

#[test]
fn test_invalid_caps() {
    let env = Env::default();
    let contract_id = env.register(VeilLendContract, ());
    let client = VeilLendContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let asset = Address::generate(&env);

    env.mock_all_auths();
    client.__constructor(&admin, &15_000);
    client.configure_asset(&admin, &asset, &true);

    // Zero cap is invalid (should be -1 for unlimited or positive)
    let result = std::panic::catch_unwind(|| {
        client.update_asset_caps(&admin, &asset, &0, &500);
    });
    assert!(result.is_err());

    // Negative cap other than -1 is invalid
    let result = std::panic::catch_unwind(|| {
        client.update_asset_caps(&admin, &asset, &-2, &500);
    });
    assert!(result.is_err());

    // Should still have default caps
    let caps = client.get_asset_caps(&asset);
    assert_eq!(caps.deposit_cap, -1);
    assert_eq!(caps.borrow_cap, -1);
}

#[test]
fn test_cap_update_events() {
    let env = Env::default();
    let contract_id = env.register(VeilLendContract, ());
    let client = VeilLendContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let asset = Address::generate(&env);

    env.mock_all_auths();
    client.__constructor(&admin, &15_000);
    client.configure_asset(&admin, &asset, &true);

    // Events are emitted - we just verify no panic
    client.update_asset_caps(&admin, &asset, &1000, &500);
    let caps = client.get_asset_caps(&asset);
    assert_eq!(caps.deposit_cap, 1000);
    assert_eq!(caps.borrow_cap, 500);
}

#[test]
fn test_circuit_breaker_events() {
    let env = Env::default();
    let contract_id = env.register(VeilLendContract, ());
    let client = VeilLendContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);

    env.mock_all_auths();
    client.__constructor(&admin, &15_000);

    // Toggle pause on
    client.set_paused(&admin, &true);
    assert_eq!(client.is_paused(), true);

    // Toggle pause off
    client.set_paused(&admin, &false);
    assert_eq!(client.is_paused(), false);
}
