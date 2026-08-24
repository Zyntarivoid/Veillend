#![no_std]

//! Test-only fixture contract used by the upgrade integration tests.
//!
//! One crate builds both fixture wasms (selected by the `FIXTURE_VERSION`
//! build-script env var):
//!
//! - default (`FIXTURE_VERSION` unset): "v2" — a future VeilLend release
//!   reporting `contract_version = 9` / storage schema 6 and exposing a new
//!   function (`upgraded_marker`) that v1 does not have, so tests can prove
//!   the executable was actually swapped and that new behaviour is live.
//!   The version must always exceed the contract's current `CONTRACT_VERSION`
//!   (8) or the upgrade version guard would reject it as a downgrade.
//! - `FIXTURE_VERSION=v1`: "v1" — reports `contract_version = 4`, a version
//!   below the current one, used to prove the version guard rejects
//!   downgrades.
//!
//! It deliberately does not implement the rest of the lending interface — the
//! tests only call `contract_metadata` (for the version guard) and
//! `upgraded_marker` (for the post-upgrade behaviour check) against it.

use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Env, Symbol};

#[cfg(fixture_v1)]
pub const CONTRACT_VERSION: u32 = 4;
#[cfg(not(fixture_v1))]
pub const CONTRACT_VERSION: u32 = 9;

#[cfg(fixture_v1)]
pub const STORAGE_SCHEMA_VERSION: u32 = 5;
#[cfg(not(fixture_v1))]
pub const STORAGE_SCHEMA_VERSION: u32 = 6;

#[cfg(fixture_v1)]
const STORAGE_SCHEMA_ID: Symbol = symbol_short!("VLENDV5");
#[cfg(not(fixture_v1))]
const STORAGE_SCHEMA_ID: Symbol = symbol_short!("VLENDV6");

#[derive(Clone, Debug, Eq, PartialEq)]
#[contracttype]
pub struct ContractMetadata {
    pub contract_version: u32,
    pub storage_schema_version: u32,
    pub storage_schema_id: Symbol,
}

#[contract]
pub struct VeilLendContractFixture;

#[contractimpl]
impl VeilLendContractFixture {
    pub fn contract_metadata(_env: Env) -> ContractMetadata {
        ContractMetadata {
            contract_version: CONTRACT_VERSION,
            storage_schema_version: STORAGE_SCHEMA_VERSION,
            storage_schema_id: STORAGE_SCHEMA_ID,
        }
    }

    /// A marker function that only exists in the v2 wasm. Tests assert it is
    /// callable after an upgrade, proving the new executable is live. The v1
    /// build omits it, so a post-downgrade probe would fail to find it.
    #[cfg(not(fixture_v1))]
    pub fn upgraded_marker(_env: Env) -> u64 {
        42
    }
}
