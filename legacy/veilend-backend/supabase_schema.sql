-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Users Table
create table if not exists users (
  id uuid default uuid_generate_v4() primary key,
  address text unique not null,
  username text,
  avatar_url text,
  nonce text,
  nonce_expires_at timestamp with time zone,
  balance numeric default 12500.50,
  collateral_value numeric default 8000.00,
  borrowed_value numeric default 1000.00,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Transactions Table
create table if not exists transactions (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references users(id) on delete cascade,
  type text, -- 'deposit', 'borrow', 'repay'
  amount numeric,
  title text,
  icon text,
  value text, -- formatted string e.g. "+$500.00"
  date text, -- formatted date e.g. "Today, 10:23 AM"
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Positions Table (Active Loans/Supplies)
create table if not exists positions (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references users(id) on delete cascade,
  asset text, -- 'ETH', 'USDC'
  type text, -- 'Borrowed', 'Supplied'
  amount numeric,
  value numeric,
  health_factor numeric,
  interest_accrued numeric,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS (Optional but recommended, though backend bypasses it with service key)
alter table users enable row level security;
alter table transactions enable row level security;
alter table positions enable row level security;

-- Create policies (if you plan to use Supabase Client on frontend directly, otherwise backend handles it)
