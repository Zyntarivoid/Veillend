use crate::{VeilLendContract, VeilLendContractClient};
use soroban_sdk::{
    contract, contractimpl,
    testutils::{Address as _, Events as _, Ledger as _},
    Address, Env, Symbol, TryFromVal, Vec,
};

const DEFAULT_TIMELOCK: u32 = 50;

fn lending_contract_key(env: &Env) -> Symbol {
    Symbol::new(env, "lending")
}

/// A mock flash loan receiver. Repayment is recorded unconditionally by the
/// lending contract once this callback returns without panicking (see
/// `flash_loan.rs`'s repayment model doc comment): there is no real token
/// balance to move, so the receiver has nothing to do here.
#[contract]
pub struct MockFlashLoanReceiver;

#[contractimpl]
impl MockFlashLoanReceiver {
    pub fn flash_loan_receiver(
        _env: Env,
        _initiator: Address,
        _asset: Address,
        _amount: i128,
        _premium: i128,
        _params: Vec<Symbol>,
    ) {
    }
}

/// A mock flash loan receiver that attempts reentrancy.
#[contract]
pub struct MockFlashLoanReceiverReentrant;

#[contractimpl]
impl MockFlashLoanReceiverReentrant {
    pub fn __constructor(env: Env, lending_contract: Address) {
        env.storage()
            .instance()
            .set(&lending_contract_key(&env), &lending_contract);
    }

    pub fn flash_loan_receiver(
        env: Env,
        _initiator: Address,
        asset: Address,
        _amount: i128,
        _premium: i128,
        _params: Vec<Symbol>,
    ) {
        let lending_contract: Address = env
            .storage()
            .instance()
            .get(&lending_contract_key(&env))
            .unwrap();
        let client = VeilLendContractClient::new(&env, &lending_contract);

        // This should fail due to the reentrancy guard.
        let receiver = env.current_contract_address();
        client.flash_loan(&receiver, &receiver, &asset, &1, &Vec::new(&env));
    }
}

fn advance_ledgers(env: &Env, n: u32) {
    let current = env.ledger().sequence();
    env.ledger().set_sequence_number(current.saturating_add(n));
}

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

#[test]
fn test_configure_flash_loan() {
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
}

#[test]
#[should_panic(expected = "Contract, #38")]
fn test_configure_flash_loan_premium_below_minimum() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let asset = Address::generate(&env);
    let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);

    configure_asset(&env, &client, &admin, &asset);

    client.configure_flash_loan(&admin, &asset, &true, &0, &10_000);
}

#[test]
#[should_panic(expected = "Contract, #38")]
fn test_configure_flash_loan_premium_above_maximum() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let asset = Address::generate(&env);
    let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);

    configure_asset(&env, &client, &admin, &asset);

    client.configure_flash_loan(&admin, &asset, &true, &1001, &10_000);
}

#[test]
#[should_panic(expected = "Contract, #39")]
fn test_configure_flash_loan_max_bps_below_minimum() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let asset = Address::generate(&env);
    let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);

    configure_asset(&env, &client, &admin, &asset);

    client.configure_flash_loan(&admin, &asset, &true, &9, &0);
}

#[test]
#[should_panic(expected = "Contract, #39")]
fn test_configure_flash_loan_max_bps_above_maximum() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let asset = Address::generate(&env);
    let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);

    configure_asset(&env, &client, &admin, &asset);

    client.configure_flash_loan(&admin, &asset, &true, &9, &10001);
}

#[test]
fn test_flash_loan_success() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let asset = Address::generate(&env);
    let user = Address::generate(&env);
    let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);

    configure_asset(&env, &client, &admin, &asset);
    set_oracle_price(&env, &client, &admin, &asset, &100);

    // Fund the reserve
    client.deposit(&user, &asset, &1_000_000);

    // Configure flash loan
    client.configure_flash_loan(&admin, &asset, &true, &9, &10_000);

    let receiver_id = env.register(MockFlashLoanReceiver, ());

    // Execute flash loan
    let initiator = user.clone();
    let amount = 100_000;
    let params = Vec::new(&env);

    let before_reserve = client.get_asset_reserve(&asset);
    client.flash_loan(&initiator, &receiver_id, &asset, &amount, &params);
    let after_reserve = client.get_asset_reserve(&asset);

    // The reserve should have increased by the premium
    let premium = 90; // ceil(100_000 * 9 / 10000) = 90
    assert_eq!(
        after_reserve.total_balance - before_reserve.total_balance,
        premium
    );
    assert_eq!(
        after_reserve.protocol_fees - before_reserve.protocol_fees,
        premium
    );
}

#[test]
#[should_panic(expected = "Contract, #34")]
fn test_flash_loan_disabled() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let asset = Address::generate(&env);
    let user = Address::generate(&env);
    let receiver = Address::generate(&env);
    let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);

    configure_asset(&env, &client, &admin, &asset);
    set_oracle_price(&env, &client, &admin, &asset, &100);

    client.deposit(&user, &asset, &1_000_000);

    // Configure flash loan with enabled = false
    client.configure_flash_loan(&admin, &asset, &false, &9, &10_000);

    client.flash_loan(&user, &receiver, &asset, &100_000, &Vec::new(&env));
}

#[test]
#[should_panic(expected = "Contract, #35")]
fn test_flash_loan_exceeds_max_bps() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let asset = Address::generate(&env);
    let user = Address::generate(&env);
    let receiver = Address::generate(&env);
    let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);

    configure_asset(&env, &client, &admin, &asset);
    set_oracle_price(&env, &client, &admin, &asset, &100);

    client.deposit(&user, &asset, &1_000_000);

    // Configure flash loan with max_bps = 5000 (50% of reserve)
    client.configure_flash_loan(&admin, &asset, &true, &9, &5_000);

    // Try to borrow 60% of reserve
    client.flash_loan(&user, &receiver, &asset, &600_000, &Vec::new(&env));
}

#[test]
#[should_panic]
fn test_flash_loan_reentrancy_blocked() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let asset = Address::generate(&env);
    let user = Address::generate(&env);
    let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);

    configure_asset(&env, &client, &admin, &asset);
    set_oracle_price(&env, &client, &admin, &asset, &100);

    client.deposit(&user, &asset, &1_000_000);

    client.configure_flash_loan(&admin, &asset, &true, &9, &10_000);

    // Register a receiver that attempts reentrancy
    let receiver_id = env.register(MockFlashLoanReceiverReentrant, (contract_id.clone(),));

    // This should fail due to the reentrancy guard
    client.flash_loan(&user, &receiver_id, &asset, &100_000, &Vec::new(&env));
}

#[test]
#[should_panic(expected = "Contract, #12")]
fn test_flash_loan_paused_blocks() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let asset = Address::generate(&env);
    let user = Address::generate(&env);
    let receiver = Address::generate(&env);
    let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);

    configure_asset(&env, &client, &admin, &asset);
    set_oracle_price(&env, &client, &admin, &asset, &100);

    client.deposit(&user, &asset, &1_000_000);

    client.configure_flash_loan(&admin, &asset, &true, &9, &10_000);

    // Pause the contract
    let action_id = client.propose_set_paused(&admin);
    advance_ledgers(&env, DEFAULT_TIMELOCK);
    client.execute_set_paused(&admin, &action_id);
    assert!(client.is_paused());

    client.flash_loan(&user, &receiver, &asset, &100_000, &Vec::new(&env));
}

#[test]
#[should_panic(expected = "Contract, #12")]
fn test_configure_flash_loan_paused_blocks() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let asset = Address::generate(&env);
    let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);

    configure_asset(&env, &client, &admin, &asset);

    let action_id = client.propose_set_paused(&admin);
    advance_ledgers(&env, DEFAULT_TIMELOCK);
    client.execute_set_paused(&admin, &action_id);
    assert!(client.is_paused());

    // Admin config mutators must not be usable to funnel value while the
    // protocol claims to be frozen (issue #298).
    client.configure_flash_loan(&admin, &asset, &true, &9, &10_000);
}

#[test]
fn test_flash_loan_events_emitted() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let asset = Address::generate(&env);
    let user = Address::generate(&env);
    let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);

    configure_asset(&env, &client, &admin, &asset);
    set_oracle_price(&env, &client, &admin, &asset, &100);

    client.deposit(&user, &asset, &1_000_000);

    client.configure_flash_loan(&admin, &asset, &true, &9, &10_000);

    let receiver_id = env.register(MockFlashLoanReceiver, ());

    // Execute flash loan
    let initiator = user.clone();
    let amount = 100_000;
    let params = Vec::new(&env);

    client.flash_loan(&initiator, &receiver_id, &asset, &amount, &params);

    // Verify event was emitted
    let events = env.events().all();
    let mut flash_loan_event_count = 0;

    let veillend_topic = Symbol::new(&env, "veillend");
    let flash_loan_topic = Symbol::new(&env, "flash_loan");

    for (_contract, topics, _data) in events.iter() {
        // Check if this is a FlashLoanEvent
        if topics.len() >= 2 {
            let topic0 = Symbol::try_from_val(&env, &topics.get(0).unwrap());
            let topic1 = Symbol::try_from_val(&env, &topics.get(1).unwrap());
            if topic0 == Ok(veillend_topic.clone()) && topic1 == Ok(flash_loan_topic.clone()) {
                flash_loan_event_count += 1;
            }
        }
    }

    assert_eq!(flash_loan_event_count, 1);
}
