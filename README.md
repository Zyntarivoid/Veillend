# 🛡️ VeilLend

> **Private Lending. Stellar Speed. X-Ray Privacy.**

**VeilLend** is a privacy-first decentralized lending protocol built on **Stellar/Soroban**, enabling users to deposit, borrow, and transact with complete financial privacy—powered by **X-Ray ZK proofs** for shielded transactions . With sub-second settlements, near-zero fees (<0.01¢), and multi-chain support, VeilLend is designed for instant, borderless DeFi.

This tool is ideal for:
- 💼 Freelancers managing cross-border payments and lending
- 🎨 Creators accepting private donations and loans
- 🌍 Individuals handling remittances with financial privacy
- 🏢 Small businesses streamlining asset management across blockchains

Whether you're a solo developer building privacy-first finance or a team scaling multi-chain DeFi, VeilLend prioritises simplicity, self-custody, and security without intermediaries.

---

## 🏗️ Architecture

VeilLend uses a modern monorepo structure for efficient development across apps and shared libraries. The structure features an `app/` parent folder containing the core application directories, with shared packages for reusability:

```
veillend/
├── app/
│   ├── backend/           # NestJS API server (relayer, indexer, multi-chain operations)
│   ├── mobile/            # React Native app (iOS/Android for on-the-go lending)
│   └── contract/          # Soroban Rust contracts (privacy/escrow/lending logic)
├── packages/
│   ├── ui/                # Shared UI components
│   └── stellar-sdk/       # Stellar utils (Horizon queries, wallet connect, ZK helpers)
├── turbo.json             # Build/dev pipelines
└── pnpm-workspace.yaml    # Workspace config
```

| Component | Tech Stack | Description |
| :--- | :--- | :--- |
| **Smart Contracts** | **Rust/Soroban** | On-chain logic for Lending Pools, ZK Shielding, and Asset Management on Stellar. |
| **Mobile App** | **React Native (Expo)** | Cross-platform mobile wallet interface with "Privacy Mode" and multi-chain (Starknet + Stellar) SDK integration. |
| **Backend API** | **NestJS** | Relayer service, indexer, and off-chain data aggregator backed by **Supabase**, now supporting multi-chain operations. |
| **Database** | **PostgreSQL (Supabase)** | Stores encrypted user profiles, transaction history, and active positions across multiple blockchains. |

---

## 🔐 Smart Contracts (Soroban/Rust)

Located in `/app/contract`, our Soroban smart contracts power the privacy engine on Stellar:

### 1. **ZK Shielded Pool (`shielded_pool.rs`)**
- Implements **X-Ray ZK privacy** for shielded transactions (mainnet live).
- **Deposit**: Users generate a secret off-chain, hash it (SHA-256), and deposit funds with the `commitment`.
- **Withdraw**: Users provide the `secret` (nullifier) to prove ownership without revealing their identity.
- **Privacy**: The on-chain state only tracks hashed commitments, breaking the link between deposit and withdrawal.

### 2. **Lending Pool (`lending_pool.rs`)**
- Standard DeFi logic for **Supply**, **Borrow**, and **Repay**.
- Integrated with Stellar assets (XLM, USDC, etc.) and cross-chain bridging.
- Emits events for real-time indexing and analytics.

---

## 📱 Mobile App Features

### Core
- **🛡️ X-Ray Privacy Dashboard**: Toggle "Privacy Mode" to mask balances and positions with zero-knowledge proofs.
- **🔑 Multi-Chain Login**: Authenticate securely using cryptographic signatures (Starknet: Argent/Braavos; Stellar: Freighter/Albedo) via multi-chain SDKs.
- **⚡ Instant Actions**: One-tap Deposit, Borrow, and Repay flows across multiple blockchains.
- **🔄 Real-time Updates**: Live synchronization with on-chain data via the Backend API for all supported chains.

### Privacy & Security
- **X-Ray Privacy Toggle**: Uses ZK proofs to hide amounts/senders (mainnet live since January 22, 2026).
- **Scam Alerts**: Flags suspicious transactions (e.g., unusual patterns, missing memos).
- **Self-Custody**: Funds route directly to your wallet—no central holding.

### Advanced (v2+)
- **Multi-asset support** with auto-swap between Stellar and Starknet assets.
- **Recurring loan/repayment links** for automated financial management.
- **Fiat on/off-ramps** (MoneyGram, Banxa) for seamless fiat-to-crypto conversion.
- **Notifications** (email/Telegram) for transaction confirmations and alerts.

---

## 🚀 Getting Started

### Prerequisites
- **Node.js** (v18+; nodejs.org)
- **pnpm** (for monorepo management; install via `npm install -g pnpm`)
- **Rust toolchain** (for Soroban contracts; install via rustup.rs)
- **Soroban CLI** (for contract deployment; `cargo install --locked soroban-cli`)
- **Docker** (for local Stellar network; docker.com)
- **A Stellar wallet** (Freighter recommended; freighter.app)
- **Supabase account** (free tier; supabase.com)
- **Git** (for cloning)
- **Expo Go** (for mobile testing)

### Installation
Clone the repository:

```bash
git clone https://github.com/your-org/veillend.git
cd veillend

# Install dependencies across the monorepo
pnpm install
```

### Environment Setup
Create a Supabase project and retrieve your `SUPABASE_URL` and `SUPABASE_ANON_KEY` from the dashboard.

Copy `.env.example` to `.env.local` in the root directory and populate it:
```
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
NEXT_PUBLIC_STELLAR_NETWORK=testnet  # Use 'mainnet' for production
```

Configure the Stellar network:
- **Development**: Defaults to testnet; fund your wallet at laboratory.stellar.org
- **Production**: Set to mainnet in `.env.local` and ensure your wallet holds real assets

For contracts: Add environment variables to `app/contract/.env` (e.g., `STELLAR_NETWORK=testnet`).

### Running Locally
Launch all services using TurboRepo:

```bash
pnpm turbo run dev
```

This starts the backend (app/backend), prepares contracts/mobile, and serves the frontend.

Access the web app at http://localhost:3000.

For the mobile app:
```bash
cd app/mobile && npx react-native run-ios  # or run-android
```

For contracts (testing/deploying):
```bash
cd app/contract && cargo test  # Run unit tests
# Deploy to testnet: Use Soroban CLI as per Soroban docs
```

Connect your wallet in the app to claim a username and test features.

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
2. **Pick an Issue**: Check GitHub issues labeled `good-first-issue`, `soroban`, or `privacy`
3. **Contribute**: Implement features, fix bugs, or improve documentation
4. **Submit**: Create a PR with tests and documentation updates

### Monorepo Best Practices:
- Use `pnpm turbo run build` to validate changes across packages
- Update shared packages (`packages/ui` or `packages/stellar-sdk`) only when needed, and bump versions
- Run `pnpm turbo run lint --filter=...` for targeted checks (e.g., `--filter=app/frontend`)

### Testing
Run tests to validate code quality and functionality:

```bash
# Lint and type-check the entire monorepo
pnpm turbo run lint
pnpm turbo run type-check

# Execute end-to-end tests
pnpm turbo run test:e2e

# Mobile-specific tests
cd app/mobile && npm test
```

Tests require a testnet wallet; detailed setup is in `TESTING.md`.

### Deployment
Deployment is automated for most components:

- **Frontend and Backend**: Connect to Vercel via dashboard, add environment variables
- **Mobile**: Use Expo CLI for over-the-air updates or app store builds
- **Contracts**: Build and deploy via CI/CD (GitHub Actions in `app/contract`)

### Contributing
Contributions are welcome and encouraged to help evolve VeilLend! To get started:

- **Report Issues**: Use GitHub Issues for bugs or feature requests. Include reproduction steps, environment details, and screenshots where possible.
- **Propose Features**: Start a Discussion thread to align on ideas before coding.
- **Submit Pull Requests**:
  - Fork the repository and create a feature branch: `git checkout -b feature/your-feature`
  - Implement changes, ensuring they pass linting and tests
  - Commit with clear messages (e.g., "feat: add multi-asset swap support")
  - Push and open a PR against `main`. Reference any related issues.

All contributors must adhere to the Code of Conduct and sign off commits for DCO compliance.

### Resources:
- [Soroban Documentation](https://soroban.stellar.org/docs)
- [Stellar Developer Docs](https://developers.stellar.org/docs)
- [VeilLend Migration Guide](veilend_contracts/docs/migration/contract-mapping.md)
- [Drips Contributor Program](https://drips.network/contributors)
- [Stellar Discord](https://discord.gg/stellardev)

**Ready to contribute?** Start with the `veilend_hello` contract in `/app/contract` and help us build the future of private lending on Stellar! 🌟
