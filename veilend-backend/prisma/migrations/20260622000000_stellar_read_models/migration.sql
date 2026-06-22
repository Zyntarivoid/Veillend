CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE transaction_type AS ENUM ('deposit', 'borrow', 'repay', 'withdraw');

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT NOT NULL UNIQUE,
  profile_name TEXT,
  privacy_mode BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE wallet_nonces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT NOT NULL,
  nonce TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT wallet_nonces_wallet_address_fkey
    FOREIGN KEY (wallet_address)
    REFERENCES users(wallet_address)
    ON DELETE CASCADE
);

CREATE INDEX wallet_nonces_wallet_address_idx ON wallet_nonces(wallet_address);
CREATE INDEX wallet_nonces_expires_at_used_idx ON wallet_nonces(expires_at, used);

CREATE TABLE supported_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_address TEXT NOT NULL UNIQUE,
  asset_code TEXT,
  asset_issuer TEXT,
  symbol TEXT,
  decimals INTEGER NOT NULL DEFAULT 7,
  supported BOOLEAN NOT NULL DEFAULT true,
  collateral_factor_bps INTEGER NOT NULL DEFAULT 0,
  borrow_factor_bps INTEGER NOT NULL DEFAULT 0,
  liquidation_threshold_bps INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX supported_assets_supported_idx ON supported_assets(supported);

CREATE TABLE positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_address TEXT NOT NULL,
  asset_address TEXT NOT NULL,
  deposited NUMERIC(39, 0) NOT NULL DEFAULT 0,
  borrowed NUMERIC(39, 0) NOT NULL DEFAULT 0,
  last_ledger BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT positions_user_address_asset_address_key UNIQUE (user_address, asset_address),
  CONSTRAINT positions_user_address_fkey
    FOREIGN KEY (user_address)
    REFERENCES users(wallet_address)
    ON DELETE CASCADE,
  CONSTRAINT positions_asset_address_fkey
    FOREIGN KEY (asset_address)
    REFERENCES supported_assets(asset_address)
);

CREATE INDEX positions_user_address_idx ON positions(user_address);
CREATE INDEX positions_asset_address_idx ON positions(asset_address);

CREATE TABLE transactions (
  id TEXT PRIMARY KEY,
  user_address TEXT NOT NULL,
  asset_address TEXT NOT NULL,
  type transaction_type NOT NULL,
  amount NUMERIC(39, 0) NOT NULL,
  ledger BIGINT NOT NULL,
  tx_hash TEXT NOT NULL UNIQUE,
  timestamp TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT transactions_user_address_fkey
    FOREIGN KEY (user_address)
    REFERENCES users(wallet_address)
    ON DELETE CASCADE,
  CONSTRAINT transactions_asset_address_fkey
    FOREIGN KEY (asset_address)
    REFERENCES supported_assets(asset_address)
);

CREATE INDEX transactions_user_address_timestamp_idx ON transactions(user_address, timestamp);
CREATE INDEX transactions_asset_address_timestamp_idx ON transactions(asset_address, timestamp);
CREATE INDEX transactions_type_timestamp_idx ON transactions(type, timestamp);

CREATE TABLE sync_checkpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL UNIQUE,
  last_indexed_ledger BIGINT NOT NULL DEFAULT 0,
  cursor TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
