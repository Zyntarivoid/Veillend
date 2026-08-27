//! Permit helper functions for the Veilend contract.

use crate::permit::{DomainSeparator, Permit};
use soroban_sdk::{Address, Bytes, Env, Symbol};

/// A verified permit that has passed signature, deadline, and nonce checks.
///
/// This struct is returned by `verify_and_consume_permit` and contains
/// the validated permit data ready for execution.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VerifiedPermit {
    pub user: Address,
    pub action: Symbol,
    pub asset: Address,
    pub amount: i128,
    pub nonce: u64,
}

/// Verifies a permit and advances the nonce if valid.
///
/// This is the main entry point for permit verification. It:
/// 1. Validates the domain separator
/// 2. Verifies the signature
/// 3. Checks the deadline
/// 4. Checks the nonce
/// 5. Advances the nonce
/// 6. Emits a permit executed event
///
/// # Arguments
/// * `env` - The Soroban environment
/// * `domain` - The domain separator for this contract
/// * `permit` - The permit to verify
/// * `signature` - The ed25519 signature
///
/// # Returns
/// * `Ok(VerifiedPermit)` if verification succeeds
/// * `Err(VeilLendError)` if verification fails
pub fn verify_and_consume_permit(
    env: &Env,
    domain: &DomainSeparator,
    permit: &Permit,
    signature: &Bytes,
) -> Result<VerifiedPermit, crate::VeilLendError> {
    use crate::permit::{
        advance_nonce, emit_permit_executed, emit_permit_failed, get_current_epoch,
        get_current_nonce, signer_address, validate_permit, verify_permit,
    };

    // The acting Address is a pure function of the public key, so it can be
    // derived up front and used to annotate a PermitFailed event on any of
    // the checks below (this is only observable via transaction simulation,
    // since a failing call still reverts all of its effects on submission).
    let user = signer_address(env, &permit.public_key);

    // Verify the signature. Note: an invalid signature aborts the
    // transaction directly inside the host call and never reaches here, so
    // it cannot be reported through `emit_permit_failed`.
    if let Err(e) = verify_permit(env, domain, permit, signature) {
        emit_permit_failed(env, &user, &permit.action, e as u32);
        return Err(e);
    }

    // Get the current nonce and epoch
    let current_nonce = get_current_nonce(env, &user);
    let current_epoch = get_current_epoch(env, &user);

    // Validate deadline, epoch, and nonce
    if let Err(e) = validate_permit(env, permit, current_nonce, current_epoch) {
        emit_permit_failed(env, &user, &permit.action, e as u32);
        return Err(e);
    }

    // Advance the nonce (consume the permit)
    let new_nonce = advance_nonce(env, &user);

    // Emit permit executed event
    emit_permit_executed(
        env,
        &user,
        &permit.action,
        &permit.asset,
        permit.amount,
        new_nonce,
    );

    Ok(VerifiedPermit {
        user,
        action: permit.action.clone(),
        asset: permit.asset.clone(),
        amount: permit.amount,
        nonce: new_nonce,
    })
}
