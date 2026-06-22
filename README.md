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

VeilLend is currently organized around the active Stellar contract and mobile app workspaces, with older implementation work archived under `legacy/` for reference:

```
veillend/
├── veilend-soroban/       # Active Soroban Rust contract workspace for VeilLend on Stellar
├── veilend-mobile/        # Active React Native / Expo mobile app
├── veilend-web/           # Active Next.js 16 web application
├── legacy/
│   ├── veilend-backend/   # Archived NestJS backend from the previous architecture
│   └── docs/              # Archived migration notes and contributor docs
└── README.md
```

| Component | Tech Stack | Description |
| :--- | :--- | :--- |
| **Smart Contracts** | **Rust/Soroban** | Initial VeilLend contract scaffold for lending state, asset configuration, and event emission on Stellar. |
| **Mobile App** | **React Native (Expo)** | Cross-platform mobile experience for deposit, borrow, repay, privacy mode, and wallet-driven onboarding. |
| **Web App** | **Next.js 16 / TypeScript** | Privacy-first web interface for VeilLend on Stellar, with App Router, Tailwind CSS, and full TypeScript support. |
| **Backend API** | **Planned Rebuild** | The backend is being rebuilt for the Stellar ecosystem; the previous NestJS version is archived in `legacy/veilend-backend`. |
| **Archived Research** | **Markdown / Notes** | Migration notes and previous contributor docs are preserved in `legacy/docs`. |

---

## 🔐 Smart Contracts (Soroban/Rust)

Located in `/veilend-soroban`, the current Soroban codebase is the new VeilLend contract foundation on Stellar.

### Current contract foundation
- Initializes the contract with an admin and minimum collateral ratio.
- Tracks supported assets for lending actions.
- Stores per-user positions with deposited and borrowed balances.
- Exposes basic `deposit`, `borrow`, `repay`, and `withdraw` state transitions.
- Emits events for indexing and analytics.
- **Oracle-backed collateral valuation** using configurable asset prices for accurate borrowing power calculations.

### Planned next layer
- Stellar token transfer integration for real asset movement.
- Liquidation rules based on oracle price thresholds.
- Shielded commitment/nullifier flows for privacy-preserving actions.
- Additional testing, security review, and deployment automation.

---

## ⚠️ Error Reference

All contract errors are typed via `VeilLendError` (`#[contracterror]`, `#[repr(u32)]`). Each variant maps to a unique `u32` code that client integrators can match on.

| Variant | Code | When it fires |
|---------|------|---------------|
| `AlreadyInitialized` | 1 | `__constructor` called when admin is already set |
| `Unauthorized` | 2 | Non-admin caller on admin-only functions (`configure_asset`, `set_oracle_price`) |
| `UnsupportedAsset` | 3 | Operation on an asset not yet configured via `configure_asset` |
| `InvalidAmount` | 4 | Negative amount passed to `deposit`, `borrow`, `repay`, `withdraw` |
| `InsufficientCollateral` | 5 | `borrow` or `withdraw` would push collateral ratio below minimum |
| `InsufficientDeposit` | 6 | `withdraw` amount exceeds user's deposited balance |
| `RepayTooLarge` | 7 | `repay` amount exceeds user's outstanding borrowed balance |
| `InvalidCollateralRatio` | 8 | `__constructor` called with `min_collateral_ratio_bps < 10_000` (< 100%) |
| `NotInitialized` | 9 | Any function requiring admin called before `__constructor` |
| `ZeroAmount` | 10 | Zero amount passed to `deposit`, `borrow`, `repay`, `withdraw` |
| `OraclePriceMissing` | 11 | `borrow` or `withdraw` on an asset without a configured oracle price |
| `ContractPaused` | 12 | Any state-changing function called while contract is paused |

### Error handling notes
- Zero and negative amounts produce **different** errors (`ZeroAmount` vs `InvalidAmount`) so clients can distinguish them.
- Oracle price missing is a **hard error** (not a silent default) — borrow/withdraw will fail explicitly if no price is set.
- `NotInitialized` and `Unauthorized` are distinct: the first means "contract not set up yet", the second means "you are not the admin".

---

## 📱 Mobile App Features

### Core
- **🛡️ X-Ray Privacy Dashboard**: Toggle "Privacy Mode" to mask balances and positions with zero-knowledge proofs.
- **🔑 Wallet Login**: Authenticate securely using cryptographic signatures and wallet-based onboarding.
- **⚡ Instant Actions**: One-tap Deposit, Borrow, and Repay flows across multiple blockchains.
- **🔄 Rebuild-Friendly Architecture**: The app is being prepared for a new Stellar-native backend and contributor-driven implementation.

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
- **Rust toolchain** (for Soroban contracts; install via rustup.rs)
- **Stellar CLI** (for contract deployment; on Ubuntu install `pkg-config`, `libdbus-1-dev`, and `libudev-dev` first, then run `cargo install --locked stellar-cli --version 23.0.1`)
- **Docker** (for local Stellar network; docker.com)
- **A Stellar wallet** (Freighter recommended; freighter.app)
- **Git** (for cloning)
- **Expo Go** (for mobile testing)

### Installation
Clone the repository:

```bash
git clone https://github.com/your-org/veillend.git
cd veillend

# Install mobile dependencies
cd veilend-mobile && npm install
```

### Environment Setup
Configure the Stellar network:
- **Development**: Defaults to testnet; fund your wallet at laboratory.stellar.org
- **Production**: Ensure your wallet holds the required live assets and network configuration

For contracts: Add environment variables in the `veilend-soroban/` workspace as needed for your target Stellar network and deployment flow.

### Running Locally
Start the mobile app from its workspace:

```bash
cd veilend-mobile && npm install && npx expo start
```

For contracts (testing/deploying):
```bash
cd veilend-soroban
cargo build --target wasm32-unknown-unknown --release
stellar contract build
```

The previous backend and migration documents remain available under `legacy/` while the new Stellar-native backend is rebuilt.

---

## 🛠️ Tech Deep Dive: ZK Privacy Flow (Stellar)

1.  **Client-Side**: User selects a privacy-enabled lending action from the mobile app.
2.  **Preparation**: The app prepares lending inputs and any privacy metadata needed for the action.
3.  **On-Chain**: The Soroban contract records the position update and emits events for indexing.
4.  **Off-Chain Services**: A new Stellar-native backend will eventually sync positions and transaction history for the app experience.
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
2. **Pick an Issue**: Check GitHub issues labeled `good-first-issue`, `soroban`, `mobile`, or `privacy`
3. **Contribute**: Implement features, fix bugs, or help shape the new Stellar-native backend
4. **Submit**: Create a PR with tests and documentation updates

### Testing
Run tests to validate code quality and functionality:

```bash
# Soroban contract checks
cd veilend-soroban && cargo build --locked --target wasm32-unknown-unknown --release

# Mobile-specific tests
cd veilend-mobile && npm test
```

### Deployment
Deployment is automated for most components:

- **Mobile**: Use Expo CLI for over-the-air updates or app store builds
- **Contracts**: Build and deploy from the `veilend-soroban/` workspace using Cargo and Stellar CLI
- **Backend**: The new Stellar-native backend will be introduced after the archived implementation is replaced

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
- Archived research: `legacy/docs`
- [Drips Contributor Program](https://drips.network/contributors)
- [Stellar Discord](https://discord.gg/stellardev)

**Ready to contribute?** Start with the VeilLend Soroban contract in `/veilend-soroban` and help us build the future of private lending on Stellar! 🌟
