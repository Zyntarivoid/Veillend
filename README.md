# 🛡️ VeilLend

> **Private Lending. Stellar Speed.**

**VeilLend** is a privacy-first decentralized lending protocol built on **Stellar/Soroban**. It leverages **Zero-Knowledge (ZK)** cryptography to enable users to deposit, borrow, and transact with complete financial privacy.

---

## 🏆 Drips Monthly Wave: Privacy Track
This project is part of the **Drips Monthly Wave Contributor Program**, focusing on privacy-first DeFi solutions for the Stellar ecosystem. We're building:
- **Confidential Transactions**: Shielded pools for depositing and withdrawing assets without revealing the link between sender and receiver.
- **ZK Protocol Implementation**: Custom implementation of a **Commit-Reveal Scheme** using **SHA-256 hashing** (Stellar-compatible).
- **Multi-Chain Wallet UI**: A privacy-focused mobile interface that supports both Starknet and Stellar wallets.

---

## 🏗️ Architecture

The project follows a modern, layered architecture:

| Component | Tech Stack | Description |
| :--- | :--- | :--- |
| **Smart Contracts** | **Rust/Soroban** | On-chain logic for Lending Pools, ZK Shielding, and Asset Management on Stellar. |
| **Mobile App** | **React Native (Expo)** | Cross-platform mobile wallet interface with "Privacy Mode" and multi-chain (Starknet + Stellar) SDK integration. |
| **Backend API** | **NestJS** | Relayer service, indexer, and off-chain data aggregator backed by **Supabase**, now supporting multi-chain operations. |
| **Database** | **PostgreSQL (Supabase)** | Stores encrypted user profiles, transaction history, and active positions across multiple blockchains. |

---

## 🔐 Smart Contracts (Soroban/Rust)

Located in `/veilend-soroban`, our Soroban smart contracts power the privacy engine on Stellar:

### 1. **ZK Shielded Pool (`shielded_pool.rs`)**
- Implements a **Commit-Reveal** privacy scheme.
- **Deposit**: Users generate a secret off-chain, hash it (SHA-256), and deposit funds with the `commitment`.
- **Withdraw**: Users provide the `secret` (nullifier) to prove ownership without revealing their identity.
- **Privacy**: The on-chain state only tracks hashed commitments, breaking the link between deposit and withdrawal.

### 2. **Lending Pool (`lending_pool.rs`)**
- Standard DeFi logic for **Supply**, **Borrow**, and **Repay**.
- Integrated with Stellar assets (XLM, USDC, etc.).
- Emits events for real-time indexing.

---

## 📱 Mobile App Features

- **🛡️ Multi-Chain Dashboard**: Toggle "Privacy Mode" to mask balances and positions from prying eyes (or shoulder surfers).
- **🔑 Multi-Chain Login**: Authenticate securely using cryptographic signatures (Starknet: Argent/Braavos; Stellar: Freighter/Albedo) via multi-chain SDKs.
- **⚡ Fast Actions**: One-tap Deposit, Borrow, and Repay flows across multiple blockchains.
- **🔄 Real-time Updates**: Live synchronization with on-chain data via the Backend API for all supported chains.

---

## 🚀 Getting Started

### Prerequisites
- **Node.js** (v18+)
- **Rust toolchain** (for Soroban contracts)
- **Soroban CLI** (for contract deployment)
- **Docker** (for local Stellar network)
- **Expo Go** (for mobile testing)

### 1. Smart Contracts
```bash
cd veilend-soroban
# Build Soroban contracts
soroban contract build
# Deploy to local network
soroban contract deploy --wasm target/wasm32-unknown-unknown/release/veilend_hello.wasm --source bob --network local
```

### 2. Backend API
```bash
cd veilend-backend
npm install
# Setup .env with SUPABASE_URL and SUPABASE_KEY
npm run start:dev
# Swagger Docs available at http://localhost:3000/api
```

### 3. Mobile App
```bash
cd veilend-mobile
npm install --legacy-peer-deps
npx expo start
# Scan QR code with Expo Go
```

---

## 🛠️ Tech Deep Dive: ZK Privacy Flow (Stellar)

1.  **Client-Side**: User selects "Shielded Deposit". App generates a random `secret`.
2.  **Hashing**: App computes `commitment = SHA256(secret || amount || asset)`.
3.  **On-Chain**: App calls `deposit_shielded(commitment, amount, asset)`.
4.  **Storage**: Contract stores `commitment` mapped to `amount`.
5.  **Withdrawal**: User provides `secret` to a fresh address. Contract verifies `SHA256(secret || amount || asset) == commitment` and transfers funds.

---

## 📜 License
MIT

## 🌟 Join the Drips Monthly Wave Contributor Program

We're actively seeking contributors to help build VeilLend on Stellar! This is your opportunity to:

- ✨ Contribute to cutting-edge privacy-focused DeFi on Stellar
- 💰 Earn rewards through the Drips contributor program
- 🤝 Collaborate with experienced blockchain developers
- 🚀 Gain experience with Soroban, Rust, and multi-chain development

### How to Get Started:
1. **Setup**: Follow the Getting Started guide above
2. **Pick an Issue**: Check GitHub issues labeled `good-first-issue` or `soroban`
3. **Contribute**: Implement features, fix bugs, or improve documentation
4. **Submit**: Create a PR with tests and documentation updates

### Resources:
- [Soroban Documentation](https://soroban.stellar.org/docs)
- [Stellar Developer Docs](https://developers.stellar.org/docs)
- [VeilLend Migration Guide](veilend_contracts/docs/migration/contract-mapping.md)
- [Drips Contributor Program](https://drips.network/contributors)

**Ready to contribute?** Start with the `veilend_hello` contract in `/veilend-soroban` and help us build the future of private lending on Stellar! 🌟
