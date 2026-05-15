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
