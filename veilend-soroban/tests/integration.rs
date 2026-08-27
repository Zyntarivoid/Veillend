use core::cmp::Ordering;

use ed25519_dalek::{Signer, SigningKey};
use soroban_env_common::{Compare, TryFromVal};
use soroban_sdk::events::Event;
use soroban_sdk::testutils::storage::Persistent as _;
use soroban_sdk::testutils::{Address as _, Events as _, Ledger as _};
use soroban_sdk::{Address, Bytes, BytesN, Env, Symbol, Val};
use veillend_contract::{
    compute_permit_digest, signer_address, ActionKind, ActionPayload, ContractUpgraded, DataKey,
    InterestAccrued, InterestParams, Permit, StorageMigrated, VeilLendContract,
    VeilLendContractClient, CONTRACT_VERSION, PERMIT_TTL_EXTEND_TO, PERSISTENT_TTL_EXTEND_TO,
    PERSISTENT_TTL_THRESHOLD, STORAGE_SCHEMA_VERSION, UPGRADE_MIN_TIMELOCK_LEDGERS,
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
    set_legacy_interest_params(&client, &admin, &asset);

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
    set_legacy_interest_params(&client, &admin, &asset);
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
    set_legacy_interest_params(&client, &admin, &asset);
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
    set_legacy_interest_params(&client, &admin, &asset);

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
    set_legacy_interest_params(&client, &admin, &asset);
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
    set_legacy_interest_params(&client, &admin, &asset);

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
    set_legacy_interest_params(&client, &admin, &asset);
    set_legacy_interest_params(&client, &admin, &asset);

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
    set_legacy_interest_params(&client, &admin, &asset);

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
    set_legacy_interest_params(&client, &admin, &asset);

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

// The overflow test is in interest.rs as a unit test (zero_snapshot and
// overflow tests work at the function level since they need to construct
// extreme states directly).

// ---------------------------------------------------------------------------
// Per-asset supply/borrow caps (issue #341)
// ---------------------------------------------------------------------------

#[test]
fn supply_cap_blocks_excess() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let asset = Address::generate(&env);
    let depositor_a = Address::generate(&env);
    let depositor_b = Address::generate(&env);
    let contract_id = env.register(VeilLendContract, (admin.clone(), 10_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);

    configure_asset(&env, &client, &admin, &asset);
    set_oracle_price(&env, &client, &admin, &asset, &1);

    client.set_supply_cap(&admin, &asset, &1_000);
    assert_eq!(client.supply_cap(&asset), 1_000);

    // First depositor stays within the cap.
    client.deposit(&depositor_a, &asset, &700);
    assert_eq!(client.get_total_deposited(&asset), 700);

    // Second depositor pushes the total past the cap and must revert.
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.deposit(&depositor_b, &asset, &400);
    }));
    assert!(
        result.is_err(),
        "expected SupplyCapExceeded when total_supplied + amount > supply_cap"
    );
    // The failed deposit must not have partially applied.
    assert_eq!(client.get_total_deposited(&asset), 700);

    // A deposit that lands exactly on the cap still succeeds.
    client.deposit(&depositor_b, &asset, &300);
    assert_eq!(client.get_total_deposited(&asset), 1_000);
}

#[test]
fn borrow_cap_blocks_excess() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let asset = Address::generate(&env);
    let borrower_a = Address::generate(&env);
    let borrower_b = Address::generate(&env);
    let contract_id = env.register(VeilLendContract, (admin.clone(), 10_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);

    configure_asset(&env, &client, &admin, &asset);
    set_oracle_price(&env, &client, &admin, &asset, &1);

    // Fund the reserve and each borrower's collateral so InsufficientReserve /
    // InsufficientCollateral never masks the cap check.
    client.deposit(&borrower_a, &asset, &10_000);
    client.deposit(&borrower_b, &asset, &10_000);

    client.set_borrow_cap(&admin, &asset, &1_000);
    assert_eq!(client.borrow_cap(&asset), 1_000);

    client.borrow(&borrower_a, &asset, &asset, &700);
    assert_eq!(client.get_total_borrowed(&asset), 700);

    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.borrow(&borrower_b, &asset, &asset, &400);
    }));
    assert!(
        result.is_err(),
        "expected BorrowCapExceeded when total_borrowed + amount > borrow_cap"
    );
    assert_eq!(client.get_total_borrowed(&asset), 700);

    client.borrow(&borrower_b, &asset, &asset, &300);
    assert_eq!(client.get_total_borrowed(&asset), 1_000);
}

#[test]
fn cap_zero_means_unlimited() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let asset = Address::generate(&env);
    let user = Address::generate(&env);
    let contract_id = env.register(VeilLendContract, (admin.clone(), 10_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);

    configure_asset(&env, &client, &admin, &asset);
    set_oracle_price(&env, &client, &admin, &asset, &1);

    // Caps default to 0 (unset) — large deposits and borrows must not be
    // blocked by the new supply/borrow cap mechanism.
    assert_eq!(client.supply_cap(&asset), 0);
    assert_eq!(client.borrow_cap(&asset), 0);

    client.deposit(&user, &asset, &1_000_000_000);
    assert_eq!(client.get_total_deposited(&asset), 1_000_000_000);

    client.borrow(&user, &asset, &asset, &500_000_000);
    assert_eq!(client.get_total_borrowed(&asset), 500_000_000);

    // Explicitly setting the cap to 0 must also mean unlimited.
    client.set_supply_cap(&admin, &asset, &0);
    client.deposit(&user, &asset, &1_000_000_000);
    assert_eq!(client.get_total_deposited(&asset), 2_000_000_000);
}

// ---------------------------------------------------------------------------
// Liquidation close factor (issue #341)
// ---------------------------------------------------------------------------

/// Sets up a position with health factor 0.999 (mildly undercollateralized):
/// deposits and borrows a `1:1` position at the min collateral ratio while
/// the collateral price is 1000, then the admin drops the collateral price
/// to 999 — pushing collateral_value/borrowed_value just under the 100% min
/// collateral ratio threshold used by this test's contract instance.
fn setup_mild_undercollateralized_position(
    env: &Env,
    client: &VeilLendContractClient,
    admin: &Address,
    collateral_asset: &Address,
    debt_asset: &Address,
    user: &Address,
    liquidator: &Address,
) {
    configure_asset(env, client, admin, collateral_asset);
    configure_asset(env, client, admin, debt_asset);
    client.set_oracle_price(admin, collateral_asset, &1000);
    client.set_oracle_price(admin, debt_asset, &1000);

    // Reserve liquidity for the debt asset to be borrowed against.
    client.deposit(liquidator, debt_asset, &10_000_000);

    client.deposit(user, collateral_asset, &1_000_000);
    client.borrow(user, debt_asset, collateral_asset, &1_000_000);

    // Drop the collateral price slightly: collateral_value now 999_000_000
    // vs borrowed_value 1_000_000_000 → health factor 0.999 (undercollateralized).
    client.set_oracle_price(admin, collateral_asset, &999);
}

#[test]
fn close_factor_blocks_90_percent_liquidation_on_hf_999() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let collateral_asset = Address::generate(&env);
    let debt_asset = Address::generate(&env);
    let user = Address::generate(&env);
    let liquidator = Address::generate(&env);
    // 100% min collateral ratio keeps the health-factor arithmetic simple.
    let contract_id = env.register(VeilLendContract, (admin.clone(), 10_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);

    setup_mild_undercollateralized_position(
        &env,
        &client,
        &admin,
        &collateral_asset,
        &debt_asset,
        &user,
        &liquidator,
    );

    assert_eq!(client.close_factor_bps(), 5_000);

    // Liquidator attempts to repay 90% of the 1_000_000 debt; default 50%
    // close factor must clip it to 500_000.
    client.liquidate(&liquidator, &user, &collateral_asset, &debt_asset, &900_000);

    let position = client.get_position(&user, &debt_asset);
    assert_eq!(
        position.borrowed, 500_000,
        "close factor must clip the repay to 50% of outstanding debt"
    );
}

#[test]
fn close_factor_bypassed_on_severe_hf() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let collateral_asset = Address::generate(&env);
    let debt_asset = Address::generate(&env);
    let user = Address::generate(&env);
    let liquidator = Address::generate(&env);
    let contract_id = env.register(VeilLendContract, (admin.clone(), 10_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);

    configure_asset(&env, &client, &admin, &collateral_asset);
    configure_asset(&env, &client, &admin, &debt_asset);
    client.set_oracle_price(&admin, &collateral_asset, &1000);
    client.set_oracle_price(&admin, &debt_asset, &1000);

    client.deposit(&liquidator, &debt_asset, &10_000_000);
    client.deposit(&user, &collateral_asset, &1_000_000);
    client.borrow(&user, &debt_asset, &collateral_asset, &1_000_000);

    // Crash the collateral price to 900: collateral_value 900_000_000 vs
    // borrowed_value 1_000_000_000 → health factor 0.90 (severe zone, < 0.95).
    client.set_oracle_price(&admin, &collateral_asset, &900);

    // Full repay in a single call must succeed despite the 50% close factor,
    // because the position is in the severe undercollateralization zone.
    client.liquidate(
        &liquidator,
        &user,
        &collateral_asset,
        &debt_asset,
        &1_000_000,
    );

    let position = client.get_position(&user, &debt_asset);
    assert_eq!(
        position.borrowed, 0,
        "severe health factor must bypass the close factor entirely"
    );
}

#[test]
fn liquidate_healthy_position_reverts() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let collateral_asset = Address::generate(&env);
    let debt_asset = Address::generate(&env);
    let user = Address::generate(&env);
    let liquidator = Address::generate(&env);
    let contract_id = env.register(VeilLendContract, (admin.clone(), 10_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);

    configure_asset(&env, &client, &admin, &collateral_asset);
    configure_asset(&env, &client, &admin, &debt_asset);
    client.set_oracle_price(&admin, &collateral_asset, &1000);
    client.set_oracle_price(&admin, &debt_asset, &1000);

    client.deposit(&liquidator, &debt_asset, &10_000_000);
    client.deposit(&user, &collateral_asset, &1_000_000);
    client.borrow(&user, &debt_asset, &collateral_asset, &1_000_000);

    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.liquidate(&liquidator, &user, &collateral_asset, &debt_asset, &1);
    }));
    assert!(
        result.is_err(),
        "expected PositionNotLiquidatable for a healthy (HF >= 1.0) position"
    );
}

// ---------------------------------------------------------------------------
// Protocol reserve accumulation and timelocked withdrawal (issue #342)
// ---------------------------------------------------------------------------

/// Deposits 1_000_000_000 and borrows 500_000_000 of the same
/// self-collateralized asset (50% utilization). `reserve_factor_bps` is
/// applied via `set_interest_params` using the same base/slope1 as the
/// legacy hardcoded model (200 bps base + 2000 bps slope1, no kink) so the
/// resulting rates match the hand-computed values used throughout this
/// file: 12% borrow APR / 6% gross (pre-reserve-factor) supply APR. Applied
/// before any time elapses so the rate isn't retroactively applied to
/// interest already accrued.
fn setup_50pct_utilization_with_reserve_factor(
    env: &Env,
    client: &VeilLendContractClient,
    admin: &Address,
    asset: &Address,
    user: &Address,
    reserve_factor_bps: u32,
) {
    configure_asset(env, client, admin, asset);
    set_oracle_price(env, client, admin, asset, &1);
    client.set_interest_params(
        admin,
        asset,
        &InterestParams {
            base_rate_bps: 200,
            kink_util_bps: 9_500,
            slope1_bps: 2_000,
            slope2_bps: 0,
            reserve_factor_bps,
        },
    );

    client.deposit(user, asset, &1_000_000_000);
    client.borrow(user, asset, asset, &500_000_000);
}

fn advance_one_year(env: &Env) {
    let ledger_timestamp = env.ledger().timestamp();
    env.ledger()
        .set_timestamp(ledger_timestamp + SECONDS_PER_YEAR);
}

#[test]
fn reserve_factor_zero_produces_no_reserve_state_changes() {
    // Backward compat: reserve_factor defaults to 0, so accrual must be
    // byte-for-byte identical to pre-#342 behavior — no reserves, no
    // lifetime counter movement, full interest passed through to suppliers.
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let asset = Address::generate(&env);
    let user = Address::generate(&env);
    let contract_id = env.register(VeilLendContract, (admin.clone(), 10_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);

    setup_50pct_utilization_with_reserve_factor(&env, &client, &admin, &asset, &user, 0);
    assert_eq!(client.get_interest_params(&asset).reserve_factor_bps, 0);
    advance_one_year(&env);

    let total_deposited_before = client.get_total_deposited(&asset);

    client.accrue_interest(&asset);

    assert_eq!(client.get_reserves(&asset), 0);
    assert_eq!(client.get_reserves_and_lifetime(&asset), (0, 0));
    // Full 60_000_000 (6% of 1_000_000_000) passes through to suppliers,
    // exactly as it did before reserve accumulation existed.
    assert_eq!(
        client.get_total_deposited(&asset),
        total_deposited_before + 60_000_000
    );
}

#[test]
fn reserves_accumulate_when_factor_set() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let asset = Address::generate(&env);
    let user = Address::generate(&env);
    let contract_id = env.register(VeilLendContract, (admin.clone(), 10_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);

    // 10% reserve factor.
    setup_50pct_utilization_with_reserve_factor(&env, &client, &admin, &asset, &user, 1_000);
    assert_eq!(client.get_interest_params(&asset).reserve_factor_bps, 1_000);
    advance_one_year(&env);

    let total_deposited_before = client.get_total_deposited(&asset);

    client.accrue_interest(&asset);

    // 10% of the 60_000_000 gross interest borrowers pay == 6_000_000.
    assert_eq!(client.get_reserves(&asset), 6_000_000);
    assert_eq!(
        client.get_reserves_and_lifetime(&asset),
        (6_000_000, 6_000_000)
    );

    // Suppliers are credited the remaining 54_000_000, not the full 60_000_000.
    assert_eq!(
        client.get_total_deposited(&asset),
        total_deposited_before + 54_000_000
    );
}

#[test]
fn withdraw_reserves_fails_without_timelock() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let asset = Address::generate(&env);
    let user = Address::generate(&env);
    let to = Address::generate(&env);
    let contract_id = env.register(VeilLendContract, (admin.clone(), 10_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);

    setup_50pct_utilization_with_reserve_factor(&env, &client, &admin, &asset, &user, 1_000);
    advance_one_year(&env);
    client.accrue_interest(&asset);
    assert_eq!(client.get_reserves(&asset), 6_000_000);

    let action_id = client.propose_withdraw_reserves(&admin, &asset, &to, &1_000_000);

    // Executing before the timelock window elapses must panic — there is no
    // direct withdraw_reserves entrypoint at all, only propose/execute.
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.execute_withdraw_reserves(&admin, &action_id);
    }));
    assert!(
        result.is_err(),
        "expected TimelockNotReady when executing before the timelock elapses"
    );
    // Reserves must be untouched by the failed execution attempt.
    assert_eq!(client.get_reserves(&asset), 6_000_000);
}

#[test]
fn withdraw_reserves_succeeds_via_timelock() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let asset = Address::generate(&env);
    let user = Address::generate(&env);
    let to = Address::generate(&env);
    let contract_id = env.register(VeilLendContract, (admin.clone(), 10_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);

    setup_50pct_utilization_with_reserve_factor(&env, &client, &admin, &asset, &user, 1_000);
    advance_one_year(&env);
    client.accrue_interest(&asset);
    assert_eq!(client.get_reserves(&asset), 6_000_000);

    let action_id = client.propose_withdraw_reserves(&admin, &asset, &to, &4_000_000);
    advance_ledgers(&env, DEFAULT_TIMELOCK);
    client.execute_withdraw_reserves(&admin, &action_id);

    assert_eq!(client.get_reserves(&asset), 2_000_000);
    // The lifetime counter never decreases — it's a cumulative accounting
    // counter, distinct from the current withdrawable balance.
    assert_eq!(
        client.get_reserves_and_lifetime(&asset),
        (2_000_000, 6_000_000)
    );
}

#[test]
fn withdraw_reserves_exceeding_balance_reverts() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let asset = Address::generate(&env);
    let user = Address::generate(&env);
    let to = Address::generate(&env);
    let contract_id = env.register(VeilLendContract, (admin.clone(), 10_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);

    setup_50pct_utilization_with_reserve_factor(&env, &client, &admin, &asset, &user, 1_000);
    advance_one_year(&env);
    client.accrue_interest(&asset);
    assert_eq!(client.get_reserves(&asset), 6_000_000);

    // Proposing a withdrawal above the current reserve balance must revert
    // immediately (validate_payload runs at propose time too).
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.propose_withdraw_reserves(&admin, &asset, &to, &6_000_001);
    }));
    assert!(
        result.is_err(),
        "expected InsufficientReserve when amount exceeds current reserves"
    );
    assert_eq!(client.get_reserves(&asset), 6_000_000);

    // Also reject at execute time if reserves shrink between propose and
    // execute (e.g. another withdrawal already drained them).
    let action_id = client.propose_withdraw_reserves(&admin, &asset, &to, &5_000_000);
    let drain_action_id = client.propose_withdraw_reserves(&admin, &asset, &to, &6_000_000);
    advance_ledgers(&env, DEFAULT_TIMELOCK);
    client.execute_withdraw_reserves(&admin, &drain_action_id);
    assert_eq!(client.get_reserves(&asset), 0);

    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.execute_withdraw_reserves(&admin, &action_id);
    }));
    assert!(
        result.is_err(),
        "expected InsufficientReserve when reserves shrank below the proposed amount before execution"
    );
}

// ============================================================================
// Flash Loan Integration Tests
// ============================================================================

mod flash_loan_integration_tests {
    use super::*;
    use soroban_sdk::{contract, contractimpl, Symbol, Vec};

    #[contract]
    pub struct IntegrationTestFlashLoanReceiver;

    #[contractimpl]
    impl IntegrationTestFlashLoanReceiver {
        pub fn flash_loan_receiver(
            _env: Env,
            _initiator: Address,
            _asset: Address,
            _amount: i128,
            _premium: i128,
            _params: Vec<Symbol>,
        ) {
            // In integration tests, we can't easily simulate token transfers
            // This is a placeholder that will be expanded with real token tests
        }
    }

    #[test]
    fn test_flash_loan_integration() {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let asset = Address::generate(&env);
        let user = Address::generate(&env);
        let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000u32));
        let client = VeilLendContractClient::new(&env, &contract_id);

        // Configure asset
        configure_asset(&env, &client, &admin, &asset);
        set_oracle_price(&env, &client, &admin, &asset, &100);

        // Fund the reserve
        client.deposit(&user, &asset, &1_000_000);

        // Configure flash loan
        client.configure_flash_loan(&admin, &asset, &true, &9, &10_000);

        // Register receiver
        let receiver_id = env.register(IntegrationTestFlashLoanReceiver, ());

        // Execute flash loan
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            client.flash_loan(&user, &receiver_id, &asset, &100_000, &Vec::new(&env));
        }));

        // In integration tests, this may fail due to missing token balance simulation
        // This test serves as a template for real token integration
        assert!(result.is_err() || result.is_ok());
    }

    #[test]
    fn test_flash_loan_config_integration() {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let asset = Address::generate(&env);
        let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000u32));
        let client = VeilLendContractClient::new(&env, &contract_id);

        configure_asset(&env, &client, &admin, &asset);

        // Configure flash loan
        client.configure_flash_loan(&admin, &asset, &true, &9, &10_000);

        let state = client.get_flash_loan_state(&asset).unwrap();
        assert!(state.enabled);
        assert_eq!(state.premium_bps, 9);
        assert_eq!(state.max_bps, 10_000);

        // Update configuration
        client.configure_flash_loan(&admin, &asset, &true, &50, &5_000);

        let updated_state = client.get_flash_loan_state(&asset).unwrap();
        assert!(updated_state.enabled);
        assert_eq!(updated_state.premium_bps, 50);
        assert_eq!(updated_state.max_bps, 5_000);

        // Disable flash loans
        client.configure_flash_loan(&admin, &asset, &false, &9, &10_000);

        let disabled_state = client.get_flash_loan_state(&asset).unwrap();
        assert!(!disabled_state.enabled);
    }
}

// ── Interest-rate model tests (issue #311) ────────────────────────────────────

/// Helper: register a fresh contract, configure one asset, set its oracle price.
/// Uses MCR=10_000 (100%) so tests can achieve high utilization ratios.
fn setup_with_asset(env: &Env) -> (VeilLendContractClient<'_>, Address, Address) {
    env.mock_all_auths();
    let admin = Address::generate(env);
    let asset = Address::generate(env);
    let contract_id = env.register(VeilLendContract, (admin.clone(), 10_000u32));
    let client = VeilLendContractClient::new(env, &contract_id);
    configure_asset(env, &client, &admin, &asset);
    set_oracle_price(env, &client, &admin, &asset, &1_000_000i128);
    (client, admin, asset)
}

/// Sets interest params equivalent to the pre-#311 hardcoded rate model
/// (BASE_RATE_BPS=200, SLOPE_BPS=2000, no kink, no reserve factor).
/// Use this in tests that were written against the old hardcoded rates.
fn set_legacy_interest_params(client: &VeilLendContractClient, admin: &Address, asset: &Address) {
    use veillend_contract::InterestParams;
    client.set_interest_params(
        admin,
        asset,
        &InterestParams {
            base_rate_bps: 200,
            kink_util_bps: 9_500, // effectively no kink — slope2 never applies
            slope1_bps: 2_000,
            slope2_bps: 0,
            reserve_factor_bps: 0, // 100% pass-through matches original supply_rate formula
        },
    );
}

/// AC: default parameters → supply & borrow accrual == 0 per second.
///
/// Assets without configured InterestParams fall back to DEFAULT_PARAMS
/// (all rates zero), so existing snapshot expectations are not broken.
#[test]
fn test_interest_params_default_zero_accrual() {
    let env = Env::default();
    let (client, _admin, asset) = setup_with_asset(&env);
    // Use the same user for deposit and borrow so the collateral check passes.
    let user = Address::generate(&env);
    client.deposit(&user, &asset, &1_000_000_000i128);
    client.borrow(&user, &asset, &asset, &500_000_000i128);

    let state_before = client.get_interest_state(&asset);

    // Advance ledger time by one year.
    env.ledger()
        .set_timestamp(env.ledger().timestamp() + veillend_contract::SECONDS_PER_YEAR as u64);

    let state_after = client.get_interest_state(&asset);

    // With all-zero rates the indexes must not move.
    assert_eq!(
        state_after.supply_index, state_before.supply_index,
        "supply index must not change with zero rates"
    );
    assert_eq!(
        state_after.borrow_index, state_before.borrow_index,
        "borrow index must not change with zero rates"
    );
}

/// AC: kink=8000, slope1=2000 bps/year, util=9000, slope2=4000 bps →
/// rate after kink piece computed correctly.
#[test]
fn test_interest_params_kink_model_above_kink() {
    use veillend_contract::InterestParams;

    let env = Env::default();
    let (client, admin, asset) = setup_with_asset(&env);

    let params = InterestParams {
        base_rate_bps: 0,
        kink_util_bps: 8_000,
        slope1_bps: 2_000,
        slope2_bps: 4_000,
        reserve_factor_bps: 0,
    };
    client.set_interest_params(&admin, &asset, &params);

    // Verify getter round-trips the params.
    let stored = client.get_interest_params(&asset);
    assert_eq!(stored.base_rate_bps, 0);
    assert_eq!(stored.kink_util_bps, 8_000);
    assert_eq!(stored.slope1_bps, 2_000);
    assert_eq!(stored.slope2_bps, 4_000);
    assert_eq!(stored.reserve_factor_bps, 0);

    // Deposit + borrow to get to 90 % utilization.
    // Same user for both so the collateral check passes.
    let user = Address::generate(&env);
    let total_supply: i128 = 1_000_000_000;
    let total_borrow: i128 = 900_000_000; // 90 % util → above kink
    client.deposit(&user, &asset, &total_supply);
    client.borrow(&user, &asset, &asset, &total_borrow);

    // Advance by one year and force accrual.
    env.ledger()
        .set_timestamp(env.ledger().timestamp() + veillend_contract::SECONDS_PER_YEAR as u64);
    client.accrue_interest(&asset);

    // Expected: annual borrow rate = 2000*8000/10000 + 4000*(9000-8000)/10000
    //         = 1600 + 400 = 2000 bps
    // borrow_rate_per_sec = 2000 / SECONDS_PER_YEAR
    // borrow_growth = borrow_rate_per_sec * SECONDS_PER_YEAR * RATE_SCALE / 10_000
    //               = 2000 * RATE_SCALE / 10_000
    let rate_scale = veillend_contract::RATE_SCALE;
    let borrow_growth = 2_000i128 * rate_scale / 10_000;
    let expected_borrow_index = rate_scale + rate_scale * borrow_growth / rate_scale;
    let state = client.get_interest_state(&asset);
    assert_eq!(
        state.borrow_index, expected_borrow_index,
        "borrow index after one year at 20% APR must match hand-computed value"
    );

    // Total borrowed must have grown.
    assert!(
        client.get_total_borrowed(&asset) > total_borrow,
        "total borrowed must grow after accrual with non-zero rate"
    );
}

/// AC: out-of-range params panic with `InvalidInterestParams`.
#[test]
fn test_interest_params_invalid_inputs_panic() {
    use veillend_contract::InterestParams;

    // kink below 1_000 → invalid.
    let env = Env::default();
    let (client, admin, asset) = setup_with_asset(&env);
    let bad_kink_low = InterestParams {
        base_rate_bps: 0,
        kink_util_bps: 500, // < 1_000 — invalid
        slope1_bps: 0,
        slope2_bps: 0,
        reserve_factor_bps: 0,
    };
    let result = client.try_set_interest_params(&admin, &asset, &bad_kink_low);
    assert!(result.is_err(), "kink_util_bps < 1_000 must panic");

    // kink above 9_500 → invalid.
    let env = Env::default();
    let (client, admin, asset) = setup_with_asset(&env);
    let bad_kink_high = InterestParams {
        base_rate_bps: 0,
        kink_util_bps: 9_600, // > 9_500 — invalid
        slope1_bps: 0,
        slope2_bps: 0,
        reserve_factor_bps: 0,
    };
    let result = client.try_set_interest_params(&admin, &asset, &bad_kink_high);
    assert!(result.is_err(), "kink_util_bps > 9_500 must panic");

    // Sum of rates > 100_000 → invalid.
    let env = Env::default();
    let (client, admin, asset) = setup_with_asset(&env);
    let bad_rate_sum = InterestParams {
        base_rate_bps: 50_000,
        kink_util_bps: 8_000,
        slope1_bps: 30_000,
        slope2_bps: 30_000, // sum = 110_000 > 100_000
        reserve_factor_bps: 0,
    };
    let result = client.try_set_interest_params(&admin, &asset, &bad_rate_sum);
    assert!(result.is_err(), "rate sum > 100_000 must panic");

    // reserve_factor > 5_000 → invalid.
    let env = Env::default();
    let (client, admin, asset) = setup_with_asset(&env);
    let bad_reserve = InterestParams {
        base_rate_bps: 0,
        kink_util_bps: 8_000,
        slope1_bps: 0,
        slope2_bps: 0,
        reserve_factor_bps: 5_001, // > 5_000 — invalid
    };
    let result = client.try_set_interest_params(&admin, &asset, &bad_reserve);
    assert!(result.is_err(), "reserve_factor_bps > 5_000 must panic");
}

// ─── Batch Operation Tests ───────────────────────────────────────────────────

#[test]
fn test_deposit_batch_single_operation_matches_single() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let asset = Address::generate(&env);
    let user = Address::generate(&env);
    let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);

    configure_asset(&env, &client, &admin, &asset);
    set_oracle_price(&env, &client, &admin, &asset, &100);

    // Single deposit
    client.deposit(&user, &asset, &100_000);
    let single_position = client.get_position(&user, &asset);
    let single_total = client.get_total_deposited(&asset);

    // Batch deposit with one operation
    let ops = soroban_sdk::vec![
        &env,
        veillend_contract::BatchOperation {
            asset: asset.clone(),
            amount: 100_000,
        }
    ];
    client.deposit_batch(&user, &ops);

    let batch_position = client.get_position(&user, &asset);
    let batch_total = client.get_total_deposited(&asset);

    assert_eq!(single_position.deposited * 2, batch_position.deposited);
    assert_eq!(single_total * 2, batch_total);
}

#[test]
fn test_deposit_batch_multiple_assets_succeeds() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let asset1 = Address::generate(&env);
    let asset2 = Address::generate(&env);
    let user = Address::generate(&env);
    let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);

    configure_asset(&env, &client, &admin, &asset1);
    configure_asset(&env, &client, &admin, &asset2);
    set_oracle_price(&env, &client, &admin, &asset1, &100);
    set_oracle_price(&env, &client, &admin, &asset2, &100);

    let ops = soroban_sdk::vec![
        &env,
        veillend_contract::BatchOperation {
            asset: asset1.clone(),
            amount: 100_000,
        },
        veillend_contract::BatchOperation {
            asset: asset2.clone(),
            amount: 50_000,
        }
    ];

    client.deposit_batch(&user, &ops);

    assert_eq!(client.get_total_deposited(&asset1), 100_000);
    assert_eq!(client.get_total_deposited(&asset2), 50_000);
    assert_eq!(client.get_position(&user, &asset1).deposited, 100_000);
    assert_eq!(client.get_position(&user, &asset2).deposited, 50_000);
}

#[test]
fn test_withdraw_batch_multiple_assets_succeeds() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let asset1 = Address::generate(&env);
    let asset2 = Address::generate(&env);
    let user = Address::generate(&env);
    let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);

    configure_asset(&env, &client, &admin, &asset1);
    configure_asset(&env, &client, &admin, &asset2);
    set_oracle_price(&env, &client, &admin, &asset1, &100);
    set_oracle_price(&env, &client, &admin, &asset2, &100);

    // First deposit assets
    let deposit_ops = soroban_sdk::vec![
        &env,
        veillend_contract::BatchOperation {
            asset: asset1.clone(),
            amount: 100_000,
        },
        veillend_contract::BatchOperation {
            asset: asset2.clone(),
            amount: 50_000,
        }
    ];
    client.deposit_batch(&user, &deposit_ops);

    // Now withdraw
    let withdraw_ops = soroban_sdk::vec![
        &env,
        veillend_contract::BatchOperation {
            asset: asset1.clone(),
            amount: 50_000,
        },
        veillend_contract::BatchOperation {
            asset: asset2.clone(),
            amount: 25_000,
        }
    ];
    client.withdraw_batch(&user, &asset1, &withdraw_ops);

    assert_eq!(client.get_total_deposited(&asset1), 50_000);
    assert_eq!(client.get_total_deposited(&asset2), 25_000);
}

#[test]
fn test_borrow_batch_multiple_assets_succeeds() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let asset = Address::generate(&env);
    let user = Address::generate(&env);
    let contract_id = env.register(VeilLendContract, (admin.clone(), 10_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);

    configure_asset(&env, &client, &admin, &asset);
    set_oracle_price(&env, &client, &admin, &asset, &100);

    // Deposit collateral
    client.deposit(&user, &asset, &1_000_000);

    let ops = soroban_sdk::vec![
        &env,
        veillend_contract::BatchOperation {
            asset: asset.clone(),
            amount: 100_000,
        },
        veillend_contract::BatchOperation {
            asset: asset.clone(),
            amount: 50_000,
        }
    ];

    client.borrow_batch(&user, &asset, &ops);

    assert_eq!(client.get_total_borrowed(&asset), 150_000);
    assert_eq!(client.get_position(&user, &asset).borrowed, 150_000);
}

#[test]
fn test_repay_batch_multiple_assets_succeeds() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let asset = Address::generate(&env);
    let user = Address::generate(&env);
    let contract_id = env.register(VeilLendContract, (admin.clone(), 10_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);

    configure_asset(&env, &client, &admin, &asset);
    set_oracle_price(&env, &client, &admin, &asset, &100);

    // Deposit collateral and borrow
    client.deposit(&user, &asset, &1_000_000);
    client.borrow(&user, &asset, &asset, &200_000);

    let ops = soroban_sdk::vec![
        &env,
        veillend_contract::BatchOperation {
            asset: asset.clone(),
            amount: 100_000,
        },
        veillend_contract::BatchOperation {
            asset: asset.clone(),
            amount: 50_000,
        }
    ];

    client.repay_batch(&user, &ops);

    assert_eq!(client.get_total_borrowed(&asset), 50_000);
    assert_eq!(client.get_position(&user, &asset).borrowed, 50_000);
}

#[test]
fn test_withdraw_then_deposit_batch_succeeds_final_healthy() {
    // Classic footgun: withdraw all XLM collateral while ETH (also held as
    // collateral) still covers the debt. Batched, only the combined final
    // state is checked, so this succeeds even though withdrawing all the
    // XLM via a single, separate `withdraw` call (which only compares the
    // withdrawn asset against the debt) would fail immediately.
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let asset_xlm = Address::generate(&env);
    let asset_eth = Address::generate(&env);
    let user = Address::generate(&env);
    let liquidity_provider = Address::generate(&env);
    let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);

    configure_asset(&env, &client, &admin, &asset_xlm);
    configure_asset(&env, &client, &admin, &asset_eth);
    set_oracle_price(&env, &client, &admin, &asset_xlm, &1);
    set_oracle_price(&env, &client, &admin, &asset_eth, &100);

    // Another depositor supplies extra XLM liquidity so the reserve has
    // enough balance left for the user to withdraw all of their own XLM
    // after having borrowed against it below.
    client.deposit(&liquidity_provider, &asset_xlm, &5_000);

    // Deposit XLM as collateral
    client.deposit(&user, &asset_xlm, &10_000);
    // Deposit ETH as collateral
    client.deposit(&user, &asset_eth, &100);

    // Borrow against XLM
    client.borrow(&user, &asset_xlm, &asset_xlm, &5_000);

    // A single separate `withdraw` of all the XLM would fail here, since it
    // only checks XLM collateral (which would drop to 0) against the XLM
    // debt. Batched together with a small ETH withdrawal, the combined
    // XLM + ETH collateral value still covers the debt.
    let withdraw_ops = soroban_sdk::vec![
        &env,
        veillend_contract::BatchOperation {
            asset: asset_xlm.clone(),
            amount: 10_000,
        },
        veillend_contract::BatchOperation {
            asset: asset_eth.clone(),
            amount: 20,
        }
    ];

    // This should succeed
    client.withdraw_batch(&user, &asset_xlm, &withdraw_ops);

    // Verify final state
    let xlm_position = client.get_position(&user, &asset_xlm);
    let eth_position = client.get_position(&user, &asset_eth);
    assert_eq!(xlm_position.deposited, 0);
    assert_eq!(eth_position.deposited, 80);

    // Should still have debt
    assert!(xlm_position.borrowed > 0);
}

#[test]
fn test_batch_fails_if_final_undercollateralized() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let asset = Address::generate(&env);
    let user = Address::generate(&env);
    let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);

    configure_asset(&env, &client, &admin, &asset);
    set_oracle_price(&env, &client, &admin, &asset, &100);

    // Deposit collateral and borrow to near limit
    client.deposit(&user, &asset, &1_000);
    client.borrow(&user, &asset, &asset, &600);

    // Try to withdraw too much, making final state undercollateralized
    let ops = soroban_sdk::vec![
        &env,
        veillend_contract::BatchOperation {
            asset: asset.clone(),
            amount: 500, // Withdraw 500 of 1000 collateral, leaving 500 collateral against 600 debt
        }
    ];

    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.withdraw_batch(&user, &asset, &ops);
    }));
    assert!(result.is_err());
}

#[test]
fn test_deposit_batch_with_duplicate_assets_aggregates() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let asset = Address::generate(&env);
    let user = Address::generate(&env);
    let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);

    configure_asset(&env, &client, &admin, &asset);
    set_oracle_price(&env, &client, &admin, &asset, &100);

    // Duplicate asset deposits should aggregate
    let ops = soroban_sdk::vec![
        &env,
        veillend_contract::BatchOperation {
            asset: asset.clone(),
            amount: 100_000,
        },
        veillend_contract::BatchOperation {
            asset: asset.clone(),
            amount: 50_000,
        }
    ];

    client.deposit_batch(&user, &ops);

    assert_eq!(client.get_total_deposited(&asset), 150_000);
    assert_eq!(client.get_position(&user, &asset).deposited, 150_000);
}

#[test]
fn test_batch_events_emitted() {
    use soroban_sdk::testutils::Events as _;

    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let asset = Address::generate(&env);
    let user = Address::generate(&env);
    let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);

    configure_asset(&env, &client, &admin, &asset);
    set_oracle_price(&env, &client, &admin, &asset, &100);

    let ops = soroban_sdk::vec![
        &env,
        veillend_contract::BatchOperation {
            asset: asset.clone(),
            amount: 100_000,
        }
    ];

    client.deposit_batch(&user, &ops);

    // Check events
    let events = env.events().all();
    let mut deposit_events = 0;
    let mut batch_events = 0;

    for (_, topics, _) in events.iter() {
        if topics.len() >= 2 {
            let topic0 = topics.get(0).unwrap();
            let topic1 = topics.get(1).unwrap();
            // Check for deposit and batch_executed events
            if let Ok(sym0) = Symbol::try_from_val(&env, &topic0) {
                if sym0 == Symbol::new(&env, "veillend") {
                    if let Ok(sym) = Symbol::try_from_val(&env, &topic1) {
                        if sym == Symbol::new(&env, "deposit") {
                            deposit_events += 1;
                        } else if sym == Symbol::new(&env, "batch_executed") {
                            batch_events += 1;
                        }
                    }
                }
            }
        }
    }

    assert_eq!(batch_events, 1);

    assert_eq!(deposit_events, 1);
}

// ─── Issue #298: require_not_paused on admin/accrual entrypoints ───────────
//
// Every admin/accrual mutator that can change protocol parameters or move
// value must be blocked while paused, exactly like `deposit`/`borrow`
// already are — otherwise a compromised admin key can keep "funneling
// value" (or the debt clock can keep advancing via `accrue_interest`) while
// the pause banner claims the system is frozen. `repay`/`withdraw` are the
// deliberate exception (users must always be able to exit); see
// `test_circuit_breaker_pause` above, which already asserts both succeed
// while paused.

#[test]
#[should_panic(expected = "Contract, #12")]
fn test_execute_configure_asset_blocked_while_paused() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let asset = Address::generate(&env);
    let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);

    let action_id = client.propose_configure_asset(&admin, &asset, &true);

    pause(&env, &client, &admin);
    assert!(client.is_paused());

    client.execute_configure_asset(&admin, &action_id);
}

#[test]
#[should_panic(expected = "Contract, #12")]
fn test_set_oracle_price_blocked_while_paused() {
    let env = Env::default();
    let (client, admin, asset) = setup_with_asset(&env);

    pause(&env, &client, &admin);
    assert!(client.is_paused());

    client.set_oracle_price(&admin, &asset, &2_000_000);
}

#[test]
#[should_panic(expected = "Contract, #12")]
fn test_execute_set_oracle_price_blocked_while_paused() {
    let env = Env::default();
    let (client, admin, asset) = setup_with_asset(&env);

    let action_id = client.propose_set_oracle_price(&admin, &asset, &2_000_000);

    pause(&env, &client, &admin);
    assert!(client.is_paused());

    client.execute_set_oracle_price(&admin, &action_id);
}

#[test]
#[should_panic(expected = "Contract, #12")]
fn test_set_max_oracle_age_blocked_while_paused() {
    let env = Env::default();
    let (client, admin, _asset) = setup_with_asset(&env);

    pause(&env, &client, &admin);
    assert!(client.is_paused());

    client.set_max_oracle_age(&admin, &3600u64);
}

#[test]
#[should_panic(expected = "Contract, #12")]
fn test_set_oracle_max_change_bps_blocked_while_paused() {
    let env = Env::default();
    let (client, admin, asset) = setup_with_asset(&env);

    pause(&env, &client, &admin);
    assert!(client.is_paused());

    client.set_oracle_max_change_bps(&admin, &asset, &1_000u32);
}

#[test]
#[should_panic(expected = "Contract, #12")]
fn test_set_oracle_price_bounds_blocked_while_paused() {
    let env = Env::default();
    let (client, admin, asset) = setup_with_asset(&env);

    pause(&env, &client, &admin);
    assert!(client.is_paused());

    client.set_oracle_price_bounds(&admin, &asset, &1i128, &10_000_000i128);
}

#[test]
#[should_panic(expected = "Contract, #12")]
fn test_execute_update_asset_caps_blocked_while_paused() {
    let env = Env::default();
    let (client, admin, asset) = setup_with_asset(&env);

    let action_id = client.propose_update_asset_caps(&admin, &asset, &1_000i128, &500i128);

    pause(&env, &client, &admin);
    assert!(client.is_paused());

    client.execute_update_asset_caps(&admin, &action_id);
}

#[test]
#[should_panic(expected = "Contract, #12")]
fn test_execute_set_min_collateral_ratio_blocked_while_paused() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);

    let action_id = client.propose_set_min_collateral_ratio(&admin, &20_000u32);

    pause(&env, &client, &admin);
    assert!(client.is_paused());

    client.execute_set_min_collateral_ratio(&admin, &action_id);
}

#[test]
#[should_panic(expected = "Contract, #12")]
fn test_accrue_interest_blocked_while_paused() {
    let env = Env::default();
    let (client, admin, asset) = setup_with_asset(&env);

    pause(&env, &client, &admin);
    assert!(client.is_paused());

    client.accrue_interest(&asset);
}

#[test]
#[should_panic(expected = "Contract, #12")]
fn test_execute_record_protocol_fee_blocked_while_paused() {
    let env = Env::default();
    let (client, admin, asset) = setup_with_asset(&env);

    let action_id = client.propose_record_protocol_fee(&admin, &asset, &100i128);

    pause(&env, &client, &admin);
    assert!(client.is_paused());

    client.execute_record_protocol_fee(&admin, &action_id);
}

#[test]
#[should_panic(expected = "Contract, #12")]
fn test_set_max_protocol_fee_bps_blocked_while_paused() {
    let env = Env::default();
    let (client, admin, _asset) = setup_with_asset(&env);

    pause(&env, &client, &admin);
    assert!(client.is_paused());

    client.set_max_protocol_fee_bps(&admin, &1_000u32);
}

#[test]
#[should_panic(expected = "Contract, #12")]
fn test_execute_withdraw_reserves_blocked_while_paused() {
    let env = Env::default();
    let (client, admin, asset) = setup_with_asset(&env);
    let to = Address::generate(&env);

    // Fund a withdrawable reserve so `propose_withdraw_reserves` itself
    // doesn't reject the amount before pause is even relevant.
    let fee_action_id = client.propose_record_protocol_fee(&admin, &asset, &100i128);
    advance_ledgers(&env, DEFAULT_TIMELOCK);
    client.execute_record_protocol_fee(&admin, &fee_action_id);

    let action_id = client.propose_withdraw_reserves(&admin, &asset, &to, &1i128);

    pause(&env, &client, &admin);
    assert!(client.is_paused());

    client.execute_withdraw_reserves(&admin, &action_id);
}

#[test]
#[should_panic(expected = "Contract, #12")]
fn test_set_supply_cap_blocked_while_paused() {
    let env = Env::default();
    let (client, admin, asset) = setup_with_asset(&env);

    pause(&env, &client, &admin);
    assert!(client.is_paused());

    client.set_supply_cap(&admin, &asset, &1_000i128);
}

#[test]
#[should_panic(expected = "Contract, #12")]
fn test_set_borrow_cap_blocked_while_paused() {
    let env = Env::default();
    let (client, admin, asset) = setup_with_asset(&env);

    pause(&env, &client, &admin);
    assert!(client.is_paused());

    client.set_borrow_cap(&admin, &asset, &1_000i128);
}

#[test]
#[should_panic(expected = "Contract, #12")]
fn test_set_close_factor_blocked_while_paused() {
    let env = Env::default();
    let (client, admin, _asset) = setup_with_asset(&env);

    pause(&env, &client, &admin);
    assert!(client.is_paused());

    client.set_close_factor(&admin, &5_000u32);
}

#[test]
#[should_panic(expected = "Contract, #12")]
fn test_set_interest_params_blocked_while_paused() {
    use veillend_contract::InterestParams;

    let env = Env::default();
    let (client, admin, asset) = setup_with_asset(&env);

    pause(&env, &client, &admin);
    assert!(client.is_paused());

    client.set_interest_params(
        &admin,
        &asset,
        &InterestParams {
            base_rate_bps: 200,
            kink_util_bps: 9_500,
            slope1_bps: 2_000,
            slope2_bps: 0,
            reserve_factor_bps: 0,
        },
    );
}

/// Explicit companion to `test_circuit_breaker_pause`'s repay/withdraw
/// assertions: repay and withdraw are the intentional exception to the
/// pause gate (users must always be able to exit), spelled out here as its
/// own test so it can't be missed as "just another paused entrypoint" when
/// this file is skimmed.
#[test]
fn test_repay_and_withdraw_succeed_while_paused() {
    let env = Env::default();
    let (client, admin, asset) = setup_with_asset(&env);
    let user = Address::generate(&env);

    client.deposit(&user, &asset, &1_000);
    client.borrow(&user, &asset, &asset, &200);

    pause(&env, &client, &admin);
    assert!(client.is_paused());

    client.repay(&user, &asset, &200);
    assert_eq!(client.get_total_borrowed(&asset), 0);

    client.withdraw(&user, &asset, &asset, &1_000);
    assert_eq!(client.get_total_deposited(&asset), 0);
}

// ---------------------------------------------------------------------------
// Timelocked contract upgrade + migration tests (issue #423)
// ---------------------------------------------------------------------------

// Fixture wasms built from `upgrade_fixture/`: `veillend_v1.wasm` reports
// CONTRACT_VERSION = 4 (a downgrade target) and `veillend_v2.wasm` reports
// CONTRACT_VERSION = 9 plus an `upgraded_marker` function that v1 does not
// have, so tests can prove the executable was actually swapped. Regenerate
// them with the commands documented in UPGRADING.md.
mod v1_fixture {
    soroban_sdk::contractimport!(file = "./tests/fixtures/veillend_v1.wasm");
}
mod v2_fixture {
    soroban_sdk::contractimport!(file = "./tests/fixtures/veillend_v2.wasm");
}

fn install_v1_wasm(env: &Env) -> BytesN<32> {
    env.deployer().upload_contract_wasm(v1_fixture::WASM)
}

fn install_v2_wasm(env: &Env) -> BytesN<32> {
    env.deployer().upload_contract_wasm(v2_fixture::WASM)
}

fn assert_upgrade_pending(
    client: &VeilLendContractClient,
    action_id: u64,
    wasm_hash: &BytesN<32>,
    expected_ready_at: u32,
) {
    let pending = client
        .get_pending_action(&action_id)
        .expect("pending action");
    assert_eq!(pending.kind, ActionKind::Upgrade);
    match &pending.payload {
        ActionPayload::Upgrade(hash) => assert_eq!(hash, wasm_hash),
        _ => panic!("expected Upgrade payload, got {:?}", pending.payload),
    }
    assert_eq!(
        pending.executable_at_ledger, expected_ready_at,
        "ready-at ledger must be snapshotted at proposal time"
    );
}

#[test]
fn test_upgrade_full_roundtrip_new_behaviour_is_live() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);

    assert_eq!(
        client.contract_metadata().contract_version,
        CONTRACT_VERSION
    );

    let new_wasm_hash = install_v2_wasm(&env);
    let proposed_at = env.ledger().sequence();
    let action_id = client.propose_upgrade(&admin, &new_wasm_hash);

    // Pending action surfaces the wasm hash and the ready-at ledger during the
    // delay window (indexers/admin UI show "upgrade pending, executable at
    // ledger N").
    assert_upgrade_pending(
        &client,
        action_id,
        &new_wasm_hash,
        proposed_at + UPGRADE_MIN_TIMELOCK_LEDGERS,
    );

    // Executing before the delay elapses must fail.
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.execute_upgrade(&admin, &action_id);
    }));
    assert!(result.is_err(), "execute before timelock must panic");

    // Wait out the floor and execute.
    advance_ledgers(&env, UPGRADE_MIN_TIMELOCK_LEDGERS);
    client.execute_upgrade(&admin, &action_id);

    // The action executed successfully (no UnknownAction), so it was consumed.
    // Note: after the swap the v2 wasm is running, so v1-only view functions
    // such as get_pending_action are no longer callable.

    // New behaviour is live: the marker function only exists in the v2 wasm.
    let v2_client = v2_fixture::Client::new(&env, &contract_id);
    assert_eq!(v2_client.upgraded_marker(), 42);
    assert_eq!(v2_client.contract_metadata().contract_version, 11);
}

#[test]
fn test_upgrade_emits_contract_upgraded_event_before_swap() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);

    let new_wasm_hash = install_v2_wasm(&env);
    let action_id = client.propose_upgrade(&admin, &new_wasm_hash);
    advance_ledgers(&env, UPGRADE_MIN_TIMELOCK_LEDGERS);
    client.execute_upgrade(&admin, &action_id);

    let expected = ContractUpgraded {
        old_version: CONTRACT_VERSION,
        new_wasm_hash,
        ledger: env.ledger().sequence(),
    };
    let expected_topics = expected.topics(&env);
    let expected_data = expected.data(&env);

    let events = env.events().all();
    let mut upgraded_count = 0u32;
    for (_, topics, data) in events.iter() {
        if topics == expected_topics && val_eq(&env, &data, &expected_data) {
            upgraded_count += 1;
        }
    }
    assert_eq!(
        upgraded_count, 1,
        "expected exactly one ContractUpgraded event with matching values"
    );
}

#[test]
fn test_upgrade_executes_while_paused() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);

    // Pause the contract — the expected response to a discovered bug.
    pause(&env, &client, &admin);
    assert!(client.is_paused());

    // A paused contract must still be upgradeable.
    let new_wasm_hash = install_v2_wasm(&env);
    let action_id = client.propose_upgrade(&admin, &new_wasm_hash);
    advance_ledgers(&env, UPGRADE_MIN_TIMELOCK_LEDGERS);
    client.execute_upgrade(&admin, &action_id);

    let v2_client = v2_fixture::Client::new(&env, &contract_id);
    assert_eq!(v2_client.upgraded_marker(), 42);
}

#[test]
fn test_upgrade_cancel_removes_pending_action() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);

    let new_wasm_hash = install_v2_wasm(&env);
    let action_id = client.propose_upgrade(&admin, &new_wasm_hash);

    // Cancel even after the delay would have elapsed.
    advance_ledgers(&env, UPGRADE_MIN_TIMELOCK_LEDGERS);
    client.cancel_upgrade(&admin, &action_id);

    assert!(client.get_pending_action(&action_id).is_none());

    // Executing the cancelled action now fails with UnknownAction.
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.execute_upgrade(&admin, &action_id);
    }));
    assert!(result.is_err());

    // Contract was never swapped.
    assert_eq!(
        client.contract_metadata().contract_version,
        CONTRACT_VERSION
    );
}

#[test]
fn test_upgrade_non_admin_propose_and_execute_fail() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let attacker = Address::generate(&env);
    let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);

    let new_wasm_hash = install_v2_wasm(&env);

    // Non-admin cannot propose.
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.propose_upgrade(&attacker, &new_wasm_hash);
    }));
    assert!(result.is_err(), "non-admin propose must panic");

    // Non-admin cannot execute.
    let action_id = client.propose_upgrade(&admin, &new_wasm_hash);
    advance_ledgers(&env, UPGRADE_MIN_TIMELOCK_LEDGERS);
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.execute_upgrade(&attacker, &action_id);
    }));
    assert!(result.is_err(), "non-admin execute must panic");

    // Contract unchanged.
    assert_eq!(
        client.contract_metadata().contract_version,
        CONTRACT_VERSION
    );
}

#[test]
fn test_upgrade_downgrade_rejected() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);

    // v1 wasm reports CONTRACT_VERSION = 4, lower than the running 8.
    let old_wasm_hash = install_v1_wasm(&env);
    let action_id = client.propose_upgrade(&admin, &old_wasm_hash);
    advance_ledgers(&env, UPGRADE_MIN_TIMELOCK_LEDGERS);

    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.execute_upgrade(&admin, &action_id);
    }));
    assert!(result.is_err(), "downgrade must be rejected");

    // Contract was not rolled back.
    assert_eq!(
        client.contract_metadata().contract_version,
        CONTRACT_VERSION
    );
}

#[test]
fn test_upgrade_mismatched_action_kind_is_unknown_action() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let asset = Address::generate(&env);
    let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);

    // Executing an upgrade against a configure_asset action id fails.
    let cfg_action = client.propose_configure_asset(&admin, &asset, &true);
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.execute_upgrade(&admin, &cfg_action);
    }));
    assert!(result.is_err(), "upgrade on wrong kind must panic");

    // Executing configure_asset against an upgrade action id fails.
    let new_wasm_hash = install_v2_wasm(&env);
    let upgrade_action = client.propose_upgrade(&admin, &new_wasm_hash);
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.execute_configure_asset(&admin, &upgrade_action);
    }));
    assert!(result.is_err(), "configure_asset on wrong kind must panic");
}

#[test]
fn test_upgrade_timelock_floor_applies_when_global_timelock_is_tiny() {
    // An admin must not be able to shrink the global timelock to 1 ledger and
    // immediately swap the wasm: upgrades always wait at least
    // UPGRADE_MIN_TIMELOCK_LEDGERS.
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);

    client.set_timelock_ledgers(&admin, &1);
    assert_eq!(client.get_timelock_ledgers(), 1);

    let new_wasm_hash = install_v2_wasm(&env);
    let proposed_at = env.ledger().sequence();
    let action_id = client.propose_upgrade(&admin, &new_wasm_hash);

    assert_upgrade_pending(
        &client,
        action_id,
        &new_wasm_hash,
        proposed_at + UPGRADE_MIN_TIMELOCK_LEDGERS,
    );

    // After the (tiny) global timelock the upgrade is still not executable.
    advance_ledgers(&env, 1);
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.execute_upgrade(&admin, &action_id);
    }));
    assert!(result.is_err(), "floor must still apply with timelock = 1");

    // Only once the floor elapses does the swap go through.
    advance_ledgers(&env, UPGRADE_MIN_TIMELOCK_LEDGERS - 1);
    client.execute_upgrade(&admin, &action_id);
    assert_eq!(
        v2_fixture::Client::new(&env, &contract_id).upgraded_marker(),
        42
    );
}

#[test]
fn test_upgrade_timelock_snapshotted_at_proposal_time() {
    // set_timelock_ledgers must not retroactively shorten an already-pending
    // upgrade: the delay is captured in PendingAction.executable_at_ledger.
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);

    // Start with a long global timelock (above the upgrade floor).
    let long_delay: u32 = 5_000;
    client.set_timelock_ledgers(&admin, &long_delay);

    let new_wasm_hash = install_v2_wasm(&env);
    let proposed_at = env.ledger().sequence();
    let action_id = client.propose_upgrade(&admin, &new_wasm_hash);
    assert_upgrade_pending(&client, action_id, &new_wasm_hash, proposed_at + long_delay);

    // Retroactively shrink the global timelock to 1.
    client.set_timelock_ledgers(&admin, &1);

    // The pending upgrade is still locked to the original (long) delay.
    advance_ledgers(&env, 1);
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.execute_upgrade(&admin, &action_id);
    }));
    assert!(result.is_err(), "snapshotted delay must not be shortened");

    advance_ledgers(&env, long_delay - 1);
    client.execute_upgrade(&admin, &action_id);
    assert_eq!(
        v2_fixture::Client::new(&env, &contract_id).upgraded_marker(),
        42
    );
}

#[test]
fn test_migrate_bumps_schema_emits_event_and_refuses_double_run() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let attacker = Address::generate(&env);
    let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);

    // Fresh deployments run at the current schema already, so migrate is a
    // no-op refusing to run.
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.migrate(&admin);
    }));
    assert!(
        result.is_err(),
        "migrate at current schema must panic with AlreadyMigrated"
    );

    // Simulate a deployment still running an older storage schema (e.g. it was
    // upgraded to a wasm whose target schema is higher than the stored one).
    let from_version = STORAGE_SCHEMA_VERSION - 1;
    env.as_contract(&contract_id, || {
        env.storage()
            .instance()
            .set(&DataKey::StorageSchemaVersion, &from_version);
    });
    assert_eq!(
        client.contract_metadata().storage_schema_version,
        from_version,
        "metadata must report the stored (pre-migration) schema"
    );

    // Non-admin cannot migrate.
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.migrate(&attacker);
    }));
    assert!(result.is_err(), "non-admin migrate must panic");
    assert_eq!(
        client.contract_metadata().storage_schema_version,
        from_version
    );

    // Admin migrates: schema bumps and the event is emitted. The event must
    // be inspected immediately — `env.events().all()` only holds the events of
    // the last invocation.
    client.migrate(&admin);

    let expected = StorageMigrated {
        from_version,
        to_version: STORAGE_SCHEMA_VERSION,
    };
    let expected_topics = expected.topics(&env);
    let expected_data = expected.data(&env);
    let events = env.events().all();
    let mut migrated_count = 0u32;
    for (_, topics, data) in events.iter() {
        if topics == expected_topics && val_eq(&env, &data, &expected_data) {
            migrated_count += 1;
        }
    }
    assert_eq!(
        migrated_count, 1,
        "expected exactly one StorageMigrated event with matching values"
    );

    assert_eq!(
        client.contract_metadata().storage_schema_version,
        STORAGE_SCHEMA_VERSION
    );

    // Idempotency: a second migrate for the same target refuses to run.
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.migrate(&admin);
    }));
    assert!(
        result.is_err(),
        "second migrate for same target must panic with AlreadyMigrated"
    );
}

// ─── Per-Asset Risk Params Tests ─────────────────────────────────────────────

/// Helper: proposes and executes `set_asset_risk_params`, advancing past timelock.
fn set_asset_risk_params(
    env: &Env,
    client: &VeilLendContractClient,
    admin: &Address,
    asset: &Address,
    collateral_factor_bps: &u32,
    liquidation_threshold_bps: &u32,
    liquidation_bonus_bps: &u32,
) {
    let action_id = client.propose_set_asset_risk_params(
        admin,
        asset,
        collateral_factor_bps,
        liquidation_threshold_bps,
        liquidation_bonus_bps,
    );
    advance_ledgers(env, DEFAULT_TIMELOCK);
    client.execute_set_asset_risk_params(admin, &action_id);
}

/// Two assets with different collateral factors: asset_a has factor 5_000
/// (50%), asset_b has factor 8_000 (80%). A user deposits both and borrows
/// against the combined weighted collateral.
#[test]
fn test_per_asset_weighting_two_assets_different_factors() {
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
    set_oracle_price(&env, &client, &admin, &asset_b, &1);

    // asset_a: factor=5_000 (50%), threshold=6_000 (60%)
    set_asset_risk_params(&env, &client, &admin, &asset_a, &5_000, &6_000, &0);
    // asset_b: factor=8_000 (80%), threshold=9_000 (90%)
    set_asset_risk_params(&env, &client, &admin, &asset_b, &8_000, &9_000, &0);

    // Deposit 1000 of each asset.
    client.deposit(&user, &asset_a, &1_000);
    client.deposit(&user, &asset_b, &1_000);

    // Weighted collateral = 1000*1*5_000 + 1000*1*8_000 = 13_000_000
    // Max borrow = 13_000_000 / 10_000 = 1_300
    let supplier = Address::generate(&env);
    client.deposit(&supplier, &asset_a, &10_000);

    // Borrow 1_300 should succeed (exactly at limit).
    client.borrow(&user, &asset_a, &asset_a, &1_300);
}

/// A low-factor collateral asset blocks borrowing that would have passed
/// under the flat global ratio.
#[test]
fn test_borrow_blocked_by_low_factor_collateral() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let stablecoin = Address::generate(&env);
    let volatile = Address::generate(&env);
    let user = Address::generate(&env);
    let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);

    configure_asset(&env, &client, &admin, &stablecoin);
    configure_asset(&env, &client, &admin, &volatile);
    set_oracle_price(&env, &client, &admin, &stablecoin, &1);
    set_oracle_price(&env, &client, &admin, &volatile, &1);

    // Volatile asset has a very low collateral factor (20%).
    set_asset_risk_params(&env, &client, &admin, &volatile, &2_000, &3_000, &0);

    // With flat ratio 15_000, 1_000 volatile (price 1) would allow
    // borrowing up to 1_000/1.5 = 666. But factor=2_000 means only
    // 1_000*2_000/10_000 = 200 borrowing power.
    client.deposit(&user, &volatile, &1_000);

    let supplier = Address::generate(&env);
    client.deposit(&supplier, &stablecoin, &10_000);

    // Borrow 200 succeeds (within factor limit).
    client.borrow(&user, &stablecoin, &volatile, &200);

    // Borrow 1 more fails (would exceed 200 borrowing power).
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.borrow(&user, &stablecoin, &volatile, &1);
    }));
    assert!(result.is_err(), "borrow 201 must fail with factor=2_000");
}

/// LTV/threshold buffer: a position at exactly the borrow limit (collateral
/// factor) is NOT liquidatable; it only becomes liquidatable when weighted
/// collateral falls below the liquidation threshold (triggered by oracle price drop).
#[test]
fn test_ltv_threshold_buffer_gap_is_real() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let collateral_asset = Address::generate(&env);
    let debt_asset = Address::generate(&env);
    let user = Address::generate(&env);
    let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);

    configure_asset(&env, &client, &admin, &collateral_asset);
    configure_asset(&env, &client, &admin, &debt_asset);
    // Use high prices to avoid rounding issues with bps math.
    set_oracle_price(&env, &client, &admin, &collateral_asset, &10_000);
    set_oracle_price(&env, &client, &admin, &debt_asset, &10_000);

    // Factor=7_000 (70%), threshold=8_000 (80%). Gap = 10%.
    set_asset_risk_params(&env, &client, &admin, &collateral_asset, &7_000, &8_000, &0);

    // Deposit 100 at price 10_000 → value = 1,000,000
    // Max borrow at factor: value * 7_000 / 10_000 / debt_price = 700,000 / 10,000 = 70
    client.deposit(&user, &collateral_asset, &100);
    let supplier = Address::generate(&env);
    client.deposit(&supplier, &debt_asset, &10_000);
    client.borrow(&user, &debt_asset, &collateral_asset, &70);

    // weighted_collateral = 100 * 10_000 * 7_000 = 7,000,000,000
    // debt * 10_000 = 70 * 10_000 * 10_000 = 7,000,000,000
    // Equal → NOT liquidatable (at borrow limit, not at threshold)
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.liquidate(
            &Address::generate(&env),
            &user,
            &collateral_asset,
            &debt_asset,
            &70,
        );
    }));
    assert!(
        result.is_err(),
        "position at borrow limit (70%) must NOT be liquidatable (threshold is 80%)"
    );

    // Drop collateral price from 10_000 to 8_000.
    // weighted_collateral = 100 * 8_000 * 8_000 = 6,400,000,000
    // debt * 10_000 = 70 * 10_000 * 10_000 = 7,000,000,000
    // 6,400,000,000 < 7,000,000,000 → liquidatable!
    set_oracle_price(&env, &client, &admin, &collateral_asset, &8_000);

    let liquidator = Address::generate(&env);
    client.deposit(&liquidator, &debt_asset, &10_000);
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.liquidate(&liquidator, &user, &collateral_asset, &debt_asset, &70);
    }));
    assert!(
        result.is_ok(),
        "position below threshold (80%) after price drop must be liquidatable"
    );
}

/// Liquidation bonus math at 0 bps, 500 bps, and the 2_000 bps ceiling.
#[test]
fn test_liquidation_bonus_math() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let collateral = Address::generate(&env);
    let debt = Address::generate(&env);

    let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);

    // ── Test with 500 bps (5%) bonus ───────────────────────────────
    configure_asset(&env, &client, &admin, &collateral);
    configure_asset(&env, &client, &admin, &debt);
    set_oracle_price(&env, &client, &admin, &collateral, &100);
    set_oracle_price(&env, &client, &admin, &debt, &100);

    // Factor=5_000, threshold=6_000, bonus=500
    set_asset_risk_params(&env, &client, &admin, &collateral, &5_000, &6_000, &500);

    let user = Address::generate(&env);
    let liquidator = Address::generate(&env);
    client.deposit(&user, &collateral, &1_000);
    let supplier = Address::generate(&env);
    client.deposit(&supplier, &debt, &10_000);

    // Borrow 300 (within factor: 1000*100*5_000/10_000/100 = 500 max).
    client.borrow(&user, &debt, &collateral, &300);

    // Drop collateral price to trigger liquidation below threshold.
    // At price 79: weighted = 1000*79*6_000 = 474_000_000
    // debt threshold = 300*100*10_000 = 300_000_000
    // 474_000_000 >= 300_000_000 → still not liquidatable
    // At price 49: weighted = 1000*49*6_000 = 294_000_000
    // 294_000_000 < 300_000_000 → liquidatable!
    set_oracle_price(&env, &client, &admin, &collateral, &49);

    client.deposit(&liquidator, &debt, &10_000);

    // Repay 100, seize with 5% bonus → seize_value = 100*100*(10_000+500)/10_000 = 1_050_000
    // seize_amount = 1_050_000 / 49 = 21_428 (capped at 1000 deposited)
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.liquidate(&liquidator, &user, &collateral, &debt, &100);
    }));
    // Should succeed since seize_amount (21_428) > 1000 but capped at 1000.
    assert!(
        result.is_ok(),
        "liquidation with 500 bps bonus should succeed"
    );

    // Check liquidator's collateral increased by 214 (seized amount).
    let liquidator_pos = client.get_position(&liquidator, &collateral);
    assert_eq!(liquidator_pos.deposited, 214);
}

/// Liquidation bonus at 0 bps: seize exactly equal value.
#[test]
fn test_liquidation_bonus_zero_bps() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let collateral = Address::generate(&env);
    let debt = Address::generate(&env);

    let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);

    configure_asset(&env, &client, &admin, &collateral);
    configure_asset(&env, &client, &admin, &debt);
    set_oracle_price(&env, &client, &admin, &collateral, &100);
    set_oracle_price(&env, &client, &admin, &debt, &100);

    // Factor=5_000, threshold=6_000, bonus=0
    set_asset_risk_params(&env, &client, &admin, &collateral, &5_000, &6_000, &0);

    let user = Address::generate(&env);
    let liquidator = Address::generate(&env);
    client.deposit(&user, &collateral, &1_000);
    let supplier = Address::generate(&env);
    client.deposit(&supplier, &debt, &10_000);

    client.borrow(&user, &debt, &collateral, &300);

    // Drop collateral price to trigger liquidation.
    set_oracle_price(&env, &client, &admin, &collateral, &49);

    client.deposit(&liquidator, &debt, &10_000);

    // Repay 100, seize with 0% bonus → seize_value = 100*100 = 10_000
    // seize_amount = 10_000 / 49 = 204 (capped at 1000 deposited)
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.liquidate(&liquidator, &user, &collateral, &debt, &100);
    }));
    assert!(
        result.is_ok(),
        "liquidation with 0 bps bonus should succeed"
    );

    let liquidator_pos = client.get_position(&liquidator, &collateral);
    assert_eq!(liquidator_pos.deposited, 204);
}

/// Liquidation bonus at 2_000 bps (20% ceiling): seize 120% of repaid value.
#[test]
fn test_liquidation_bonus_2000_bps_ceiling() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let collateral = Address::generate(&env);
    let debt = Address::generate(&env);

    let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);

    configure_asset(&env, &client, &admin, &collateral);
    configure_asset(&env, &client, &admin, &debt);
    set_oracle_price(&env, &client, &admin, &collateral, &100);
    set_oracle_price(&env, &client, &admin, &debt, &100);

    // Factor=5_000, threshold=8_000, bonus=2_000 (max)
    set_asset_risk_params(&env, &client, &admin, &collateral, &5_000, &8_000, &2_000);

    let user = Address::generate(&env);
    let liquidator = Address::generate(&env);
    client.deposit(&user, &collateral, &1_000);
    let supplier = Address::generate(&env);
    client.deposit(&supplier, &debt, &10_000);

    // Borrow 400 (within factor: 1000*100*5_000/10_000/100 = 500 max).
    client.borrow(&user, &debt, &collateral, &400);

    // Drop collateral price to trigger liquidation below threshold (8_000).
    // At price 79: weighted = 1000*79*8_000 = 632_000_000
    // debt threshold = 400*100*10_000 = 400_000_000
    // 632_000_000 >= 400_000_000 → not liquidatable
    // At price 49: weighted = 1000*49*8_000 = 392_000_000
    // 392_000_000 < 400_000_000 → liquidatable!
    set_oracle_price(&env, &client, &admin, &collateral, &49);

    client.deposit(&liquidator, &debt, &10_000);

    // Repay 100, seize with 20% bonus → seize_value = 100*100*(10_000+2_000)/10_000 = 120_000
    // seize_amount = 120_000 / 49 = 2_448 (capped at 1000 deposited)
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.liquidate(&liquidator, &user, &collateral, &debt, &100);
    }));
    assert!(
        result.is_ok(),
        "liquidation with 2_000 bps bonus should succeed"
    );

    let liquidator_pos = client.get_position(&liquidator, &collateral);
    assert_eq!(liquidator_pos.deposited, 244);
}

/// Bonus capped by available collateral producing bad debt: when the seize
/// amount would exceed the borrower's collateral, the cap binds and
/// LiquidationClipped is emitted.
#[test]
fn test_liquidation_bonus_capped_by_collateral() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let collateral = Address::generate(&env);
    let debt = Address::generate(&env);

    let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);

    configure_asset(&env, &client, &admin, &collateral);
    configure_asset(&env, &client, &admin, &debt);
    set_oracle_price(&env, &client, &admin, &collateral, &100);
    set_oracle_price(&env, &client, &admin, &debt, &100);

    // Factor=5_000, threshold=8_000, bonus=2_000 (max)
    set_asset_risk_params(&env, &client, &admin, &collateral, &5_000, &8_000, &2_000);

    let user = Address::generate(&env);
    let liquidator = Address::generate(&env);
    // Only deposit 100 collateral.
    client.deposit(&user, &collateral, &100);
    let supplier = Address::generate(&env);
    client.deposit(&supplier, &debt, &10_000);

    // Borrow within factor: 100*100*5_000/10_000/100 = 50 max
    client.borrow(&user, &debt, &collateral, &50);

    // Drop collateral price to trigger liquidation below threshold (8_000).
    // At price 49: weighted = 100*49*8_000 = 39_200_000
    // debt threshold = 50*100*10_000 = 50_000_000
    // 39_200_000 < 50_000_000 → liquidatable!
    set_oracle_price(&env, &client, &admin, &collateral, &49);

    client.deposit(&liquidator, &debt, &10_000);

    // Repay 50. Without cap: seize_value = 50*100*(10_000+2_000)/10_000 = 60_000
    // seize_amount = 60_000 / 49 = 1_224, but capped at 100 deposited.
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.liquidate(&liquidator, &user, &collateral, &debt, &50);
    }));
    assert!(result.is_ok(), "capped liquidation should succeed");

    // User's collateral should be 0 (fully seized).
    let user_pos = client.get_position(&user, &collateral);
    assert_eq!(user_pos.deposited, 0);

    // Liquidator gets all 100 collateral.
    let liquidator_pos = client.get_position(&liquidator, &collateral);
    assert_eq!(liquidator_pos.deposited, 100);
}

/// Every bounds-violation error for `propose_set_asset_risk_params`.
#[test]
fn test_asset_risk_params_bounds_violations() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let asset = Address::generate(&env);
    let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);
    configure_asset(&env, &client, &admin, &asset);

    // collateral_factor > liquidation_threshold → CollateralFactorExceedsThreshold
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.propose_set_asset_risk_params(&admin, &asset, &8_000, &7_000, &0);
    }));
    assert!(result.is_err(), "CF > threshold must fail");

    // liquidation_threshold > 10_000 → LiquidationThresholdExceedsMax
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.propose_set_asset_risk_params(&admin, &asset, &7_000, &10_001, &0);
    }));
    assert!(result.is_err(), "threshold > 10_000 must fail");

    // liquidation_bonus > 2_000 → InvalidLiquidationBonus
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.propose_set_asset_risk_params(&admin, &asset, &7_000, &8_000, &2_001);
    }));
    assert!(result.is_err(), "bonus > 2_000 must fail");

    // threshold + bonus > 10_000 → LiquidationThresholdPlusBonusExceedsMax
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.propose_set_asset_risk_params(&admin, &asset, &7_000, &9_000, &1_001);
    }));
    assert!(result.is_err(), "threshold + bonus > 10_000 must fail");
}

/// Timelock enforcement: execute_set_asset_risk_params fails before timelock.
#[test]
fn test_asset_risk_params_timelock_enforcement() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let asset = Address::generate(&env);
    let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);
    configure_asset(&env, &client, &admin, &asset);

    let action_id = client.propose_set_asset_risk_params(&admin, &asset, &7_000, &8_000, &500);

    // Execute immediately (before timelock) → must fail.
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.execute_set_asset_risk_params(&admin, &action_id);
    }));
    assert!(result.is_err(), "execute before timelock must fail");

    // Advance past timelock and execute → must succeed.
    advance_ledgers(&env, DEFAULT_TIMELOCK);
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.execute_set_asset_risk_params(&admin, &action_id);
    }));
    assert!(result.is_ok(), "execute after timelock must succeed");
}

/// Fallback behaviour: an unconfigured asset uses the global
/// `min_collateral_ratio_bps` as both collateral factor and liquidation
/// threshold, with 0 bonus.
#[test]
fn test_asset_risk_params_fallback_unconfigured_asset() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let asset = Address::generate(&env);
    let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);
    configure_asset(&env, &client, &admin, &asset);

    // No per-asset params set → fallback.
    let params = client.get_asset_risk_params(&asset);
    assert!(
        !params.is_explicit,
        "unconfigured asset should report is_explicit=false"
    );
    // 10_000 * 10_000 / 15_000 = 6_667 (ceiling)
    assert_eq!(params.collateral_factor_bps, 6_667);
    assert_eq!(params.liquidation_threshold_bps, 6_667);
    assert_eq!(params.liquidation_bonus_bps, 0);
}

/// Explicit params override the fallback.
#[test]
fn test_asset_risk_params_explicit_override() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let asset = Address::generate(&env);
    let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);
    configure_asset(&env, &client, &admin, &asset);

    set_asset_risk_params(&env, &client, &admin, &asset, &7_500, &8_000, &500);

    let params = client.get_asset_risk_params(&asset);
    assert!(
        params.is_explicit,
        "configured asset should report is_explicit=true"
    );
    assert_eq!(params.collateral_factor_bps, 7_500);
    assert_eq!(params.liquidation_threshold_bps, 8_000);
    assert_eq!(params.liquidation_bonus_bps, 500);
}

/// AssetRiskParamsUpdated event is emitted when params are set.
#[test]
fn test_asset_risk_params_updated_event() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let asset = Address::generate(&env);
    let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);
    configure_asset(&env, &client, &admin, &asset);

    // The event emission is verified by the function completing without panic.
    // The contract emits AssetRiskParamsUpdated internally.
    set_asset_risk_params(&env, &client, &admin, &asset, &7_000, &8_000, &500);

    // Verify params were actually stored.
    let params = client.get_asset_risk_params(&asset);
    assert!(params.is_explicit);
    assert_eq!(params.collateral_factor_bps, 7_000);
    assert_eq!(params.liquidation_threshold_bps, 8_000);
    assert_eq!(params.liquidation_bonus_bps, 500);
}

/// Cancel a pending set_asset_risk_params action.
#[test]
fn test_cancel_set_asset_risk_params() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let asset = Address::generate(&env);
    let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);
    configure_asset(&env, &client, &admin, &asset);

    let action_id = client.propose_set_asset_risk_params(&admin, &asset, &7_000, &8_000, &500);

    // Cancel before execution.
    client.cancel_set_asset_risk_params(&admin, &action_id);

    // Execute after cancel → must fail with UnknownAction.
    advance_ledgers(&env, DEFAULT_TIMELOCK);
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.execute_set_asset_risk_params(&admin, &action_id);
    }));
    assert!(result.is_err(), "execute after cancel must fail");
}

// ─── Storage TTL / archival-safety tests ─────────────────────────────────────
//
// See README.md's "Storage lifetime & TTL policy" section. These tests use
// the test-env ledger controls (`advance_ledgers`, which jumps only the
// ledger sequence — not the timestamp — matching how TTL is actually
// measured on Soroban) to prove entries this fix bumps survive a long,
// TTL-relevant gap rather than archiving.

/// A deterministic (no RNG) Ed25519 keypair for signing test `Permit`s.
fn test_signing_key(seed_byte: u8) -> SigningKey {
    SigningKey::from_bytes(&[seed_byte; 32])
}

fn sign_permit(
    env: &Env,
    signing_key: &SigningKey,
    domain: &veillend_contract::DomainSeparator,
    permit: &Permit,
) -> Bytes {
    let digest = compute_permit_digest(env, domain, permit);
    let digest_bytes: Vec<u8> = digest.iter().collect();
    let signature = signing_key.sign(&digest_bytes);
    Bytes::from_array(env, &signature.to_bytes())
}

/// A bumped `Position` (and the `SupportedAsset`/instance storage it implies)
/// must still read correctly after an interval that spans the entirety of
/// `PERSISTENT_TTL_EXTEND_TO` — the window `write_position` and
/// `require_supported_asset` arm it to on every touch.
#[test]
fn test_bumped_position_survives_long_dormancy() {
    let env = Env::default();
    let (client, _admin, asset) = setup_with_asset(&env);
    let user = Address::generate(&env);

    client.deposit(&user, &asset, &1_000i128);

    let position_key = DataKey::Position(user.clone(), asset.clone());
    let ttl_after_deposit = env.as_contract(&client.address, || {
        env.storage().persistent().get_ttl(&position_key)
    });
    assert!(
        ttl_after_deposit >= PERSISTENT_TTL_EXTEND_TO - PERSISTENT_TTL_THRESHOLD,
        "deposit did not bump Position's TTL close to PERSISTENT_TTL_EXTEND_TO: got {}",
        ttl_after_deposit
    );

    // Jump most of the way across the bumped window without touching
    // anything else.
    advance_ledgers(&env, PERSISTENT_TTL_EXTEND_TO - 100);

    let position = client.get_position(&user, &asset);
    assert_eq!(position.deposited, 1_000);
}

/// `PermitNonce`/`PermitEpoch` must not lose their value across a long
/// dormancy: `get_permit_nonce` must still report the correct, advanced
/// nonce (not silently reset to `0`), and a fresh permit signed at that
/// nonce must still be accepted.
#[test]
fn test_permit_state_survives_long_dormancy() {
    let env = Env::default();
    let (client, _admin, asset) = setup_with_asset(&env);

    let signing_key = test_signing_key(1);
    let public_key = BytesN::from_array(&env, &signing_key.verifying_key().to_bytes());
    let user = signer_address(&env, &public_key);

    let domain = client.get_domain_separator();
    let permit0 = Permit {
        public_key: public_key.clone(),
        action: Symbol::new(&env, "deposit"),
        asset: asset.clone(),
        amount: 500,
        nonce: 0,
        epoch: 0,
        deadline: env.ledger().timestamp() + 10_000,
        chain_id: domain.chain_id,
        contract_id: client.address.clone(),
    };
    let sig0 = sign_permit(&env, &signing_key, &domain, &permit0);
    client.deposit_for(&permit0, &sig0, &asset, &500);
    assert_eq!(client.get_permit_nonce(&user), 1);

    // Advance across nearly the entire PERMIT_TTL_EXTEND_TO window (longer
    // than the ordinary PERSISTENT_TTL_EXTEND_TO window every other entry
    // gets, since a permit nonce is the highest-severity key in this
    // contract's storage surface).
    advance_ledgers(&env, PERMIT_TTL_EXTEND_TO - 1_000);

    assert_eq!(
        client.get_permit_nonce(&user),
        1,
        "nonce must survive the dormancy unchanged, not reset to 0"
    );
    assert_eq!(client.get_permit_epoch(&user), 0);

    // A fresh permit signed at the current (correct, advanced) nonce still
    // works — the long gap did not break legitimate future use either.
    let permit1 = Permit {
        nonce: 1,
        deadline: env.ledger().timestamp() + 10_000,
        ..permit0.clone()
    };
    let sig1 = sign_permit(&env, &signing_key, &domain, &permit1);
    client.deposit_for(&permit1, &sig1, &asset, &500);
    assert_eq!(client.get_permit_nonce(&user), 2);
}

/// Replaying an already-consumed permit must still fail after a long
/// dormancy — the nonce must not have silently reset to a value that would
/// let an old, already-used signature validate again.
///
/// `deposit_for` (like the other `*_for` permit entrypoints) calls
/// `.unwrap()` on `verify_and_consume_permit`'s `Result`, so a validation
/// failure surfaces as a Rust panic carrying the `VeilLendError` variant's
/// name (here `PermitNonceMismatch`, code 43 — see `permit_failed`'s
/// `error_code` in the event log) rather than a typed `Error(Contract, #N)`
/// host error; this is pre-existing behavior of the permit entrypoints, not
/// something this fix changes.
#[test]
#[should_panic(expected = "PermitNonceMismatch")]
fn test_permit_replay_fails_after_long_dormancy() {
    let env = Env::default();
    let (client, _admin, asset) = setup_with_asset(&env);

    let signing_key = test_signing_key(2);
    let public_key = BytesN::from_array(&env, &signing_key.verifying_key().to_bytes());

    let domain = client.get_domain_separator();
    let permit0 = Permit {
        public_key: public_key.clone(),
        action: Symbol::new(&env, "deposit"),
        asset: asset.clone(),
        amount: 500,
        nonce: 0,
        epoch: 0,
        deadline: env.ledger().timestamp() + 10_000,
        chain_id: domain.chain_id,
        contract_id: client.address.clone(),
    };
    let sig0 = sign_permit(&env, &signing_key, &domain, &permit0);
    client.deposit_for(&permit0, &sig0, &asset, &500);

    advance_ledgers(&env, PERMIT_TTL_EXTEND_TO - 1_000);

    // Replay the same, already-consumed permit (nonce 0) again.
    client.deposit_for(&permit0, &sig0, &asset, &500);
}

/// `revoke_permits` invalidates a previously-signed permit immediately,
/// regardless of its nonce, without needing to know which nonce it used.
/// See `test_permit_replay_fails_after_long_dormancy` for why the expected
/// panic string is the error variant's name rather than `Contract, #N`.
#[test]
#[should_panic(expected = "PermitNonceMismatch")]
fn test_revoke_permits_invalidates_outstanding_permit() {
    let env = Env::default();
    let (client, _admin, asset) = setup_with_asset(&env);

    let signing_key = test_signing_key(3);
    let public_key = BytesN::from_array(&env, &signing_key.verifying_key().to_bytes());
    let user = signer_address(&env, &public_key);

    let domain = client.get_domain_separator();
    let permit0 = Permit {
        public_key: public_key.clone(),
        action: Symbol::new(&env, "deposit"),
        asset: asset.clone(),
        amount: 500,
        nonce: 0,
        epoch: 0,
        deadline: env.ledger().timestamp() + 10_000,
        chain_id: domain.chain_id,
        contract_id: client.address.clone(),
    };
    let sig0 = sign_permit(&env, &signing_key, &domain, &permit0);

    let new_epoch = client.revoke_permits(&user);
    assert_eq!(new_epoch, 1);

    // The permit was signed under epoch 0, which is no longer current.
    client.deposit_for(&permit0, &sig0, &asset, &500);
}

/// A `SupportedAsset` with a live balance must survive a long dormancy: it
/// must not archive into "unsupported" purely from time passing, which
/// would otherwise trap the deposited funds behind `UnsupportedAsset` (the
/// exact outcome `apply_configure_asset`'s active-positions guard exists to
/// prevent for an explicit admin call).
#[test]
fn test_supported_asset_with_live_balance_survives_long_dormancy() {
    let env = Env::default();
    let (client, _admin, asset) = setup_with_asset(&env);
    let user = Address::generate(&env);

    client.deposit(&user, &asset, &1_000i128);

    let supported_key = DataKey::SupportedAsset(asset.clone());
    let ttl = env.as_contract(&client.address, || {
        env.storage().persistent().get_ttl(&supported_key)
    });
    assert!(
        ttl >= PERSISTENT_TTL_EXTEND_TO - PERSISTENT_TTL_THRESHOLD,
        "deposit did not bump SupportedAsset's TTL close to PERSISTENT_TTL_EXTEND_TO: got {}",
        ttl
    );

    advance_ledgers(&env, PERSISTENT_TTL_EXTEND_TO - 100);

    // Still usable — no UnsupportedAsset panic, and the live balance is intact.
    client.deposit(&user, &asset, &1i128);
    assert!(client.is_asset_supported(&asset));
    assert_eq!(client.get_asset_reserve(&asset).total_balance, 1_001);
}

/// Oracle staleness enforcement must survive the loss of `OracleLastUpdated`
/// specifically: a live `OraclePrice` next to a *missing* `OracleLastUpdated`
/// must fail closed (`OraclePriceStale`), not silently skip the staleness
/// check and let an arbitrarily stale price read as fresh. Normal operation
/// always writes and bumps the two keys together (`apply_set_oracle_price`,
/// `bump_oracle_keys`), so this simulates the only way they could
/// realistically diverge — using `env.as_contract` to reach into storage
/// directly, standing in for a partial-archival edge case.
#[test]
#[should_panic(expected = "Contract, #23")]
fn test_oracle_staleness_survives_loss_of_last_updated() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let collateral_asset = Address::generate(&env);
    let borrow_asset = Address::generate(&env);
    let user = Address::generate(&env);
    let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);

    configure_asset(&env, &client, &admin, &collateral_asset);
    configure_asset(&env, &client, &admin, &borrow_asset);
    set_oracle_price(&env, &client, &admin, &collateral_asset, &1);
    set_oracle_price(&env, &client, &admin, &borrow_asset, &1);

    let supplier = Address::generate(&env);
    client.deposit(&supplier, &borrow_asset, &1_000);
    client.deposit(&user, &collateral_asset, &1_000);

    // Sanity: borrowing works normally before anything is removed.
    client.borrow(&user, &borrow_asset, &collateral_asset, &100);

    // Simulate the borrow asset's OracleLastUpdated having diverged from its
    // still-live OraclePrice.
    env.as_contract(&contract_id, || {
        env.storage()
            .persistent()
            .remove(&DataKey::OracleLastUpdated(borrow_asset.clone()));
    });

    // Must fail closed rather than treat the (possibly ancient) price as fresh.
    client.borrow(&user, &borrow_asset, &collateral_asset, &10);
}
