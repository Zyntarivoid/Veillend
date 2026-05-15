# Veilend Protocol - Smart Contracts Documentation

## 📋 Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Contract Details](#contract-details)
   - [VeilLendAddressesProvider](#veillendaddressesprovider)
   - [LendingPool](#lendingpool)
   - [ReserveData](#reservedata)
   - [PriceOracle](#priceoracle)
   - [InterestToken](#interesttoken)
   - [ShieldedPool](#shieldedpool)
   - [VEILENDGOV](#veilendgov)
4. [Data Structures](#data-structures)
5. [Interfaces](#interfaces)
6. [Security Features](#security-features)
7. [Deployment & Configuration](#deployment--configuration)
8. [Developer Guide](#developer-guide)

---

## 🎯 Overview

**Veilend** is a next-generation decentralized lending protocol built on Starknet, combining traditional DeFi lending mechanisms with privacy-preserving features through zk-SNARK technology. The protocol enables users to:

- **Deposit** assets and earn interest
- **Borrow** assets against collateral
- **Shield deposits** for enhanced privacy using zero-knowledge proofs
- **Govern** the protocol through the VEILEND governance token

### Key Features

✅ **Over-collateralized lending** with variable interest rates  
✅ **Privacy-preserving transactions** via shielded pools  
✅ **Real-time price oracles** with staleness detection  
✅ **Upgradeable contracts** with multi-sig governance  
✅ **Role-based access control** for administrative functions  
✅ **Reentrancy protection** on all critical functions  
✅ **Emergency pause mechanisms** for risk management  

### Technology Stack

- **Blockchain**: Starknet (Layer 2)
- **Language**: Cairo v2.12.0
- **Framework**: Scarb v2024_07
- **Testing**: Starknet Foundry (snforge)
- **Libraries**: OpenZeppelin Cairo v2.0.0

---

## 🏗️ Architecture

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    Veilend Protocol                          │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────────┐                                      │
│  │ AddressesProvider │ ← Central registry for all contracts │
│  └────────┬─────────┘                                      │
│           │                                                  │
│  ┌────────┴─────────────────────────────────────────┐      │
│  │                                                   │      │
│  ▼                                                   ▼      │
│  ┌──────────────────┐                      ┌──────────────────┐
│  │  LendingPool     │                      │  ShieldedPool    │
│  │  - Deposit       │                      │  - Private Dep   │
│  │  - Withdraw      │                      │  - Private Wdr   │
│  │  - Borrow        │                      │  - ZK Proofs     │
│  │  - Repay         │                      │  - Merkle Tree   │
│  └────────┬─────────┘                      └──────────────────┘
│           │                                                  │
│  ┌────────┴─────────────────────────────────────────┐      │
│  │                                                   │      │
│  ▼                                                   ▼      │
│  ┌──────────────────┐                      ┌──────────────────┐
│  │  ReserveData     │                      │  PriceOracle     │
│  │  - Config Mgmt   │                      │  - Price Feeds   │
│  │  - State Mgmt    │                      │  - Staleness Chk │
│  │  - User Data     │                      │  - Multi-Asset   │
│  └──────────────────┘                      └──────────────────┘
│                                                               │
│  ┌──────────────────┐                                      │
│  │ InterestToken    │ ← ERC20 interest-bearing tokens       │
│  └──────────────────┘                                      │
│                                                               │
│  ┌──────────────────┐                                      │
│  │ VEILENDGOV       │ ← Governance token                    │
│  └──────────────────┘                                      │
└─────────────────────────────────────────────────────────────┘
```

### Contract Interactions

1. **AddressesProvider** serves as the single source of truth for all contract addresses
2. **LendingPool** interacts with:
   - `ReserveData` for configuration and state
   - `PriceOracle` for asset prices
   - `InterestToken` for minting/burning interest-bearing tokens
3. **ShieldedPool** operates independently for privacy-focused transactions
4. All contracts implement **upgradeability** via OpenZeppelin's upgradeable pattern

---

## 📜 Contract Details

### VeilLendAddressesProvider

**Purpose**: Central registry managing all protocol contract addresses and configuration.

**Address**: `TBD` (Deployment-dependent)

#### Roles

| Role | Selector | Description |
|------|----------|-------------|
| `DEFAULT_ADMIN_ROLE` | - | Full administrative access |
| `PROXY_ADMIN_ROLE` | `"PROXY_ADMIN_ROLE"` | Can upgrade contracts and manage proxy settings |
| `CONFIGURATOR_ROLE` | `"CONFIGURATOR_ROLE"` | Can update contract addresses and parameters |

#### Storage Variables

```cairo
struct Storage {
    // Core protocol addresses
    lending_pool: ContractAddress,
    lending_pool_configurator: ContractAddress,
    lending_pool_collateral_manager: ContractAddress,
    
    // Data layer
    reserve_data: ContractAddress,
    price_oracle: ContractAddress,
    
    // Privacy layer
    shielded_pool: ContractAddress,
    nullifier_registry: ContractAddress,
    
    // Token contracts
    governance_token: ContractAddress,
    fee_collector: ContractAddress,
    
    // Protocol parameters
    protocol_version: felt252,
    market_id: felt252,
    
    // Emergency admin
    emergency_admin: ContractAddress,
}
```

#### Key Functions

##### Getters

```cairo
fn get_lending_pool(self: @ContractState) -> ContractAddress
fn get_reserve_data(self: @ContractState) -> ContractAddress
fn get_price_oracle(self: @ContractState) -> ContractAddress
fn get_shielded_pool(self: @ContractState) -> ContractAddress
fn get_governance_token(self: @ContractState) -> ContractAddress
fn get_all_addresses(self: @ContractState) -> AllAddresses
fn get_address_by_string(self: @ContractState, identifier: felt252) -> ContractAddress
```

##### Setters (Role-Protected)

```cairo
fn set_lending_pool(ref self: ContractState, new_address: ContractAddress)
    // Requires: CONFIGURATOR_ROLE
    
fn set_reserve_data(ref self: ContractState, new_address: ContractAddress)
    // Requires: CONFIGURATOR_ROLE
    
fn set_price_oracle(ref self: ContractState, new_address: ContractAddress)
    // Requires: CONFIGURATOR_ROLE
    
fn set_emergency_admin(ref self: ContractState, new_address: ContractAddress)
    // Requires: PROXY_ADMIN_ROLE
```

##### Emergency Functions

```cairo
fn deactivate_protocol(ref self: ContractState)
    // Requires: EMERGENCY_ADMIN
    
fn activate_protocol(ref self: ContractState)
    // Requires: PROXY_ADMIN_ROLE
```

#### Events

- `LendingPoolUpdated(old_address, new_address)`
- `ReserveDataUpdated(old_address, new_address)`
- `PriceOracleUpdated(old_address, new_address)`
- `ShieldedPoolUpdated(old_address, new_address)`
- `MarketIdUpdated(old_id, new_id)`
- `ProtocolVersionUpdated(old_version, new_version)`

---

### LendingPool

**Purpose**: Core lending functionality - handles deposits, withdrawals, borrows, and repays.

**Address**: `TBD` (Registered in AddressesProvider)

#### Inherited Components

- ✅ `AccessControlComponent` - Role-based access control
- ✅ `UpgradeableComponent` - Contract upgradeability
- ✅ `ReentrancyGuardComponent` - Reentrancy protection
- ✅ `PausableComponent` - Emergency pause functionality

#### Constructor Parameters

```cairo
fn constructor(
    ref self: ContractState,
    admin_address: ContractAddress,
    provider: ContractAddress,              // AddressesProvider address
    reserve_data_contract: ContractAddress,
    price_oracle_contract: ContractAddress,
    fee_collector: ContractAddress,
    interest_token_address: ContractAddress
)
```

#### Core Functions

##### deposit

Deposits assets into the lending pool and mints interest-bearing tokens.

```cairo
fn deposit(
    ref self: ContractState,
    asset: ContractAddress,
    amount: u256,
    on_behalf_of: ContractAddress
)
```

**Parameters:**
- `asset`: ERC20 token contract address
- `amount`: Amount to deposit (in token decimals)
- `on_behalf_of`: Address to credit the deposit to

**Requirements:**
- Contract must have allowance ≥ amount from caller
- Caller must have balance ≥ amount
- Reserve must be active
- Amount > 0

**Emits:** `Deposit(reserve, user, on_behalf_of, amount, referral_code)`

---

##### withdraw

Withdraws deposited assets and burns corresponding interest-bearing tokens.

```cairo
fn withdraw(
    ref self: ContractState,
    asset: ContractAddress,
    amount: u256,
    to: ContractAddress
)
```

**Parameters:**
- `asset`: ERC20 token contract address
- `amount`: Amount to withdraw
- `to`: Recipient address

**Requirements:**
- User must have sufficient aToken balance
- Amount > 0
- Health factor must remain > 1 after withdrawal

**Emits:** `Withdraw(reserve, user, to, amount)`

---

##### borrow

Borrows assets against collateral.

```cairo
fn borrow(
    ref self: ContractState,
    asset: ContractAddress,
    amount: u256,
    interest_rate_mode: u8,
    on_behalf_of: ContractAddress
)
```

**Parameters:**
- `asset`: Asset to borrow
- `amount`: Amount to borrow
- `interest_rate_mode`: 1=stable, 2=variable (only variable supported)
- `on_behalf_of`: Address to receive the borrowed assets

**Requirements:**
- Sufficient collateral deposited
- Health factor > 1 after borrow
- Reserve has available liquidity
- Borrowing enabled for reserve

**Health Factor Calculation:**
```
Health Factor = (Total Collateral × Avg Liquidation Threshold) / (Total Debt × 10000)
```

**Emits:** `Borrow(reserve, user, on_behalf_of, amount, interest_rate_mode, borrow_rate)`

---

##### repay

Repays borrowed assets.

```cairo
fn repay(
    ref self: ContractState,
    asset: ContractAddress,
    amount: u256,
    interest_rate_mode: u8,
    on_behalf_of: ContractAddress
)
```

**Parameters:**
- `asset`: Asset being repaid
- `amount`: Amount to repay (0 or > debt = full repayment)
- `interest_rate_mode`: Must be 2 (variable)
- `on_behalf_of`: Address whose debt is being repaid

**Emits:** `Repay(reserve, user, repayer, amount, use_a_tokens)`

---

##### get_user_account_data

Retrieves comprehensive user financial data.

```cairo
fn get_user_account_data(
    self: @ContractState,
    user: ContractAddress
) -> (u256, u256, u256, u256, u256, u8)
```

**Returns:** `(total_collateral, total_debt, avg_liquidation_threshold, health_factor, available_borrows, liquidation_mode)`

---

#### Internal Functions

##### _update_reserve_state

Updates reserve state after deposits/withdrawals.

```cairo
fn _update_reserve_state(
    ref self: ContractState,
    asset: ContractAddress,
    liquidity_added: u256,
    liquidity_removed: u256,
    is_deposit: bool
)
```

**Process:**
1. Updates total and available liquidity
2. Calculates utilization rate
3. Updates interest rates based on utilization
4. Updates liquidity and borrow indices
5. Emits `ReserveDataUpdated` event

---

##### _calculate_variable_borrow_rate

Calculates variable borrow rate using piecewise linear function.

```cairo
fn _calculate_variable_borrow_rate(
    self: @ContractState,
    reserve_data_contract_dispatcher: IReserveDataDispatcher,
    asset: ContractAddress,
    utilization: u256
) -> u256
```

**Formula:**
```
if utilization < optimal_utilization_rate:
    rate = base_rate + (utilization × slope1) / optimal_rate
else:
    rate = base_rate + slope1 + ((utilization - optimal) × slope2) / (10000 - optimal)
```

---

##### _calculate_liquidity_rate

Calculates liquidity rate (deposit APY).

```cairo
fn _calculate_liquidity_rate(
    self: @ContractState,
    reserve_data_contract_dispatcher: IReserveDataDispatcher,
    asset: ContractAddress,
    utilization: u256,
    variable_rate: u256
) -> u256
```

**Formula:**
```
liquidity_rate = (utilization × variable_rate × (1 - reserve_factor)) / 10000
```

---

#### Interest Rate Model

The protocol uses a **piecewise linear interest rate model**:

- **Optimal Utilization Rate**: Point where rate curve changes slope (typically 80%)
- **Base Variable Borrow Rate**: Starting rate at 0% utilization
- **Variable Rate Slope 1**: Rate increase slope before optimal point
- **Variable Rate Slope 2**: Rate increase slope after optimal point (steeper)

**Example Parameters (per asset):**
```
optimal_utilization_rate = 8000 (80%)
base_variable_borrow_rate = 200 (2%)
variable_rate_slope1 = 400 (4%)
variable_rate_slope2 = 30000 (300%)
```

---

### ReserveData

**Purpose**: Manages reserve configuration, state, and user position data.

#### Storage Structure

```cairo
struct Storage {
    reserve_config: Map<ContractAddress, ReserveConfiguration>,
    reserve_state: Map<ContractAddress, ReserveState>,
    user_reserve_data: Map<(ContractAddress, ContractAddress), UserReserveData>,
}
```

#### Key Functions

##### set_reserve_config

Sets configuration parameters for a reserve.

```cairo
fn set_reserve_config(
    ref self: ContractState,
    asset: ContractAddress,
    optimal_utilization_rate: u256,
    base_variable_borrow_rate: u256,
    variable_rate_slope1: u256,
    variable_rate_slope2: u256,
    loan_to_value: u256,
    liquidation_threshold: u256,
    liquidation_bonus: u256,
    reserve_factor: u256,
    a_token_address: ContractAddress,
    variable_debt_token_address: ContractAddress,
    is_active: bool,
    is_frozen: bool,
    borrowing_enabled: bool
)
```

**Emits:** `ReserveConfigurationUpdated`

---

##### get_reserve_config

Retrieves reserve configuration.

```cairo
fn get_reserve_config(self: @ContractState, asset: ContractAddress) -> ReserveConfigurationResponse
```

---

##### set_reserve_state

Updates reserve state (called by LendingPool).

```cairo
fn set_reserve_state(
    ref self: ContractState,
    asset: ContractAddress,
    total_liquidity: u256,
    available_liquidity: u256,
    total_variable_debt: u256,
    liquidity_rate: u256,
    variable_borrow_rate: u256,
    liquidity_index: u256,
    variable_borrow_index: u256,
)
```

**Emits:** `ReserveStateUpdated`

---

##### set_user_reserve_data

Updates user's position data.

```cairo
fn set_user_reserve_data(
    ref self: ContractState,
    user: ContractAddress,
    asset: ContractAddress,
    scaled_a_token_balance: u256,
    scaled_variable_debt: u256,
    is_using_as_collateral: bool
)
```

**Emits:** `UserReserveDataUpdated`

---

### PriceOracle

**Purpose**: Manages asset price feeds with staleness detection.

#### Roles

| Role | Selector | Description |
|------|----------|-------------|
| `ORACLE_ADMIN_ROLE` | `"ORACLE_ADMIN_ROLE"` | Can manage price feeders and config |
| `PRICE_FEEDER_ROLE` | `"PRICE_FEEDER_ROLE"` | Can update prices |

#### Constructor Parameters

```cairo
fn constructor(
    ref self: ContractState,
    admin_address: ContractAddress,
    base_currency: felt252,      // e.g., "USD"
    price_decimals: u8,          // Typically 18
    staleness_threshold: u64,    // In seconds (e.g., 3600)
)
```

#### Key Functions

##### get_price

Retrieves asset price with freshness check.

```cairo
fn get_price(self: @ContractState, asset: ContractAddress) -> u256
```

**Requirements:**
- Price must be > 0
- Price must not be stale (updated within threshold)

**Returns:** Price in USD with configured decimals (typically 18)

---

##### get_price_safe

Retrieves price without reverting if unavailable.

```cairo
fn get_price_safe(self: @ContractState, asset: ContractAddress) -> (u256, bool)
```

**Returns:** `(price, is_fresh)`

---

##### set_price

Updates asset price (role-protected).

```cairo
fn set_price(
    ref self: ContractState,
    asset: ContractAddress,
    price: u256,
)
```

**Requires:** `PRICE_FEEDER_ROLE` or `ORACLE_ADMIN_ROLE`

**Emits:** `PriceUpdated(asset, price, timestamp, updater)`

---

##### set_prices

Batch updates multiple prices.

```cairo
fn set_prices(
    ref self: ContractState,
    assets: Array<ContractAddress],
    prices: Array<u256>,
)
```

**Requirements:**
- Arrays must have same length
- All prices must be > 0

---

##### Price Management Functions

```cairo
fn set_price_source(ref self: ContractState, asset: ContractAddress, source: ContractAddress)
    // Sets external oracle source (e.g., Pragma, Chainlink)
    
fn set_staleness_threshold(ref self: ContractState, new_threshold: u64)
    // Updates acceptable staleness duration
    
fn grant_price_feeder_role(ref self: ContractState, account: ContractAddress)
    // Grants price update permissions
    
fn revoke_price_feeder_role(ref self: ContractState, account: ContractAddress)
    // Revokes price update permissions
```

---

### InterestToken

**Purpose**: ERC20 interest-bearing token (aToken) that represents deposited assets.

**Standard**: ERC20 with additional mint/burn functions

#### Inherited Components

- ✅ `ERC20Component` - Standard ERC20 implementation
- ✅ `OwnableComponent` - Ownership control
- ✅ `AccessControlComponent` - Role-based access
- ✅ `UpgradeableComponent` - Upgradeability
- ✅ `ReentrancyGuardComponent` - Reentrancy protection
- ✅ `PausableComponent` - Emergency pause

#### Constructor Parameters

```cairo
fn constructor(
    ref self: ContractState,
    name: ByteArray,             // Token name
    symbol: ByteArray,           // Token symbol
    decimals: u8,                // Token decimals
    initial_supply: u256,        // Initial supply
    max_supply: u256,            // Maximum supply cap
    owner: ContractAddress       // Initial owner
)
```

#### Key Functions

##### _mint

Mints tokens to user on deposit (internal, LendingPool-only).

```cairo
fn _mint(
    ref self: ContractState,
    on_behalf_of: ContractAddress,
    amount: u256,
)
```

**Requirements:**
- Caller must be LendingPool contract
- Updates scaled balance and index

**Process:**
1. Updates liquidity index
2. Calculates scaled amount: `amount * 10^27 / index`
3. Updates user's scaled balance
4. Mints ERC20 tokens

**Emits:** `Mint(caller, on_behalf_of, amount, index)`

---

##### _burn

Burns tokens on withdrawal (internal, LendingPool-only).

```cairo
fn _burn(
    ref self: ContractState,
    from: ContractAddress,
    amount: u256,
)
```

**Requirements:**
- Caller must be LendingPool contract
- User must have sufficient scaled balance

**Emits:** `Burn(caller, on_behald_of, amount, index)`

---

##### Balance Functions

```cairo
fn scaled_balance_of(self: @ContractState, user: ContractAddress) -> u256
    // Returns user's balance in scaled units
    
fn get_scaled_total_supply(self: @ContractState) -> u256
    // Returns total supply in scaled units
```

---

##### Index Management

```cairo
fn get_liquidity_index(self: @ContractState) -> u256
    // Returns current liquidity index (RAY precision: 10^27)
    
fn set_liquidity_index(ref self: ContractState, new_index: u256)
    // Updates index (LendingPool-only)
```

**Index Evolution:**
```
index_t = index_{t-1} × (1 + rate_per_second × time_elapsed)
```

---

### ShieldedPool

**Purpose**: Privacy-preserving deposit/withdrawal using zk-SNARKs and Merkle trees.

#### Roles

| Role | Selector | Description |
|------|----------|-------------|
| `GUARDIAN_ROLE` | `"GUARDIAN_ROLE"` | Can manage assets and upgrade contract |
| `PAUSER_ROLE` | `"PAUSER_ROLE"` | Can pause/unpause contract |

#### Constructor Parameters

```cairo
fn constructor(
    ref self: ContractState,
    admin_address: ContractAddress,
    guardian_address: ContractAddress,
    fee_collector: ContractAddress,
    tree_depth: u32,              // Merkle tree depth (e.g., 32)
    min_deposit: u256,
    max_deposit: u256,
    deposit_fee: u16,             // In basis points (100 = 1%)
)
```

#### Storage Structure

```cairo
struct Storage {
    // Commitments storage
    commitments: Map<felt252, Commitment>,
    
    // Nullifiers (prevents double-spending)
    nullifiers: Map<felt252, bool>,
    
    // Merkle tree
    merkle_root: felt252,
    merkle_tree: Map<u64, felt252>,
    next_leaf_index: u64,
    tree_depth: u32,
    
    // Asset management
    supported_assets: Vec<ContractAddress>,
    asset_supported: Map<ContractAddress, bool>,
    total_shielded_per_asset: Map<ContractAddress, u256>,
    
    // Limits and fees
    min_deposit_amount: u256,
    max_deposit_amount: u256,
    deposit_fee_basis_points: u16,
    fee_collector: ContractAddress,
    
    // Emergency controls
    emergency_withdrawal_enabled: bool,
}
```

#### Core Functions

##### deposit_shielded

Creates a shielded (private) deposit.

```cairo
fn deposit_shielded(
    ref self: ContractState,
    commitment: felt252,
    asset: ContractAddress,
    amount: u256,
)
```

**Parameters:**
- `commitment`: Hash of note commitment (from ZK proof)
- `asset`: Asset to deposit
- `amount`: Amount to deposit

**Requirements:**
- `min_deposit ≤ amount ≤ max_deposit`
- Asset must be supported
- Commitment must not already exist
- User must approve token transfer

**Process:**
1. Transfers tokens from user to contract
2. Stores commitment data
3. Inserts leaf into Merkle tree
4. Updates total shielded balance

**Emits:** `ShieldedDeposit(commitment, asset, amount, depositor, leaf_index, timestamp)`

---

##### withdraw_shielded

Withdraws from shielded balance using ZK proof.

```cairo
fn withdraw_shielded(
    ref self: ContractState,
    nullifier: felt252,
    recipient: ContractAddress,
    asset: ContractAddress,
    amount: u256,
    merkle_proof: Array<felt252>,
    path_indices: Array<u8>,
)
```

**Parameters:**
- `nullifier`: Unique nullifier to prevent double-spend
- `recipient`: Address to receive funds
- `asset`: Asset to withdraw
- `amount`: Amount to withdraw
- `merkle_proof`: Merkle proof array
- `path_indices`: Path indices for proof verification

**Requirements:**
- Nullifier must not be used
- Commitment must exist and be unspent
- Merkle proof must be valid
- User must have sufficient shielded balance

**Process:**
1. Verifies nullifier hasn't been used
2. Retrieves and validates commitment
3. Verifies Merkle proof
4. Calculates and deducts fee
5. Marks nullifier as used
6. Transfers tokens to recipient

**Emits:** `ShieldedWithdrawal(nullifier, recipient, asset, amount, fee, timestamp)`

---

##### verify_proof

Verifies a zk-SNARK proof (placeholder for production implementation).

```cairo
fn verify_proof(
    self: @ContractState,
    proof: Array<felt252>,
    public_inputs: Array<felt252>,
) -> bool
```

**Note:** Currently returns `true` for testing. Production requires integration with Starkware's verifier.

---

##### Merkle Tree Functions

```cairo
fn get_merkle_root(self: @ContractState) -> felt252
    // Returns current Merkle root
    
fn get_next_leaf_index(self: @ContractState) -> u64
    // Returns next available leaf index
```

**Internal Merkle Operations:**

```cairo
fn _insert_merkle_leaf(ref self: ContractState, leaf: felt252)
    // Inserts leaf and updates root using Poseidon hash
    
fn _verify_merkle_proof(
    self: @ContractState,
    leaf: felt252,
    proof: Array<felt252>,
    path_indices: Array<u8>,
    expected_root: felt252,
    leaf_index: u64,
) -> bool
    // Verifies inclusion proof
```

---

##### Asset Management

```cairo
fn add_supported_asset(ref self: ContractState, asset: ContractAddress)
    // Requires: GUARDIAN_ROLE
    
fn remove_supported_asset(ref self: ContractState, asset: ContractAddress)
    // Requires: GUARDIAN_ROLE
    
fn set_deposit_limits(ref self: ContractState, min_amount: u256, max_amount: u256)
    // Requires: GUARDIAN_ROLE
    
fn set_deposit_fee(ref self: ContractState, fee_basis_points: u16)
    // Requires: GUARDIAN_ROLE (max 10% = 1000 bps)
```

---

##### Emergency Functions

```cairo
fn enable_emergency_withdrawal(ref self: ContractState, enabled: bool)
    // Requires: GUARDIAN_ROLE
    
fn emergency_withdraw(
    ref self: ContractState,
    asset: ContractAddress,
    recipient: ContractAddress,
    amount: u256,
)
    // Requires: GUARDIAN_ROLE, emergency mode enabled
```

---

### VEILENDGOV

**Purpose**: Governance token for protocol voting and proposals.

**Standard**: ERC20

#### Constructor Parameters

```cairo
fn constructor(
    ref self: ContractState,
    name: ByteArray,
    symbol: ByteArray,
    decimals: u8,
    initial_supply: u256,
    max_supply: u256,
    owner: ContractAddress
)
```

#### Features

- ✅ Standard ERC20 transfers
- ✅ Ownable for administrative functions
- ✅ Upgradeable via owner decision
- ✅ Fixed max supply cap

---

## 🧩 Data Structures

### ReserveConfiguration

Stores configuration parameters for each reserve asset.

```cairo
#[derive(Drop, starknet::Store, Serde, Clone)]
pub struct ReserveConfiguration {
    // Interest rate parameters (RAY precision: 10^27)
    pub optimal_utilization_rate: u256,
    pub base_variable_borrow_rate: u256,
    pub variable_rate_slope1: u256,
    pub variable_rate_slope2: u256,
    
    // Collateral parameters (basis points: 10000 = 100%)
    pub loan_to_value: u256,
    pub liquidation_threshold: u256,
    pub liquidation_bonus: u256,
    
    // Reserve factors (basis points)
    pub reserve_factor: u256,
    
    // Token addresses
    pub a_token_address: ContractAddress,
    pub variable_debt_token_address: ContractAddress,
    
    // Flags
    pub is_active: bool,
    pub is_frozen: bool,
    pub borrowing_enabled: bool,
}
```

**Field Descriptions:**

| Field | Type | Description | Typical Range |
|-------|------|-------------|---------------|
| `optimal_utilization_rate` | u256 | Utilization rate where rate curve bends | 8000 (80%) |
| `base_variable_borrow_rate` | u256 | Starting borrow rate at 0% util | 200 (2%) |
| `variable_rate_slope1` | u256 | Rate increase before optimal | 400 (4%) |
| `variable_rate_slope2` | u256 | Rate increase after optimal | 30000 (300%) |
| `loan_to_value` | u256 | Max borrow vs collateral ratio | 7500 (75%) |
| `liquidation_threshold` | u256 | HF threshold for liquidation | 8000 (80%) |
| `liquidation_bonus` | u256 | Bonus for liquidators | 500 (5%) |
| `reserve_factor` | u256 | Protocol's share of interest | 2000 (20%) |

---

### ReserveState

Tracks dynamic state of each reserve.

```cairo
#[derive(Drop, starknet::Store, Serde, Clone)]
pub struct ReserveState {
    // Liquidity metrics
    pub total_liquidity: u256,
    pub available_liquidity: u256,
    pub total_variable_debt: u256,
    
    // Interest rate metrics (RAY precision)
    pub liquidity_rate: u256,
    pub variable_borrow_rate: u256,
    pub liquidity_index: u256,
    pub variable_borrow_index: u256,
    
    // Timestamps
    pub last_update_timestamp: u64,
}
```

**Index Precision:**
- Indices use **RAY** precision: `10^27`
- Allows for high-precision interest accrual

---

### UserReserveData

Stores user's position in a specific reserve.

```cairo
#[derive(Drop, starknet::Store, Serde, Clone)]
pub struct UserReserveData {
    pub scaled_a_token_balance: u256,
    pub scaled_variable_debt: u256,
    pub is_using_as_collateral: bool,
}
```

**Scaled Balances:**
- Balances are stored in scaled units to account for interest accrual
- Actual balance = `scaled_balance × index / 10^27`

---

### Commitment

Represents a shielded deposit note.

```cairo
#[derive(Drop, Serde, Clone, starknet::Store)]
pub struct Commitment {
    pub amount: u256,
    pub asset: ContractAddress,
    pub depositor: ContractAddress,
    pub leaf_index: u64,
    pub timestamp: u64,
    pub is_spent: bool,
}
```

---

## 🔌 Interfaces

### ILendingPool

```cairo
#[starknet::interface]
pub trait ILendingPool<TContractState> {
    fn deposit(ref self: TContractState, asset: ContractAddress, amount: u256, on_behalf_of: ContractAddress);
    fn withdraw(ref self: TContractState, asset: ContractAddress, amount: u256, to: ContractAddress);
    fn borrow(ref self: TContractState, asset: ContractAddress, amount: u256, interest_rate_mode: u8, on_behalf_of: ContractAddress);
    fn repay(ref self: TContractState, asset: ContractAddress, amount: u256, interest_rate_mode: u8, on_behalf_of: ContractAddress);
    fn get_user_account_data(self: @TContractState, user: ContractAddress) -> (u256, u256, u256, u256, u256, u8);
}
```

---

### IReserveData

```cairo
#[starknet::interface]
pub trait IReserveData<TContractState> {
    fn set_reserve_config(ref self: TContractState, asset: ContractAddress, ...);
    fn get_reserve_config(self: @TContractState, asset: ContractAddress) -> ReserveConfigurationResponse;
    fn set_reserve_state(ref self: TContractState, asset: ContractAddress, ...);
    fn get_reserve_state(self: @TContractState, asset: ContractAddress) -> ReserveStateResponse;
    fn set_user_reserve_data(ref self: TContractState, user: ContractAddress, asset: ContractAddress, ...);
    fn get_user_reserve_data(self: @TContractState, user: ContractAddress, asset: ContractAddress) -> UserReserveDataResponse;
}
```

---

### IPriceOracle

```cairo
#[starknet::interface]
pub trait IPriceOracle<TContractState> {
    fn get_price(self: @TContractState, asset: ContractAddress) -> u256;
    fn get_price_safe(self: @TContractState, asset: ContractAddress) -> (u256, bool);
    fn get_prices(self: @TContractState, assets: Array<ContractAddress>) -> Array<u256>;
    fn set_price(ref self: TContractState, asset: ContractAddress, price: u256);
    fn set_prices(ref self: TContractState, assets: Array<ContractAddress>, prices: Array<u256>);
    fn get_price_source(self: @TContractState, asset: ContractAddress) -> ContractAddress;
    fn set_price_source(ref self: TContractState, asset: ContractAddress, source: ContractAddress);
    fn get_price_decimals(self: @TContractState) -> u8;
    fn get_base_currency(self: @TContractState) -> felt252;
    fn get_staleness_threshold(self: @TContractState) -> u64;
    fn set_staleness_threshold(ref self: TContractState, new_threshold: u64);
    fn get_last_update_timestamp(self: @TContractState, asset: ContractAddress) -> u64;
    fn is_price_fresh(self: @TContractState, asset: ContractAddress) -> bool;
}
```

---

### IInterestToken

```cairo
#[starknet::interface]
pub trait IInterestToken<TContractState> {
    fn _mint(ref self: TContractState, on_behalf_of: ContractAddress, amount: u256);
    fn _burn(ref self: TContractState, from: ContractAddress, amount: u256);
    fn scaled_balance_of(self: @TContractState, user: ContractAddress) -> u256;
    fn get_scaled_total_supply(self: @TContractState) -> u256;
    fn get_liquidity_index(self: @TContractState) -> u256;
    fn set_liquidity_index(ref self: TContractState, new_index: u256);
    fn get_underlying_asset(self: @TContractState) -> ContractAddress;
    fn get_lending_pool(self: @TContractState) -> ContractAddress;
}
```

---

### IShieldedPool

```cairo
#[starknet::interface]
pub trait IShieldedPool<TContractState> {
    fn deposit_shielded(ref self: TContractState, commitment: felt252, asset: ContractAddress, amount: u256);
    fn withdraw_shielded(ref self: TContractState, nullifier: felt252, recipient: ContractAddress, asset: ContractAddress, amount: u256, merkle_proof: Array<felt252>, path_indices: Array<u8>);
    fn verify_proof(self: @TContractState, proof: Array<felt252>, public_inputs: Array<felt252>) -> bool;
    fn get_commitment(self: @TContractState, commitment_hash: felt252) -> (u256, ContractAddress, bool);
    fn is_nullifier_used(self: @TContractState, nullifier: felt252) -> bool;
    fn get_merkle_root(self: @TContractState) -> felt252;
    fn get_next_leaf_index(self: @TContractState) -> u64;
    fn get_total_shielded(self: @TContractState, asset: ContractAddress) -> u256;
    fn add_supported_asset(ref self: TContractState, asset: ContractAddress);
    fn remove_supported_asset(ref self: TContractState, asset: ContractAddress);
    fn set_deposit_limits(ref self: TContractState, min_amount: u256, max_amount: u256);
    fn set_deposit_fee(ref self: TContractState, fee_basis_points: u16);
    fn set_fee_collector(ref self: TContractState, new_collector: ContractAddress);
    fn enable_emergency_withdrawal(ref self: TContractState, enabled: bool);
    fn emergency_withdraw(ref self: TContractState, asset: ContractAddress, recipient: ContractAddress, amount: u256);
}
```

---

## 🛡️ Security Features

### 1. Access Control

All contracts implement **OpenZeppelin's AccessControl** with role-based permissions:

**Common Roles:**
- `DEFAULT_ADMIN_ROLE`: Full administrative access
- `ADMIN_ROLE`: Contract-specific admin
- `GUARDIAN_ROLE`: Emergency and configuration management
- `PAUSER_ROLE`: Can pause/unpause contracts

**Specialized Roles:**
- `PROXY_ADMIN_ROLE`: Can upgrade contracts
- `CONFIGURATOR_ROLE`: Can update protocol parameters
- `ORACLE_ADMIN_ROLE`: Oracle management
- `PRICE_FEEDER_ROLE`: Can update price feeds

---

### 2. Reentrancy Protection

All state-changing functions use **ReentrancyGuard**:

```cairo
fn deposit(ref self: ContractState, ...) {
    self.reentrancyguard.start();
    
    // ... logic ...
    
    self.reentrancyguard.end();
}
```

---

### 3. Pausability

Critical functions can be paused during emergencies:

```cairo
fn withdraw(ref self: ContractState, ...) {
    self.pausable.assert_not_paused();
    // ... rest of logic
}
```

**Pause Triggers:**
- Market volatility
- Oracle failures
- Security vulnerabilities
- Protocol upgrades

---

### 4. Upgradeability

All contracts use **OpenZeppelin's UpgradeableComponent**:

```cairo
fn upgrade(ref self: ContractState, new_class_hash: ClassHash) {
    self._check_proxy_admin();
    self.upgradeable.upgrade(new_class_hash);
}
```

**Upgrade Process:**
1. Deploy new contract class
2. Verify with security audits
3. Governance approval (if applicable)
4. Call `upgrade()` with new class hash

---

### 5. Price Oracle Security

**Staleness Detection:**
```cairo
let last_update = self.last_update_timestamps.read(asset);
let current_time = get_block_timestamp();
assert!(current_time - last_update <= threshold, "Price is stale");
```

**Multi-Source Support:**
- Can integrate with Pragma, Chainlink, or custom oracles
- Each asset can have independent price source

---

### 6. Health Factor Monitoring

**Liquidation Threshold:**
```
Health Factor = (Collateral × Avg LT) / (Debt × 10000)

If HF < 1 → Position can be liquidated
```

**Safety Mechanisms:**
- Borrows blocked if HF would drop below 1
- Withdrawals blocked if HF would drop below 1
- Real-time HF calculation on all actions

---

### 7. Nullifier Pattern (ShieldedPool)

Prevents double-spending in private transactions:

```cairo
// Check nullifier hasn't been used
assert!(!self.nullifiers.read(nullifier), "Nullifier already used");

// Mark as used
self.nullifiers.write(nullifier, true);
```

---

### 8. Commitment Validation

Ensures commitments are unique and unspent:

```cairo
let existing = self.commitments.read(commitment);
assert!(existing.amount == 0_u256, "Commitment already exists");
```

---

## 🚀 Deployment & Configuration

### Prerequisites

```bash
# Install Scarb
curl --proto '=https' --tlsv1.2 -sSf https://docs.swmansion.com/scarb/install.sh | sh

# Install Starknet Foundry
curl -L https://foundry-rs.github.io/starknet-foundry/install.sh | sh

# Verify installations
scarb --version
snforge --version
```

### Project Setup

```bash
cd veilend_contracts

# Install dependencies
scarb install

# Build contracts
scarb build

# Run tests
snforge test
```

---

### Deployment Steps

#### 1. Deploy VEILENDGOV Token

```bash
sncast deploy \
  --account <ACCOUNT> \
  --url <RPC_URL> \
  --class-hash <CLASS_HASH> \
  --constructor-calldata \
    0x5645494c454e4420476f7665726e616e636520546f6b656e  # name: "Veilend Governance Token"
    0x5645494c                                               # symbol: "VEIL"
    18                                                      # decimals
    0x0                                                     # initial_supply
    0x3635c9adc5dea00000                                    # max_supply: 100M tokens
    <OWNER_ADDRESS>
```

---

#### 2. Deploy AddressesProvider

```bash
sncast deploy \
  --account <ACCOUNT> \
  --url <RPC_URL> \
  --class-hash <CLASS_HASH> \
  --constructor-calldata \
    <ADMIN_ADDRESS> \
    0x01                                                    # market_id
    0x01                                                    # protocol_version
    <EMERGENCY_ADMIN_ADDRESS>
```

---

#### 3. Deploy ReserveData

```bash
sncast deploy \
  --account <ACCOUNT> \
  --url <RPC_URL> \
  --class-hash <CLASS_HASH> \
  --constructor-calldata \
    <ADMIN_ADDRESS>
```

---

#### 4. Deploy PriceOracle

```bash
sncast deploy \
  --account <ACCOUNT> \
  --url <RPC_URL> \
  --class-hash <CLASS_HASH> \
  --constructor-calldata \
    <ADMIN_ADDRESS> \
    0x555344                                              # base_currency: "USD"
    18                                                    # price_decimals
    3600                                                  # staleness_threshold: 1 hour
```

---

#### 5. Deploy InterestToken

```bash
sncast deploy \
  --account <ACCOUNT> \
  --url <RPC_URL> \
  --class-hash <CLASS_HASH> \
  --constructor-calldata \
    0x5645494c454e4420496e74657265737420546f6b656e    # name: "Veilend Interest Token"
    0x7645494c                                            # symbol: "vEIL"
    18                                                    # decimals
    0x0                                                   # initial_supply
    0xffffffffffffffffffffffffffffffffffff              # max_supply
    <OWNER_ADDRESS>
```

---

#### 6. Deploy LendingPool

```bash
sncast deploy \
  --account <ACCOUNT> \
  --url <RPC_URL> \
  --class-hash <CLASS_HASH> \
  --constructor-calldata \
    <ADMIN_ADDRESS> \
    <ADDRESSES_PROVIDER_ADDRESS> \
    <RESERVE_DATA_ADDRESS> \
    <PRICE_ORACLE_ADDRESS> \
    <FEE_COLLECTOR_ADDRESS> \
    <INTEREST_TOKEN_ADDRESS>
```

---

#### 7. Deploy ShieldedPool

```bash
sncast deploy \
  --account <ACCOUNT> \
  --url <RPC_URL> \
  --class-hash <CLASS_HASH> \
  --constructor-calldata \
    <ADMIN_ADDRESS> \
    <GUARDIAN_ADDRESS> \
    <FEE_COLLECTOR_ADDRESS> \
    32                                                    # tree_depth
    1000000                                               # min_deposit: 1e6 (assuming 6 decimals)
    1000000000000                                         # max_deposit: 1e12
    10                                                    # deposit_fee: 0.1% (10 bps)
```

---

### Post-Deployment Configuration

#### 1. Update AddressesProvider

```cairo
// Set all deployed contract addresses
sncast invoke \
  --address <PROVIDER_ADDRESS> \
  --function set_lending_pool \
  --calldata <LENDING_POOL_ADDRESS>

sncast invoke \
  --address <PROVIDER_ADDRESS> \
  --function set_reserve_data \
  --calldata <RESERVE_DATA_ADDRESS>

sncast invoke \
  --address <PROVIDER_ADDRESS> \
  --function set_price_oracle \
  --calldata <PRICE_ORACLE_ADDRESS>

sncast invoke \
  --address <PROVIDER_ADDRESS> \
  --function set_shielded_pool \
  --calldata <SHIELDED_POOL_ADDRESS>

sncast invoke \
  --address <PROVIDER_ADDRESS> \
  --function set_governance_token \
  --calldata <GOV_TOKEN_ADDRESS>

sncast invoke \
  --address <PROVIDER_ADDRESS> \
  --function set_interest_token \
  --calldata <INTEREST_TOKEN_ADDRESS>
```

---

#### 2. Configure Reserve

```cairo
// Set reserve configuration for an asset (e.g., USDC)
sncast invoke \
  --address <RESERVE_DATA_ADDRESS> \
  --function set_reserve_config \
  --calldata \
    <USDC_ADDRESS> \
    8000                                                # optimal_utilization_rate
    200                                                 # base_variable_borrow_rate
    400                                                 # variable_rate_slope1
    30000                                               # variable_rate_slope2
    7500                                                # loan_to_value (75%)
    8000                                                # liquidation_threshold (80%)
    500                                                 # liquidation_bonus (5%)
    2000                                                # reserve_factor (20%)
    <A_TOKEN_ADDRESS> \
    <VARIABLE_DEBT_TOKEN_ADDRESS> \
    1                                                   # is_active
    0                                                   # is_frozen
    1                                                   # borrowing_enabled
```

---

#### 3. Set Price Feeds

```cairo
// Grant price feeder role to oracle service
sncast invoke \
  --address <PRICE_ORACLE_ADDRESS> \
  --function grant_price_feeder_role \
  --calldata <ORACLE_SERVICE_ADDRESS>

// Set initial price for USDC
sncast invoke \
  --address <PRICE_ORACLE_ADDRESS> \
  --function set_price \
  --calldata \
    <USDC_ADDRESS> \
    1000000000000000001                                 # $1.00 with 18 decimals
```

---

#### 4. Add Supported Assets to ShieldedPool

```cairo
sncast invoke \
  --address <SHIELDED_POOL_ADDRESS> \
  --function add_supported_asset \
  --calldata <USDC_ADDRESS>
```

---

### Network Configuration

#### Sepolia Testnet

Update `Scarb.toml`:

```toml
[[tool.snforge.fork]]
name = "SEPOLIA_LATEST"
url = "https://starknet-sepolia.public.blastapi.io/rpc/v0_8"
block_id.tag = "latest"
```

Update `snfoundry.toml`:

```toml
[sncast.default]
url = "https://starknet-sepolia.public.blastapi.io/rpc/v0_8"
account = "your_account_name"
```

---

#### Mainnet

For mainnet deployment, update RPC URLs to mainnet endpoints:

```toml
[[tool.snforge.fork]]
name = "MAINNET_LATEST"
url = "https://starknet-mainnet.public.blastapi.io/rpc/v0_8"
block_id.tag = "latest"
```

---

## 👨‍💻 Developer Guide

### Testing

#### Run Unit Tests

```bash
cd veilend_contracts
snforge test
```

#### Run Specific Test

```bash
snforge test lending_pool_tests::test_deposit
```

#### Run with Forked Network

```bash
snforge test --fork SEPOLIA_LATEST
```

---

### Example Usage (TypeScript)

#### Connect to Contracts

```typescript
import { RpcProvider, Contract, Account } from 'starknet';

// Provider
const provider = new RpcProvider({ 
  nodeUrl: 'https://starknet-sepolia.public.blastapi.io/rpc/v0_8' 
});

// Account
const account = new Account(provider, accountAddress, privateKey);

// Load ABI
const lendingPoolAbi = await fetch('path/to/LendingPool_ABI.json').then(r => r.json());

// Create contract instance
const lendingPool = new Contract(lendingPoolAbi, lendingPoolAddress, provider);
lendingPool.connect(account);
```

---

#### Deposit Assets

```typescript
// Approve LendingPool to spend tokens
const erc20Abi = [...]; // ERC20 ABI
const usdc = new Contract(erc20Abi, usdcAddress, account);

const approveAmount = parseUnits('1000', 6); // 1000 USDC

await usdc.approve(lendingPoolAddress, approveAmount);

// Deposit to LendingPool
const depositAmount = parseUnits('1000', 6);

const tx = await lendingPool.deposit(
  usdcAddress,
  depositAmount,
  account.address
);

await provider.waitForTransaction(tx.transaction_hash);
console.log('Deposit successful!');
```

---

#### Borrow Assets

```typescript
// Borrow against deposited collateral
const borrowAmount = parseUnits('500', 6); // 500 USDC

const tx = await lendingPool.borrow(
  usdcAddress,
  borrowAmount,
  2, // variable rate
  account.address
);

await provider.waitForTransaction(tx.transaction_hash);
console.log('Borrow successful!');
```

---

#### Get User Account Data

```typescript
const userData = await lendingPool.get_user_account_data(account.address);

console.log('Total Collateral:', formatUnits(userData.total_collateral, 18));
console.log('Total Debt:', formatUnits(userData.total_debt, 18));
console.log('Health Factor:', formatUnits(userData.health_factor, 18));
console.log('Available Borrows:', formatUnits(userData.available_borrows, 18));
```

---

#### Shielded Deposit (Private)

```typescript
// Generate commitment and nullifier (client-side)
const { commitment, nullifier } = generateCommitmentAndNullifier(
  amount,
  asset,
  randomness
);

// Deposit to ShieldedPool
const tx = await shieldedPool.deposit_shielded(
  commitment,
  usdcAddress,
  amount
);

await provider.waitForTransaction(tx.transaction_hash);
console.log('Shielded deposit successful!');
```

---

#### Shielded Withdrawal (Private)

```typescript
// Generate Merkle proof and ZK proof (client-side)
const merkleProof = await generateMerkleProof(commitmentIndex);
const zkProof = await generateZKProof(...);

// Withdraw from ShieldedPool
const tx = await shieldedPool.withdraw_shielded(
  nullifier,
  recipientAddress,
  usdcAddress,
  amount,
  merkleProof.proof,
  merkleProof.pathIndices
);

await provider.waitForTransaction(tx.transaction_hash);
console.log('Shielded withdrawal successful!');
```

---

### Best Practices

#### 1. Interest Rate Calculations

Always use proper precision (RAY = 10^27):

```cairo
let scaled_amount = (amount * u256_pow(10_u256, 27_u256)) / liquidity_index;
```

#### 2. Health Factor Safety Margin

Maintain health factor well above 1:

```typescript
const SAFE_HF_THRESHOLD = 1.2; // 20% safety margin

if (healthFactor < SAFE_HF_THRESHOLD) {
  console.warn('Health factor approaching liquidation zone!');
}
```

#### 3. Price Oracle Redundancy

Use multiple price sources for critical assets:

```cairo
let price1 = oracle1.get_price(asset);
let price2 = oracle2.get_price(asset);

// Use median or weighted average
let final_price = calculate_median([price1, price2]);
```

#### 4. Gas Optimization

Batch operations when possible:

```cairo
// Batch price updates
fn set_prices(
  ref self: ContractState,
  assets: Array<ContractAddress>,
  prices: Array<u256>,
)
```

#### 5. Error Handling

Use descriptive error messages:

```cairo
assert!(amount > 0_u256, "Amount must be greater than 0");
assert!(balance >= amount, "Insufficient balance");
```

---

### Common Issues & Solutions

#### Issue: "Price is stale"

**Cause:** Oracle hasn't updated within threshold

**Solution:**
```cairo
// Increase staleness threshold (admin only)
sncast invoke \
  --address <ORACLE_ADDRESS> \
  --function set_staleness_threshold \
  --calldata 7200  // 2 hours
```

---

#### Issue: "Health factor too low"

**Cause:** Attempting to borrow/withdraw would make position undercollateralized

**Solution:**
- Deposit more collateral
- Repay some debt
- Reduce withdrawal amount

---

#### Issue: "Commitment already exists"

**Cause:** Trying to reuse a commitment hash

**Solution:**
Generate a new unique commitment with fresh randomness:

```typescript
const commitment = poseidonHash([amount, asset, randomBytes()]);
```

---

#### Issue: "Nullifier already used"

**Cause:** Attempting to double-spend a shielded note

**Solution:**
This should never happen legitimately. If it does, it indicates:
- Bug in client code
- Malicious activity attempt
- Incorrect nullifier derivation

---

### Integration Examples

#### Frontend Integration (React)

```tsx
import { useContract, useAccount } from '@starknet-react/core';

function DepositForm() {
  const { account } = useAccount();
  
  const { contract: lendingPool } = useContract({
    abi: lendingPoolAbi,
    address: lendingPoolAddress,
  });

  const handleDeposit = async (amount: bigint) => {
    try {
      // Approve
      const approveTx = await usdcContract.approve(
        lendingPoolAddress,
        amount
      );
      await waitForTransaction(approveTx.transaction_hash);

      // Deposit
      const depositTx = await lendingPool.deposit(
        usdcAddress,
        amount,
        account.address
      );
      await waitForTransaction(depositTx.transaction_hash);
      
      console.log('Deposit successful!');
    } catch (error) {
      console.error('Deposit failed:', error);
    }
  };

  return (
    <button onClick={() => handleDeposit(parseUnits('100', 6))}>
      Deposit 100 USDC
    </button>
  );
}
```

---

#### Backend Monitoring (Node.js)

```typescript
import { RpcProvider } from 'starknet';

async function monitorHealthFactors() {
  const provider = new RpcProvider({
    nodeUrl: process.env.STARKNET_RPC_URL
  });

  const lendingPool = new Contract(abi, address, provider);

  // Get all users (from events or indexer)
  const users = await getUsersFromIndexer();

  for (const user of users) {
    const userData = await lendingPool.get_user_account_data(user);
    const hf = Number(userData.health_factor) / 1e18;

    if (hf < 1.2) {
      console.warn(`User ${user} HF: ${hf.toFixed(3)} - AT RISK!`);
      // Send notification
    }
  }
}

// Run every minute
setInterval(monitorHealthFactors, 60000);
```

---

## 📚 Additional Resources

### Official Documentation

- [Cairo Documentation](https://docs.cairo-lang.org/)
- [Starknet Documentation](https://docs.starknet.io/)
- [OpenZeppelin Cairo](https://github.com/OpenZeppelin/cairo-contracts)
- [Starknet Foundry](https://foundry-rs.github.io/starknet-foundry/)

### Security Audits

[Placeholder for audit reports]

### Community

- [Discord](https://discord.gg/veilend)
- [Twitter](https://twitter.com/veilend)
- [GitHub](https://github.com/veilend)

---

## 📝 License

[Specify your license here]

---

## ⚠️ Disclaimer

This documentation is for informational purposes only. The Veilend Protocol is provided "AS IS" without warranty of any kind. Always conduct thorough security audits and testing before deploying to production.

**Smart contract development involves significant risk. Use at your own discretion.**

---

*Last Updated: March 2026*
