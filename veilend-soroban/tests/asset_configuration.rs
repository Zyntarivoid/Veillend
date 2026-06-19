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

    let contract_id = env.register(
        VeilLendContract,
        (Address::generate(&env), MIN_COLLATERAL_RATIO_BPS),
    );
    let client = VeilLendContractClient::new(&env, &contract_id);

    let admin = client.admin();
    let asset = Address::generate(&env);
    let user = Address::generate(&env);

    (env, client, admin, asset, user)
}

#[test]
fn constructor_sets_admin_and_collateral_ratio() {
    let (_env, client, admin, asset, _user) = setup();

    assert_eq!(client.admin(), admin);
    assert_eq!(client.min_collateral_ratio_bps(), MIN_COLLATERAL_RATIO_BPS);
    assert!(!client.is_asset_supported(&asset));
}

#[test]
fn admin_can_configure_and_read_supported_asset() {
    let (_env, client, admin, asset, _user) = setup();

    client.configure_asset(&admin, &asset, &true);
    assert!(client.is_asset_supported(&asset));

    client.configure_asset(&admin, &asset, &false);
    assert!(!client.is_asset_supported(&asset));
}

#[test]
#[should_panic(expected = "Error(Contract, #2)")]
fn non_admin_cannot_configure_supported_asset() {
    let (env, client, _admin, asset, _user) = setup();
    let attacker = Address::generate(&env);

    client.configure_asset(&attacker, &asset, &true);
}

#[test]
fn configured_asset_allows_initial_position_flow() {
    let (_env, client, admin, asset, user) = setup();

    client.configure_asset(&admin, &asset, &true);
    client.deposit(&user, &asset, &1_000);
    client.borrow(&user, &asset, &500);

    assert_eq!(
        client.get_position(&user, &asset),
        Position {
            deposited: 1_000,
            borrowed: 500,
        }
    );
}

#[test]
#[should_panic(expected = "Error(Contract, #3)")]
fn unsupported_asset_rejects_initial_deposit() {
    let (_env, client, _admin, asset, user) = setup();

    client.deposit(&user, &asset, &1_000);
}
