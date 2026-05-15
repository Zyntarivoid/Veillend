# VeilLend Soroban Contracts

This directory contains Soroban smart contracts for the VeilLend protocol on the Stellar network.

## Getting Started

### Prerequisites
- Rust toolchain (1.76.0+)
- Soroban CLI (21.0.0+)
- Docker (for local network)

### Installation
```bash
# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source $HOME/.cargo/env
rustup target add wasm32-unknown-unknown

# Install Soroban CLI
cargo install --locked soroban-cli

# Install Docker
curl -fsSL https://get.docker.com | sh
```

### Building
```bash
cd veilend_hello
soroban contract build
```

### Testing
```bash
cargo test
```

## Contracts
- `veilend_hello`: Hello World contract for testing and development
- `lending_pool`: Core lending logic (deposit, borrow, repay, withdraw)
- `shielded_pool`: Privacy-preserving transactions with ZK proofs
- `price_oracle`: Asset price feeds with staleness detection
- `reserve_data`: Reserve configuration and state management
- `interest_token`: Interest-bearing tokens (aTokens)
- `addresses_provider`: Central registry for all contracts

## Development Workflow
1. Write Code → src/lib.rs
2. Format & Lint → cargo fmt && cargo clippy
3. Run Tests → cargo test
4. Build WASM → soroban contract build
5. Deploy to Local → soroban contract deploy --network local
6. Test Manually → soroban contract invoke
7. Deploy to Testnet → soroban contract deploy --network testnet

## Documentation
- [Soroban Documentation](https://soroban.stellar.org/docs)
- [Stellar Developer Docs](https://developers.stellar.org/docs)
- [VeilLend Migration Guide](../veilend_contracts/docs/migration/contract-mapping.md)
