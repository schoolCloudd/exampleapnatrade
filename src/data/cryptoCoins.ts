export interface CryptoCoin {
  symbol: string;
  name: string;
  network: string;
  networkFull: string;
  icon: string;
  color: string;
  addressPrefix: string;
  confirmations: number;
  avgTime: string;
  minDeposit: number;
  fee: number;
  popular?: boolean;
  depositGuide: string[];
}

export const cryptoCoins: CryptoCoin[] = [
  // Top Popular Coins
  {
    symbol: "USDT",
    name: "Tether",
    network: "TRC-20",
    networkFull: "TRON Network (TRC-20)",
    icon: "₮",
    color: "#26A17B",
    addressPrefix: "T",
    confirmations: 20,
    avgTime: "2-5 min",
    minDeposit: 10,
    fee: 1,
    popular: true,
    depositGuide: [
      "Copy the TRC-20 wallet address below",
      "Open your wallet app (Trust Wallet, Binance, etc.)",
      "Select USDT → Make sure to choose TRC-20 network",
      "Paste the address and enter amount",
      "Confirm the transaction",
      "Wait 2-5 minutes for confirmation"
    ]
  },
  {
    symbol: "BTC",
    name: "Bitcoin",
    network: "Bitcoin",
    networkFull: "Bitcoin Network (Native SegWit)",
    icon: "₿",
    color: "#F7931A",
    addressPrefix: "bc1q",
    confirmations: 3,
    avgTime: "10-30 min",
    minDeposit: 500,
    fee: 100,
    popular: true,
    depositGuide: [
      "Copy the Bitcoin wallet address below",
      "Open your wallet app or exchange",
      "Select BTC → Bitcoin network",
      "Paste the address and enter amount",
      "Double-check the address starts with 'bc1q'",
      "Wait 10-30 minutes for 3 confirmations"
    ]
  },
  {
    symbol: "ETH",
    name: "Ethereum",
    network: "ERC-20",
    networkFull: "Ethereum Network (ERC-20)",
    icon: "Ξ",
    color: "#627EEA",
    addressPrefix: "0x",
    confirmations: 12,
    avgTime: "3-10 min",
    minDeposit: 200,
    fee: 50,
    popular: true,
    depositGuide: [
      "Copy the ETH wallet address below",
      "Open your wallet app or exchange",
      "Select ETH → Ethereum (ERC-20) network",
      "⚠️ Do NOT use other networks like BSC/Polygon",
      "Paste the address and enter amount",
      "Wait 3-10 minutes for confirmation"
    ]
  },
  {
    symbol: "BNB",
    name: "BNB",
    network: "BEP-20",
    networkFull: "Binance Smart Chain (BEP-20)",
    icon: "B",
    color: "#F3BA2F",
    addressPrefix: "0x",
    confirmations: 15,
    avgTime: "1-3 min",
    minDeposit: 50,
    fee: 5,
    popular: true,
    depositGuide: [
      "Copy the BNB wallet address below",
      "Open your Binance or Trust Wallet",
      "Select BNB → BEP-20 (BSC) network",
      "⚠️ Do NOT use BEP-2 (Binance Chain)",
      "Paste the address and enter amount",
      "Wait 1-3 minutes for confirmation"
    ]
  },
  {
    symbol: "SOL",
    name: "Solana",
    network: "Solana",
    networkFull: "Solana Network (SPL)",
    icon: "◎",
    color: "#9945FF",
    addressPrefix: "",
    confirmations: 30,
    avgTime: "1-2 min",
    minDeposit: 50,
    fee: 1,
    popular: true,
    depositGuide: [
      "Copy the Solana wallet address below",
      "Open Phantom, Solflare, or exchange",
      "Select SOL → Solana network",
      "Paste the address and enter amount",
      "Transaction confirms in ~1-2 minutes"
    ]
  },
  {
    symbol: "TRX",
    name: "Tron",
    network: "TRC-20",
    networkFull: "TRON Network (TRC-20)",
    icon: "T",
    color: "#FF0013",
    addressPrefix: "T",
    confirmations: 20,
    avgTime: "1-3 min",
    minDeposit: 20,
    fee: 1,
    popular: true,
    depositGuide: [
      "Copy the TRX wallet address below",
      "Open your wallet (Trust Wallet, TronLink, etc.)",
      "Select TRX → TRC-20 network",
      "Paste the address and enter amount",
      "Fast confirmation in 1-3 minutes"
    ]
  },
  // More Coins
  {
    symbol: "USDC",
    name: "USD Coin",
    network: "ERC-20",
    networkFull: "Ethereum Network (ERC-20)",
    icon: "$",
    color: "#2775CA",
    addressPrefix: "0x",
    confirmations: 12,
    avgTime: "3-10 min",
    minDeposit: 100,
    fee: 20,
    depositGuide: [
      "Copy the USDC wallet address below",
      "Select USDC → Ethereum (ERC-20) network",
      "⚠️ Do NOT send on other chains",
      "Paste address and confirm",
      "Wait 3-10 minutes"
    ]
  },
  {
    symbol: "XRP",
    name: "Ripple",
    network: "XRP Ledger",
    networkFull: "XRP Ledger (Requires Memo)",
    icon: "✕",
    color: "#23292F",
    addressPrefix: "r",
    confirmations: 1,
    avgTime: "3-5 sec",
    minDeposit: 50,
    fee: 1,
    depositGuide: [
      "Copy the XRP address AND memo tag",
      "⚠️ MEMO IS REQUIRED - funds will be lost without it",
      "Open your wallet and select XRP",
      "Enter BOTH address and memo tag",
      "Ultra-fast confirmation in seconds"
    ]
  },
  {
    symbol: "ADA",
    name: "Cardano",
    network: "Cardano",
    networkFull: "Cardano Network (Native)",
    icon: "₳",
    color: "#0033AD",
    addressPrefix: "addr1",
    confirmations: 15,
    avgTime: "5-10 min",
    minDeposit: 50,
    fee: 2,
    depositGuide: [
      "Copy the Cardano wallet address",
      "Open Yoroi, Daedalus, or exchange",
      "Select ADA → Cardano network",
      "Paste address and send",
      "Wait 5-10 minutes"
    ]
  },
  {
    symbol: "DOGE",
    name: "Dogecoin",
    network: "Dogecoin",
    networkFull: "Dogecoin Network (Native)",
    icon: "Ð",
    color: "#C2A633",
    addressPrefix: "D",
    confirmations: 6,
    avgTime: "5-15 min",
    minDeposit: 100,
    fee: 10,
    depositGuide: [
      "Copy the DOGE wallet address",
      "Open your wallet or exchange",
      "Select DOGE → Dogecoin network",
      "Paste address and enter amount",
      "Wait 5-15 minutes"
    ]
  },
  {
    symbol: "DOT",
    name: "Polkadot",
    network: "Polkadot",
    networkFull: "Polkadot Relay Chain",
    icon: "●",
    color: "#E6007A",
    addressPrefix: "1",
    confirmations: 12,
    avgTime: "2-5 min",
    minDeposit: 50,
    fee: 1,
    depositGuide: [
      "Copy the DOT wallet address",
      "Open Polkadot.js or exchange",
      "Select DOT → Polkadot network",
      "Paste address and confirm"
    ]
  },
  {
    symbol: "MATIC",
    name: "Polygon",
    network: "Polygon",
    networkFull: "Polygon Network (MATIC)",
    icon: "M",
    color: "#8247E5",
    addressPrefix: "0x",
    confirmations: 128,
    avgTime: "2-5 min",
    minDeposit: 20,
    fee: 1,
    depositGuide: [
      "Copy the MATIC wallet address",
      "Select MATIC → Polygon network",
      "⚠️ Use Polygon (not Ethereum)",
      "Paste address and send"
    ]
  },
  {
    symbol: "LTC",
    name: "Litecoin",
    network: "Litecoin",
    networkFull: "Litecoin Network (Native)",
    icon: "Ł",
    color: "#BFBBBB",
    addressPrefix: "ltc1",
    confirmations: 6,
    avgTime: "5-15 min",
    minDeposit: 50,
    fee: 5,
    depositGuide: [
      "Copy the LTC wallet address",
      "Open your wallet or exchange",
      "Select LTC → Litecoin network",
      "Paste address and confirm"
    ]
  },
  {
    symbol: "SHIB",
    name: "Shiba Inu",
    network: "ERC-20",
    networkFull: "Ethereum Network (ERC-20)",
    icon: "S",
    color: "#FFA409",
    addressPrefix: "0x",
    confirmations: 12,
    avgTime: "3-10 min",
    minDeposit: 100,
    fee: 30,
    depositGuide: [
      "Copy the SHIB wallet address",
      "Select SHIB → Ethereum (ERC-20)",
      "⚠️ High gas fees on Ethereum",
      "Paste address and confirm"
    ]
  },
  {
    symbol: "AVAX",
    name: "Avalanche",
    network: "C-Chain",
    networkFull: "Avalanche C-Chain",
    icon: "A",
    color: "#E84142",
    addressPrefix: "0x",
    confirmations: 12,
    avgTime: "1-3 min",
    minDeposit: 20,
    fee: 1,
    depositGuide: [
      "Copy the AVAX wallet address",
      "Select AVAX → C-Chain network",
      "⚠️ Use C-Chain only",
      "Paste address and send"
    ]
  },
  {
    symbol: "ATOM",
    name: "Cosmos",
    network: "Cosmos",
    networkFull: "Cosmos Hub (Requires Memo)",
    icon: "⚛",
    color: "#2E3148",
    addressPrefix: "cosmos1",
    confirmations: 1,
    avgTime: "5-10 sec",
    minDeposit: 20,
    fee: 0.5,
    depositGuide: [
      "Copy the ATOM address AND memo",
      "⚠️ MEMO IS REQUIRED",
      "Select ATOM → Cosmos network",
      "Enter both address and memo"
    ]
  },
  {
    symbol: "LINK",
    name: "Chainlink",
    network: "ERC-20",
    networkFull: "Ethereum Network (ERC-20)",
    icon: "⬡",
    color: "#375BD2",
    addressPrefix: "0x",
    confirmations: 12,
    avgTime: "3-10 min",
    minDeposit: 20,
    fee: 5,
    depositGuide: [
      "Copy the LINK wallet address",
      "Select LINK → Ethereum (ERC-20)",
      "Paste address and confirm"
    ]
  },
  {
    symbol: "UNI",
    name: "Uniswap",
    network: "ERC-20",
    networkFull: "Ethereum Network (ERC-20)",
    icon: "U",
    color: "#FF007A",
    addressPrefix: "0x",
    confirmations: 12,
    avgTime: "3-10 min",
    minDeposit: 20,
    fee: 5,
    depositGuide: [
      "Copy the UNI wallet address",
      "Select UNI → Ethereum (ERC-20)",
      "Paste address and confirm"
    ]
  },
  {
    symbol: "XLM",
    name: "Stellar",
    network: "Stellar",
    networkFull: "Stellar Network (Requires Memo)",
    icon: "✦",
    color: "#14B6E7",
    addressPrefix: "G",
    confirmations: 1,
    avgTime: "3-5 sec",
    minDeposit: 20,
    fee: 0.1,
    depositGuide: [
      "Copy the XLM address AND memo",
      "⚠️ MEMO IS REQUIRED",
      "Select XLM → Stellar network",
      "Enter both address and memo"
    ]
  },
  {
    symbol: "BCH",
    name: "Bitcoin Cash",
    network: "Bitcoin Cash",
    networkFull: "Bitcoin Cash Network",
    icon: "₿",
    color: "#8DC351",
    addressPrefix: "bitcoincash:q",
    confirmations: 6,
    avgTime: "10-20 min",
    minDeposit: 50,
    fee: 5,
    depositGuide: [
      "Copy the BCH wallet address",
      "Select BCH → Bitcoin Cash network",
      "Paste address and confirm"
    ]
  },
  {
    symbol: "NEAR",
    name: "NEAR Protocol",
    network: "NEAR",
    networkFull: "NEAR Protocol Network",
    icon: "N",
    color: "#00C08B",
    addressPrefix: "",
    confirmations: 1,
    avgTime: "1-2 sec",
    minDeposit: 10,
    fee: 0.1,
    depositGuide: [
      "Copy the NEAR wallet address",
      "Select NEAR → NEAR Protocol",
      "Super fast confirmation"
    ]
  },
  {
    symbol: "APT",
    name: "Aptos",
    network: "Aptos",
    networkFull: "Aptos Network",
    icon: "A",
    color: "#4ECDC4",
    addressPrefix: "0x",
    confirmations: 1,
    avgTime: "1-3 sec",
    minDeposit: 10,
    fee: 0.1,
    depositGuide: [
      "Copy the APT wallet address",
      "Select APT → Aptos network",
      "Instant confirmation"
    ]
  },
  {
    symbol: "FIL",
    name: "Filecoin",
    network: "Filecoin",
    networkFull: "Filecoin Network",
    icon: "⨎",
    color: "#0090FF",
    addressPrefix: "f1",
    confirmations: 5,
    avgTime: "5-10 min",
    minDeposit: 20,
    fee: 1,
    depositGuide: [
      "Copy the FIL wallet address",
      "Select FIL → Filecoin network",
      "Paste address and confirm"
    ]
  },
  {
    symbol: "ARB",
    name: "Arbitrum",
    network: "Arbitrum",
    networkFull: "Arbitrum One Network",
    icon: "A",
    color: "#28A0F0",
    addressPrefix: "0x",
    confirmations: 12,
    avgTime: "1-3 min",
    minDeposit: 10,
    fee: 0.5,
    depositGuide: [
      "Copy the ARB wallet address",
      "Select → Arbitrum One network",
      "Fast and low fees"
    ]
  },
  {
    symbol: "OP",
    name: "Optimism",
    network: "Optimism",
    networkFull: "Optimism Network",
    icon: "O",
    color: "#FF0420",
    addressPrefix: "0x",
    confirmations: 12,
    avgTime: "1-3 min",
    minDeposit: 10,
    fee: 0.5,
    depositGuide: [
      "Copy the OP wallet address",
      "Select → Optimism network",
      "Fast Layer-2 transaction"
    ]
  },
];

// Get deposit wallet addresses (admin-configured)
export const getDepositAddress = (symbol: string): string => {
  // These should ideally come from platform_settings table
  // For now, return placeholder addresses
  const addresses: Record<string, string> = {
    USDT: "TYDzsYUEpvnYmQk4zGP9sWWcTEd2MiAtW6",
    BTC: "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
    ETH: "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD21",
    BNB: "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD21",
    SOL: "7EcDhSYGxXyscszYEp35KHN8vvw3svAuLKTzXwCFLtV",
    TRX: "TYDzsYUEpvnYmQk4zGP9sWWcTEd2MiAtW6",
    USDC: "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD21",
    XRP: "rEb8TK3gBgk5auZkwc6sHnwrGVJH8DuaLh",
    ADA: "addr1q9w5c3paa2s2vy5v7a2nxl8ck9t4w9z3v7a2nxl8ck9t4w9z",
    DOGE: "D8vFz4p1L37jdg47HXKtSujChhP9f3tVkp",
    DOT: "15kUt2i86LHRWCkE3D9Ly1AzKYpxCZv6cg7jYGJfhnvVnSGw",
    MATIC: "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD21",
    LTC: "ltc1q7a8a4fxd8r5z3v7a2nxl8ck9t4w9z3v7a2nxl8",
    SHIB: "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD21",
    AVAX: "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD21",
    ATOM: "cosmos1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p7q8r9s0",
    LINK: "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD21",
    UNI: "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD21",
    XLM: "GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOUJ3DRYV3Q2V2VG",
    BCH: "bitcoincash:qpm2qsznhks23z7629mms6s4cwef74vcwvy22gdx6a",
    NEAR: "apnatrade.near",
    APT: "0x742d35cc6634c0532925a3b844bc9e7595f2bd21",
    FIL: "f1abjxfbp274xpdqcpuaykwkfb43omjotacm2p3za",
    ARB: "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD21",
    OP: "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD21",
  };
  return addresses[symbol] || addresses["USDT"];
};

// Get memo/tag if required
export const getMemo = (symbol: string): string | null => {
  const memos: Record<string, string> = {
    XRP: "123456789",
    XLM: "APNATRADE2024",
    ATOM: "APNATRADE",
  };
  return memos[symbol] || null;
};

// Check if coin requires memo
export const requiresMemo = (symbol: string): boolean => {
  return ["XRP", "XLM", "ATOM"].includes(symbol);
};
