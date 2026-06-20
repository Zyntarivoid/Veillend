use soroban_sdk::{testutils::Address as _, Address, Env};
use veillend_contract::{Position, VeilLendContract, VeilLendContractClient};

const MIN_COLLATERAL_RATIO_BPS: u32 = 15_000;

fn setup() -> (
    Env,
    VeilLendContractClient<'static>,
    Address,
    Address,
    Address,
) {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let contract_id = env.register(VeilLendContract, (admin.clone(), MIN_COLLATERAL_RATIO_BPS));
    let client = VeilLendContractClient::new(&env, &contract_id);
    let asset = Address::generate(&env);
    let user = Address::generate(&env);

    client.configure_asset(&admin, &asset, &true);

    (env, client, admin, asset, user)
}

#[test]
fn deposit_borrow_repay_and_withdraw_update_position() {
    let (_env, client, _admin, asset, user) = setup();

    client.deposit(&user, &asset, &1_000);
    client.borrow(&user, &asset, &500);
    client.repay(&user, &asset, &200);
    client.withdraw(&user, &asset, &550);

    assert_eq!(
        client.get_position(&user, &asset),
        Position {
            deposited: 450,
            borrowed: 300,
        }
    );
}

#[test]
#[should_panic(expected = "Error(Contract, #4)")]
fn deposit_rejects_zero_amount() {
    let (_env, client, _admin, asset, user) = setup();

    client.deposit(&user, &asset, &0);
}

#[test]
#[should_panic(expected = "Error(Contract, #4)")]
fn borrow_rejects_negative_amount() {
    let (_env, client, _admin, asset, user) = setup();

    client.borrow(&user, &asset, &-1);
}

#[test]
#[should_panic(expected = "Error(Contract, #5)")]
fn borrow_rejects_insufficient_collateral() {
    let (_env, client, _admin, asset, user) = setup();

    client.deposit(&user, &asset, &100);
    client.borrow(&user, &asset, &100);
}

#[test]
#[should_panic(expected = "Error(Contract, #7)")]
fn repay_rejects_amount_above_debt() {
    let (_env, client, _admin, asset, user) = setup();

    client.deposit(&user, &asset, &1_000);
    client.borrow(&user, &asset, &500);
    client.repay(&user, &asset, &501);
}

#[test]
#[should_panic(expected = "Error(Contract, #6)")]
fn withdraw_rejects_amount_above_deposit() {
    let (_env, client, _admin, asset, user) = setup();

    client.deposit(&user, &asset, &100);
    client.withdraw(&user, &asset, &101);
}

#[test]
#[should_panic(expected = "Error(Contract, #5)")]
fn withdraw_rejects_when_remaining_collateral_is_too_low() {
    let (_env, client, _admin, asset, user) = setup();

    client.deposit(&user, &asset, &1_000);
    client.borrow(&user, &asset, &500);
    client.withdraw(&user, &asset, &251);
}
