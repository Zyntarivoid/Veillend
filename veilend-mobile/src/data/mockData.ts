export const MOCK_USER = {
  name: "Kristin Watson",
  balance: 12692.00,
  cardNumber: "5440 1234 **** 6578",
  totalExpenses: 2364.00,
  monthlyChange: 472.65,
};

export const MOCK_ASSETS = [
  {
    id: 'xlm',
    name: 'Stellar Lumens',
    symbol: 'XLM',
    icon: 'star', // Ionicons name
    balance: 15000,
    price: 0.12,
    apy: 4.2,
    collateralFactor: 75,
  },
  {
    id: 'usdc',
    name: 'USDC',
    symbol: 'USDC',
    icon: 'logo-usd', // Ionicons name
    balance: 5000,
    price: 1,
    apy: 5.2,
    collateralFactor: 90,
  },
  {
    id: 'blnd',
    name: 'Blend',
    symbol: 'BLND',
    icon: 'layers', // Ionicons name
    balance: 10000,
    price: 1.5,
    apy: 12.0,
    collateralFactor: 70,
  },
];

export const MOCK_TRANSACTIONS = [
  {
    id: '1',
    type: 'deposit',
    title: 'Deposited XLM',
    amount: '15,000 XLM',
    value: '$1,800.00',
    date: '01:11 PM, Today',
    icon: 'arrow-down',
  },
  {
    id: '2',
    type: 'borrow',
    title: 'Borrowed USDC',
    amount: '1,000 USDC',
    value: '$1,000.00',
    date: '10:00 AM, Yesterday',
    icon: 'cash',
  },
  {
    id: '3',
    type: 'repay',
    title: 'Repaid BLND',
    amount: '500 BLND',
    value: '$750.00',
    date: '09:30 AM, Yesterday',
    icon: 'arrow-up',
  },
];

export const MOCK_POSITIONS = [
  {
    id: 'pos1',
    asset: 'XLM',
    type: 'Collateral',
    amount: 15000,
    value: 1800,
    status: 'Healthy',
    healthFactor: 1.8,
  },
  {
    id: 'pos2',
    asset: 'USDC',
    type: 'Borrowed',
    amount: 1000,
    value: 1000,
    status: 'Active',
    healthFactor: 1.8,
  },
];
