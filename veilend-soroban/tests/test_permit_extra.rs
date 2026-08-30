#![cfg(test)]

use ed25519_dalek::{Signer, SigningKey};
use soroban_sdk::testutils::{Address as _, Ledger as _};
use soroban_sdk::{Address, Env, Symbol};
use veillend_contract::{
    compute_permit_digest, signer_address, Permit, VeilLendContract, VeilLendContractClient,
    CONTRACT_VERSION, DomainSeparator,
};

fn setup() -> (Env, VeilLendContractClient<'static>, Address, Address, SigningKey, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let contract_id = env.register(VeilLendContract, (admin.clone(), 15_000u32));
    let client = VeilLendContractClient::new(&env, &contract_id);

    let xlm = Address::generate(&env);
    let usdc = Address::generate(&env);

    let signing_key = SigningKey::from_bytes(&[1u8; 32]);
    let user = signer_address(&env, &signing_key.get_public().to_bytes().into());

    (env, client, admin, user, signing_key, xlm, usdc)
}

fn sign_permit(
    env: &Env,
    signing_key: &SigningKey,
    domain: &DomainSeparator,
    permit: &Permit,
) -> soroban_sdk::Bytes {
    let digest = compute_permit_digest(env, domain, permit);
    let sig = signing_key.sign(digest.as_slice());
    soroban_sdk::Bytes::from_slice(env, &sig.to_bytes())
}

#[test]
#[should_panic(expected = "VeilLendError::InvalidSignature")]
fn test_withdraw_for_extra_asset_mismatch() {
    let (env, client, _admin, _user, signing_key, xlm, usdc) = setup();
    let domain = client.get_domain_separator();

    let permit = Permit {
        public_key: signing_key.get_public().to_bytes().into(),
        action: Symbol::new(&env, "withdraw"),
        asset: xlm.clone(),
        amount: 100,
        nonce: 0,
        epoch: 0,
        deadline: env.ledger().timestamp() + 3600,
        chain_id: 0,
        contract_id: client.address.clone(),
        extra_asset: Some(usdc.clone()),
    };
    let sig = sign_permit(&env, &signing_key, &domain, &permit);

    // Provide a different debt_asset (xlm instead of usdc) -> should panic
    client.withdraw_for(&permit, &sig, &xlm, &xlm, &100);
}

#[test]
#[should_panic(expected = "VeilLendError::InvalidSignature")]
fn test_borrow_for_extra_asset_mismatch() {
    let (env, client, _admin, _user, signing_key, xlm, usdc) = setup();
    let domain = client.get_domain_separator();

    let permit = Permit {
        public_key: signing_key.get_public().to_bytes().into(),
        action: Symbol::new(&env, "borrow"),
        asset: xlm.clone(),
        amount: 100,
        nonce: 0,
        epoch: 0,
        deadline: env.ledger().timestamp() + 3600,
        chain_id: 0,
        contract_id: client.address.clone(),
        extra_asset: Some(usdc.clone()),
    };
    let sig = sign_permit(&env, &signing_key, &domain, &permit);

    // Provide a different collateral_asset (xlm instead of usdc) -> should panic
    client.borrow_for(&permit, &sig, &xlm, &xlm, &100);
}

#[test]
#[should_panic(expected = "VeilLendError::InvalidSignature")]
fn test_deposit_for_must_not_have_extra_asset() {
    let (env, client, _admin, _user, signing_key, xlm, usdc) = setup();
    let domain = client.get_domain_separator();

    let permit = Permit {
        public_key: signing_key.get_public().to_bytes().into(),
        action: Symbol::new(&env, "deposit"),
        asset: xlm.clone(),
        amount: 100,
        nonce: 0,
        epoch: 0,
        deadline: env.ledger().timestamp() + 3600,
        chain_id: 0,
        contract_id: client.address.clone(),
        extra_asset: Some(usdc.clone()), // extra_asset set!
    };
    let sig = sign_permit(&env, &signing_key, &domain, &permit);

    // Should panic because deposit doesn't allow extra_asset
    client.deposit_for(&permit, &sig, &xlm, &100);
}

#[test]
#[should_panic] // Actually ed25519_verify traps or returns invalid sig
fn test_old_domain_version_rejected() {
    let (env, client, _admin, _user, signing_key, xlm, _usdc) = setup();
    
    // Create an old domain with version 11
    let old_domain = DomainSeparator {
        contract_id: client.address.clone(),
        version: 11,
        chain_id: 0,
    };

    let permit = Permit {
        public_key: signing_key.get_public().to_bytes().into(),
        action: Symbol::new(&env, "deposit"),
        asset: xlm.clone(),
        amount: 100,
        nonce: 0,
        epoch: 0,
        deadline: env.ledger().timestamp() + 3600,
        chain_id: 0,
        contract_id: client.address.clone(),
        extra_asset: None,
    };
    let sig = sign_permit(&env, &signing_key, &old_domain, &permit);

    // Verify using current version (which is 12) -> should fail
    client.deposit_for(&permit, &sig, &xlm, &100);
}

#[test]
fn test_deposit_replayed_as_withdraw_fails_digest() {
    let (env, client, _admin, _user, signing_key, xlm, usdc) = setup();
    let domain = client.get_domain_separator();

    let deposit_permit = Permit {
        public_key: signing_key.get_public().to_bytes().into(),
        action: Symbol::new(&env, "deposit"),
        asset: xlm.clone(),
        amount: 100,
        nonce: 0,
        epoch: 0,
        deadline: env.ledger().timestamp() + 3600,
        chain_id: 0,
        contract_id: client.address.clone(),
        extra_asset: None,
    };
    let sig = sign_permit(&env, &signing_key, &domain, &deposit_permit);

    // Try to replay the deposit signature as a withdraw signature
    // but the digest won't match.
    // We expect an ed25519 signature failure, which on Soroban translates to a panic
    let withdraw_permit = Permit {
        public_key: signing_key.get_public().to_bytes().into(),
        action: Symbol::new(&env, "withdraw"),
        asset: xlm.clone(),
        amount: 100,
        nonce: 0,
        epoch: 0,
        deadline: env.ledger().timestamp() + 3600,
        chain_id: 0,
        contract_id: client.address.clone(),
        extra_asset: Some(usdc.clone()),
    };
    
    // We have to use catch_unwind or similar, but since we are just testing if it fails:
    let res = std::panic::catch_unwind(|| {
        client.withdraw_for(&withdraw_permit, &sig, &xlm, &usdc, &100);
    });
    assert!(res.is_err());
}
