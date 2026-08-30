//! Permit-style meta-transaction verification.
//!
//! This module provides ed25519 signature verification for off-chain signed
//! permits, enabling relayers to submit transactions on behalf of users who
//! have signed a structured permit message.

use crate::{DataKey, VeilLendContract, VeilLendError, PERMIT_TTL_EXTEND_TO};
use soroban_sdk::{
    address_payload::AddressPayload, contractevent, contracttype, xdr::ToXdr, Address, Bytes,
    BytesN, Env, Symbol,
};

/// Domain separator for permit signatures.
///
/// This ensures signatures are bound to this specific contract and version,
/// preventing replay across different contracts or versions.
#[derive(Clone, Debug, Eq, PartialEq)]
#[contracttype]
pub struct DomainSeparator {
    pub contract_id: Address,
    pub version: u32,
    pub chain_id: u64,
}

/// Permit structure for meta-transactions.
///
/// Users sign this struct off-chain, and relayers submit it on-chain. All
/// fields are included in the signature digest (via XDR serialization) to
/// prevent tampering.
///
/// The signer is identified by `public_key`, an Ed25519 public key, rather
/// than a Soroban `Address`: a contract cannot safely extract a raw signing
/// key from an arbitrary `Address` (it may be a contract address, or an
/// account whose signers have since been rotated away from its master key).
/// Instead, the acting `Address` is derived deterministically from
/// `public_key` (see [`signer_address`]), so the two can never disagree.
#[derive(Clone, Debug, Eq, PartialEq)]
#[contracttype]
pub struct Permit {
    /// The Ed25519 public key that must have signed this permit.
    pub public_key: BytesN<32>,
    /// The action to perform (deposit, withdraw, borrow, repay)
    pub action: Symbol,
    /// The asset address for the operation
    pub asset: Address,
    /// The amount for the operation
    pub amount: i128,
    /// The current nonce for this user (must match expected value)
    pub nonce: u64,
    /// The signer's current `PermitEpoch` (must match exactly). Distinct
    /// from `nonce`: `revoke_permits` bumps this to invalidate every permit
    /// signed under a prior epoch in a single call, regardless of nonce —
    /// e.g. after a signature is suspected leaked, without needing to know
    /// (or race) the exact nonce it was signed against.
    pub epoch: u64,
    /// Timestamp deadline (ledger timestamp) after which this permit expires
    pub deadline: u64,
    /// Chain ID to prevent cross-chain replay
    pub chain_id: u64,
    /// Contract ID to prevent cross-contract replay
    pub contract_id: Address,
    /// For withdraw: the debt asset to check against
    /// For borrow: the collateral asset to use
    pub extra_asset: Option<Address>,
}

/// Derives the Address controlled by an Ed25519 public key.
///
/// This is the account `Address` whose master key is `public_key`. A
/// successfully verified permit is only authoritative for accounts where
/// that master key is actually the authorizing signer, i.e. simple,
/// non-multisig accounts (the common case for regular wallets).
pub fn signer_address(env: &Env, public_key: &BytesN<32>) -> Address {
    Address::from_payload(
        env,
        AddressPayload::AccountIdPublicKeyEd25519(public_key.clone()),
    )
}

/// Computes the digest to be signed for a permit.
///
/// The digest is the SHA-256 hash of the XDR encoding of the domain
/// separator followed by the XDR encoding of the permit, following an
/// EIP-712-style domain-separation pattern.
pub fn compute_permit_digest(env: &Env, domain: &DomainSeparator, permit: &Permit) -> Bytes {
    let mut combined = Bytes::new(env);
    combined.append(&domain.clone().to_xdr(env));
    combined.append(&permit.clone().to_xdr(env));
    Bytes::from(env.crypto().sha256(&combined))
}

/// Verifies a signature against a permit.
///
/// # Arguments
/// * `env` - The Soroban environment
/// * `domain` - The domain separator for this contract
/// * `permit` - The permit to verify
/// * `signature` - The ed25519 signature (64 bytes)
///
/// # Returns
/// * `Ok(())` if the signature is well-formed (verification failure aborts
///   the transaction directly, see below)
/// * `Err(VeilLendError::InvalidSignature)` if the signature is not 64 bytes
///
/// # Panics
/// The host's `ed25519_verify` traps the transaction if the signature does
/// not match `permit.public_key` over the computed digest; there is no way
/// to recover from this within the contract, so an invalid signature never
/// returns an `Err` — it aborts execution outright.
pub fn verify_permit(
    env: &Env,
    domain: &DomainSeparator,
    permit: &Permit,
    signature: &Bytes,
) -> Result<(), VeilLendError> {
    let signature: BytesN<64> = signature
        .try_into()
        .map_err(|_| VeilLendError::InvalidSignature)?;

    let digest = compute_permit_digest(env, domain, permit);

    env.crypto()
        .ed25519_verify(&permit.public_key, &digest, &signature);

    Ok(())
}

/// Validates a permit's deadline, epoch, and nonce.
///
/// # Arguments
/// * `env` - The Soroban environment
/// * `permit` - The permit to validate
/// * `current_nonce` - The current nonce for the user
/// * `current_epoch` - The user's current `PermitEpoch`
///
/// # Returns
/// * `Ok(())` if the permit is valid
/// * `Err(VeilLendError::PermitExpired)` if the deadline has passed
/// * `Err(VeilLendError::PermitNonceMismatch)` if the epoch or nonce doesn't
///   match. `#[contracterror]` enums are XDR-bounded to 50 cases and
///   `VeilLendError` is already at that cap (see `InterestStateMissing`), so
///   an epoch mismatch (from `revoke_permits`) intentionally reuses this
///   code rather than getting a distinct one — both cases call for the same
///   client response: re-fetch the current nonce/epoch and re-sign.
pub fn validate_permit(
    env: &Env,
    permit: &Permit,
    current_nonce: u64,
    current_epoch: u64,
) -> Result<(), VeilLendError> {
    // Check deadline
    let now = env.ledger().timestamp();
    if now > permit.deadline {
        return Err(VeilLendError::PermitExpired);
    }

    // Epoch is checked before nonce, but reported as the same error code
    // (see doc comment above).
    if permit.epoch != current_epoch {
        return Err(VeilLendError::PermitNonceMismatch);
    }

    // Check nonce (must be exactly the current expected value)
    if permit.nonce != current_nonce {
        return Err(VeilLendError::PermitNonceMismatch);
    }

    Ok(())
}

/// Advances the nonce for a user and re-arms both `PermitNonce` and
/// `PermitEpoch`'s TTL to `PERMIT_TTL_EXTEND_TO`.
///
/// The two keys are always touched together (even though only the nonce
/// changes value here) so they can never drift apart and archive
/// independently of one another — see `DataKey::PermitEpoch`.
///
/// # Arguments
/// * `env` - The Soroban environment
/// * `user` - The user whose nonce to advance
///
/// # Returns
/// * The new nonce value
pub fn advance_nonce(env: &Env, user: &Address) -> u64 {
    let nonce_key = DataKey::PermitNonce(user.clone());
    let current: u64 = env.storage().persistent().get(&nonce_key).unwrap_or(0);
    let next = current + 1;
    env.storage().persistent().set(&nonce_key, &next);
    VeilLendContract::bump_persistent_to(env, &nonce_key, PERMIT_TTL_EXTEND_TO);

    // `extend_ttl` requires an existing entry, so a user consuming their very
    // first permit needs `PermitEpoch` explicitly written (as its
    // current-or-default value) before it can be bumped at all.
    let epoch_key = DataKey::PermitEpoch(user.clone());
    let current_epoch: u64 = env.storage().persistent().get(&epoch_key).unwrap_or(0);
    env.storage().persistent().set(&epoch_key, &current_epoch);
    VeilLendContract::bump_persistent_to(env, &epoch_key, PERMIT_TTL_EXTEND_TO);

    next
}

/// Gets the current nonce for a user. Read-only: does not bump.
///
/// # Arguments
/// * `env` - The Soroban environment
/// * `user` - The user whose nonce to query
///
/// # Returns
/// * The current nonce value
pub fn get_current_nonce(env: &Env, user: &Address) -> u64 {
    let key = DataKey::PermitNonce(user.clone());
    env.storage().persistent().get(&key).unwrap_or(0)
}

/// Gets a user's current permit epoch. Read-only: does not bump.
pub fn get_current_epoch(env: &Env, user: &Address) -> u64 {
    let key = DataKey::PermitEpoch(user.clone());
    env.storage().persistent().get(&key).unwrap_or(0)
}

/// Increments a user's permit epoch, invalidating every permit signed under
/// the prior epoch regardless of nonce. Returns the new epoch.
///
/// Bumps `PermitEpoch` to `PERMIT_TTL_EXTEND_TO`, same as `advance_nonce`,
/// so a deliberate revocation doesn't itself shorten the entry's lifetime.
pub fn revoke_permits(env: &Env, user: &Address) -> u64 {
    let epoch_key = DataKey::PermitEpoch(user.clone());
    let current: u64 = env.storage().persistent().get(&epoch_key).unwrap_or(0);
    let next = current + 1;
    env.storage().persistent().set(&epoch_key, &next);
    VeilLendContract::bump_persistent_to(env, &epoch_key, PERMIT_TTL_EXTEND_TO);
    next
}

/// Emits a permit executed event.
pub fn emit_permit_executed(
    env: &Env,
    user: &Address,
    action: &Symbol,
    asset: &Address,
    amount: i128,
    nonce: u64,
    extra_asset: &Option<Address>,
) {
    #[contractevent(topics = ["veillend", "permit_executed"])]
    #[derive(Clone, Debug, Eq, PartialEq)]
    struct PermitExecuted {
        #[topic]
        pub user: Address,
        #[topic]
        pub action: Symbol,
        pub asset: Address,
        pub amount: i128,
        pub nonce: u64,
        pub extra_asset: Option<Address>,
        pub timestamp: u64,
    }

    let event = PermitExecuted {
        user: user.clone(),
        action: action.clone(),
        asset: asset.clone(),
        amount,
        nonce,
        extra_asset: extra_asset.clone(),
        timestamp: env.ledger().timestamp(),
    };
    event.publish(env);
}

/// Emits a permit failed event.
pub fn emit_permit_failed(
    env: &Env,
    user: &Address,
    action: &Symbol,
    extra_asset: &Option<Address>,
    error_code: u32,
) {
    #[contractevent(topics = ["veillend", "permit_failed"])]
    #[derive(Clone, Debug, Eq, PartialEq)]
    struct PermitFailed {
        #[topic]
        pub user: Address,
        #[topic]
        pub action: Symbol,
        pub extra_asset: Option<Address>,
        pub error_code: u32,
        pub timestamp: u64,
    }

    let event = PermitFailed {
        user: user.clone(),
        action: action.clone(),
        extra_asset: extra_asset.clone(),
        error_code,
        timestamp: env.ledger().timestamp(),
    };
    event.publish(env);
}
