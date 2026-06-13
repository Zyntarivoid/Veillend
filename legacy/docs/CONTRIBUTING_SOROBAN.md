# VeilLend: Soroban Developer Onboarding Guide

> **Step-by-step guide for setting up your local Soroban development environment**

**Last Updated:** May 2026  
**Difficulty:** Beginner to Intermediate  
**Estimated Setup Time:** 30-45 minutes

---

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Installation Guide](#installation-guide)
   - [Step 1: Install Rust](#step-1-install-rust)
   - [Step 2: Install Soroban CLI](#step-2-install-soroban-cli)
   - [Step 3: Install Docker (Local Network)](#step-3-install-docker-local-network)
   - [Step 4: Verify Installation](#step-4-verify-installation)
4. [Hello World: VeilLend Project Structure](#hello-world-veillend-project-structure)
5. [Essential VS Code Extensions](#essential-vs-code-extensions)
6. [Development Tools & Workflow](#development-tools--workflow)
7. [Quick Start: Build & Test](#quick-start-build--test)
8. [Common Issues & Troubleshooting](#common-issues--troubleshooting)
9. [Next Steps](#next-steps)
10. [Additional Resources](#additional-resources)

---

## Overview

This guide helps new contributors set up a complete Soroban development environment for the VeilLend project. VeilLend is a privacy-first decentralized lending protocol that currently runs on Starknet and is expanding to Stellar/Soroban.

### What is Soroban?

**Soroban** is Stellar's smart contract platform that allows developers to write decentralized applications using **Rust**. Key features:

- ✅ **Rust-based**: Write smart contracts in a memory-safe, high-performance language
- ✅ **WASM compilation**: Contracts compile to WebAssembly for efficient execution
- ✅ **Cross-platform**: Deploy on Stellar testnet, mainnet, or local sandbox
- ✅ **Rich tooling**: CLI tools, local network, and testing frameworks

### VeilLend Architecture (Stellar)

VeilLend on Stellar will implement:

| Component             | Description                                           | Status     |
| --------------------- | ----------------------------------------------------- | ---------- |
| **LendingPool**       | Core lending logic (deposit, borrow, repay, withdraw) | 📋 Planned |
| **ShieldedPool**      | Privacy-preserving transactions with ZK proofs        | 📋 Planned |
| **PriceOracle**       | Asset price feeds with staleness detection            | 📋 Planned |
| **ReserveData**       | Reserve configuration and state management            | 📋 Planned |
| **InterestToken**     | Interest-bearing tokens (aTokens)                     | 📋 Planned |
| **AddressesProvider** | Central registry for all contracts                    | 📋 Planned |

**📖 Migration Reference:** See `docs/migration/contract-mapping.md` for detailed Starknet → Soroban migration patterns.

---

## ✅ Prerequisites

Before starting, ensure you have:

- **Operating System:** macOS, Linux, or Windows (WSL2 recommended)
- **Disk Space:** At least 5 GB free (Rust toolchain + Docker images)
- **Internet Connection:** Required for downloading dependencies
- **Terminal Access:** Basic command-line knowledge
- **Git:** Version control system

---

## 🛠️ Installation Guide

### Step 1: Install Rust

Soroban contracts are written in Rust. We'll install the Rust toolchain using `rustup`.

#### macOS / Linux

```bash
# Install Rust using rustup
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Follow the prompts (choose option 1 for default installation)

# Load Rust environment into current shell
source $HOME/.cargo/env

# Verify installation
rustc --version
cargo --version
```

#### Windows

1. Download the installer from https://rustup.rs
2. Run the installer and follow the prompts
3. Open a new terminal and verify:

```bash
rustc --version
cargo --version
```

#### Configure Rust for Soroban

```bash
# Install the wasm32-unknown-unknown target (required for WASM compilation)
rustup target add wasm32-unknown-unknown

# Update to latest stable version
rustup update stable
```

**Expected Output:**

```
rustc 1.76.0 (or higher)
cargo 1.76.0 (or higher)
```

---

### Step 2: Install Soroban CLI

The Soroban CLI (`soroban`) is the primary tool for building, deploying, and interacting with contracts.

#### Option A: Install via Cargo (Recommended)

```bash
# Install the latest stable version
cargo install --locked soroban-cli

# Verify installation
soroban --version
```

#### Option B: Install via Homebrew (macOS)

```bash
# Add Stellar tap
brew tap stellar/tap

# Install Soroban CLI
brew install soroban-cli

# Verify installation
soroban --version
```

#### Option C: Install from Source

```bash
# Clone the repository
git clone https://github.com/stellar/stellar-cli.git
cd stellar-cli

# Build and install
cargo install --locked --path .

# Verify installation
soroban --version
```

**Expected Output:**

```
soroban 21.0.0 (or higher)
```

#### Configure Soroban CLI

```bash
# Add Stellar testnet network
soroban network add \
  testnet \
  --rpc-url https://soroban-testnet.stellar.org \
  --network-passphrase "Test SDF Network ; September 2015"

# Add Stellar mainnet network
soroban network add \
  public \
  --rpc-url https://soroban-mainnet.stellar.org \
  --network-passphrase "Public Global Stellar Network ; September 2015"

# Create a test account (for development)
soroban keys generate alice --network testnet

# Fund the account with testnet lumens (XLM)
soroban keys fund alice --network testnet

# Check account balance
soroban keys balance alice --network testnet
```

---

### Step 3: Install Docker (Local Network)

Docker enables you to run a local Stellar network for fast, offline development and testing.

#### macOS

```bash
# Install Docker Desktop
brew install --cask docker

# Start Docker Desktop from Applications
open -a Docker

# Verify installation
docker --version
docker compose version
```

#### Linux (Ubuntu/Debian)

```bash
# Install Docker Engine
curl -fsSL https://get.docker.com | sh

# Add your user to the docker group (avoid using sudo)
sudo usermod -aG docker $USER

# Apply group changes (or log out and back in)
newgrp docker

# Start Docker service
sudo systemctl enable docker
sudo systemctl start docker

# Verify installation
docker --version
docker compose version
```

#### Windows

1. Download Docker Desktop from https://www.docker.com/products/docker-desktop
2. Run the installer and follow the prompts
3. Enable WSL2 backend during installation
4. Restart your computer
5. Verify:

```bash
docker --version
docker compose version
```

#### Run Local Stellar Network

```bash
# Pull the Stellar quickstart image (first time only, ~2GB)
docker pull stellar/quickstart:testing

# Start local network
docker run --rm -it \
  -p 8000:8000 \
  -p 5432:5432 \
  stellar/quickstart:testing \
  --standalone \
  --enable-soroban-rpc

# The network is ready when you see:
# "soroban rpc: listening on port 8000"
```

**Network Endpoints:**

- **RPC URL:** `http://localhost:8000/soroban/rpc`
- **Horizon URL:** `http://localhost:8000`
- **Network Passphrase:** `Standalone Network ; February 2017`

#### Configure Soroban for Local Network

```bash
# Add local network to Soroban CLI
soroban network add \
  local \
  --rpc-url http://localhost:8000/soroban/rpc \
  --network-passphrase "Standalone Network ; February 2017"

# Generate a local account
soroban keys generate bob --network local

# Fund the account (local network has unlimited XLM)
soroban keys fund bob --network local

# Check balance
soroban keys balance bob --network local
```

---

### Step 4: Verify Installation

Run this comprehensive check to ensure everything is working:

```bash
# Create a verification script
cat << 'EOF' > verify_setup.sh
#!/bin/bash

echo "🔍 Verifying Soroban Development Environment..."
echo ""

# Check Rust
echo "✓ Rust Toolchain:"
rustc --version
cargo --version
rustup target list --installed | grep wasm32
echo ""

# Check Soroban CLI
echo "✓ Soroban CLI:"
soroban --version
echo ""

# Check Docker
echo "✓ Docker:"
docker --version
docker compose version
echo ""

# Check local network
echo "✓ Local Network Connection:"
soroban network ls
echo ""

# Check test account
echo "✓ Test Account Balance:"
soroban keys balance alice --network testnet 2>/dev/null || echo "  Account not funded yet. Run: soroban keys fund alice --network testnet"
echo ""

echo "✅ Setup verification complete!"
EOF

chmod +x verify_setup.sh
./verify_setup.sh
```

---

## 👋 Hello World: VeilLend Project Structure

Let's create a simple Soroban contract following VeilLend's project structure.

### 1. Navigate to Contracts Directory

```bash
cd /path/to/veillend

# Create Soroban contracts directory (if it doesn't exist)
mkdir -p veilend-soroban
cd veilend-soroban
```

### 2. Initialize a New Soroban Project

```bash
# Create a new contract using the official template
soroban contract init veilend_hello
cd veilend_hello
```

**Project Structure:**

```
veilend_hello/
├── Cargo.toml          # Rust dependencies
├── src/
│   ├── lib.rs          # Contract entry point
│   └── main.rs         # Test harness
└── tests/
    └── test.rs         # Integration tests
```

### 3. Understand the Contract Structure

Let's examine the generated files:

#### `Cargo.toml`

```toml
[package]
name = "veilend_hello"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]
doctest = false

[dependencies]
soroban-sdk = { version = "21.0.0" }

[dev-dependencies]
soroban-sdk = { version = "21.0.0", features = ["testutils"] }
```

#### `src/lib.rs`

```rust
use soroban_sdk::{contract, contractimpl, contractclient, symbol_short, Env, Symbol, Address};

#[contract]
pub struct VeilLendHelloContract;

#[contractimpl]
impl VeilLendHelloContract {
    /// Initialize the contract with an admin address
    pub fn initialize(env: Env, admin: Address) {
        admin.require_auth();
        env.storage().instance().set(&symbol_short!("admin"), &admin);
    }

    /// Get the admin address
    pub fn get_admin(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&symbol_short!("admin"))
            .expect("Contract not initialized")
    }

    /// Simple hello function
    pub fn hello(env: Env, user: Address) -> Symbol {
        user.require_auth();
        symbol_short!("Hello!")
    }
}

// Generate a client for testing
#[contractclient(name = "VeilLendHelloClient")]
impl VeilLendHelloContract;
```

### 4. Write Tests

#### `tests/test.rs`

```rust
#![cfg(test)]

use soroban_sdk::{testutils::Address as _, Env, Address};
use veilend_hello::*;

#[test]
fn test_initialize() {
    let env = Env::default();
    let contract_id = env.register(VeilLendHelloContract, ());
    let client = VeilLendHelloClient::new(&env, &contract_id);

    let admin = Address::generate(&env);

    // Initialize with admin
    env.mock_all_auths();
    client.initialize(&admin);

    // Verify admin is set
    assert_eq!(client.get_admin(), admin);
}

#[test]
fn test_hello() {
    let env = Env::default();
    let contract_id = env.register(VeilLendHelloContract, ());
    let client = VeilLendHelloClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    env.mock_all_auths();
    client.initialize(&admin);

    let user = Address::generate(&env);
    let result = client.hello(&user);

    assert_eq!(result, symbol_short!("Hello!"));
}
```

### 5. Build the Contract

```bash
# Build the contract (compiles to WASM)
soroban contract build

# Output will be in:
# target/wasm32-unknown-unknown/release/veilend_hello.wasm
```

### 6. Deploy to Local Network

```bash
# Ensure local network is running (see Step 3)

# Deploy the contract
soroban contract deploy \
  --wasm target/wasm32-unknown-unknown/release/veilend_hello.wasm \
  --source bob \
  --network local

# This will output a contract ID (save it!)
# Example: CDZQYNS4K7QZ3VQXJ2X5G3JZQZ3VQXJ2X5G3JZQZ3VQXJ2X5G3JZQA
```

### 7. Invoke the Contract

```bash
# Set your contract ID
export CONTRACT_ID="your_contract_id_here"

# Initialize the contract
soroban contract invoke \
  --id $CONTRACT_ID \
  --source bob \
  --network local \
  -- \
  initialize \
  --admin bob

# Call hello function
soroban contract invoke \
  --id $CONTRACT_ID \
  --source bob \
  --network local \
  -- \
  hello \
  --user bob

# Get admin address
soroban contract invoke \
  --id $CONTRACT_ID \
  --source bob \
  --network local \
  -- \
  get_admin
```

### 8. Run Tests

```bash
# Run all tests
cargo test

# Run specific test
cargo test test_initialize

# Run with output
cargo test -- --nocapture
```

---

## 💻 Essential VS Code Extensions

Visual Studio Code is the recommended IDE for Soroban development. Install these extensions:

### Required Extensions

| Extension            | Publisher | Purpose                                          | Install Command                        |
| -------------------- | --------- | ------------------------------------------------ | -------------------------------------- |
| **rust-analyzer**    | rust-lang | Rust language server (autocomplete, diagnostics) | `ext install rust-lang.rust-analyzer`  |
| **Even Better TOML** | tamasfe   | TOML file syntax highlighting                    | `ext install tamasfe.even-better-toml` |
| **CodeLLDB**         | vadimcn   | Debugger for Rust                                | `ext install vadimcn.vscode-lldb`      |

### Recommended Extensions

| Extension             | Publisher  | Purpose                   | Install Command                         |
| --------------------- | ---------- | ------------------------- | --------------------------------------- |
| **crates**            | serayuzgur | Manage Cargo dependencies | `ext install serayuzgur.crates`         |
| **Error Lens**        | usernamehw | Inline error highlighting | `ext install usernamehw.error-lens`     |
| **GitLens**           | eamodio    | Enhanced Git capabilities | `ext install eamodio.gitlens`           |
| **Prettier**          | esbenp     | Code formatting           | `ext install esbenp.prettier-vscode`    |
| **Soroban Contracts** | Stellar    | Soroban-specific snippets | `ext install stellar.soroban-contracts` |

### Install All Extensions at Once

Create a `.vscode/extensions.json` file in your workspace:

```json
{
  "recommendations": [
    "rust-lang.rust-analyzer",
    "tamasfe.even-better-toml",
    "vadimcn.vscode-lldb",
    "serayuzgur.crates",
    "usernamehw.error-lens",
    "eamodio.gitlens",
    "esbenp.prettier-vscode"
  ]
}
```

Then install with:

```bash
code --install-extension rust-lang.rust-analyzer
code --install-extension tamasfe.even-better-toml
code --install-extension vadimcn.vscode-lldb
code --install-extension serayuzgur.crates
code --install-extension usernamehw.error-lens
code --install-extension eamodio.gitlens
code --install-extension esbenp.prettier-vscode
```

### VS Code Settings

Create `.vscode/settings.json`:

```json
{
  "rust-analyzer.cargo.features": "all",
  "rust-analyzer.checkOnSave.command": "clippy",
  "rust-analyzer.procMacro.enable": true,
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "rust-lang.rust-analyzer",
  "[rust]": {
    "editor.defaultFormatter": "rust-lang.rust-analyzer"
  },
  "files.associations": {
    "*.rs": "rust"
  }
}
```

---

## 🛠️ Development Tools & Workflow

### Essential Cargo Commands

```bash
# Build contract
cargo build --target wasm32-unknown-unknown --release

# Run tests
cargo test

# Run tests with output
cargo test -- --nocapture

# Format code
cargo fmt

# Run linter
cargo clippy -- -D warnings

# Check for security issues
cargo audit

# Update dependencies
cargo update
```

### Soroban CLI Commands Reference

```bash
# Network Management
soroban network ls                    # List networks
soroban network add <name>            # Add network
soroban network remove <name>         # Remove network

# Account Management
soroban keys generate <name>          # Generate keypair
soroban keys fund <name>              # Fund account (testnet/local)
soroban keys balance <name>           # Check balance
soroban keys address <name>           # Get public key
soroban keys ls                       # List all keys
soroban keys rm <name>                # Remove key

# Contract Management
soroban contract build                # Build WASM
soroban contract deploy               # Deploy contract
soroban contract invoke               # Call contract function
soroban contract read                 # Read contract storage
soroban contract asset deploy         # Deploy SAC (Stellar Asset Contract)

# Utility
soroban lab xdr                       # XDR encoding/decoding
soroban lab token                     # Token utilities
```

### Development Workflow

```
1. Write Code → src/lib.rs
2. Format & Lint → cargo fmt && cargo clippy
3. Run Tests → cargo test
4. Build WASM → soroban contract build
5. Deploy to Local → soroban contract deploy --network local
6. Test Manually → soroban contract invoke
7. Deploy to Testnet → soroban contract deploy --network testnet
8. Verify on Explorer → https://stellar.expert/explorer/testnet/contract/<ID>
```

---

## ⚡ Quick Start: Build & Test

Here's a complete workflow to get you started:

### 1. Clone VeilLend Repository

```bash
git clone https://github.com/your-org/veillend.git
cd veillend/veilend-soroban
```

### 2. Install Dependencies

```bash
# Install Rust dependencies
cargo fetch
```

### 3. Run Existing Tests

```bash
# Run all tests
cargo test

# Expected output:
# running X tests
# test test_initialize ... ok
# test test_hello ... ok
#
# test result: ok. X passed; 0 failed; 0 ignored; 0 measured; 0 filtered out
```

### 4. Build All Contracts

```bash
soroban contract build

# Verify WASM files were created
ls -lh target/wasm32-unknown-unknown/release/*.wasm
```

### 5. Start Local Network

```bash
# In a separate terminal
docker run --rm -it \
  -p 8000:8000 \
  -p 5432:5432 \
  stellar/quickstart:testing \
  --standalone \
  --enable-soroban-rpc
```

### 6. Deploy & Test

```bash
# Setup local account
soroban keys generate dev --network local
soroban keys fund dev --network local

# Deploy contract
soroban contract deploy \
  --wasm target/wasm32-unknown-unknown/release/veilend_hello.wasm \
  --source dev \
  --network local

# Invoke functions
soroban contract invoke \
  --id <CONTRACT_ID> \
  --source dev \
  --network local \
  -- \
  initialize \
  --admin dev
```

---

## 🐛 Common Issues & Troubleshooting

### Issue 1: Rust Installation Fails

**Error:** `rustup: command not found`

**Solution:**

```bash
# Download and install rustup manually
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source $HOME/.cargo/env
```

---

### Issue 2: WASM Target Not Found

**Error:** `error[E0463]: can't find crate for core`

**Solution:**

```bash
# Install the WASM target
rustup target add wasm32-unknown-unknown

# Verify
rustup target list --installed | grep wasm32
```

---

### Issue 3: Soroban CLI Not Found

**Error:** `soroban: command not found`

**Solution:**

```bash
# Add Cargo bin directory to PATH
echo 'export PATH="$HOME/.cargo/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc

# Or reinstall
cargo install --locked soroban-cli
```

---

### Issue 4: Docker Container Won't Start

**Error:** `port is already allocated`

**Solution:**

```bash
# Find and kill process using port 8000
lsof -i :8000
kill -9 <PID>

# Or use different port
docker run --rm -it \
  -p 8001:8000 \
  stellar/quickstart:testing \
  --standalone \
  --enable-soroban-rpc
```

---

### Issue 5: Contract Deployment Fails

**Error:** `insufficient balance` or `transaction failed`

**Solution:**

```bash
# Check account balance
soroban keys balance <account> --network <network>

# Fund account (testnet)
soroban keys fund <account> --network testnet

# Fund account (local - unlimited)
soroban keys fund <account> --network local
```

---

### Issue 6: Tests Fail with Panic

**Error:** `panicked at 'called Option::unwrap() on a None value'`

**Solution:**

- Check that all storage values are initialized before reading
- Use `expect()` with descriptive error messages
- Add `env.mock_all_auths()` in tests to bypass authentication

---

### Issue 7: Contract Build Fails

**Error:** `compilation failed` or linker errors

**Solution:**

```bash
# Update Rust toolchain
rustup update

# Clean and rebuild
cargo clean
soroban contract build

# Check for dependency conflicts
cargo tree
```

---

### Issue 8: Local Network Connection Refused

**Error:** `connection refused` or `timeout`

**Solution:**

```bash
# Check if Docker container is running
docker ps | grep quickstart

# Wait for network to fully initialize (can take 30-60 seconds)
# Look for: "soroban rpc: listening on port 8000"

# Test connection
curl http://localhost:8000/soroban/rpc -X POST \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"getHealth","params":[]}'
```

---

## 🎓 Next Steps

Now that your environment is set up, here's what to do next:

### 1. Study the Migration Guide

Read the comprehensive Starknet → Soroban mapping:

```bash
cat veilend_contracts/docs/migration/contract-mapping.md
```

**Key sections:**

- Storage patterns (Cairo Maps → Soroban DataKey)
- Library equivalents (OpenZeppelin → Soroban)
- Type system mapping
- Event system mapping

### 2. Review Existing Cairo Contracts

Understand the current implementation:

```bash
ls veilend_contracts/src/contracts/
# lending_pool.cairo
# shielded_pool.cairo
# price_oracle.cairo
# reserve_data.cairo
# interest_token.cairo
# addresses_provider.cairo
```

### 3. Start with a Simple Contract

Begin porting a simple contract like `addresses_provider.cairo` to Soroban:

```bash
# Create new contract directory
cd veilend-soroban
soroban contract init addresses_provider
cd addresses_provider

# Start implementing based on migration guide
```

### 4. Join the Community

- **Discord:** [Stellar Developers](https://discord.gg/stellardev)
- **Documentation:** [Soroban Docs](https://soroban.stellar.org/docs)
- **Examples:** [Soroban Examples](https://github.com/stellar/soroban-examples)
- **Forum:** [Stellar Community Forum](https://community.stellar.org/)

### 5. Contribute to VeilLend

1. **Pick an Issue:** Check GitHub issues labeled `good-first-issue` or `soroban`
2. **Create a Branch:** `git checkout -b feature/soroban-lending-pool`
3. **Implement & Test:** Follow the development workflow above
4. **Submit a PR:** Include tests and documentation updates

---

## 📚 Additional Resources

### Official Documentation

- [Soroban Documentation](https://soroban.stellar.org/docs)
- [Stellar Developer Docs](https://developers.stellar.org/docs)
- [Soroban SDK Reference](https://docs.rs/soroban-sdk/latest/soroban_sdk/)
- [Stellar SDK JS](https://stellar.github.io/js-stellar-sdk/)

### Learning Resources

- [Soroban Examples Repository](https://github.com/stellar/soroban-examples)
  - `token` - Fungible token implementation
  - `crowdfund` - Crowdfunding contract
  - `timelock` - Timelock contract
  - `auction` - Auction contract
  - `cross_contract` - Cross-contract calls

- [Awesome Soroban](https://github.com/stellar/awesome-soroban)
- [Soroban Workshop](https://github.com/stellar/soroban-workshop)

### Tools & Libraries

| Tool                  | Description                       | Link                                       |
| --------------------- | --------------------------------- | ------------------------------------------ |
| **soroban-sdk**       | Core SDK for contract development | https://crates.io/crates/soroban-sdk       |
| **stellar-cli**       | Command-line tools                | https://github.com/stellar/stellar-cli     |
| **soroban-token-sdk** | Token helper utilities            | https://crates.io/crates/soroban-token-sdk |
| **stellar-sdk**       | JavaScript SDK for frontend       | https://github.com/stellar/js-stellar-sdk  |
| **stellar-explore**   | Block explorer                    | https://stellar.expert                     |

### Community

- **Discord:** [Stellar Developers](https://discord.gg/stellardev)
- **Stack Exchange:** [Stellar Stack Exchange](https://stellar.stackexchange.com/)
- **Reddit:** [r/stellar](https://reddit.com/r/stellar)
- **Twitter:** [@StellarOrg](https://twitter.com/StellarOrg)

### VeilLend Specific Resources

- **Project README:** `/README.md`
- **Starknet Contracts:** `/veilend_contracts/src/contracts/`
- **Migration Guide:** `/veilend_contracts/docs/migration/contract-mapping.md`
- **Backend API:** `/veilend-backend/`
- **Mobile App:** `/veilend-mobile/`

---

## 📝 Quick Reference Card

```
┌─────────────────────────────────────────────────────┐
│           SOROBAN DEVELOPMENT CHEAT SHEET           │
├─────────────────────────────────────────────────────┤
│ Install:                                            │
│   rustup target add wasm32-unknown-unknown          │
│   cargo install --locked soroban-cli                │
│                                                     │
│ Build:                                              │
│   soroban contract build                            │
│                                                     │
│ Deploy:                                             │
│   soroban contract deploy --wasm <path> --source <k>│
│                                                     │
│ Invoke:                                             │
│   soroban contract invoke --id <ID> -- --fn <name>  │
│                                                     │
│ Test:                                               │
│   cargo test                                        │
│                                                     │
│ Networks:                                           │
│   local:    http://localhost:8000/soroban/rpc       │
│   testnet:  https://soroban-testnet.stellar.org     │
│   mainnet:  https://soroban-mainnet.stellar.org     │
└─────────────────────────────────────────────────────┘
```

---

## ✅ Setup Checklist

Use this checklist to verify your environment is ready:

- [ ] Rust installed (`rustc --version`)
- [ ] WASM target installed (`rustup target list --installed | grep wasm32`)
- [ ] Soroban CLI installed (`soroban --version`)
- [ ] Docker installed (`docker --version`)
- [ ] Local network running (`docker ps | grep quickstart`)
- [ ] Testnet account created and funded
- [ ] Local account created and funded
- [ ] VS Code extensions installed
- [ ] Hello World contract built and tested
- [ ] Hello World contract deployed to local network
- [ ] Contract functions invoked successfully
- [ ] Read migration guide (`contract-mapping.md`)

---

**Welcome to the VeilLend contributor community! 🎉**

If you encounter any issues not covered here, please:

1. Check the [troubleshooting section](#common-issues--troubleshooting)
2. Search existing GitHub issues
3. Ask in the Stellar Discord
4. Open a new issue with details about your problem

Happy coding! 🚀
