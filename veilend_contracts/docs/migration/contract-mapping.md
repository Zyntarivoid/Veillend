# Technical Mapping: Cairo 2.x → Soroban (Rust)

> **VeilLend Migration Reference**  
> Maps `lending_pool.cairo` and `shielded_pool.cairo` patterns to their Soroban equivalents on Stellar.

---

## Table of Contents

1. [Platform Overview](#1-platform-overview)
2. [Storage: Cairo Maps → Soroban DataKey](#2-storage-cairo-maps--soroban-datakey)
   - [LendingPool State Variables](#21-lendingpool-state-variables)
   - [ShieldedPool State Variables](#22-shieldedpool-state-variables)
3. [Library Equivalents: OpenZeppelin Starknet → Stellar Ecosystem](#3-library-equivalents-openzeppelin-starknet--stellar-ecosystem)
4. [Core DeFi Flows in Soroban Terms](#4-core-defi-flows-in-soroban-terms)
   - [Supply (Deposit)](#41-supply-deposit)
   - [Borrow](#42-borrow)
   - [Repay](#43-repay)
5. [Type System Mapping](#5-type-system-mapping)
6. [Event System Mapping](#6-event-system-mapping)
7. [Error Handling Mapping](#7-error-handling-mapping)
8. [Privacy / ZK Considerations](#8-privacy--zk-considerations)
9. [Key Architectural Differences Summary](#9-key-architectural-differences-summary)

---

## 1. Platform Overview

| Dimension | Starknet (Cairo 2.x) | Stellar (Soroban / Rust) |
| :--- | :--- | :--- |
| **Language** | Cairo 2.x | Rust (compiled to WASM) |
| **Native hash** | Poseidon | SHA-256 / Keccak (no native ZK hash) |
| **Storage model** | Key-value via `Map<K,V>` and `Vec<T>` inside `#[storage] struct` | Key-value via `env.storage()` with typed `DataKey` enum |
| **Address type** | `ContractAddress` (felt252 wrapper) | `Address` (Stellar account or contract) |
| **Large integers** | `u256` native | `i128` (max ~170 billion with 7 decimals); `u128` available |
| **Upgradeability** | `UpgradeableComponent` (class hash swap) | `env.deployer().update_current_contract_wasm()` |
| **Contract calls** | Dispatcher pattern (`IFooDispatcher { contract_address }`) | `ContractClient` auto-generated via `contractclient!` macro |
| **Access control** | OZ `AccessControlComponent` with roles | Custom role map in storage, or `soroban-governor` |
| **Reentrancy guard** | OZ `ReentrancyGuardComponent` | Not needed — Soroban host enforces single re-entrant call per invocation |
| **Pausable** | OZ `PausableComponent` | Manual `is_paused: bool` in storage |
| **Token standard** | OZ ERC-20 (`IERC20Dispatcher`) | Stellar token interface (`token::Client`) via SEP-0041 |

---

## 2. Storage: Cairo Maps → Soroban DataKey

In Cairo, storage is declared as a typed struct with fields annotated `#[storage]`. In Soroban, all persistent state lives in three ledger entry tiers accessed via `env.storage().persistent()`, `env.storage().instance()`, or `env.storage().temporary()`. Keys are values of a custom enum, conventionally named `DataKey`.

### 2.1 LendingPool State Variables

**Cairo `lending_pool.cairo` — `#[storage] struct Storage`:**

```cairo
addresses_provider_address: ContractAddress,
reserve_data_contract_address: ContractAddress,
price_oracle_contract_address: ContractAddress,
interest_token_address: ContractAddress,
fee_collector_address: ContractAddress,
reserves_list: Vec<ContractAddress>,
reserves: Map<ContractAddress, bool>,
// + OZ component sub-storages (accesscontrol, src5, upgradeable,
//   reentrancyguard, pausable)
```

**Soroban `DataKey` equivalent:**

```rust
use soroban_sdk::{contracttype, Address};

#[contracttype]
pub enum DataKey {
    // -- Protocol addresses (stored in instance storage — cheap, contract-lifetime) --
    AddressesProvider,          // → addresses_provider_address
    ReserveDataContract,        // → reserve_data_contract_address
    PriceOracle,                // → price_oracle_contract_address
    InterestToken,              // → interest_token_address
    FeeCollector,               // → fee_collector_address

    // -- Access control (instance storage) --
    Admin,                      // replaces OZ DEFAULT_ADMIN_ROLE
    Roles(Address),             // replaces OZ role bitmap per address

    // -- Protocol state (instance storage) --
    Paused,                     // replaces OZ PausableComponent

    // -- Per-reserve whitelist (persistent storage — survives ledger close) --
    ReserveSupported(Address),  // → reserves: Map<ContractAddress, bool>
    ReserveList,                // → reserves_list: Vec<ContractAddress>
                                //   (stored as Vec<Address>)

    // -- Per-reserve configuration (persistent storage) --
    ReserveConfig(Address),     // → ReserveData contract's reserve config

    // -- Per-reserve runtime state (persistent storage) --
    ReserveState(Address),      // → ReserveData contract's reserve state

    // -- Per-user, per-reserve data (persistent storage) --
    UserReserveData(Address, Address), // (user, asset) → UserReserveData
}
```

**Storage tier guidance:**

| DataKey | Tier | Rationale |
| :--- | :--- | :--- |
| `AddressesProvider`, `ReserveDataContract`, `PriceOracle`, `InterestToken`, `FeeCollector`, `Admin`, `Paused` | `instance()` | Set once at construction, read on every call. Instance storage is cheap and does not need TTL extension. |
| `ReserveSupported`, `ReserveList`, `ReserveConfig`, `ReserveState` | `persistent()` | Long-lived protocol state that must survive ledger archival. Extend TTL on every write. |
| `UserReserveData` | `persistent()` | Per-user positions; TTL extended on every deposit/borrow/repay. |

**Example read/write in Soroban:**

```rust
// Write (deposit path)
env.storage()
    .persistent()
    .set(&DataKey::ReserveState(asset.clone()), &new_state);

// Extend TTL so state is not archived (1 year in ledgers ≈ 6_311_520)
env.storage()
    .persistent()
    .extend_ttl(&DataKey::ReserveState(asset.clone()), 1_000_000, 6_311_520);

// Read
let state: ReserveState = env.storage()
    .persistent()
    .get(&DataKey::ReserveState(asset.clone()))
    .unwrap_or_else(|| panic_with_error!(&env, Error::ReserveNotFound));
```

---

### 2.2 ShieldedPool State Variables

**Cairo `shielded_pool.cairo` — `#[storage] struct Storage`:**

```cairo
commitments: Map<felt252, Commitment>,
nullifiers: Map<felt252, bool>,
merkle_root: felt252,
merkle_tree: Map<u64, felt252>,
next_leaf_index: u64,
tree_depth: u32,
supported_assets: Vec<ContractAddress>,
asset_supported: Map<ContractAddress, bool>,
total_shielded_per_asset: Map<ContractAddress, u256>,
min_deposit_amount: u256,
max_deposit_amount: u256,
deposit_fee_basis_points: u16,
fee_collector: ContractAddress,
emergency_withdrawal_enabled: bool,
// + OZ component sub-storages
```

**Soroban `DataKey` equivalent:**

```rust
use soroban_sdk::{contracttype, Address, Bytes};

// felt252 becomes Bytes (32-byte array) in Soroban
type Felt252 = soroban_sdk::BytesN<32>;

#[contracttype]
pub enum ShieldedDataKey {
    // -- Protocol parameters (instance storage) --
    FeeCollector,                       // → fee_collector
    MinDeposit,                         // → min_deposit_amount
    MaxDeposit,                         // → max_deposit_amount
    DepositFeeBps,                      // → deposit_fee_basis_points (u32)
    EmergencyWithdrawalEnabled,         // → emergency_withdrawal_enabled
    TreeDepth,                          // → tree_depth

    // -- Access control (instance storage) --
    Admin,
    Guardian,

    // -- Merkle tree global state (instance storage) --
    MerkleRoot,                         // → merkle_root (BytesN<32>)
    NextLeafIndex,                      // → next_leaf_index (u64)

    // -- Merkle tree leaves (persistent storage) --
    MerkleLeaf(u64),                    // → merkle_tree: Map<u64, felt252>

    // -- Commitments (persistent storage) --
    Commitment(Felt252),                // → commitments: Map<felt252, Commitment>

    // -- Nullifiers (persistent storage) --
    Nullifier(Felt252),                 // → nullifiers: Map<felt252, bool>

    // -- Asset management (persistent storage) --
    AssetSupported(Address),            // → asset_supported: Map<ContractAddress, bool>
    SupportedAssets,                    // → supported_assets: Vec<ContractAddress>
    TotalShielded(Address),             // → total_shielded_per_asset: Map<ContractAddress, u256>
                                        //   Note: u256 → i128 in Soroban (see §5)
}
```

**Commitment struct mapping:**

```cairo
// Cairo
pub struct Commitment {
    pub amount: u256,
    pub asset: ContractAddress,
    pub depositor: ContractAddress,
    pub leaf_index: u64,
    pub timestamp: u64,
    pub is_spent: bool,
}
```

```rust
// Soroban
use soroban_sdk::{contracttype, Address};

#[contracttype]
pub struct Commitment {
    pub amount: i128,        // u256 → i128 (max ~170B stroops)
    pub asset: Address,      // ContractAddress → Address
    pub depositor: Address,  // ContractAddress → Address
    pub leaf_index: u64,
    pub timestamp: u64,      // env.ledger().timestamp()
    pub is_spent: bool,
}
```

---

## 3. Library Equivalents: OpenZeppelin Starknet → Stellar Ecosystem

`lending_pool.cairo` and `shielded_pool.cairo` import five OpenZeppelin components. Below is the direct mapping to Stellar/Soroban equivalents.

### 3.1 AccessControlComponent

**Cairo usage:**
```cairo
use openzeppelin_access::accesscontrol::AccessControlComponent;
// Grants roles, checks has_role(), stores role bitmap per address

const ADMIN_ROLE: felt252 = selector!("ADMIN_ROLE");
self.accesscontrol._grant_role(ADMIN_ROLE, admin_address);
self.accesscontrol.has_role(ADMIN_ROLE, caller);
```

**Soroban equivalent — manual role storage (no direct library):**

There is no OZ AccessControl for Soroban. Implement a lightweight role map:

```rust
// In DataKey
Roles(Address),  // value: u32 bitmask (or Vec<Symbol> for named roles)

// Helper functions
fn require_admin(env: &Env) {
    let caller = env.invoker();
    let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
    if caller != admin {
        panic_with_error!(env, Error::Unauthorized);
    }
}

fn require_role(env: &Env, role: Symbol) {
    let caller = env.invoker();
    let roles: Vec<Symbol> = env.storage()
        .persistent()
        .get(&DataKey::Roles(caller.clone()))
        .unwrap_or(vec![env]);
    if !roles.contains(&role) {
        panic_with_error!(env, Error::Unauthorized);
    }
}
```

**Community library:** [`soroban-governor`](https://github.com/script3/soroban-governor) provides DAO-style governance with roles, but for simpler RBAC, manual implementation (as above) is idiomatic.

---

### 3.2 SRC5Component (Interface Introspection)

**Cairo usage:**
```cairo
use openzeppelin::introspection::src5::SRC5Component;
// Starknet's analogue of ERC-165 interface detection
```

**Soroban equivalent:** Soroban has no interface introspection standard. Contracts expose their ABI via the contract spec stored on-chain (`#[contract]` + `#[contractimpl]` macros auto-generate this). No migration needed — simply omit SRC5.

---

### 3.3 UpgradeableComponent

**Cairo usage:**
```cairo
use openzeppelin::upgrades::UpgradeableComponent;
self.upgradeable.upgrade(new_class_hash); // swaps class hash
```

**Soroban equivalent:**

```rust
// Soroban built-in upgrade — no library needed
pub fn upgrade(env: Env, new_wasm_hash: BytesN<32>) {
    // Auth check
    let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
    admin.require_auth();

    env.deployer().update_current_contract_wasm(new_wasm_hash);
}
```

Soroban's upgradeability is native via `env.deployer().update_current_contract_wasm()`. The new WASM must be uploaded to the network first (`soroban contract upload`), then its hash is passed here.

---

### 3.4 ReentrancyGuardComponent

**Cairo usage:**
```cairo
use openzeppelin::security::reentrancyguard::ReentrancyGuardComponent;
self.reentrancyguard.start();
// ... logic ...
self.reentrancyguard.end();
```

**Soroban equivalent:** **Not needed.** The Soroban host enforces that a contract cannot call itself recursively within a single invocation context. Reentrancy from external contracts is prevented by Soroban's authorization model. Remove all reentrancy guard calls when porting.

---

### 3.5 PausableComponent

**Cairo usage:**
```cairo
use openzeppelin::security::pausable::PausableComponent;
self.pausable.assert_not_paused();
self.pausable.pause();
self.pausable.unpause();
```

**Soroban equivalent — manual `Paused` flag:**

```rust
// Storage key (instance)
// DataKey::Paused → bool

fn assert_not_paused(env: &Env) {
    let paused: bool = env.storage()
        .instance()
        .get(&DataKey::Paused)
        .unwrap_or(false);
    if paused {
        panic_with_error!(env, Error::ContractPaused);
    }
}

pub fn pause(env: Env) {
    require_admin(&env);
    env.storage().instance().set(&DataKey::Paused, &true);
}

pub fn unpause(env: Env) {
    require_admin(&env);
    env.storage().instance().set(&DataKey::Paused, &false);
}
```

---

### 3.6 ERC-20 Token Interface

**Cairo usage:**
```cairo
use openzeppelin::token::erc20::interface::{IERC20Dispatcher, IERC20DispatcherTrait};
let token = IERC20Dispatcher { contract_address: asset };
token.transfer_from(caller, contract, amount);
token.transfer(recipient, amount);
token.balance_of(caller);
token.allowance(caller, contract);
```

**Soroban equivalent — Stellar token client (SEP-0041):**

```rust
use soroban_sdk::token;

// All Stellar assets (native XLM and issued tokens) expose this interface
let token_client = token::Client::new(&env, &asset);

// transfer_from → transfer_from (requires approval via allowance)
token_client.transfer_from(
    &env.current_contract_address(), // spender (this contract)
    &caller,                          // from
    &env.current_contract_address(), // to
    &amount,
);

// transfer
token_client.transfer(&env.current_contract_address(), &recipient, &amount);

// balance_of → balance
let balance: i128 = token_client.balance(&caller);

// allowance
let allowance: i128 = token_client.allowance(&caller, &env.current_contract_address());
```

**Key difference:** In Soroban, `transfer_from` requires the *spender* (this contract) to `require_auth()` on the `from` address **OR** the user must have called `token.approve(spender, amount, expiry)` first. The standard DeFi flow (user approves, then pool calls transfer_from) works identically to ERC-20.

---

### 3.7 Library Mapping Summary Table

| OpenZeppelin Starknet | Soroban / Stellar Equivalent | Notes |
| :--- | :--- | :--- |
| `AccessControlComponent` | Manual `DataKey::Roles(Address)` map | No OZ port exists; manual RBAC is idiomatic |
| `SRC5Component` | ❌ Omit | Soroban exposes ABI via contract spec automatically |
| `UpgradeableComponent` | `env.deployer().update_current_contract_wasm()` | Built-in; no library needed |
| `ReentrancyGuardComponent` | ❌ Omit | Host-level protection; guard is redundant |
| `PausableComponent` | Manual `DataKey::Paused` bool | 5 lines; no library needed |
| `IERC20Dispatcher` | `soroban_sdk::token::Client` | SEP-0041 token standard |
| `IPriceOracleDispatcher` | `ContractClient` (custom) or Reflector oracle | Reflector is the main on-chain price oracle on Stellar |
| `IInterestTokenDispatcher` | Custom `ContractClient` | Port interest token to Soroban, then auto-generate client |

---

## 4. Core DeFi Flows in Soroban Terms

### 4.1 Supply (Deposit)

**Cairo flow (`lending_pool.cairo → fn deposit`):**

1. `pausable.assert_not_paused()`
2. `reentrancyguard.start()`
3. Validate `amount > 0` and `on_behalf_of != zero`
4. Fetch `ReserveConfiguration` from `ReserveData` external contract; assert `is_active`
5. Check caller's ERC-20 balance ≥ amount and allowance ≥ amount
6. `token.transfer_from(caller, contract, amount)`
7. `_update_reserve_state(asset, amount, 0, is_deposit=true)` — updates liquidity totals and recalculates rates
8. `interest_token._mint(caller, amount)` — mint vShare tokens representing the deposit
9. Emit `Deposit` event

**Soroban equivalent flow:**

```rust
pub fn supply(env: Env, asset: Address, amount: i128, on_behalf_of: Address) {
    // 1. Pause check
    assert_not_paused(&env);

    // 2. Auth — caller must authorize this invocation
    let caller = env.invoker();
    caller.require_auth();

    // 3. Validate inputs
    if amount <= 0 { panic_with_error!(&env, Error::InvalidAmount); }

    // 4. Fetch reserve config
    let config = get_reserve_config(&env, &asset); // reads DataKey::ReserveConfig(asset)
    if !config.is_active { panic_with_error!(&env, Error::ReserveNotActive); }

    // 5 & 6. Transfer tokens into this contract (replaces allowance check + transfer_from)
    //         Soroban: user must have approved this contract as spender
    let token = token::Client::new(&env, &asset);
    token.transfer_from(
        &env.current_contract_address(),
        &caller,
        &env.current_contract_address(),
        &amount,
    );

    // 7. Update reserve state
    update_reserve_state(&env, &asset, amount, 0, true);

    // 8. Mint interest tokens to on_behalf_of
    let interest_token = InterestTokenClient::new(&env, &get_interest_token_address(&env));
    interest_token.mint(&on_behalf_of, &amount);

    // 9. Emit event
    env.events().publish(
        (symbol_short!("supply"), asset.clone()),
        (caller, on_behalf_of, amount),
    );

    // Extend TTL for affected keys
    extend_reserve_ttl(&env, &asset);
}
```

**Key differences from Cairo:**
- No explicit reentrancy guard (host handles it).
- `caller.require_auth()` replaces `get_caller_address()` — Soroban's auth model is more explicit.
- Balance and allowance checks are implicit: if the user hasn't approved, `transfer_from` panics automatically.
- Events use `env.events().publish()` with topic tuples rather than `#[derive(starknet::Event)]` structs.

---

### 4.2 Borrow

**Cairo flow (`lending_pool.cairo → fn borrow`):**

1. Pause + reentrancy guards
2. Validate params; assert `interest_rate_mode == 2` (variable only)
3. Fetch `ReserveConfig` (assert active, borrowing enabled, not frozen) and `ReserveState` (assert available liquidity ≥ amount)
4. Call `get_user_account_data(on_behalf_of)` → derives `total_collateral` (iterates all reserves)
5. Fetch `asset_price` from `PriceOracle`
6. Compute `max_borrowable = (collateral_in_asset × loan_to_value) / 10000`
7. Compute `available_to_borrow = max_borrowable − user_current_debt`; assert `amount ≤ available_to_borrow`
8. `_update_reserve_state(asset, 0, 0, false)` — accrue interest indices
9. Compute `scaled_amount = amount × RAY / variable_borrow_index`; add to `user_data.scaled_variable_debt`
10. Update `ReserveState`: decrease `available_liquidity`, increase `total_variable_debt`
11. `token.transfer(on_behalf_of, amount)` — send borrowed tokens
12. Emit `Borrow`

**Soroban equivalent flow:**

```rust
pub fn borrow(env: Env, asset: Address, amount: i128, on_behalf_of: Address) {
    assert_not_paused(&env);

    let caller = env.invoker();
    caller.require_auth();

    // Validate
    if amount <= 0 { panic_with_error!(&env, Error::InvalidAmount); }

    // Fetch config & state
    let config: ReserveConfig = get_reserve_config(&env, &asset);
    let mut state: ReserveState = get_reserve_state(&env, &asset);

    if !config.is_active    { panic_with_error!(&env, Error::ReserveNotActive); }
    if !config.borrowing_enabled { panic_with_error!(&env, Error::BorrowingDisabled); }
    if config.is_frozen     { panic_with_error!(&env, Error::ReserveFrozen); }
    if state.available_liquidity < amount { panic_with_error!(&env, Error::InsufficientLiquidity); }

    // Health factor / collateral check
    let (total_collateral, _total_debt, _avg_lt, _hf, _, _) =
        get_user_account_data(&env, &on_behalf_of);

    let oracle = OracleClient::new(&env, &get_oracle_address(&env));
    let price: i128 = oracle.get_price(&asset);

    // Compute collateral value in asset units (price has 7 decimals on Stellar)
    let collateral_in_asset = (total_collateral * 10_000_000_i128) / price;
    let max_borrowable = (collateral_in_asset * config.loan_to_value as i128) / 10_000_i128;

    let user_data: UserReserveData = get_user_reserve_data(&env, &on_behalf_of, &asset);
    let available_to_borrow = (max_borrowable - user_data.scaled_variable_debt).max(0);
    if amount > available_to_borrow {
        panic_with_error!(&env, Error::InsufficientCollateral);
    }

    // Accrue indices, refresh state
    update_reserve_state(&env, &asset, 0, 0, false);
    let state: ReserveState = get_reserve_state(&env, &asset);

    // Update user debt (scaled by borrow index)
    let scaled_amount = (amount * RAY) / state.variable_borrow_index;
    let mut user_data = get_user_reserve_data(&env, &on_behalf_of, &asset);
    user_data.scaled_variable_debt += scaled_amount;
    set_user_reserve_data(&env, &on_behalf_of, &asset, &user_data);

    // Update reserve state
    state.available_liquidity -= amount;
    state.total_variable_debt += amount;
    set_reserve_state(&env, &asset, &state);

    // Transfer borrowed tokens to borrower
    let token = token::Client::new(&env, &asset);
    token.transfer(&env.current_contract_address(), &on_behalf_of, &amount);

    env.events().publish(
        (symbol_short!("borrow"), asset.clone()),
        (caller, on_behalf_of, amount, state.variable_borrow_rate),
    );

    extend_reserve_ttl(&env, &asset);
    extend_user_ttl(&env, &on_behalf_of, &asset);
}
```

**Key differences from Cairo:**
- `u256` arithmetic in Cairo → `i128` in Soroban. RAY (1e27) precision must be adapted — Stellar uses 7-decimal fixed point, so RAY typically becomes `1_000_000_0_i128` (1e7) or you maintain a scaled integer system internally.
- Oracle price format: Stellar's [Reflector oracle](https://reflector.network/) returns prices in `i128` with 14-decimal precision. Adjust collateral math accordingly.
- No `get_caller_address()` in Soroban — use `env.invoker()`.

---

### 4.3 Repay

**Cairo flow (`lending_pool.cairo → fn repay`):**

1. Pause + reentrancy guards
2. Validate params; assert `interest_rate_mode == 2`
3. Fetch `ReserveConfig` (assert active) and `ReserveState`
4. Compute `current_debt = scaled_variable_debt × variable_borrow_index / RAY`
5. Cap `repay_amount = min(amount, current_debt)`
6. Check caller balance ≥ `repay_amount` and allowance ≥ `repay_amount`
7. `token.transfer_from(caller, contract, repay_amount)`
8. Accrue indices via `_update_reserve_state(asset, 0, 0, false)`
9. Compute `scaled_repay = repay_amount × RAY / variable_borrow_index`
10. Update `user_data.scaled_variable_debt` (subtract or zero out)
11. Update `ReserveState`: increase `available_liquidity`, decrease `total_variable_debt`
12. Emit `Repay`

**Soroban equivalent flow:**

```rust
pub fn repay(env: Env, asset: Address, amount: i128, on_behalf_of: Address) {
    assert_not_paused(&env);

    let caller = env.invoker();
    caller.require_auth();

    if amount <= 0 { panic_with_error!(&env, Error::InvalidAmount); }

    let config: ReserveConfig = get_reserve_config(&env, &asset);
    if !config.is_active { panic_with_error!(&env, Error::ReserveNotActive); }

    let state: ReserveState = get_reserve_state(&env, &asset);
    let mut user_data: UserReserveData = get_user_reserve_data(&env, &on_behalf_of, &asset);

    // Current debt with accrued interest
    let current_debt = (user_data.scaled_variable_debt * state.variable_borrow_index) / RAY;
    if current_debt == 0 { panic_with_error!(&env, Error::NoDebtToRepay); }

    // Cap repayment at full debt
    let repay_amount = amount.min(current_debt);

    // Pull tokens from caller
    let token = token::Client::new(&env, &asset);
    token.transfer_from(
        &env.current_contract_address(),
        &caller,
        &env.current_contract_address(),
        &repay_amount,
    );

    // Accrue indices
    update_reserve_state(&env, &asset, 0, 0, false);
    let state: ReserveState = get_reserve_state(&env, &asset);

    // Reduce debt
    let scaled_repay = (repay_amount * RAY) / state.variable_borrow_index;
    if scaled_repay >= user_data.scaled_variable_debt {
        user_data.scaled_variable_debt = 0;
    } else {
        user_data.scaled_variable_debt -= scaled_repay;
    }
    set_user_reserve_data(&env, &on_behalf_of, &asset, &user_data);

    // Update pool liquidity
    let mut state = get_reserve_state(&env, &asset);
    state.available_liquidity += repay_amount;
    state.total_variable_debt -= repay_amount;
    set_reserve_state(&env, &asset, &state);

    env.events().publish(
        (symbol_short!("repay"), asset.clone()),
        (on_behalf_of, caller, repay_amount),
    );

    extend_reserve_ttl(&env, &asset);
    extend_user_ttl(&env, &on_behalf_of, &asset);
}
```

---

## 5. Type System Mapping

| Cairo 2.x | Soroban (Rust) | Notes |
| :--- | :--- | :--- |
| `felt252` | `BytesN<32>` | For commitment/nullifier hashes from ZK circuits |
| `felt252` (small values) | `u64` / `Symbol` | Symbols are ≤10 char identifiers; use for keys/roles |
| `u256` | `i128` | Soroban's largest numeric type. Max value ~170 billion with 7-decimal precision. For larger values, split into `(i128, i128)` high/low pair. |
| `u64` | `u64` | Direct equivalent |
| `u32` | `u32` | Direct equivalent |
| `u16` | `u32` | Soroban has no u16 in contract types; use u32 |
| `u8` | `u32` | Same — use u32 |
| `bool` | `bool` | Direct equivalent |
| `ContractAddress` | `Address` | `Address` covers both accounts and contracts |
| `Array<T>` | `Vec<T>` (`soroban_sdk::Vec`) | Soroban Vec is host-managed; no push/pop, use `vec![env, a, b]` |
| `Map<K, V>` | `DataKey` enum → `env.storage()` | No in-memory map; each key is a storage lookup |
| `Vec<T>` (storage) | `soroban_sdk::Vec` stored at a `DataKey` | Store the whole vec under one key |
| `#[derive(starknet::Store)]` | `#[contracttype]` | Enables the type to be stored in Soroban ledger entries |
| RAY (1e27 precision) | 1e7 precision (Stellar standard) | Adapt interest rate math; or use a custom `RAY = 10_000_000_i128` |

---

## 6. Event System Mapping

**Cairo:**

```cairo
#[derive(Drop, starknet::Event)]
pub struct Deposit {
    pub reserve: ContractAddress,
    pub user: ContractAddress,
    pub on_behalf_of: ContractAddress,
    pub amount: u256,
    pub referral_code: u16,
}

self.emit(Deposit { reserve: asset, user: caller, on_behalf_of, amount, referral_code: 0 });
```

**Soroban:**

```rust
// Topics (indexed, searchable): up to 4 values, each ≤32 bytes
// Data (non-indexed): arbitrary ScVal

env.events().publish(
    // topics tuple — these are indexed
    (Symbol::new(&env, "supply"), asset.clone(), caller.clone()),
    // data — the payload
    (on_behalf_of, amount),
);
```

**Event mapping table:**

| Cairo Event | Soroban Topics | Soroban Data |
| :--- | :--- | :--- |
| `Deposit` | `("supply", reserve, user)` | `(on_behalf_of, amount)` |
| `Withdraw` | `("withdraw", reserve, user)` | `(to, amount)` |
| `Borrow` | `("borrow", reserve, user)` | `(on_behalf_of, amount, borrow_rate)` |
| `Repay` | `("repay", reserve, user)` | `(repayer, amount)` |
| `ReserveDataUpdated` | `("rate_update", reserve)` | `(liquidity_rate, variable_borrow_rate, liquidity_index, variable_borrow_index)` |
| `ShieldedDeposit` | `("shld_deposit", asset)` | `(commitment_bytes, amount, leaf_index)` |
| `ShieldedWithdrawal` | `("shld_withdraw", asset, recipient)` | `(nullifier_bytes, amount, fee)` |
| `MerkleRootUpdated` | `("merkle_update",)` | `(old_root, new_root, leaf_index)` |

---

## 7. Error Handling Mapping

**Cairo:**

```cairo
assert!(amount > 0_u256, "Amount must be greater than 0");
assert!(reserve_config.is_active, "Reserve not active");
```

**Soroban — typed error enum:**

```rust
use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone)]
pub enum Error {
    InvalidAmount         = 1,
    ReserveNotActive      = 2,
    BorrowingDisabled     = 3,
    ReserveFrozen         = 4,
    InsufficientLiquidity = 5,
    InsufficientCollateral = 6,
    NoDebtToRepay         = 7,
    ContractPaused        = 8,
    Unauthorized          = 9,
    CommitmentExists      = 10,
    CommitmentNotFound    = 11,
    NullifierUsed         = 12,
    CommitmentSpent       = 13,
    InvalidMerkleProof    = 14,
    AssetNotSupported     = 15,
    TransferFailed        = 16,
}

// Usage
if amount <= 0 {
    panic_with_error!(&env, Error::InvalidAmount);
}
```

Soroban typed errors are returned to callers and are inspectable off-chain, equivalent to Cairo's `assert!` panic messages.

---

## 8. Privacy / ZK Considerations

### Poseidon Hash → SHA-256 / Keccak

Cairo uses `core::poseidon::PoseidonTrait` for commitment hashing:

```cairo
// Cairo — native Poseidon
let commitment = PoseidonTrait::new()
    .update(secret)
    .finalize();
```

Soroban has no native Poseidon. Options in priority order:

| Approach | Notes |
| :--- | :--- |
| **SHA-256 via `env.crypto().sha256()`** | Built into the Soroban host; cheapest; use for simple commit-reveal schemes |
| **Keccak-256 via `env.crypto().keccak256()`** | Also host-native; compatible with EVM tooling if needed |
| **Off-chain ZK proof + on-chain verifier** | Port a Groth16/PLONK verifier written in Rust to Soroban WASM. The proving system must use a hash function verifiable without Poseidon (e.g., SHA-256-based circuits with Halo2 or Risc0) |
| **Poseidon in WASM** | Compile a Rust Poseidon library (e.g., `poseidon-rs`) into the Soroban contract. Functional but adds ~40KB WASM size and higher CPU metering costs |

**Recommended path for VeilLend on Stellar:** Replace Poseidon with SHA-256 for the commit-reveal scheme on-chain. The off-chain client computes `commitment = SHA256(secret || amount || asset)` and submits it. This keeps the on-chain verifier simple:

```rust
pub fn deposit_shielded(env: Env, commitment: BytesN<32>, asset: Address, amount: i128) {
    // ...
    // No hash recomputation on-chain at deposit; store commitment as-is
    // ...
}

pub fn withdraw_shielded(env: Env, secret: Bytes, recipient: Address, asset: Address, amount: i128, ...) {
    // Recompute commitment from secret on-chain to verify ownership
    let preimage = Bytes::from_slice(&env, &[secret.as_slice(), &amount.to_be_bytes(), ...].concat());
    let computed: BytesN<32> = env.crypto().sha256(&preimage);
    // Verify computed == stored commitment
}
```

### Merkle Tree

The `merkle_tree: Map<u64, felt252>` and `merkle_root: felt252` in `shielded_pool.cairo` map as:

```rust
DataKey::MerkleLeaf(index: u64) → BytesN<32>   // persistent storage
DataKey::MerkleRoot              → BytesN<32>   // instance storage
DataKey::NextLeafIndex           → u64          // instance storage
```

Merkle tree hashing changes from Poseidon to SHA-256:

```rust
fn hash_pair(env: &Env, left: &BytesN<32>, right: &BytesN<32>) -> BytesN<32> {
    let mut preimage = Bytes::new(env);
    preimage.append(&Bytes::from_slice(env, left.as_slice()));
    preimage.append(&Bytes::from_slice(env, right.as_slice()));
    env.crypto().sha256(&preimage)
}
```

---

## 9. Key Architectural Differences Summary

| Concern | Cairo / Starknet | Soroban / Stellar |
| :--- | :--- | :--- |
| **Inter-contract calls** | Dispatcher pattern: `IFooDispatcher { contract_address }.method()` | `ContractClient::new(&env, &address).method()` — identical pattern, different macro |
| **Storage separation** | `ReserveData` is a separate contract because Cairo storage is per-contract | Same pattern works; DataKey namespacing keeps it clean in one contract too |
| **Fee precision** | Basis points (1/10000) on `u256` | Basis points on `i128`; watch for overflow with `i128::checked_mul` |
| **Timestamp** | `get_block_timestamp()` → `u64` UNIX seconds | `env.ledger().timestamp()` → `u64` UNIX seconds — identical |
| **Block/ledger number** | `get_block_number()` → `u64` | `env.ledger().sequence()` → `u32` |
| **Deployment** | `scarb build` → class hash → deploy | `soroban contract build` → WASM → `soroban contract upload` → `soroban contract deploy` |
| **Testing framework** | `snforge` | `soroban-sdk` built-in test environment + `soroban contract invoke` for E2E |
| **Gas / metering** | Sierra → CASM steps (felt252 ops) | CPU instructions + memory in WASM metering units; avoid unbounded loops |
| **`Vec` iteration** | `for i in 0..len { self.reserves_list.at(i).read() }` | `for item in vec.iter()` — idiomatic Rust iteration over `soroban_sdk::Vec` |

---

*This document covers the direct Cairo 2.x → Soroban mapping based on the actual `lending_pool.cairo` and `shielded_pool.cairo` source files in VeilLend. For Soroban SDK API reference, see [https://docs.rs/soroban-sdk](https://docs.rs/soroban-sdk). For Stellar token standard, see [SEP-0041](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0041.md).*