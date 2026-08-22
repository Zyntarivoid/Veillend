use core::cmp::Ordering;

use soroban_env_common::Compare;
use soroban_sdk::events::Event;
use soroban_sdk::testutils::{Address as _, Events as _, Ledger as _};
use soroban_sdk::{vec, Address, Env, Val};
use veillend_contract::{
    BatchOperation, InterestAccrued, VeilLendContract, VeilLendContractClient,
};

const SECONDS_PER_YEAR: u64 = 31_536_000;
const DEFAULT_TIMELOCK: u32 = 50;

/// Returns true if two `Val`s are equal per the host's value comparison.
///
/// `soroban_sdk::Val` does not implement `PartialEq` in soroban-sdk 23.x, so
/// event data (a `Val`) must be compared through the host `Compare` trait.
fn val_eq(env: &Env, a: &Val, b: &Val) -> bool {
    env.compare(a, b).unwrap() == Ordering::Equal
}

fn advance_ledgers(env: &Env, n: u32) {
    let current = env.ledger().sequence();
    env.ledger().set_sequence_number(current.saturating_add(n));
}

/// Proposes and executes `configure_asset(true)`, advancing past the default
/// timelock so the action becomes executable.
fn configure_asset(env: &Env, client: &VeilLendContractClient, admin: &Address, asset: &Address) {
    let action_id = client.propose_configure_asset(admin, asset, &true);
    advance_ledgers(env, DEFAULT_TIMELOCK);
    client.execute_configure_asset(admin, &action_id);
}

fn set_oracle_price(
    env: &Env,
    client: &VeilLendContractClient,
    admin: &Address,
    asset: &Address,
    price: &i128,
) {
    let action_id = client.propose_set_oracle_price(admin, asset, price);
    advance_ledgers(env, DEFAULT_TIMELOCK);
    client.execute_set_oracle_price(admin, &action_id);
}

fn update_asset_caps(
    env: &Env,
    client: &VeilLendContractClient,
    admin: &Address,
    asset: &Address,
    deposit_cap: &i128,
    borrow_cap: &i128,
) {
    let action_id = client.propose_update_asset_caps(admin, asset, deposit_cap, borrow_cap);
    advance_ledgers(env, DEFAULT_TIMELOCK);
    client.execute_update_asset_caps(admin, &action_id);
}

fn pause(env: &Env, client: &VeilLendContractClient, admin: &Address) {
    let action_id = client.propose_set_paused(admin);
    advance_ledgers(env, DEFAULT_TIMELOCK);
    client.execute_set_paused(admin, &action_id);
}

#[test]
fn test_initialize_contract() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);

    let admins = client.get_admins();
    assert_eq!(admins.len(), 1);
    assert_eq!(admins.get(0), Some(admin));
    assert_eq!(client.min_collateral_ratio_bps(), 15_000);
    assert_eq!(client.get_timelock_ledgers(), DEFAULT_TIMELOCK);
    assert!(!client.is_paused());
}

#[test]
fn test_configure_asset() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let asset = Address::generate(&env);
    let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);

    let action_id = client.propose_configure_asset(&admin, &asset, &true);
    advance_ledgers(&env, DEFAULT_TIMELOCK);
    client.execute_configure_asset(&admin, &action_id);

    assert!(client.is_asset_supported(&asset));

    let caps = client.get_asset_caps(&asset);
    assert_eq!(caps.deposit_cap, -1);
    assert_eq!(caps.borrow_cap, -1);

    assert_eq!(client.get_total_deposited(&asset), 0);
    assert_eq!(client.get_total_borrowed(&asset), 0);
}

#[test]
fn test_update_asset_caps() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let asset = Address::generate(&env);
    let user = Address::generate(&env);
    let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);

    configure_asset(&env, &client, &admin, &asset);
    set_oracle_price(&env, &client, &admin, &asset, &100);

    // Set caps
    update_asset_caps(&env, &client, &admin, &asset, &1000, &500);

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
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.deposit(&user, &asset, &1);
    }));
    assert!(result.is_err());

    // Test borrow cap
    client.borrow(&user, &asset, &asset, &500);
    assert_eq!(client.get_total_borrowed(&asset), 500);

    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.borrow(&user, &asset, &asset, &1);
    }));
    assert!(result.is_err());
}

#[test]
fn test_circuit_breaker_pause() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let asset = Address::generate(&env);
    let user = Address::generate(&env);
    let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);

    configure_asset(&env, &client, &admin, &asset);
    set_oracle_price(&env, &client, &admin, &asset, &100);

    // Pause the contract (timelocked)
    pause(&env, &client, &admin);
    assert!(client.is_paused());

    // Deposit should fail
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.deposit(&user, &asset, &100);
    }));
    assert!(result.is_err());

    // Borrow should fail
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.borrow(&user, &asset, &asset, &100);
    }));
    assert!(result.is_err());

    // Unpause is immediate, then deposit and borrow
    client.set_paused(&admin, &false);
    client.deposit(&user, &asset, &1000);
    client.borrow(&user, &asset, &asset, &500);
    pause(&env, &client, &admin);

    // Repay should still work (user can reduce debt)
    client.repay(&user, &asset, &500);
    assert_eq!(client.get_total_borrowed(&asset), 0);

    // Withdraw should still work (user can remove collateral)
    client.withdraw(&user, &asset, &asset, &1000);
    assert_eq!(client.get_total_deposited(&asset), 0);
}

#[test]
fn test_circuit_breaker_unauthorized() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let attacker = Address::generate(&env);
    let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);

    // Attacker tries to pause (propose)
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.propose_set_paused(&attacker);
    }));
    assert!(result.is_err());

    // Attacker tries to unpause
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.set_paused(&attacker, &false);
    }));
    assert!(result.is_err());

    // Should still be unpaused
    assert!(!client.is_paused());
}

#[test]
fn test_deposit_and_borrow_with_caps() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let asset = Address::generate(&env);
    let user1 = Address::generate(&env);
    let user2 = Address::generate(&env);
    let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);

    configure_asset(&env, &client, &admin, &asset);
    set_oracle_price(&env, &client, &admin, &asset, &100);

    // Set caps
    update_asset_caps(&env, &client, &admin, &asset, &2000, &1000);

    // User1 deposits 1000
    client.deposit(&user1, &asset, &1000);
    assert_eq!(client.get_total_deposited(&asset), 1000);

    // User2 deposits 1000 (now at 2000 cap)
    client.deposit(&user2, &asset, &1000);
    assert_eq!(client.get_total_deposited(&asset), 2000);

    // User2 tries to deposit more - should fail
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.deposit(&user2, &asset, &1);
    }));
    assert!(result.is_err());

    // User1 borrows 500
    client.borrow(&user1, &asset, &asset, &500);
    assert_eq!(client.get_total_borrowed(&asset), 500);

    // User2 borrows 500 (now at 1000 cap)
    client.borrow(&user2, &asset, &asset, &500);
    assert_eq!(client.get_total_borrowed(&asset), 1000);

    // User2 tries to borrow more - should fail
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.borrow(&user2, &asset, &asset, &1);
    }));
    assert!(result.is_err());
}

#[test]
fn test_unlimited_caps() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let asset = Address::generate(&env);
    let user = Address::generate(&env);
    let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);

    configure_asset(&env, &client, &admin, &asset);
    set_oracle_price(&env, &client, &admin, &asset, &100);

    // Set caps to unlimited (-1)
    update_asset_caps(&env, &client, &admin, &asset, &-1, &-1);

    // Should be able to deposit large amounts
    client.deposit(&user, &asset, &1000000);
    assert_eq!(client.get_total_deposited(&asset), 1000000);

    // Should be able to borrow large amounts (if collateral allows)
    client.borrow(&user, &asset, &asset, &500000);
    assert_eq!(client.get_total_borrowed(&asset), 500000);
}

#[test]
fn test_invalid_caps() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let asset = Address::generate(&env);
    let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);

    configure_asset(&env, &client, &admin, &asset);

    // Zero cap is invalid (should be -1 for unlimited or positive)
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.propose_update_asset_caps(&admin, &asset, &0, &500);
    }));
    assert!(result.is_err());

    // Negative cap other than -1 is invalid
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.propose_update_asset_caps(&admin, &asset, &-2, &500);
    }));
    assert!(result.is_err());

    // Should still have default caps
    let caps = client.get_asset_caps(&asset);
    assert_eq!(caps.deposit_cap, -1);
    assert_eq!(caps.borrow_cap, -1);
}

#[test]
fn test_cap_update_events() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let asset = Address::generate(&env);
    let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);

    configure_asset(&env, &client, &admin, &asset);

    // Events are emitted - we just verify no panic
    update_asset_caps(&env, &client, &admin, &asset, &1000, &500);
    let caps = client.get_asset_caps(&asset);
    assert_eq!(caps.deposit_cap, 1000);
    assert_eq!(caps.borrow_cap, 500);
}

#[test]
fn test_circuit_breaker_events() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);

    // Pause on (timelocked)
    pause(&env, &client, &admin);
    assert!(client.is_paused());

    // Pause off (immediate)
    client.set_paused(&admin, &false);
    assert!(!client.is_paused());
}

#[test]
fn test_deposit_then_borrow_then_time_advances_grows_debt_matching_formula() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let asset = Address::generate(&env);
    let user = Address::generate(&env);
    let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);

    configure_asset(&env, &client, &admin, &asset);
    set_oracle_price(&env, &client, &admin, &asset, &1);

    // 50% utilization: borrow_rate = 200 + (5000 * 2000 / 10000) = 1200 bps (12% APR)
    // supply_rate = 1200 * 5000 / 10000 = 600 bps (6% APR)
    client.deposit(&user, &asset, &1_000_000);
    client.borrow(&user, &asset, &asset, &500_000);

    let ledger_timestamp = env.ledger().timestamp();
    env.ledger()
        .set_timestamp(ledger_timestamp + SECONDS_PER_YEAR);

    let position = client.get_position(&user, &asset);

    assert_eq!(position.borrowed, 560_000);
    assert_eq!(position.deposited, 1_060_000);
}

#[test]
fn test_accrue_interest_grows_indexes_with_no_position_touch() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let asset = Address::generate(&env);
    let user = Address::generate(&env);
    let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);

    configure_asset(&env, &client, &admin, &asset);
    set_oracle_price(&env, &client, &admin, &asset, &1);
    client.deposit(&user, &asset, &1_000_000);
    client.borrow(&user, &asset, &asset, &500_000);

    let before = client.get_interest_state(&asset);
    assert_eq!(before.supply_index, 1_000_000_000);
    assert_eq!(before.borrow_index, 1_000_000_000);

    let ledger_timestamp = env.ledger().timestamp();
    env.ledger()
        .set_timestamp(ledger_timestamp + SECONDS_PER_YEAR);

    // No position is touched here - purely a reserve-level refresh.
    client.accrue_interest(&asset);

    let after = client.get_interest_state(&asset);
    assert_eq!(after.borrow_index, 1_120_000_000);
    assert_eq!(after.supply_index, 1_060_000_000);
    assert_eq!(client.get_total_borrowed(&asset), 560_000);
    assert_eq!(client.get_total_deposited(&asset), 1_060_000);
}

#[test]
fn test_repay_and_withdraw_operate_on_accrued_amounts() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let asset = Address::generate(&env);
    let user = Address::generate(&env);
    let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);

    configure_asset(&env, &client, &admin, &asset);
    set_oracle_price(&env, &client, &admin, &asset, &1);
    client.deposit(&user, &asset, &1_000_000);
    client.borrow(&user, &asset, &asset, &500_000);

    let ledger_timestamp = env.ledger().timestamp();
    env.ledger()
        .set_timestamp(ledger_timestamp + SECONDS_PER_YEAR);

    // Repaying more than the accrued debt should fail.
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.repay(&user, &asset, &560_001);
    }));
    assert!(result.is_err());

    // Repaying exactly the accrued debt succeeds.
    client.repay(&user, &asset, &560_000);
    let position = client.get_position(&user, &asset);
    assert_eq!(position.borrowed, 0);

    // With no outstanding debt, the full accrued deposit can be withdrawn.
    client.withdraw(&user, &asset, &asset, &1_060_000);
    let position = client.get_position(&user, &asset);
    assert_eq!(position.deposited, 0);
}

#[test]
fn test_conservation_of_value_between_suppliers_and_borrower() {
    // Interest accrued to the borrower's debt must exactly equal interest
    // credited to suppliers' deposits in aggregate (100% pass-through, no
    // protocol fee skim in this accrual model) — verified here across two
    // distinct suppliers and a separately-collateralized borrower, at 40%
    // utilization (not the round 50%/100% cases covered elsewhere).
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let asset = Address::generate(&env);
    let supplier = Address::generate(&env);
    let borrower = Address::generate(&env);
    let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);

    configure_asset(&env, &client, &admin, &asset);
    set_oracle_price(&env, &client, &admin, &asset, &1);

    // Pure supplier: deposits only, never borrows.
    client.deposit(&supplier, &asset, &500_000);

    // Borrower: deposits their own collateral, then borrows against it
    // (750_000 * 10_000 >= 500_000 * 15_000, exactly at the 150% minimum).
    client.deposit(&borrower, &asset, &750_000);
    client.borrow(&borrower, &asset, &asset, &500_000);

    let total_deposited_before = client.get_total_deposited(&asset);
    let total_borrowed_before = client.get_total_borrowed(&asset);

    let ledger_timestamp = env.ledger().timestamp();
    env.ledger()
        .set_timestamp(ledger_timestamp + SECONDS_PER_YEAR);

    client.accrue_interest(&asset);

    let total_deposited_growth = client.get_total_deposited(&asset) - total_deposited_before;
    let total_borrowed_growth = client.get_total_borrowed(&asset) - total_borrowed_before;

    assert_eq!(total_deposited_growth, 50_000);
    assert_eq!(total_borrowed_growth, 50_000);
}

#[test]
fn test_two_accrual_calls_at_same_timestamp_are_idempotent() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let asset = Address::generate(&env);
    let user = Address::generate(&env);
    let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);

    configure_asset(&env, &client, &admin, &asset);
    set_oracle_price(&env, &client, &admin, &asset, &1);
    client.deposit(&user, &asset, &1_000_000);
    client.borrow(&user, &asset, &asset, &500_000);

    let ledger_timestamp = env.ledger().timestamp();
    env.ledger()
        .set_timestamp(ledger_timestamp + SECONDS_PER_YEAR);

    client.accrue_interest(&asset);
    let after_first = client.get_interest_state(&asset);
    let total_deposited_after_first = client.get_total_deposited(&asset);
    let total_borrowed_after_first = client.get_total_borrowed(&asset);

    // Same timestamp, no time elapsed - must be a no-op.
    client.accrue_interest(&asset);
    let after_second = client.get_interest_state(&asset);

    assert_eq!(after_first, after_second);
    assert_eq!(
        client.get_total_deposited(&asset),
        total_deposited_after_first
    );
    assert_eq!(
        client.get_total_borrowed(&asset),
        total_borrowed_after_first
    );
}

#[test]
fn test_interest_accrued_event_emission_and_values() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let asset = Address::generate(&env);
    let user = Address::generate(&env);
    let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);

    configure_asset(&env, &client, &admin, &asset);
    set_oracle_price(&env, &client, &admin, &asset, &1);
    client.deposit(&user, &asset, &1_000_000);
    client.borrow(&user, &asset, &asset, &500_000);

    let ledger_timestamp = env.ledger().timestamp();
    env.ledger()
        .set_timestamp(ledger_timestamp + SECONDS_PER_YEAR);

    client.accrue_interest(&asset);

    // 50% utilization: borrow_rate = 12% APR, supply_rate = 6% APR. After one
    // year the borrow index grows 1.0 -> 1.12 and the supply index grows
    // 1.0 -> 1.06, accruing 60_000 to both borrowers and suppliers.
    let expected = InterestAccrued {
        asset: asset.clone(),
        interest_to_suppliers: 60_000,
        interest_to_borrowers: 60_000,
        supply_index_before: 1_000_000_000,
        borrow_index_before: 1_000_000_000,
        supply_index_after: 1_060_000_000,
        borrow_index_after: 1_120_000_000,
        timestamp: ledger_timestamp + SECONDS_PER_YEAR,
    };
    let expected_topics = expected.topics(&env);
    let expected_data = expected.data(&env);

    let events = env.events().all();
    let mut interest_accrued_count = 0u32;
    for (_, topics, data) in events.iter() {
        if topics == expected_topics && val_eq(&env, &data, &expected_data) {
            interest_accrued_count += 1;
        }
    }
    assert_eq!(
        interest_accrued_count, 1,
        "expected exactly one InterestAccrued event with matching values"
    );

    // A second accrual at the same timestamp accrues zero interest, so the
    // guard must skip storage writes and emit no events at all: no
    // InterestAccrued event and no reserve-update event. `env.events().all()`
    // returns only the events of the last contract invocation.
    client.accrue_interest(&asset);

    let second_events = env.events().all();
    let mut second_interest_accrued_count = 0u32;
    for (_, topics, data) in second_events.iter() {
        if topics == expected_topics && val_eq(&env, &data, &expected_data) {
            second_interest_accrued_count += 1;
        }
    }
    assert_eq!(
        second_interest_accrued_count, 0,
        "no InterestAccrued event should be emitted when interest is zero"
    );
    assert_eq!(
        second_events.len(),
        0,
        "a zero-interest accrual must be a pure no-op and emit no events at all"
    );
}

// ---------------------------------------------------------------------------
// Multi-admin + timelock acceptance tests (issue #312)
// ---------------------------------------------------------------------------

#[test]
fn test_two_admin_set_propose_execute_timelock() {
    let env = Env::default();
    env.mock_all_auths();
    let admin1 = Address::generate(&env);
    let admin2 = Address::generate(&env);
    let asset = Address::generate(&env);
    let contract_id = env.register(VeilLendContract, (admin1.clone(), 15_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);

    // admin1 adds admin2 -> 2-admin set
    client.add_admin(&admin1, &admin2);
    let admins = client.get_admins();
    assert!(admins.contains(&admin1));
    assert!(admins.contains(&admin2));

    // admin1 proposes configure_asset
    let action_id = client.propose_configure_asset(&admin1, &asset, &true);

    // execute before timelock -> TimelockNotReady (panics)
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.execute_configure_asset(&admin1, &action_id);
    }));
    assert!(result.is_err());

    // wait ledgers -> execute succeeds
    advance_ledgers(&env, DEFAULT_TIMELOCK);
    client.execute_configure_asset(&admin1, &action_id);
    assert!(client.is_asset_supported(&asset));
}

#[test]
fn test_second_admin_can_execute_proposal() {
    let env = Env::default();
    env.mock_all_auths();
    let admin1 = Address::generate(&env);
    let admin2 = Address::generate(&env);
    let asset = Address::generate(&env);
    let contract_id = env.register(VeilLendContract, (admin1.clone(), 15_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);

    client.add_admin(&admin1, &admin2);

    // admin1 proposes, admin2 executes after timelock
    let action_id = client.propose_configure_asset(&admin1, &asset, &true);
    advance_ledgers(&env, DEFAULT_TIMELOCK);
    client.execute_configure_asset(&admin2, &action_id);
    assert!(client.is_asset_supported(&asset));
}

#[test]
fn test_remove_admin_last_admin_required() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);

    // Removing the only remaining admin must panic (LastAdminRequired)
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.remove_admin(&admin, &admin);
    }));
    assert!(result.is_err());

    // Admin set is unchanged
    let admins = client.get_admins();
    assert_eq!(admins.len(), 1);
    assert_eq!(admins.get(0), Some(admin));
}

#[test]
fn test_add_remove_admin_roundtrip() {
    let env = Env::default();
    env.mock_all_auths();
    let admin1 = Address::generate(&env);
    let admin2 = Address::generate(&env);
    let contract_id = env.register(VeilLendContract, (admin1.clone(), 15_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);

    client.add_admin(&admin1, &admin2);
    assert!(client.get_admins().contains(&admin2));

    // admin2 (now an admin) can remove admin1
    client.remove_admin(&admin2, &admin1);
    let admins = client.get_admins();
    assert_eq!(admins.len(), 1);
    assert_eq!(admins.get(0), Some(admin2));
}

#[test]
fn test_propose_then_cancel_execute_returns_unknown_action() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let asset = Address::generate(&env);
    let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);

    let action_id = client.propose_configure_asset(&admin, &asset, &true);

    // cancel (past the timelock so it would otherwise be executable)
    advance_ledgers(&env, DEFAULT_TIMELOCK);
    client.cancel_configure_asset(&admin, &action_id);

    // execute now returns UnknownAction (panics)
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.execute_configure_asset(&admin, &action_id);
    }));
    assert!(result.is_err());

    // Nothing was configured
    assert!(!client.is_asset_supported(&asset));
}

#[test]
fn test_unpause_immediate_even_with_timelock_configured() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);

    // Configure a long timelock
    client.set_timelock_ledgers(&admin, &100_000);
    assert_eq!(client.get_timelock_ledgers(), 100_000);

    // Pausing still requires the timelock
    let action_id = client.propose_set_paused(&admin);
    advance_ledgers(&env, 100_000);
    client.execute_set_paused(&admin, &action_id);
    assert!(client.is_paused());

    // Unpause executes immediately even with timelock configured
    client.set_paused(&admin, &false);
    assert!(!client.is_paused());
}

#[test]
fn test_set_timelock_ledgers_bounds() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);

    // Below minimum (1)
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.set_timelock_ledgers(&admin, &0);
    }));
    assert!(result.is_err());

    // Above maximum (100_000)
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.set_timelock_ledgers(&admin, &100_001);
    }));
    assert!(result.is_err());

    // Boundary values are accepted
    client.set_timelock_ledgers(&admin, &1);
    assert_eq!(client.get_timelock_ledgers(), 1);
    client.set_timelock_ledgers(&admin, &100_000);
    assert_eq!(client.get_timelock_ledgers(), 100_000);
}

#[test]
fn test_set_min_collateral_ratio_timelocked() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);

    // Invalid ratio (< 10_000 bps) rejected at propose time
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.propose_set_min_collateral_ratio(&admin, &9_999);
    }));
    assert!(result.is_err());

    // Valid ratio proposed and executed after timelock
    let action_id = client.propose_set_min_collateral_ratio(&admin, &20_000);
    advance_ledgers(&env, DEFAULT_TIMELOCK);
    client.execute_set_min_collateral_ratio(&admin, &action_id);

    assert_eq!(client.min_collateral_ratio_bps(), 20_000);
}

#[test]
fn test_record_protocol_fee_timelocked() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let asset = Address::generate(&env);
    let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);

    configure_asset(&env, &client, &admin, &asset);

    let action_id = client.propose_record_protocol_fee(&admin, &asset, &100);
    advance_ledgers(&env, DEFAULT_TIMELOCK);
    client.execute_record_protocol_fee(&admin, &action_id);

    let reserve = client.get_asset_reserve(&asset);
    assert_eq!(reserve.total_balance, 100);
    assert_eq!(reserve.protocol_fees, 100);
}

// ---------------------------------------------------------------------------
// Constructor auth ordering (from #264): the founding admin must sign before
// any storage is touched, so unauthenticated callers cannot probe init state.
// ---------------------------------------------------------------------------

#[test]
fn test_constructor_requires_admin_auth() {
    // No mock_all_auths: the constructor must authenticate `admin`, so
    // registration without the admin signature fails.
    let env = Env::default();
    let admin = Address::generate(&env);

    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        env.register(VeilLendContract, (admin.clone(), 15_000u32));
    }));
    assert!(result.is_err());
}

// ============================================================================
// Oracle Safety Rail Tests (Issue #263)
// ============================================================================

#[test]
fn test_oracle_staleness_tracking() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let asset = Address::generate(&env);
    let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);

    client.add_admin(&admin, &admin);
    configure_asset(&env, &client, &admin, &asset);

    // Set initial price
    client.set_oracle_price(&admin, &asset, &100);

    // Check price with age - should be 0 seconds old
    let (price, age) = client.get_oracle_price_with_age(&asset).unwrap();
    assert_eq!(price, 100);
    assert_eq!(age, 0);

    // Advance time by 1 hour
    let ledger_timestamp = env.ledger().timestamp();
    env.ledger().set_timestamp(ledger_timestamp + 3600);

    // Check again - should be 3600 seconds old
    let (price, age) = client.get_oracle_price_with_age(&asset).unwrap();
    assert_eq!(price, 100);
    assert_eq!(age, 3600);
}

#[test]
fn test_oracle_staleness_blocks_collateral_check() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let asset = Address::generate(&env);
    let user = Address::generate(&env);
    let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);

    client.add_admin(&admin, &admin);
    configure_asset(&env, &client, &admin, &asset);
    client.set_oracle_price(&admin, &asset, &100);

    // Set max age to 1 hour
    client.set_max_oracle_age(&admin, &3600);

    // Deposit and borrow should work initially
    client.deposit(&user, &asset, &1000);
    client.borrow(&user, &asset, &asset, &500);

    // Advance time beyond max age (2 hours)
    let ledger_timestamp = env.ledger().timestamp();
    env.ledger().set_timestamp(ledger_timestamp + 7200);

    // Try to withdraw - should fail due to stale price
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.withdraw(&user, &asset, &asset, &100);
    }));
    assert!(result.is_err());

    // Try to borrow more - should also fail
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.borrow(&user, &asset, &asset, &100);
    }));
    assert!(result.is_err());

    // Repay should still work
    client.repay(&user, &asset, &500);
}

#[test]
fn test_oracle_max_change_bps_blocks_excessive_volatility() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let asset = Address::generate(&env);
    let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);

    client.add_admin(&admin, &admin);
    configure_asset(&env, &client, &admin, &asset);

    // Set initial price to 100
    client.set_oracle_price(&admin, &asset, &100);

    // Set max change to 500 bps (5%)
    client.set_oracle_max_change_bps(&admin, &asset, &500);

    // Try to set price to 106 (6% increase) - should fail
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.set_oracle_price(&admin, &asset, &106);
    }));
    assert!(result.is_err());

    // Set price to 105 (5% increase) - should succeed
    client.set_oracle_price(&admin, &asset, &105);
    assert_eq!(client.get_oracle_price(&asset), Some(105));

    // Set price to 100 (from 105, ~4.76% decrease) - should succeed
    client.set_oracle_price(&admin, &asset, &100);
    assert_eq!(client.get_oracle_price(&asset), Some(100));

    // Set price to 94 (6% decrease) - should fail
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.set_oracle_price(&admin, &asset, &94);
    }));
    assert!(result.is_err());

    // Set price to 95 (5% decrease) - should succeed
    client.set_oracle_price(&admin, &asset, &95);
    assert_eq!(client.get_oracle_price(&asset), Some(95));
}

#[test]
fn test_oracle_price_bounds() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let asset = Address::generate(&env);
    let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);

    client.add_admin(&admin, &admin);
    configure_asset(&env, &client, &admin, &asset);

    // Set bounds: min=1, max=1000
    client.set_oracle_price_bounds(&admin, &asset, &1, &1000);

    // Try to set price below min - should fail
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.set_oracle_price(&admin, &asset, &0);
    }));
    assert!(result.is_err());

    // Set price at min - should succeed
    client.set_oracle_price(&admin, &asset, &1);
    assert_eq!(client.get_oracle_price(&asset), Some(1));

    // Try to set price above max - should fail
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.set_oracle_price(&admin, &asset, &1001);
    }));
    assert!(result.is_err());

    // Set price at max - should succeed
    client.set_oracle_price(&admin, &asset, &1000);
    assert_eq!(client.get_oracle_price(&asset), Some(1000));

    // Set price in middle - should succeed
    client.set_oracle_price(&admin, &asset, &500);
    assert_eq!(client.get_oracle_price(&asset), Some(500));
}

#[test]
fn test_accrue_interest_syncs_reserve_total_balance() {
    // Regression test for issue #260: interest accrual must keep
    // AssetReserve.total_balance in sync with suppliers' growing claim,
    // otherwise the reserve balance drifts stale relative to
    // TotalDeposited - TotalBorrowed.
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let asset = Address::generate(&env);
    let user = Address::generate(&env);
    let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);

    configure_asset(&env, &client, &admin, &asset);
    set_oracle_price(&env, &client, &admin, &asset, &1);

    // 50% utilization: borrow_rate = 12% APR, supply_rate = 6% APR.
    client.deposit(&user, &asset, &1_000_000);
    client.borrow(&user, &asset, &asset, &500_000);

    let ledger_timestamp = env.ledger().timestamp();
    env.ledger()
        .set_timestamp(ledger_timestamp + SECONDS_PER_YEAR);

    client.accrue_interest(&asset);

    assert_eq!(client.get_total_deposited(&asset), 1_060_000);
    assert_eq!(client.get_total_borrowed(&asset), 560_000);

    let reserve = client.get_asset_reserve(&asset);
    // 1_000_000 deposited - 500_000 borrowed out + 60_000 interest credited
    // to suppliers = 560_000. Borrower-side interest (60_000 owed on top of
    // the 500_000 debt) must NOT add to the reserve balance since it never
    // left/entered the reserve as tokens.
    assert_eq!(reserve.total_balance, 560_000);

    assert!(
        reserve.total_balance
            >= client.get_total_deposited(&asset) - client.get_total_borrowed(&asset)
    );
}

#[test]
fn test_withdraw_after_implicit_accrual_uses_synced_reserve() {
    // The implicit accrual inside withdraw() must update the reserve before
    // the InsufficientReserve check runs, or a legitimate full withdrawal of
    // the post-accrual supplier claim would incorrectly be blocked.
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let asset = Address::generate(&env);
    let user = Address::generate(&env);
    let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);

    configure_asset(&env, &client, &admin, &asset);
    set_oracle_price(&env, &client, &admin, &asset, &1);

    client.deposit(&user, &asset, &1_000_000);
    client.borrow(&user, &asset, &asset, &500_000);

    let ledger_timestamp = env.ledger().timestamp();
    env.ledger()
        .set_timestamp(ledger_timestamp + SECONDS_PER_YEAR);

    // No explicit accrue_interest call - withdraw() must accrue internally
    // and sync the reserve before its balance check.
    client.repay(&user, &asset, &560_000);
    client.withdraw(&user, &asset, &asset, &1_060_000);

    let position = client.get_position(&user, &asset);
    assert_eq!(position.deposited, 0);
}

#[test]
fn test_repay_then_withdraw_full_claim_after_accrual() {
    // After a full year of accrual, repaying the full accrued debt and then
    // withdrawing the full accrued deposit must both succeed against a
    // reserve balance that has been kept in sync throughout.
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let asset = Address::generate(&env);
    let user = Address::generate(&env);
    let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);

    configure_asset(&env, &client, &admin, &asset);
    set_oracle_price(&env, &client, &admin, &asset, &1);

    client.deposit(&user, &asset, &1_000_000);
    client.borrow(&user, &asset, &asset, &500_000);

    let ledger_timestamp = env.ledger().timestamp();
    env.ledger()
        .set_timestamp(ledger_timestamp + SECONDS_PER_YEAR);

    client.repay(&user, &asset, &560_000);

    // Reserve was 560_000 (1_000_000 deposited - 500_000 lent out + 60_000
    // supplier interest) before repay; the full 560_000 debt repayment
    // returns those tokens to the reserve.
    let reserve_after_repay = client.get_asset_reserve(&asset);
    assert_eq!(reserve_after_repay.total_balance, 1_120_000);
    assert!(reserve_after_repay.total_balance >= 1_060_000);

    client.withdraw(&user, &asset, &asset, &1_060_000);

    let position = client.get_position(&user, &asset);
    assert_eq!(position.deposited, 0);
    assert_eq!(position.borrowed, 0);

    let reserve_after_withdraw = client.get_asset_reserve(&asset);
    assert_eq!(reserve_after_withdraw.total_balance, 60_000);
}
fn disable_asset(
    env: &Env,
    client: &VeilLendContractClient,
    admin: &Address,
    asset: &Address,
) -> Result<(), ()> {
    let action_id = client.propose_configure_asset(admin, asset, &false);
    advance_ledgers(env, DEFAULT_TIMELOCK);
    std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.execute_configure_asset(admin, &action_id);
    }))
    .map_err(|_| ())
}

#[test]
fn test_configure_asset_disable_blocked_while_deposit_active() {
    // A user deposits → admin attempts to disable → must panic with
    // AssetHasActivePositions (27). After the user withdraws in full, the
    // same disable attempt must succeed.
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let asset = Address::generate(&env);
    let user = Address::generate(&env);
    let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);

    configure_asset(&env, &client, &admin, &asset);
    set_oracle_price(&env, &client, &admin, &asset, &1);

    // Deposit 1 000 — now total_deposited != 0.
    client.deposit(&user, &asset, &1_000);
    assert_eq!(client.get_total_deposited(&asset), 1_000);

    // Disable attempt must panic because active deposits exist.
    let result = disable_asset(&env, &client, &admin, &asset);
    assert!(
        result.is_err(),
        "expected panic with AssetHasActivePositions while deposit is outstanding"
    );
    // Asset is still marked supported — the flag must not have been flipped.
    assert!(client.is_asset_supported(&asset));

    // User withdraws the full amount.
    client.withdraw(&user, &asset, &asset, &1_000);
    assert_eq!(client.get_total_deposited(&asset), 0);

    // Disable attempt must now succeed (no active positions remain).
    let result = disable_asset(&env, &client, &admin, &asset);
    assert!(
        result.is_ok(),
        "expected disable to succeed after all deposits withdrawn"
    );
    assert!(!client.is_asset_supported(&asset));
}

#[test]
fn test_configure_asset_disable_blocked_while_borrow_active() {
    // A user borrows → admin attempts to disable → must panic with
    // AssetHasActivePositions (27). After the user repays in full, the same
    // disable attempt must succeed.
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let asset = Address::generate(&env);
    let user = Address::generate(&env);
    let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);

    configure_asset(&env, &client, &admin, &asset);
    set_oracle_price(&env, &client, &admin, &asset, &1);

    // Deposit enough collateral, then borrow.
    client.deposit(&user, &asset, &2_000);
    client.borrow(&user, &asset, &asset, &1_000);
    assert_eq!(client.get_total_borrowed(&asset), 1_000);

    // Disable attempt must panic because active borrows exist.
    let result = disable_asset(&env, &client, &admin, &asset);
    assert!(
        result.is_err(),
        "expected panic with AssetHasActivePositions while borrow is outstanding"
    );
    assert!(client.is_asset_supported(&asset));

    // User repays the full borrowed amount.
    client.repay(&user, &asset, &1_000);
    assert_eq!(client.get_total_borrowed(&asset), 0);

    // Still has a deposit — disable must still be blocked.
    let result = disable_asset(&env, &client, &admin, &asset);
    assert!(
        result.is_err(),
        "expected panic while deposit still outstanding after repay"
    );

    // User also withdraws the remaining deposit.
    client.withdraw(&user, &asset, &asset, &2_000);
    assert_eq!(client.get_total_deposited(&asset), 0);

    // Now both totals are zero — disable must succeed.
    let result = disable_asset(&env, &client, &admin, &asset);
    assert!(
        result.is_ok(),
        "expected disable to succeed after all borrows repaid and deposits withdrawn"
    );
    assert!(!client.is_asset_supported(&asset));
}

#[test]
fn test_configure_asset_enable_unaffected_by_guardrail() {
    // Enabling (supported=true) must never be blocked by the active-positions
    // guard — the check is only on the disable path.
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let asset = Address::generate(&env);
    let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);

    // Enabling a fresh asset always works.
    configure_asset(&env, &client, &admin, &asset);
    assert!(client.is_asset_supported(&asset));
}

// ---------------------------------------------------------------------------
// Guardrail tests — update_asset_caps below current outstanding
// (fix/admin-action-guardrails: CapBelowOutstanding = 28)
// ---------------------------------------------------------------------------

/// Helper: propose and execute update_asset_caps, returning Ok(()) on success
/// or Err if execution panicked.
fn try_update_caps(
    env: &Env,
    client: &VeilLendContractClient,
    admin: &Address,
    asset: &Address,
    deposit_cap: i128,
    borrow_cap: i128,
) -> Result<(), ()> {
    let action_id = client.propose_update_asset_caps(admin, asset, &deposit_cap, &borrow_cap);
    advance_ledgers(env, DEFAULT_TIMELOCK);
    std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.execute_update_asset_caps(admin, &action_id);
    }))
    .map_err(|_| ())
}

#[test]
fn test_update_deposit_cap_below_outstanding_panics() {
    // 2 000 currently deposited → setting deposit_cap to 1 000 must panic
    // with CapBelowOutstanding (28).
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let asset = Address::generate(&env);
    let user = Address::generate(&env);
    let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);

    configure_asset(&env, &client, &admin, &asset);
    set_oracle_price(&env, &client, &admin, &asset, &1);
    client.deposit(&user, &asset, &2_000);
    assert_eq!(client.get_total_deposited(&asset), 2_000);

    // Setting cap below current total must panic.
    let result = try_update_caps(&env, &client, &admin, &asset, 1_000, -1);
    assert!(
        result.is_err(),
        "expected CapBelowOutstanding when deposit_cap < total_deposited"
    );
}

#[test]
fn test_update_deposit_cap_equal_to_outstanding_succeeds() {
    // 2 000 currently deposited → deposit_cap = 2 000 must succeed (equal is fine).
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let asset = Address::generate(&env);
    let user = Address::generate(&env);
    let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);

    configure_asset(&env, &client, &admin, &asset);
    set_oracle_price(&env, &client, &admin, &asset, &1);
    client.deposit(&user, &asset, &2_000);

    let result = try_update_caps(&env, &client, &admin, &asset, 2_000, -1);
    assert!(
        result.is_ok(),
        "setting deposit_cap equal to outstanding must succeed"
    );
    assert_eq!(client.get_asset_caps(&asset).deposit_cap, 2_000);
}

#[test]
fn test_update_deposit_cap_above_outstanding_succeeds() {
    // 2 000 currently deposited → deposit_cap = 3 000 must succeed.
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let asset = Address::generate(&env);
    let user = Address::generate(&env);
    let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);

    configure_asset(&env, &client, &admin, &asset);
    set_oracle_price(&env, &client, &admin, &asset, &1);
    client.deposit(&user, &asset, &2_000);

    let result = try_update_caps(&env, &client, &admin, &asset, 3_000, -1);
    assert!(
        result.is_ok(),
        "setting deposit_cap above outstanding must succeed"
    );
    assert_eq!(client.get_asset_caps(&asset).deposit_cap, 3_000);
}

#[test]
fn test_update_deposit_cap_unlimited_always_succeeds() {
    // -1 (unlimited sentinel) must always be settable regardless of outstanding.
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let asset = Address::generate(&env);
    let user = Address::generate(&env);
    let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);

    configure_asset(&env, &client, &admin, &asset);
    set_oracle_price(&env, &client, &admin, &asset, &1);
    client.deposit(&user, &asset, &2_000);

    let result = try_update_caps(&env, &client, &admin, &asset, -1, -1);
    assert!(
        result.is_ok(),
        "setting deposit_cap to -1 (unlimited) must always succeed"
    );
    assert_eq!(client.get_asset_caps(&asset).deposit_cap, -1);
}

#[test]
fn test_update_borrow_cap_below_outstanding_panics() {
    // 1 000 currently borrowed → setting borrow_cap to 500 must panic
    // with CapBelowOutstanding (28).
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let asset = Address::generate(&env);
    let user = Address::generate(&env);
    let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);

    configure_asset(&env, &client, &admin, &asset);
    set_oracle_price(&env, &client, &admin, &asset, &1);
    client.deposit(&user, &asset, &2_000);
    client.borrow(&user, &asset, &asset, &1_000);
    assert_eq!(client.get_total_borrowed(&asset), 1_000);

    let result = try_update_caps(&env, &client, &admin, &asset, -1, 500);
    assert!(
        result.is_err(),
        "expected CapBelowOutstanding when borrow_cap < total_borrowed"
    );
}

#[test]
fn test_update_borrow_cap_equal_to_outstanding_succeeds() {
    // 1 000 currently borrowed → borrow_cap = 1 000 must succeed.
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let asset = Address::generate(&env);
    let user = Address::generate(&env);
    let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);

    configure_asset(&env, &client, &admin, &asset);
    set_oracle_price(&env, &client, &admin, &asset, &1);
    client.deposit(&user, &asset, &2_000);
    client.borrow(&user, &asset, &asset, &1_000);

    let result = try_update_caps(&env, &client, &admin, &asset, -1, 1_000);
    assert!(
        result.is_ok(),
        "setting borrow_cap equal to outstanding must succeed"
    );
    assert_eq!(client.get_asset_caps(&asset).borrow_cap, 1_000);
}

#[test]
fn test_update_borrow_cap_above_outstanding_succeeds() {
    // 1 000 currently borrowed → borrow_cap = 2 000 must succeed.
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let asset = Address::generate(&env);
    let user = Address::generate(&env);
    let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);

    configure_asset(&env, &client, &admin, &asset);
    set_oracle_price(&env, &client, &admin, &asset, &1);
    client.deposit(&user, &asset, &2_000);
    client.borrow(&user, &asset, &asset, &1_000);

    let result = try_update_caps(&env, &client, &admin, &asset, -1, 2_000);
    assert!(
        result.is_ok(),
        "setting borrow_cap above outstanding must succeed"
    );
    assert_eq!(client.get_asset_caps(&asset).borrow_cap, 2_000);
}

#[test]
fn test_update_borrow_cap_unlimited_always_succeeds() {
    // -1 (unlimited sentinel) must always be settable regardless of outstanding borrows.
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let asset = Address::generate(&env);
    let user = Address::generate(&env);
    let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);

    configure_asset(&env, &client, &admin, &asset);
    set_oracle_price(&env, &client, &admin, &asset, &1);
    client.deposit(&user, &asset, &2_000);
    client.borrow(&user, &asset, &asset, &1_000);

    let result = try_update_caps(&env, &client, &admin, &asset, -1, -1);
    assert!(
        result.is_ok(),
        "setting borrow_cap to -1 (unlimited) must always succeed"
    );
    assert_eq!(client.get_asset_caps(&asset).borrow_cap, -1);
}

// ---------------------------------------------------------------------------
// Guardrail tests — record_protocol_fee bounds via set_max_protocol_fee_bps
// (fix/admin-action-guardrails: ProtocolFeeExceedsLimit = 29)
// ---------------------------------------------------------------------------

/// Helper: propose and execute record_protocol_fee, returning Ok(()) on
/// success or Err if execution panicked.
fn try_record_fee(
    env: &Env,
    client: &VeilLendContractClient,
    admin: &Address,
    asset: &Address,
    amount: i128,
) -> Result<(), ()> {
    let action_id = client.propose_record_protocol_fee(admin, asset, &amount);
    advance_ledgers(env, DEFAULT_TIMELOCK);
    std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.execute_record_protocol_fee(admin, &action_id);
    }))
    .map_err(|_| ())
}

#[test]
fn test_record_protocol_fee_backward_compat_no_cap_set() {
    // When set_max_protocol_fee_bps has never been called (default 0),
    // record_protocol_fee must behave exactly as before — any positive
    // amount is accepted regardless of size, confirming backward compatibility.
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let asset = Address::generate(&env);
    let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);

    configure_asset(&env, &client, &admin, &asset);

    // Record a small fee — must succeed without any cap.
    let result = try_record_fee(&env, &client, &admin, &asset, 1);
    assert!(
        result.is_ok(),
        "small fee with no cap configured must succeed"
    );

    // Record a very large fee — must also succeed (cap is disabled).
    let result = try_record_fee(&env, &client, &admin, &asset, 1_000_000_000);
    assert!(
        result.is_ok(),
        "large fee with no cap configured must succeed (backward compat)"
    );

    // Record another mid-range fee — all succeed.
    let result = try_record_fee(&env, &client, &admin, &asset, 50_000);
    assert!(
        result.is_ok(),
        "mid-range fee with no cap configured must succeed"
    );
}

#[test]
fn test_record_protocol_fee_exceeds_limit_panics() {
    // set_max_protocol_fee_bps(500) = 5 %.  With net reserve of 100 000
    // the max allowed single-call fee is exactly 5 000
    // (100_000 * 500 / 10_000 = 5_000).  Requesting 5 001 must panic
    // with ProtocolFeeExceedsLimit (29).
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let asset = Address::generate(&env);
    let user = Address::generate(&env);
    let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);

    configure_asset(&env, &client, &admin, &asset);
    set_oracle_price(&env, &client, &admin, &asset, &1);

    // Build a net reserve of 100 000: total_balance = 100_000, protocol_fees = 0.
    client.deposit(&user, &asset, &100_000);

    // Enable the 5 % cap.
    client.set_max_protocol_fee_bps(&admin, &500);

    // 5 001 > 5 000 → must panic.
    let result = try_record_fee(&env, &client, &admin, &asset, 5_001);
    assert!(
        result.is_err(),
        "fee of 5_001 must be rejected when max is 5_000 (5 % of 100_000)"
    );
}

#[test]
fn test_record_protocol_fee_at_exact_limit_succeeds() {
    // Boundary is inclusive (≤).  A fee of exactly 5 000 must succeed when
    // net reserve is 100 000 and the cap is 500 bps (5 %)
    // (100_000 * 500 / 10_000 = 5_000).
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let asset = Address::generate(&env);
    let user = Address::generate(&env);
    let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);

    configure_asset(&env, &client, &admin, &asset);
    set_oracle_price(&env, &client, &admin, &asset, &1);
    client.deposit(&user, &asset, &100_000);
    client.set_max_protocol_fee_bps(&admin, &500);

    // Exactly at the limit — must succeed.
    let result = try_record_fee(&env, &client, &admin, &asset, 5_000);
    assert!(
        result.is_ok(),
        "fee of exactly 5_000 must succeed (boundary is inclusive)"
    );

    let reserve = client.get_asset_reserve(&asset);
    assert_eq!(reserve.protocol_fees, 5_000);
}

#[test]
fn test_set_max_protocol_fee_bps_above_5000_panics() {
    // Any value above 5 000 must be rejected immediately (uses InvalidCap).
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);

    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.set_max_protocol_fee_bps(&admin, &5_001);
    }));
    assert!(
        result.is_err(),
        "set_max_protocol_fee_bps(5_001) must panic"
    );

    // The boundary value 5 000 must be accepted.
    client.set_max_protocol_fee_bps(&admin, &5_000);
}

#[test]
fn test_set_max_protocol_fee_bps_requires_admin_auth() {
    // A non-admin caller must be rejected with Unauthorized.
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let attacker = Address::generate(&env);
    let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);

    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.set_max_protocol_fee_bps(&attacker, &500);
    }));
    assert!(
        result.is_err(),
        "non-admin must not be able to call set_max_protocol_fee_bps"
    );
}

// ---------------------------------------------------------------------------
// Cross-asset collateralization tests (issue #262)
// ---------------------------------------------------------------------------

#[test]
fn test_cross_asset_borrow_insufficient_collateral() {
    // Proving test: collateral and debt values must come from the prices of
    // DIFFERENT assets. X has price 1 and Y has price 2. A user deposits
    // 10_000 X (collateral value 10_000) and tries to borrow 4_000 Y (debt
    // value 8_000). At a 15_000 bps minimum the required collateral is
    // 12_000, so this must fail with InsufficientCollateral — the old
    // same-price model priced both sides with one asset and would not catch
    // this.
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let asset_x = Address::generate(&env);
    let asset_y = Address::generate(&env);
    let user = Address::generate(&env);
    let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);

    configure_asset(&env, &client, &admin, &asset_x);
    configure_asset(&env, &client, &admin, &asset_y);
    set_oracle_price(&env, &client, &admin, &asset_x, &1);
    set_oracle_price(&env, &client, &admin, &asset_y, &2);

    client.deposit(&user, &asset_x, &10_000);

    // Seed Y liquidity so the borrow reaches the collateral check instead of
    // failing earlier on InsufficientReserve.
    let supplier = Address::generate(&env);
    client.deposit(&supplier, &asset_y, &100_000);

    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.borrow(&user, &asset_y, &asset_x, &4_000);
    }));
    assert!(
        result.is_err(),
        "cross-asset borrow must fail: 10_000 collateral < 12_000 required"
    );
}

#[test]
fn test_cross_asset_borrow_at_exactly_min_ratio_succeeds() {
    // (a) Deposit A (price 1), borrow B (price 2) at exactly 150%.
    // collateral = 300 * 1 = 300, debt = 100 * 2 = 200 → ratio 150%.
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let asset_a = Address::generate(&env);
    let asset_b = Address::generate(&env);
    let user = Address::generate(&env);
    let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);

    configure_asset(&env, &client, &admin, &asset_a);
    configure_asset(&env, &client, &admin, &asset_b);
    set_oracle_price(&env, &client, &admin, &asset_a, &1);
    set_oracle_price(&env, &client, &admin, &asset_b, &2);

    let supplier = Address::generate(&env);
    client.deposit(&supplier, &asset_b, &1_000);
    client.deposit(&user, &asset_a, &300);

    client.borrow(&user, &asset_b, &asset_a, &100);

    let position = client.get_position(&user, &asset_b);
    assert_eq!(position.borrowed, 100);
}

#[test]
fn test_cross_asset_borrow_below_min_ratio_fails() {
    // (b) Deposit A (price 1), try to borrow B (price 2) at 149%.
    // collateral = 298 * 1 = 298, debt = 100 * 2 = 200 → ratio 149%.
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let asset_a = Address::generate(&env);
    let asset_b = Address::generate(&env);
    let user = Address::generate(&env);
    let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);

    configure_asset(&env, &client, &admin, &asset_a);
    configure_asset(&env, &client, &admin, &asset_b);
    set_oracle_price(&env, &client, &admin, &asset_a, &1);
    set_oracle_price(&env, &client, &admin, &asset_b, &2);

    let supplier = Address::generate(&env);
    client.deposit(&supplier, &asset_b, &1_000);
    client.deposit(&user, &asset_a, &298);

    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.borrow(&user, &asset_b, &asset_a, &100);
    }));
    assert!(
        result.is_err(),
        "cross-asset borrow at 149% must fail with InsufficientCollateral"
    );
}

#[test]
fn test_cross_asset_withdraw_that_breaks_ratio_panics() {
    // (c) Deposit A (price 1), borrow B (price 2) at 200%, then withdraw A
    // down to exactly 150% (succeeds); a further withdraw that would drop
    // the ratio to 149% must panic with InsufficientCollateral.
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let asset_a = Address::generate(&env);
    let asset_b = Address::generate(&env);
    let user = Address::generate(&env);
    let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);

    configure_asset(&env, &client, &admin, &asset_a);
    configure_asset(&env, &client, &admin, &asset_b);
    set_oracle_price(&env, &client, &admin, &asset_a, &1);
    set_oracle_price(&env, &client, &admin, &asset_b, &2);

    let supplier = Address::generate(&env);
    client.deposit(&supplier, &asset_b, &1_000);

    // collateral = 400 * 1 = 400, debt = 100 * 2 = 200 → ratio 200%.
    client.deposit(&user, &asset_a, &400);
    client.borrow(&user, &asset_b, &asset_a, &100);

    // Withdraw 100 A → collateral 300, debt 200 → exactly 150% (succeeds).
    client.withdraw(&user, &asset_a, &asset_b, &100);

    // Withdraw 2 more A → collateral 298, debt 200 → 149% (must panic).
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.withdraw(&user, &asset_a, &asset_b, &2);
    }));
    assert!(
        result.is_err(),
        "withdraw that drops the cross-asset ratio to 149% must panic"
    );
}

// ---------------------------------------------------------------------------
// Interest accrual correctness tests (issue #349)
// ---------------------------------------------------------------------------

#[test]
fn small_amounts_dust_accrual() {
    // Tiny balances: total_supplied = 15_000, total_borrowed = 5_000
    // (33% utilization). Over one year:
    //   borrow_rate = 200 + (3333 * 2000 / 10_000) = 866 bps
    //   supply_rate = 866 * 3333 / 10_000 = 288 bps
    //   borrow_growth = 86_600_000
    //   supply_growth = 28_800_000
    //   interest_to_borrowers = 5_000 * 86_600_000 / 1e9 = 433
    //   interest_to_suppliers = 15_000 * 28_800_000 / 1e9 = 432
    //   dust = 433 - 432 = 1
    //
    // We accrue 100 times (each 1 year apart — limited to 100 to avoid
    // borrow_index overflow from exponential compounding) and verify:
    //   1. The aggregate dust across all accruals is non-zero
    //   2. Final reserve.total_balance == initial deposit + Σ(supplier interest) + Σ(dust)
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let asset = Address::generate(&env);
    let user = Address::generate(&env);
    let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);

    configure_asset(&env, &client, &admin, &asset);
    set_oracle_price(&env, &client, &admin, &asset, &1);

    // Deposit creates the supplier side; borrow creates the borrower side.
    client.deposit(&user, &asset, &15_000);
    client.borrow(&user, &asset, &asset, &5_000);

    let initial_reserve = client.get_asset_reserve(&asset);
    let mut cumulative_supplier_interest: i128 = 0;
    let mut cumulative_dust: i128 = 0;

    for _ in 0..100 {
        let before_total_deposited = client.get_total_deposited(&asset);
        let before_total_borrowed = client.get_total_borrowed(&asset);

        let ledger_timestamp = env.ledger().timestamp();
        env.ledger()
            .set_timestamp(ledger_timestamp + SECONDS_PER_YEAR);

        client.accrue_interest(&asset);

        let after_total_deposited = client.get_total_deposited(&asset);
        let after_total_borrowed = client.get_total_borrowed(&asset);
        let supplier_interest = after_total_deposited - before_total_deposited;
        let borrower_interest = after_total_borrowed - before_total_borrowed;
        let dust = borrower_interest - supplier_interest;

        // Dust must never be negative — borrowers always pay >= what suppliers receive.
        assert!(dust >= 0, "dust must never be negative");

        cumulative_supplier_interest += supplier_interest;
        cumulative_dust += dust;
    }

    // Aggregate dust over 100 accruals must be non-zero.
    assert!(
        cumulative_dust > 0,
        "aggregate dust over accruals must be non-zero"
    );

    let final_reserve = client.get_asset_reserve(&asset);
    // Reserve balance must equal: initial_deposit + Σ(supplier_interest) + Σ(dust)
    assert_eq!(
        final_reserve.total_balance,
        initial_reserve.total_balance + cumulative_supplier_interest + cumulative_dust
    );
}

#[test]
fn test_paused_contract_blocks_all_mutating_admin_and_accrual_entrypoints() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let asset = Address::generate(&env);
    let user = Address::generate(&env);
    let other_admin = Address::generate(&env);
    let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);

    // Initial setup before pause
    configure_asset(&env, &client, &admin, &asset);
    set_oracle_price(&env, &client, &admin, &asset, &100);

    // Pause contract
    pause(&env, &client, &admin);
    assert!(client.is_paused());

    // 1. add_admin must panic with ContractPaused
    assert!(std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.add_admin(&admin, &other_admin);
    }))
    .is_err());

    // 2. remove_admin must panic
    assert!(std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.remove_admin(&admin, &other_admin);
    }))
    .is_err());

    // 3. set_timelock_ledgers must panic
    assert!(std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.set_timelock_ledgers(&admin, &100);
    }))
    .is_err());

    // 4. propose_configure_asset must panic
    let new_asset = Address::generate(&env);
    assert!(std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.propose_configure_asset(&admin, &new_asset, &true);
    }))
    .is_err());

    // 5. set_oracle_price must panic
    assert!(std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.set_oracle_price(&admin, &asset, &200);
    }))
    .is_err());

    // 6. set_max_oracle_age must panic
    assert!(std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.set_max_oracle_age(&admin, &3600);
    }))
    .is_err());

    // 7. set_oracle_max_change_bps must panic
    assert!(std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.set_oracle_max_change_bps(&admin, &asset, &500);
    }))
    .is_err());

    // 8. set_oracle_price_bounds must panic
    assert!(std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.set_oracle_price_bounds(&admin, &asset, &10, &1000);
    }))
    .is_err());

    // 9. propose_update_asset_caps must panic
    assert!(std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.propose_update_asset_caps(&admin, &asset, &1000, &500);
    }))
    .is_err());

    // 10. propose_set_min_collateral_ratio must panic
    assert!(std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.propose_set_min_collateral_ratio(&admin, &20_000);
    }))
    .is_err());

    // 11. accrue_interest must panic
    assert!(std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.accrue_interest(&asset);
    }))
    .is_err());

    // 12. propose_record_protocol_fee must panic
    assert!(std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.propose_record_protocol_fee(&admin, &asset, &500);
    }))
    .is_err());

    // 13. set_max_protocol_fee_bps must panic
    assert!(std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.set_max_protocol_fee_bps(&admin, &1000);
    }))
    .is_err());

    // 14. deposit must panic
    assert!(std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.deposit(&user, &asset, &1000);
    }))
    .is_err());

    // 15. borrow must panic
    assert!(std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.borrow(&user, &asset, &asset, &500);
    }))
    .is_err());
}

#[test]
fn test_repay_and_withdraw_succeed_while_paused() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let asset = Address::generate(&env);
    let user = Address::generate(&env);
    let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);

    configure_asset(&env, &client, &admin, &asset);
    set_oracle_price(&env, &client, &admin, &asset, &1);

    // Initial deposit and borrow
    client.deposit(&user, &asset, &1_000_000);
    client.borrow(&user, &asset, &asset, &500_000);

    // Pause contract during active incident
    pause(&env, &client, &admin);
    assert!(client.is_paused());

    // Users MUST be able to repay debt while paused to avoid liquidation / de-risk
    client.repay(&user, &asset, &500_000);
    let pos_after_repay = client.get_position(&user, &asset);
    assert_eq!(pos_after_repay.borrowed, 0);

    // Users MUST be able to withdraw their deposited funds to safety while paused
    client.withdraw(&user, &asset, &asset, &1_000_000);
    let pos_after_withdraw = client.get_position(&user, &asset);
    assert_eq!(pos_after_withdraw.deposited, 0);

    // Admin can unpause immediately
    client.set_paused(&admin, &false);
    assert!(!client.is_paused());
}

#[test]
fn test_healthy_position_liquidation_fails_not_liquidatable() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let usdc = Address::generate(&env);
    let xlm = Address::generate(&env);
    let borrower = Address::generate(&env);
    let liquidator = Address::generate(&env);

    let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000u32)); // 150% min collateral
    let client = VeilLendContractClient::new(&env, &contract_id);

    configure_asset(&env, &client, &admin, &usdc);
    configure_asset(&env, &client, &admin, &xlm);
    set_oracle_price(&env, &client, &admin, &usdc, &100);
    set_oracle_price(&env, &client, &admin, &xlm, &100);

    // Borrower deposits 300 XLM ($300) and borrows 100 USDC ($100) -> 300% collateral ratio (Healthy)
    client.deposit(&borrower, &xlm, &300);
    client.borrow(&borrower, &usdc, &xlm, &100);

    // Liquidator tries to liquidate healthy position -> fails NotLiquidatable
    let res = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.liquidate(&liquidator, &borrower, &xlm, &usdc, &50);
    }));
    assert!(res.is_err(), "Healthy position cannot be liquidated");
}

#[test]
fn test_liquidation_close_factor_bounds_and_seize_discount() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let usdc = Address::generate(&env);
    let xlm = Address::generate(&env);
    let borrower = Address::generate(&env);
    let liquidator = Address::generate(&env);

    let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000u32)); // 150% min collateral
    let client = VeilLendContractClient::new(&env, &contract_id);

    configure_asset(&env, &client, &admin, &usdc);
    configure_asset(&env, &client, &admin, &xlm);
    set_oracle_price(&env, &client, &admin, &usdc, &100);
    set_oracle_price(&env, &client, &admin, &xlm, &100);

    // Borrower deposits 200 XLM and borrows 100 USDC (initially 200% ratio)
    client.deposit(&borrower, &xlm, &200);
    client.borrow(&borrower, &usdc, &xlm, &100);

    // XLM price drops to 60 -> Collateral value = 200 * 60 = 12,000; Debt value = 100 * 100 = 10,000
    // Ratio = 12,000 / 10,000 = 120% < 150% (Underwater / Breach!)
    set_oracle_price(&env, &client, &admin, &xlm, &60);

    // Try liquidating 51 USDC (above 50% close factor of 100 debt) -> fails LiquidationTooLarge
    let res_too_large = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.liquidate(&liquidator, &borrower, &xlm, &usdc, &51);
    }));
    assert!(res_too_large.is_err(), "Exceeding close factor must panic LiquidationTooLarge");

    // Liquidate 49 USDC (within 50% close factor) -> Succeeds!
    client.liquidate(&liquidator, &borrower, &xlm, &usdc, &49);

    let borrower_debt_pos = client.get_position(&borrower, &usdc);
    assert_eq!(borrower_debt_pos.borrowed, 51);

    let liquidator_pos = client.get_position(&liquidator, &xlm);
    assert!(liquidator_pos.deposited > 0, "Liquidator seized collateral");
}

#[test]
fn test_liquidation_seize_math_with_price_divergence() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let usdc = Address::generate(&env);
    let xlm = Address::generate(&env);
    let borrower = Address::generate(&env);
    let liquidator = Address::generate(&env);

    let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);

    configure_asset(&env, &client, &admin, &usdc);
    configure_asset(&env, &client, &admin, &xlm);
    // USDC = $1.00 (100 stroops), XLM = $1.00 (100 stroops)
    set_oracle_price(&env, &client, &admin, &usdc, &100);
    set_oracle_price(&env, &client, &admin, &xlm, &100);

    // Borrower deposits 4000 XLM and borrows 2000 USDC
    client.deposit(&borrower, &xlm, &4000);
    client.borrow(&borrower, &usdc, &xlm, &2000);

    // XLM price drops to $0.50 (50 stroops) -> Collateral value = 4000 * 50 = $2000, Debt value = 2000 * 100 = $2000 (100% ratio < 150%)
    set_oracle_price(&env, &client, &admin, &xlm, &50);

    // Repay 1000 USDC at $1.00, collateral XLM at $0.50, default discount 10500 bps (5% bonus)
    // Seized XLM = (1000 * 100 * 10500) / (50 * 10000) = 1,050,000,000 / 500,000 = 2100 XLM
    client.liquidate(&liquidator, &borrower, &xlm, &usdc, &1000);

    let liquidator_pos = client.get_position(&liquidator, &xlm);
    assert_eq!(liquidator_pos.deposited, 2100);

    let borrower_xlm_pos = client.get_position(&borrower, &xlm);
    assert_eq!(borrower_xlm_pos.deposited, 1900); // 4000 - 2100

    let borrower_usdc_pos = client.get_position(&borrower, &usdc);
    assert_eq!(borrower_usdc_pos.borrowed, 1000); // 2000 - 1000
}

#[test]
fn test_bad_debt_writeoff_checks_collateral_and_updates_total_borrowed() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let usdc = Address::generate(&env);
    let xlm = Address::generate(&env);
    let borrower = Address::generate(&env);
    let liquidator = Address::generate(&env);

    let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);

    configure_asset(&env, &client, &admin, &usdc);
    configure_asset(&env, &client, &admin, &xlm);
    set_oracle_price(&env, &client, &admin, &usdc, &100);
    set_oracle_price(&env, &client, &admin, &xlm, &100);

    // Borrower deposits 100 XLM and borrows 50 USDC
    client.deposit(&borrower, &xlm, &100);
    client.borrow(&borrower, &usdc, &xlm, &50);

    // Admin tries to write off bad debt while borrower still has collateral -> fails CollateralRemaining
    let res_collateral_remaining = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.writeoff_bad_debt(&admin, &borrower, &usdc);
    }));
    assert!(res_collateral_remaining.is_err(), "Bad debt writeoff must fail if collateral remains");

    // XLM price drops to $0.20 -> 100 XLM is only worth $20 collateral vs $50 debt
    set_oracle_price(&env, &client, &admin, &xlm, &20);

    // Liquidator repays $20 of debt (close factor set to 100% and 1.0x discount)
    // Seized XLM = (20 * 100 * 10000) / (20 * 10000) = 100 XLM (All borrower collateral seized!)
    client.set_liquidation_params(&admin, &10_000, &10_000);
    client.liquidate(&liquidator, &borrower, &xlm, &usdc, &20);

    let borrower_xlm_pos = client.get_position(&borrower, &xlm);
    assert_eq!(borrower_xlm_pos.deposited, 0, "Collateral completely exhausted");

    let borrower_usdc_pos = client.get_position(&borrower, &usdc);
    assert_eq!(borrower_usdc_pos.borrowed, 30, "30 USDC uncollateralized bad debt remains");

    // After full liquidation, when collateral is 0, admin can write off remaining bad debt
    client.writeoff_bad_debt(&admin, &borrower, &usdc);

    let final_pos = client.get_position(&borrower, &usdc);
    assert_eq!(final_pos.borrowed, 0, "Bad debt fully written off");
}

#[test]
fn test_set_liquidation_params_bounds_validation() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);

    // Valid update: 60% close factor, 8% discount
    client.set_liquidation_params(&admin, &6_000, &10_800);
    let (close, discount) = client.get_liquidation_params();
    assert_eq!(close, 6_000);
    assert_eq!(discount, 10_800);

    // Invalid close factor = 0 -> panics
    assert!(std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.set_liquidation_params(&admin, &0, &10_500);
    })).is_err());

    // Invalid close factor > 10_000 -> panics
    assert!(std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.set_liquidation_params(&admin, &10_001, &10_500);
    })).is_err());

    // Invalid discount < 10_000 -> panics
    assert!(std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.set_liquidation_params(&admin, &5_000, &9_999);
    })).is_err());

    // Invalid discount > 12_000 -> panics
    assert!(std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.set_liquidation_params(&admin, &5_000, &12_001);
    })).is_err());
}

#[test]
fn test_batch_deposit_and_repay_parity_with_single_call() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let usdc = Address::generate(&env);
    let xlm = Address::generate(&env);
    let user = Address::generate(&env);

    let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);

    configure_asset(&env, &client, &admin, &usdc);
    configure_asset(&env, &client, &admin, &xlm);
    set_oracle_price(&env, &client, &admin, &usdc, &100);
    set_oracle_price(&env, &client, &admin, &xlm, &100);

    // Multi-asset batch deposit (1000 XLM and 500 USDC)
    let ops = vec![
        &env,
        BatchOperation { asset: xlm.clone(), amount: 1000 },
        BatchOperation { asset: usdc.clone(), amount: 500 },
    ];
    client.deposit_batch(&user, &ops);

    let xlm_pos = client.get_position(&user, &xlm);
    let usdc_pos = client.get_position(&user, &usdc);
    assert_eq!(xlm_pos.deposited, 1000);
    assert_eq!(usdc_pos.deposited, 500);

    // Single borrow
    client.borrow(&user, &usdc, &xlm, &200);

    // Batch repay
    let repay_ops = vec![
        &env,
        BatchOperation { asset: usdc.clone(), amount: 200 },
    ];
    client.repay_batch(&user, &repay_ops);

    let usdc_pos_after = client.get_position(&user, &usdc);
    assert_eq!(usdc_pos_after.borrowed, 0);
}

#[test]
fn test_batch_borrow_and_withdraw_end_of_batch_health_check() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let usdc = Address::generate(&env);
    let xlm = Address::generate(&env);
    let user = Address::generate(&env);

    let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);

    configure_asset(&env, &client, &admin, &usdc);
    configure_asset(&env, &client, &admin, &xlm);
    set_oracle_price(&env, &client, &admin, &usdc, &100);
    set_oracle_price(&env, &client, &admin, &xlm, &100);

    // Deposit 3000 XLM ($3000)
    client.deposit(&user, &xlm, &3000);

    // Batch borrow multiple amounts (300 USDC and 200 USDC -> Total 500 USDC vs 3000 XLM collateral = 600% ratio)
    let borrow_ops = vec![
        &env,
        BatchOperation { asset: usdc.clone(), amount: 300 },
        BatchOperation { asset: usdc.clone(), amount: 200 },
    ];
    client.borrow_batch(&user, &borrow_ops, &xlm);

    let usdc_pos = client.get_position(&user, &usdc);
    assert_eq!(usdc_pos.borrowed, 500);

    // Batch withdraw 1000 XLM (leaves 2000 XLM collateral vs 500 USDC debt = 400% ratio >= 150%)
    let withdraw_ops = vec![
        &env,
        BatchOperation { asset: xlm.clone(), amount: 500 },
        BatchOperation { asset: xlm.clone(), amount: 500 },
    ];
    client.withdraw_batch(&user, &withdraw_ops, &usdc);

    let xlm_pos = client.get_position(&user, &xlm);
    assert_eq!(xlm_pos.deposited, 2000);
}

#[test]
fn test_batch_undercollateralized_end_state_reverts() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let usdc = Address::generate(&env);
    let xlm = Address::generate(&env);
    let user = Address::generate(&env);

    let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000u32)); // 150% min collateral
    let client = VeilLendContractClient::new(&env, &contract_id);

    configure_asset(&env, &client, &admin, &usdc);
    configure_asset(&env, &client, &admin, &xlm);
    set_oracle_price(&env, &client, &admin, &usdc, &100);
    set_oracle_price(&env, &client, &admin, &xlm, &100);

    client.deposit(&user, &xlm, &1000);

    // Try batch borrow of 800 USDC (requires 1200 XLM collateral at 150%, only 1000 available -> reverts)
    let bad_borrow_ops = vec![
        &env,
        BatchOperation { asset: usdc.clone(), amount: 400 },
        BatchOperation { asset: usdc.clone(), amount: 400 },
    ];
    let res = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.borrow_batch(&user, &bad_borrow_ops, &xlm);
    }));
    assert!(res.is_err(), "Undercollateralized batch must revert atomically");
}
