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

VeilLend is currently organized as a multi-part repository with separate mobile, backend, and Soroban contract workspaces:

```
veillend/
├── veilend-soroban/       # Active Soroban Rust contract workspace for VeilLend on Stellar
├── veilend-backend/       # NestJS API server and indexing layer
├── veilend-mobile/        # React Native / Expo mobile app
├── docs/                  # Contributor and migration notes
└── README.md
```

| Component | Tech Stack | Description |
| :--- | :--- | :--- |
| **Smart Contracts** | **Rust/Soroban** | Initial VeilLend contract scaffold for lending state, asset configuration, and event emission on Stellar. |
| **Mobile App** | **React Native (Expo)** | Cross-platform mobile experience for deposit, borrow, repay, privacy mode, and wallet-driven onboarding. |
| **Backend API** | **NestJS** | API, indexing, and off-chain data services backed by **Supabase**. |
| **Database** | **PostgreSQL (Supabase)** | Stores user profiles, transaction history, and active positions. |

---

## 🔐 Smart Contracts (Soroban/Rust)

Located in `/veilend-soroban`, the current Soroban codebase is the new VeilLend contract foundation on Stellar.

### Current contract foundation
- Initializes the contract with an admin and minimum collateral ratio.
- Tracks supported assets for lending actions.
- Stores per-user positions with deposited and borrowed balances.
- Exposes basic `deposit`, `borrow`, `repay`, and `withdraw` state transitions.
- Emits events for indexing and analytics.

### Planned next layer
- Stellar token transfer integration for real asset movement.
- Oracle-backed collateral valuation and liquidation rules.
- Shielded commitment/nullifier flows for privacy-preserving actions.
- Additional testing, security review, and deployment automation.

---

## 📱 Mobile App Features

### Core
- **🛡️ X-Ray Privacy Dashboard**: Toggle "Privacy Mode" to mask balances and positions with zero-knowledge proofs.
- **🔑 Wallet Login**: Authenticate securely using cryptographic signatures and wallet-based onboarding.
- **⚡ Instant Actions**: One-tap Deposit, Borrow, and Repay flows across multiple blockchains.
- **🔄 Real-time Updates**: Live synchronization with on-chain data via the Backend API for all supported chains.

### Privacy & Security
- **X-Ray Privacy Toggle**: Designed to hide sensitive balances and activity as the privacy layer is integrated.
- **Scam Alerts**: Flags suspicious transactions (e.g., unusual patterns, missing memos).
- **Self-Custody**: Funds route directly to your wallet—no central holding.

### Advanced (v2+)
- **Multi-asset support** with future expansion across Stellar-native and interoperable assets.
- **Recurring loan/repayment links** for automated financial management.
- **Fiat on/off-ramps** (MoneyGram, Banxa) for seamless fiat-to-crypto conversion.
- **Notifications** (email/Telegram) for transaction confirmations and alerts.

---

## 🚀 Getting Started

### Prerequisites
- **Node.js** (v18+; nodejs.org)
- **pnpm** (for monorepo management; install via `npm install -g pnpm`)
- **Rust toolchain** (for Soroban contracts; install via rustup.rs)
- **Stellar CLI** (for contract deployment; `cargo install --locked stellar-cli --features opt`)
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

For contracts: Add environment variables in the `veilend-soroban/` workspace as needed for your target Stellar network and deployment flow.

### Running Locally
Launch the backend and mobile workspaces from their respective directories:

```bash
cd veilend-backend && npm install && npm run start:dev
```

In a separate terminal, start the mobile app:

```bash
cd veilend-mobile && npm install && npx expo start
```

Access the web app at http://localhost:3000.

For the mobile app:
```bash
cd veilend-mobile && npx expo start
```

For contracts (testing/deploying):
```bash
cd veilend-soroban
cargo build --target wasm32-unknown-unknown --release
stellar contract build
```

Connect your wallet in the app to claim a username and test features.

---

## 🛠️ Tech Deep Dive: ZK Privacy Flow (Stellar)

1.  **Client-Side**: User selects a privacy-enabled lending action from the mobile app.
2.  **Preparation**: The app prepares lending inputs and any privacy metadata needed for the action.
3.  **On-Chain**: The Soroban contract records the position update and emits events for indexing.
4.  **Off-Chain Services**: The backend syncs positions and transaction history for the app experience.
5.  **Future Privacy Layer**: Shielded commitments and proof verification will extend this flow in later releases.

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
- **Contracts**: Build and deploy from the `veilend-soroban/` workspace using Cargo and Stellar CLI

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

**Ready to contribute?** Start with the VeilLend Soroban contract in `/veilend-soroban` and help us build the future of private lending on Stellar! 🌟
