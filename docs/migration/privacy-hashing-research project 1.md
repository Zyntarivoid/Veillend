# Privacy Hashing Research: Commit-Reveal Migration from Starknet to Stellar

**Document Status:** Research & Proposal
**Last Updated:** May 2026
**Target Platform:** Stellar Soroban (Rust WASM)
**Difficulty:** Medium (Cryptography Research)

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Current Architecture: Starknet Poseidon-Based Commit-Reveal](#current-architecture-starknet-poseidon-based-commit-reveal)
3. [Soroban-Supported Hashing Primitives](#soroban-supported-hashing-primitives)
4. [Algorithm Comparison: Poseidon vs SHA-256 vs Keccak-256](#algorithm-comparison-poseidon-vs-sha-256-vs-keccak-256)
5. [Gas / Resource Implications on Soroban](#gas--resource-implications-on-soroban)
6. [Proposed Revised Withdrawal Verification Flow for Stellar](#proposed-revised-withdrawal-verification-flow-for-stellar)
7. [Implementation Roadmap](#implementation-roadmap)
8. [Open Questions & Risks](#open-questions--risks)
9. [References](#references)

---

## Executive Summary

VeilLend's ShieldedPool on Starknet uses a **Commit-Reveal** scheme powered by the **Poseidon** hash function — a SNARK-friendly hash native to Cairo's `core::poseidon` module. Poseidon is used for commitment generation, nullifier derivation, and incremental Merkle tree operations. However, **Poseidon is not natively available on Soroban**, Stellar's smart contract platform.

This document:

1. Analyzes the current Poseidon-based commit-reveal flow in the Cairo ShieldedPool contract
2. Compares Poseidon with Soroban-native alternatives (SHA-256, Keccak-256)
3. Evaluates resource (gas) implications of each algorithm on Soroban
4. Proposes a revised withdrawal verification flow compatible with Stellar

**Recommendation:** Use **SHA-256** as the primary hash for on-chain commitment/nullifier computation on Soroban, with a **hybrid approach** that retains Poseidon compatibility for future ZK-proof integration via Soroban's Bn254/Groth16 verifier.

---

## Current Architecture: Starknet Poseidon-Based Commit-Reveal

### Source Files

| Component | File | Role |
|-----------|------|------|
| ShieldedPool contract | `veilend_cairo/src/contracts/shielded_pool.cairo` | Core privacy pool logic |
| IShieldedPool interface | `veilend_cairo/src/interfaces/interfaces.cairo` | Commit-reveal ABI |
| Commitment struct | `veilend_cairo/src/structs/structs.cairo` | Data structures |
| Event structs | `veilend_cairo/src/event_structs/event_structs.cairo` | Event definitions |
| Backend service | `veilend-backend/src/shielded-pool/shielded-pool.service.ts` | RPC interaction layer |
| Mobile store | `veilend-mobile/src/store/store.ts` | Client-side state |

### Poseidon Usage in ShieldedPool

The Cairo ShieldedPool imports Poseidon directly from Cairo's standard library:

```cairo
use core::poseidon::PoseidonTrait;
use core::hash::HashStateTrait;
use core::poseidon::HashState;
```

Poseidon is used in **three critical operations**:

#### 1. Merkle Leaf Insertion (`_insert_merkle_leaf`)

```cairo
fn _insert_merkle_leaf(ref self: ContractState, leaf: felt252) {
    let current_root = self.merkle_root.read();
    let next_index = self.next_leaf_index.read();

    self.merkle_tree.write(next_index, leaf);

    let new_root = PoseidonTrait::new()
                    .update(current_root)
                    .update(leaf)
                    .update(next_index.into())
                    .finalize();

    self.merkle_root.write(new_root);
    self.next_leaf_index.write(next_index + 1);
}
```

**Purpose:** Computes an incremental Merkle root by hashing `(current_root, leaf, next_index)` through Poseidon's sponge construction.

#### 2. Merkle Proof Verification (`_verify_merkle_proof`)

```cairo
fn _verify_merkle_proof(
    self: @ContractState,
    leaf: felt252,
    proof: Array<felt252>,
    path_indices: Array<u8>,
    expected_root: felt252,
    leaf_index: u64,
) -> bool {
    let mut computed_hash = leaf;

    for i in 0..proof_len {
        let sibling = *proof.at(i);
        let direction = *path_indices.at(i);

        if direction == 0_u8 {
            computed_hash = PoseidonTrait::new()
                .update(computed_hash)
                .update(sibling)
                .finalize();
        } else {
            computed_hash = PoseidonTrait::new()
                .update(sibling)
                .update(computed_hash)
                .finalize();
        }
    };

    computed_hash == expected_root
}
```

**Purpose:** Walks the Merkle path from leaf to root, hashing each (node, sibling) pair with Poseidon. For a tree of depth `d`, this requires `d` Poseidon invocations.

#### 3. Nullifier-to-Commitment Mapping (`_nullifier_to_commitment`)

```cairo
fn _nullifier_to_commitment(self: @ContractState, nullifier: felt252) -> felt252 {
    PoseidonTrait::new()
        .update(nullifier)
        .finalize()
}
```

**Purpose:** Derives a commitment from a nullifier. In production, this mapping would be proven by a ZK-SNARK; currently it is a simplified placeholder.

### Commit-Reveal Flow (Starknet)

```
DEPOSIT (Commit Phase)
═══════════════════════
Client (off-chain):
  1. Generate random nullifier and secret
  2. Compute commitment = Poseidon(nullifier, secret)  [off-chain]
  3. Submit deposit_shielded(commitment, asset, amount) to ShieldedPool

Contract (on-chain):
  4. Verify commitment != 0 and doesn't already exist
  5. Transfer tokens from depositor to contract
  6. Store commitment data (amount, asset, depositor, leaf_index, timestamp)
  7. Insert commitment as Merkle leaf → Poseidon-based root update
  8. Emit ShieldedDeposit event


WITHDRAW (Reveal Phase)
════════════════════════
Client (off-chain):
  1. Reveal nullifier (associated with the commitment to spend)
  2. Generate Merkle proof from leaf to root
  3. Submit withdraw_shielded(nullifier, recipient, asset, amount, merkle_proof, path_indices)

Contract (on-chain):
  4. Verify nullifier hasn't been used (double-spend protection)
  5. Derive commitment from nullifier via _nullifier_to_commitment() [Poseidon, placeholder]
  6. Verify commitment exists and isn't spent
  7. Verify Merkle proof via _verify_merkle_proof() [Poseidon × tree_depth]
  8. Mark nullifier as used, commitment as spent
  9. Transfer tokens to recipient (minus fee)
  10. Emit ShieldedWithdrawal event
```

### Key Data Structures

```cairo
// Commitment storage
struct Commitment {
    amount: u256,
    asset: ContractAddress,
    depositor: ContractAddress,
    leaf_index: u64,
    timestamp: u64,
    is_spent: bool,
}

// Storage layout
commitments: Map<felt252, Commitment>,        // commitment_hash → data
nullifiers: Map<felt252, bool>,                // nullifier → used
merkle_root: felt252,                          // current Merkle root
merkle_tree: Map<u64, felt252>,               // index → leaf hash
next_leaf_index: u64,                          // next insertion index
tree_depth: u32,                               // tree depth (e.g., 20)
```

### Critical Observation

The current implementation is a **simplified placeholder** for a full ZK-proof system. The comments in the Cairo code acknowledge this:

- `_nullifier_to_commitment`: *"In production, this would be derived from ZK proof"*
- `verify_proof`: *"For now, return true for testing"*
- `_insert_merkle_leaf`: *"Simplified - in production use incremental merkle tree"*
- `_verify_merkle_proof`: *"In production, this would verify against the actual merkle tree"*

This means the migration has an opportunity to **design the hashing scheme correctly from the start** for Soroban, rather than merely porting a placeholder.

---

## Soroban-Supported Hashing Primitives

The Soroban SDK (`soroban-sdk` v21+) provides the `env.crypto()` module with the following hash functions:

### Available Primitives

| Function | API | Output | Native | ZK-Friendly |
|----------|-----|--------|--------|-------------|
| **SHA-256** | `env.crypto().sha256(&Bytes) -> Hash<32>` | 32 bytes | Yes (host fn) | No |
| **Keccak-256** | `env.crypto().keccak256(&Bytes) -> Hash<32>` | 32 bytes | Yes (host fn) | No |
| **BLS12-381** | `env.crypto().bls12_381()` | Various | Yes (host fn) | Yes (pairing) |
| **BN254** | `env.crypto().bn254()` | Various | Yes (host fn) | Yes (pairing) |

### Signature Verification

| Function | API | Use Case |
|----------|-----|----------|
| **Ed25519** | `env.crypto().ed25519_verify(pk, msg, sig)` | Standard Stellar auth |
| **secp256k1** | `env.crypto().secp256k1_recover(digest, sig, rec_id)` | Ethereum compatibility |
| **secp256r1** | `env.crypto().secp256r1_verify(pk, digest, sig)` | WebAuthn / passkeys |

### What Is NOT Available

| Function | Status | Implication |
|----------|--------|-------------|
| **Poseidon** | Not available | Cannot directly port Cairo hashing logic |
| **Pedersen** | Not available | Alternative SNARK-friendly hash also missing |
| **MiMC** | Not available | Lightweight SNARK-friendly hash not supported |
| **SHA-3/SHAKE** | Not available | Only SHA-256 and Keccak-256 variants |

### Key Insight: BN254 and Groth16 Verification

Soroban provides **native BN254 pairing operations** and **Groth16 proof verification** through `env.crypto().bn254()`. This is significant because:

1. Groth16 proofs can be verified on-chain efficiently
2. The proof computation (proving) happens **off-chain** — only verification is on-chain
3. This means ZK-friendly hashes like Poseidon can still be used **off-chain** for proof generation, while on-chain verification relies on BN254 primitives

---

## Algorithm Comparison: Poseidon vs SHA-256 vs Keccak-256

### Algorithm Properties

| Property | Poseidon | SHA-256 | Keccak-256 |
|----------|----------|---------|------------|
| **Type** | Arithmetic sponge | Merkle-Damgard | Sponge (Keccak-f[1600]) |
| **Field** | Prime field (felt252 / BN254) | Binary (2^256) | Binary (2^256) |
| **Output** | 252-bit felt / 256-bit | 256-bit | 256-bit |
| **Rounds** | 8 full + 57 partial (H=2) | 64 rounds | 24 rounds |
| **SNARK-friendly** | Yes (few constraints) | No (~25K R1CS constraints) | No (~200K R1CS constraints) |
| **STARK-friendly** | Partially | No | Yes (native to Keccak) |
| **NIST Standard** | No | Yes (FIPS 180-4) | No (SHA-3 uses different padding) |
| **Cryptographic Assumption** | Algebraic (Gröbner basis) | Cryptographic (collision resistance) | Cryptographic (sponge security) |
| **On-chain (Starknet)** | Native (1 opcode) | Via precompile | Not native |
| **On-chain (Soroban)** | Not available | Native host fn | Native host fn |

### Constraint Comparison for ZK Proofs

When generating ZK proofs (off-chain), the number of R1CS constraints per hash operation is a critical metric:

| Hash Function | R1CS Constraints (approx.) | Proof Generation Time | Proof Size |
|---------------|---------------------------|----------------------|------------|
| Poseidon (H=2, t=3) | ~276 | Fast (~ms) | ~128 bytes (Groth16) |
| Poseidon (H=3, t=6) | ~939 | Fast (~ms) | ~128 bytes (Groth16) |
| SHA-256 | ~25,000 | Slow (~seconds) | ~128 bytes (Groth16) |
| Keccak-256 | ~200,000+ | Very Slow (~10s of seconds) | ~128 bytes (Groth16) |

**Implication:** If full ZK-proof integration is planned, Poseidon should still be used **off-chain** for proof generation. The on-chain hash function only needs to match for **non-ZK verification** (the current placeholder approach).

### Security Comparison

| Property | Poseidon | SHA-256 | Keccak-256 |
|----------|----------|---------|------------|
| **Collision Resistance** | ~128 bits (estimated) | 128 bits | 128 bits |
| **Preimage Resistance** | ~252 bits | 256 bits | 256 bits |
| **Quantum Resistance** | No (broken by quantum) | No (broken by quantum) | No (broken by quantum) |
| **Maturity** | ~5 years (2020) | ~22 years (2002) | ~9 years (2015) |
| **Known Attacks** | Algebraic attacks (mitigated by round count) | None practical | None practical |
| **Audit Status** | Peer-reviewed, limited production use | NIST-certified, universal | NIST SHA-3 competition winner |

---

## Gas / Resource Implications on Soroban

### Soroban Fee Model

Soroban uses a **multidimensional resource fee** model. The non-refundable portion of fees depends on:

1. **CPU Instructions** — metered by the host environment per WASM opcode
2. **Ledger Entry Accesses** — read/write operations to persistent storage
3. **Ledger I/O** — bytes read from / written to ledger
4. **Transaction Size** — network bandwidth cost
5. **Events & Return Value** — metadata size

The key insight for hashing: **CPU instruction cost is proportional to the computational complexity of the hash function**. Host-native functions (SHA-256, Keccak-256) are significantly cheaper than implementing a custom hash in WASM.

### Instruction Cost Analysis

| Operation | Implementation | Estimated CPU Instructions | Notes |
|-----------|---------------|---------------------------|-------|
| SHA-256 (host) | `env.crypto().sha256()` | Low (native host call) | Single host function invocation |
| Keccak-256 (host) | `env.crypto().keccak256()` | Low (native host call) | Single host function invocation |
| Poseidon (WASM) | Custom Rust impl | Very High (field arithmetic) | No native support; must implement in WASM |
| Poseidon (off-chain) | Client-side | N/A (off-chain) | Free on-chain; only result stored |

### Estimated Resource Cost per ShieldedPool Operation

For a Merkle tree of depth **20** (standard for privacy pools):

| Operation | Poseidon (WASM) | SHA-256 (host) | Keccak-256 (host) |
|-----------|----------------|----------------|-------------------|
| **Deposit (1 hash)** | ~1 field arithmetic op × WASM overhead | 1 `sha256` call | 1 `keccak256` call |
| **Withdraw (20 Merkle hashes + nullifier)** | ~21 Poseidon ops × WASM overhead | 21 `sha256` calls | 21 `keccak256` calls |
| **Approx. relative cost** | **~5-10x** (estimated) | **1x (baseline)** | **~1x (baseline)** |

### Detailed Cost Breakdown for Withdrawal

A withdrawal requires:

1. **1 nullifier derivation** — hash(nullifier) to get commitment
2. **20 Merkle path hashes** — one per tree level (depth=20)
3. **~3-5 storage reads** — commitment data, nullifier status, merkle root
4. **2-3 storage writes** — mark nullifier used, mark commitment spent, update totals
5. **1 token transfer** — SAC call

| Hash Choice | CPU Instructions (hash only) | Relative Fee Impact |
|-------------|------------------------------|---------------------|
| SHA-256 (21 calls) | ~21 × host_fn_cost | Baseline |
| Keccak-256 (21 calls) | ~21 × host_fn_cost | ~Baseline |
| Poseidon in WASM (21 calls) | ~21 × (field_arithmetic_in_wasm) | **5-10x baseline** |

### Why Poseidon in WASM Is Expensive

Poseidon operates over large prime fields (e.g., the BN254 scalar field: `p ≈ 2^254`). Each Poseidon permutation requires:

- **8 full rounds**: each with matrix multiplication over `F_p` (expensive modular arithmetic)
- **57 partial rounds**: each with sparse matrix multiplication over `F_p`
- **Total**: ~65 field multiplications, each requiring multi-precision arithmetic in WASM

In contrast, SHA-256 operates on 32-bit words with simple bitwise operations (AND, XOR, ROT), which are natively efficient in WASM. But since SHA-256 is a **host function** on Soroban, it bypasses WASM entirely and executes as a native host call.

### Storage Considerations

| Data | Poseidon (felt252) | SHA-256 (BytesN<32>) | Keccak-256 (BytesN<32>) |
|------|-------------------|----------------------|-------------------------|
| Commitment key | 32 bytes | 32 bytes | 32 bytes |
| Nullifier key | 32 bytes | 32 bytes | 32 bytes |
| Merkle node | 32 bytes | 32 bytes | 32 bytes |
| **Storage cost** | Identical | Identical | Identical |

Storage costs are identical across all hash choices because the output is always 256 bits (32 bytes).

### Fee Estimation Formula

```
Resource Fee = (instructions × instruction_rate)
             + (ledger_reads × read_rate)
             + (ledger_writes × write_rate)
             + (read_bytes × byte_read_rate)
             + (write_bytes × byte_write_rate)
             + (tx_size × bandwidth_rate)
             + rent
```

For the ShieldedPool, the dominant variable is **instructions**. Using SHA-256 host calls minimizes this component.

Current Soroban testnet rates (approximate, subject to change):
- Instruction rate: ~100 stroops per 10,000 instructions
- Ledger read: ~5,000 stroops per read
- Ledger write: ~20,000 stroops per write
- Base inclusion fee: 100 stroops per operation

---

## Proposed Revised Withdrawal Verification Flow for Stellar

### Design Principles

1. **Use SHA-256 as the on-chain hash** — native Soroban host function, lowest CPU cost
2. **Reserve Poseidon for off-chain ZK proof generation** — when ZK proofs are integrated, Poseidon runs off-chain and only the Groth16 verification happens on-chain via `env.crypto().bn254()`
3. **Maintain the same commit-reveal semantics** — commitment, nullifier, and Merkle proof concepts are preserved
4. **Data-type migration** — `felt252` → `BytesN<32>` for all hash outputs

### Revised Data Structures (Soroban)

```rust
use soroban_sdk::{contracttype, BytesN, Address};

#[contracttype]
pub struct Commitment {
    pub amount: i128,          // Soroban uses i128 for token amounts
    pub asset: Address,        // Stellar asset contract address
    pub depositor: Address,
    pub leaf_index: u32,
    pub timestamp: u64,
    pub is_spent: bool,
}

#[contracttype]
pub enum DataKey {
    Commitment(BytesN<32>),           // commitment_hash -> Commitment
    Nullifier(BytesN<32>),            // nullifier -> bool
    NullifierToCommitment(BytesN<32>), // nullifier -> commitment_hash (lookup for withdrawal)
    MerkleRoot,                       // -> BytesN<32>
    MerkleNode(u32),                  // index -> BytesN<32>
    NextLeafIndex,                    // -> u32
    TreeDepth,                        // -> u32
    SupportedAsset(Address),          // asset -> bool
    TotalShielded(Address),           // asset -> i128
    MinDeposit,                       // -> i128
    MaxDeposit,                       // -> i128
    DepositFeeBps,                    // -> u32
    FeeCollector,                     // -> Address
    EmergencyEnabled,                 // -> bool
    Admin,                            // -> Address
}
```

> **Note:** The `NullifierToCommitment` map is essential for the withdrawal flow.
> Unlike the Cairo placeholder where `Poseidon(nullifier)` deterministically maps to a commitment,
> SHA-256 commitments include additional inputs (secret, amount, asset) and cannot be derived
> from the nullifier alone. The contract stores this mapping during deposit so it can look up
> the commitment during withdrawal.

### Revised Hashing Functions

The following functions are split into **off-chain (client-side)** and **on-chain (contract)** categories.

#### Off-Chain Functions (Client-Side)

These run on the client device. They use any hash available in the client runtime
(e.g., `@noble/hashes/sha256` in React Native) and do not incur on-chain costs.

```typescript
// Off-chain: Client-side TypeScript (React Native)
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, randomBytes } from '@noble/hashes/utils';

// Standard commit-reveal: generate two independent random values,
// then derive commitment from both. No circular dependency.
//
// commitment = SHA-256(nullifier || secret)
// This follows the Tornado Cash design pattern.

export function generateDepositParams(): {
  nullifier: Uint8Array;   // 32 bytes
  secret: Uint8Array;      // 32 bytes
  commitment: Uint8Array;  // 32 bytes (SHA-256 output)
} {
  const nullifier = randomBytes(32);
  const secret = randomBytes(32);

  // commitment = SHA-256(nullifier || secret)
  const preimage = new Uint8Array(64);
  preimage.set(nullifier, 0);
  preimage.set(secret, 32);
  const commitment = sha256(preimage);

  return { nullifier, secret, commitment };
}
```

#### On-Chain Functions (Soroban Contract)

These run inside the Soroban WASM runtime and use `env.crypto().sha256()` host calls.

```rust
use soroban_sdk::{Env, Bytes, BytesN, Vec};

/// Insert a leaf into the incremental Merkle tree (on-chain)
///
/// new_root = SHA-256(current_root || leaf || leaf_index)
pub fn insert_merkle_leaf(
    env: &Env,
    current_root: &BytesN<32>,
    leaf: &BytesN<32>,
    leaf_index: u32,
) -> BytesN<32> {
    let mut preimage = Bytes::new(env);
    preimage.append(&current_root.clone().into());
    preimage.append(&leaf.clone().into());
    // Append leaf_index as 4-byte big-endian
    let index_bytes: [u8; 4] = leaf_index.to_be_bytes();
    preimage.append(&Bytes::from_array(env, &index_bytes));
    env.crypto().sha256(&preimage)
}

/// Verify a Merkle proof using SHA-256 (on-chain)
///
/// For each level: hash(left || right) or hash(right || left) depending on path index
pub fn verify_merkle_proof(
    env: &Env,
    leaf: &BytesN<32>,
    proof: &Vec<BytesN<32>>,
    path_indices: &Vec<u8>,
    expected_root: &BytesN<32>,
) -> bool {
    let mut computed_hash = leaf.clone();

    for i in 0..proof.len() {
        let sibling = proof.get(i).unwrap();
        let direction = path_indices.get(i).unwrap();

        let mut preimage = Bytes::new(env);
        if direction == 0 {
            // Current node is left child
            preimage.append(&computed_hash.clone().into());
            preimage.append(&sibling.clone().into());
        } else {
            // Current node is right child
            preimage.append(&sibling.clone().into());
            preimage.append(&computed_hash.clone().into());
        }
        computed_hash = env.crypto().sha256(&preimage);
    }

    computed_hash == *expected_root
}
```

> **Design Note:** We use `soroban_sdk::Vec` (not `std::Vec`) and `Vec::get(i)` (not indexing)
> per Soroban SDK conventions. The `Bytes::from_array(env, &bytes)` API is used for
> fixed-size byte arrays instead of the non-existent `Bytes::from(env, &slice)`.

### Revised Deposit Flow (Soroban)

```
DEPOSIT (Commit Phase) — Stellar/Soroban
═════════════════════════════════════════

Client (off-chain):
  1. Generate random nullifier: 32 bytes
  2. Generate random secret: 32 bytes
  3. Compute commitment = SHA-256(nullifier || secret)    [Tornado Cash pattern]
  4. Submit deposit_shielded(commitment, nullifier_hash, asset, amount) to ShieldedPool
     where nullifier_hash = SHA-256(nullifier)  [public nullifier identifier]

Contract (on-chain):
  5. Validate: commitment != 0, amount within limits, asset supported
  6. Check commitment doesn't already exist in storage
  7. Store nullifier_hash → commitment mapping (for withdrawal lookup)
  8. Transfer SAC tokens from depositor to contract
  9. Store commitment data in ledger
  10. Insert commitment as Merkle leaf → SHA-256 root update
  11. Emit ShieldedDeposit event
```

> **Why `nullifier_hash`?** The raw nullifier is the user's secret spend key. During deposit,
> the contract stores `SHA-256(nullifier)` as the public nullifier identifier. During withdrawal,
> the client reveals the raw nullifier, the contract hashes it, and uses the hash to look up
> the associated commitment. This prevents the raw nullifier from being linkable to the deposit
> until the user chooses to withdraw.

### Revised Withdrawal Flow (Soroban)

```
WITHDRAW (Reveal Phase) — Stellar/Soroban
══════════════════════════════════════════

Client (off-chain):
  1. Retrieve nullifier and secret for the commitment to spend
  2. Compute nullifier_hash = SHA-256(nullifier)
  3. Compute commitment = SHA-256(nullifier || secret)   [verify locally]
  4. Build Merkle proof: sibling hashes from leaf to root
  5. Build path_indices: direction at each level (0=left, 1=right)
  6. Submit withdraw_shielded(nullifier, recipient, asset, amount, merkle_proof, path_indices)

Contract (on-chain):
  7. Compute nullifier_hash = SHA-256(nullifier)
  8. Check nullifier_hash hasn't been used (double-spend protection)
  9. Look up commitment via NullifierToCommitment map: commitment = nullifier_to_commitment[nullifier_hash]
  10. Look up commitment data from storage
  11. Verify: commitment exists, amount sufficient, not already spent, asset matches
  12. Verify Merkle proof via SHA-256 (20 hash computations for depth-20 tree)
  13. Mark nullifier_hash as used
  14. Mark commitment as spent
  15. Update total shielded balance
  16. Transfer SAC tokens to recipient (minus fee)
  17. Emit ShieldedWithdrawal event
```

> **Key difference from Cairo:** The Cairo version used `Poseidon(nullifier) → commitment` as a
> deterministic on-chain derivation (placeholder). The Soroban version uses an explicit
> `NullifierToCommitment` storage map populated during deposit. This is because SHA-256
> commitments include the secret, so the commitment cannot be re-derived from the nullifier alone.

### Merkle Proof Verification Pseudocode (Soroban)

```rust
use soroban_sdk::{Env, Bytes, BytesN, Address, Vec};

fn withdraw_shielded(
    env: Env,
    nullifier: BytesN<32>,    // raw nullifier (revealed by client)
    recipient: Address,
    asset: Address,
    amount: i128,
    merkle_proof: Vec<BytesN<32>>,
    path_indices: Vec<u8>,
) {
    // 1. Validate inputs
    assert!(amount > 0, "Amount must be positive");

    // 2. Compute nullifier_hash = SHA-256(nullifier)
    let nullifier_hash = env.crypto().sha256(&nullifier.to_bytes());

    // 3. Check nullifier_hash not used (double-spend protection)
    let nullifier_used: bool = env.storage().persistent()
        .get(&DataKey::Nullifier(nullifier_hash.clone()))
        .unwrap_or(false);
    assert!(!nullifier_used, "Nullifier already used");

    // 4. Look up commitment via NullifierToCommitment mapping
    let commitment: BytesN<32> = env.storage().persistent()
        .get(&DataKey::NullifierToCommitment(nullifier_hash.clone()))
        .expect("No commitment found for nullifier");

    // 5. Look up commitment data
    let commitment_data: Commitment = env.storage().persistent()
        .get(&DataKey::Commitment(commitment.clone()))
        .expect("Commitment not found");
    assert!(commitment_data.amount >= amount, "Insufficient shielded balance");
    assert!(!commitment_data.is_spent, "Commitment already spent");
    assert!(commitment_data.asset == asset, "Asset mismatch");

    // 6. Verify Merkle proof
    let merkle_root: BytesN<32> = env.storage().persistent()
        .get(&DataKey::MerkleRoot)
        .unwrap();
    let is_valid = verify_merkle_proof(
        &env, &commitment, &merkle_proof, &path_indices, &merkle_root
    );
    assert!(is_valid, "Invalid Merkle proof");

    // 7. Update state
    env.storage().persistent().set(&DataKey::Nullifier(nullifier_hash.clone()), &true);
    let mut updated = commitment_data.clone();
    updated.is_spent = true;
    env.storage().persistent().set(&DataKey::Commitment(commitment), &updated);

    // 8. Transfer tokens
    let fee = calculate_fee(&env, amount);
    let amount_after_fee = amount - fee;

    // Transfer fee to collector
    // Transfer remainder to recipient
    // (SAC token transfer calls)

    // 9. Emit event
    // env.events().publish(...)
}
```

### Nullifier-to-Commitment Mapping (Revised)

On Starknet, the Cairo placeholder used `Poseidon(nullifier) → commitment` as a deterministic
on-chain derivation. On Soroban, we use an **explicit storage mapping** instead:

```
Deposit:  contract stores nullifier_to_commitment[SHA-256(nullifier)] = commitment
Withdraw: contract looks up commitment = nullifier_to_commitment[SHA-256(nullifier)]
```

**Why not a deterministic hash?** The commitment is `SHA-256(nullifier || secret)`, which includes
the `secret` that only the depositor knows. The contract cannot re-derive the commitment from the
nullifier alone without the secret. Therefore, the mapping must be stored explicitly during deposit.

```rust
/// Called during deposit_shielded to store the nullifier→commitment mapping
fn store_nullifier_mapping(
    env: &Env,
    nullifier: &BytesN<32>,   // raw nullifier from client
    commitment: &BytesN<32>,  // commitment computed client-side
) {
    // Hash the nullifier so the raw value isn't stored in cleartext
    let nullifier_hash = env.crypto().sha256(&nullifier.to_bytes());

    // Store the lookup mapping
    env.storage().persistent().set(
        &DataKey::NullifierToCommitment(nullifier_hash.clone()),
        &commitment,
    );

    // Also initialize the nullifier as unused
    env.storage().persistent().set(
        &DataKey::Nullifier(nullifier_hash),
        &false,
    );
}
```

> **Security note:** The contract stores `SHA-256(nullifier)`, not the raw nullifier. This means
> an observer cannot link a deposit to a withdrawal without the depositor revealing the nullifier.
> This matches the privacy semantics of Tornado Cash and similar protocols.

### Dual-Hash Strategy (Future ZK Integration)

When ZK proofs are integrated, the architecture becomes:

```
┌─────────────────────────────────────────────────┐
│                 OFF-CHAIN (Client)               │
│                                                  │
│  Step 1: Generate deposit parameters             │
│  ├── nullifier = randomBytes(32)                 │
│  ├── secret    = randomBytes(32)                 │
│  └── commitment = SHA-256(nullifier || secret)   │
│                                                  │
│  Step 2: Generate ZK proof (Poseidon-based)      │
│  ├── commitment_zk = Poseidon(nullifier, secret) │
│  ├── nullifier_zk  = Poseidon(nullifier)         │
│  ├── merkle_path   = Poseidon-based tree proof   │
│  └── proof = Groth16.prove(circuit, inputs)      │
│                                                  │
└──────────────┬──────────────────────────────────┘
               │
               │  Submit: proof + public_inputs
               │  (commitment, nullifier_hash, merkle_root)
               ▼
┌─────────────────────────────────────────────────┐
│              ON-CHAIN (Soroban)                  │
│                                                  │
│  SHA-256 Layer (current, non-ZK)                │
│  ├── commitment storage + Merkle tree            │
│  ├── nullifier_hash → commitment lookup          │
│  └── Merkle proof via SHA-256                    │
│                                                  │
│  ZK Verification Layer (future)                  │
│  └── env.crypto().bn254().verify_groth16(...)    │
│                                                  │
│  The ZK proof verifies that the Poseidon         │
│  computation was done correctly off-chain,        │
│  binding the SHA-256 on-chain state to the       │
│  Poseidon off-chain proof.                       │
│                                                  │
└─────────────────────────────────────────────────┘
```

In this dual-hash model:

1. **SHA-256** handles on-chain commitment/nullifier/Merkle root computation and storage
2. **Poseidon** (off-chain) generates ZK proofs that the computations are correct
3. **Groth16 verification** (on-chain via `env.crypto().bn254()`) validates the proof
4. A **binding commitment** links both hash domains: the on-chain commitment is `SHA-256(nullifier || secret)`, and the ZK proof demonstrates knowledge of the same `nullifier` and `secret` that produce the matching Poseidon commitment

---

## Implementation Roadmap

### Phase 1: SHA-256 ShieldedPool on Soroban (Current Priority)

**Goal:** Port the ShieldedPool to Soroban using SHA-256 as the on-chain hash.

| Task | Description | Status |
|------|-------------|--------|
| Create `shielded_pool` Soroban project | `soroban contract init shielded_pool` | Planned |
| Define Soroban data structures | Commitment, DataKey enum, storage layout | Planned |
| Implement `deposit_shielded` | SHA-256 commitment, SAC token transfer, Merkle insert | Planned |
| Implement `withdraw_shielded` | Nullifier check, Merkle verification, SAC transfer | Planned |
| Implement Merkle tree | SHA-256 incremental Merkle tree (depth=20) | Planned |
| Admin functions | Asset management, fee settings, emergency controls | Planned |
| Write unit tests | Deposit, withdraw, double-spend, Merkle verification | Planned |
| Deploy to testnet | Verify on Stellar testnet | Planned |

### Phase 2: Client-Side Hash Migration (Mobile)

| Task | Description | Status |
|------|-------------|--------|
| Update `store.ts` | Change `depositShielded` to compute SHA-256 commitment | Planned |
| Add SHA-256 utility | Use `@noble/hashes/sha256` for RN-compatible hashing | Planned |
| Update `api.ts` | Send `BytesN<32>` commitment instead of `felt252` | Planned |
| Merkle proof generation | Client-side SHA-256 Merkle tree + proof builder | Planned |
| Update backend service | Adapt `shielded-pool.service.ts` for Soroban calls | Planned |

### Phase 3: ZK Proof Integration (Future)

| Task | Description | Status |
|------|-------------|--------|
| Select ZK framework | Circom + snarkjs or Halo2 for proof generation | Planned |
| Define ZK circuit | Poseidon-based commitment/nullifier/Merkle verification | Planned |
| Implement Groth16 verifier | Use `env.crypto().bn254()` on Soroban | Planned |
| Build prover service | Off-chain proof generation backend | Planned |
| Integrate with mobile | Proof generation + submission in React Native | Planned |

---

## Open Questions & Risks

### Open Questions

1. **Merkle tree depth**: The current Cairo contract uses a configurable depth (typically 20). On Soroban, deeper trees increase withdrawal cost (more SHA-256 calls). Should we reduce the default depth for Soroban (e.g., 16)?

2. **Merkle tree implementation**: The current Cairo implementation is simplified. Should we implement a proper incremental Merkle tree (like `IncrementalQuinTree`) or continue with the simplified approach?

3. **Commitment binding**: The Soroban design uses an explicit `NullifierToCommitment` storage map instead of the Cairo's deterministic `Poseidon(nullifier)` derivation. This adds one extra storage write per deposit and one extra storage read per withdrawal. Is this trade-off acceptable, or should we explore alternative commitment schemes?

4. **Cross-chain compatibility**: If a user deposits on Starknet and wants to withdraw on Stellar (via bridge), the hash functions differ. How should cross-chain nullifiers be handled?

5. **Frontend randomness**: The `crypto.getRandomValues()` availability in React Native for generating 32-byte secrets. Currently, the mobile app uses `expo-secure-store` — is this sufficient for cryptographic randomness?

### Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| SHA-256 not ZK-friendly → larger proof circuits | Medium | Use dual-hash strategy; Poseidon off-chain, SHA-256 on-chain |
| Increased withdrawal cost vs Starknet | Low | SHA-256 host calls are efficient; cost difference is marginal |
| Merkle proof forgery in simplified tree | High | Implement proper incremental Merkle tree before mainnet |
| Nullifier collision across chains | Medium | Add chain-specific domain separator to nullifier preimage |
| Storage bloat on Soroban (rent model) | Medium | Use persistent storage with TTL management; prune spent commitments |

---

## References

### Codebase References

- [ShieldedPool Cairo contract](../../veilend_cairo/src/contracts/shielded_pool.cairo) — Current Poseidon-based implementation
- [IShieldedPool interface](../../veilend_cairo/src/interfaces/interfaces.cairo) — Commit-reveal ABI
- [Commitment & MerkleProof structs](../../veilend_cairo/src/structs/structs.cairo) — Data structures
- [ShieldedPool backend service](../../veilend-backend/src/shielded-pool/shielded-pool.service.ts) — RPC interaction
- [Mobile store](../../veilend-mobile/src/store/store.ts) — Client-side shielded operations
- [Soroban hello contract](../../veilend-soroban/veilend_hello/src/lib.rs) — Soroban starter template
- [Mobile-Stellar integration guide](./mobile-stellar-integration.md) — Related migration doc
- [Soroban contributing guide](../CONTRIBUTING_SOROBAN.md) — Dev environment setup

### External References

- [Soroban SDK `Crypto` module](https://docs.rs/soroban-sdk/latest/soroban_sdk/crypto/struct.Crypto.html) — SHA-256 and Keccak-256 host functions
- [Stellar Fees, Resource Limits, and Metering](https://developers.stellar.org/docs/learn/fundamentals/fees-resource-limits-metering) — Fee model
- [Soroban Environment Host — Fee Computation](https://github.com/stellar/rs-soroban-env/blob/main/soroban-env-host/src/fees.rs) — Canonical fee calculation
- [Stellar Lab — Network Resource Limits](https://lab.stellar.org/network-limits) — Current fee rates
- [Poseidon: A New Hash Function for Zero-Knowledge Proof Systems](https://eprint.iacr.org/2019/458) — Poseidon paper
- [ZK-Friendly Hash Functions — Zellic](https://www.zellic.io/blog/zk-friendly-hash-functions) — Comparison of ZK-friendly hashes
- [Benchmarking ZK-Friendly Hash Functions and SNARK Proving](https://arxiv.org/html/2409.01976v1) — Constraint benchmarks

---

## Document Metadata

- **Version**: 1.1 (corrected — fixed circular dependency, Soroban SDK API, nullifier mapping)
- **Status**: Research & Proposal — Validated
- **Target Review Date**: June 2026
- **Authors**: VeilLend Protocol Team
