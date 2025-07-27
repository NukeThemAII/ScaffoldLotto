# 🎰 KasplexLottery - Decentralized Lottery DApp

<h4 align="center">
  <a href="#features">Features</a> |
  <a href="#smart-contract">Smart Contract</a> |
  <a href="#frontend">Frontend</a> |
  <a href="#getting-started">Getting Started</a>
</h4>

🎲 A fully decentralized lottery system built on Ethereum, featuring automatic draws, fair prize distribution, and a modern web interface. Players select 5 numbers from 1-35, with draws occurring every 3.5 days and prizes distributed across 5 tiers.

⚙️ Built using NextJS, RainbowKit, Hardhat, Wagmi, Viem, and Typescript on top of Scaffold-ETH 2.

## Features

- 🎯 **Number Selection**: Choose 5 unique numbers from 1-35
- 💰 **Fixed Ticket Price**: 1 KAS per ticket with 1% admin fee
- ⏰ **Automatic Draws**: Every 3.5 days (302,400 seconds)
- 🏆 **5-Tier Prize System**: 40%, 25%, 20%, 10%, 5% distribution
- 🔒 **Secure Random Generation**: Block-based randomness using `block.prevrandao`
- 📱 **Modern UI**: Responsive design with real-time updates
- 🔐 **Wallet Integration**: Connect with MetaMask and other Web3 wallets
- 🧪 **Comprehensive Testing**: 23 test cases covering all functionality

## Smart Contract

### KasplexLottery Contract

The main lottery contract (`contracts/YourContract.sol`) implements:

#### Core Functions

```solidity
// Purchase a lottery ticket
function buyTicket(uint8[5] memory numbers) external payable

// Draw the current lottery (automated every 3.5 days)
function drawLottery() external

// Claim prizes for a specific lottery
function claimPrize(uint256 lotteryId) external

// Admin function to withdraw fees
function withdrawAdminFees() external onlyOwner
```

#### View Functions

```solidity
// Get current lottery information
function getCurrentLottery() external view returns (Lottery memory)

// Get user's prize for a specific lottery
function getUserPrize(address user, uint256 lotteryId) external view returns (uint256)

// Get user's tickets for a specific lottery
function getUserTickets(address user, uint256 lotteryId) external view returns (uint8[5][] memory)

// Get time remaining until next draw
function getTimeUntilDraw() external view returns (uint256)
```

#### Events

```solidity
event TicketPurchased(address indexed player, uint256 indexed lotteryId, uint8[5] numbers);
event LotteryDrawn(uint256 indexed lotteryId, uint8[5] winningNumbers, uint256 totalPrizePool);
event PrizeClaimed(address indexed winner, uint256 amount);
```

### Prize Distribution

| Matches | Prize Tier | Percentage |
|---------|------------|------------|
| 5/5     | Tier 1     | 40%        |
| 4/5     | Tier 2     | 25%        |
| 3/5     | Tier 3     | 20%        |
| 2/5     | Tier 4     | 10%        |
| 1/5     | Tier 5     | 5%         |

### Security Features

- **Input Validation**: Numbers must be 1-35, unique, and sorted
- **Access Control**: Owner-only functions for admin operations
- **Reentrancy Protection**: Safe prize claiming mechanism
- **Time-based Controls**: Prevents premature lottery draws
- **Emergency Functions**: Owner can withdraw funds if needed

## Frontend

### User Interface

The frontend (`packages/nextjs/app/page.tsx`) provides:

- **Number Selection Grid**: Interactive 1-35 number picker
- **Lottery Information**: Current lottery ID, prize pool, time until draw
- **Ticket Management**: View purchased tickets and track prizes
- **Prize Claiming**: One-click prize claiming for winning tickets
- **Real-time Updates**: Live countdown and lottery status

### Key Components

```typescript
// Contract interaction hooks
const { data: currentLottery } = useScaffoldContractRead({
  contractName: "KasplexLottery",
  functionName: "getCurrentLottery",
});

// Write functions for user actions
const { writeAsync: buyTicket } = useScaffoldContractWrite({
  contractName: "KasplexLottery",
  functionName: "buyTicket",
});

// Event watching for real-time updates
useScaffoldEventSubscriber({
  contractName: "KasplexLottery",
  eventName: "TicketPurchased",
  listener: (logs) => {
    // Handle ticket purchase events
  },
});
```

## Getting Started

### Requirements

- [Node.js (>= v20.18.3)](https://nodejs.org/en/download/)
- [Yarn (v1 or v2+)](https://yarnpkg.com/getting-started/install)
- [Git](https://git-scm.com/downloads)
- [MetaMask](https://metamask.io/) or other Web3 wallet

### Installation

1. Clone the repository:
```bash
git clone https://github.com/NukeThemAII/ScaffoldLotto.git
cd ScaffoldLotto/my-dapp-example
```

2. Install dependencies:
```bash
yarn install
```

3. Start local blockchain:
```bash
yarn chain
```

4. Deploy the contract:
```bash
yarn deploy
```

5. Start the frontend:
```bash
yarn start
```

6. Visit `http://localhost:3000` to interact with the lottery

### Testing

Run the comprehensive test suite:
```bash
yarn hardhat:test
```

The test suite includes 23 tests covering:
- Contract deployment and initialization
- Ticket purchasing with validation
- Lottery drawing mechanics
- Prize distribution and claiming
- Admin functions and security
- Edge cases and error handling

### Development Commands

```bash
# Run local blockchain
yarn chain

# Deploy contracts
yarn deploy

# Start frontend development server
yarn start

# Run tests
yarn hardhat:test

# Lint code
yarn lint

# Format code
yarn format
```

## Project Structure

```
my-dapp-example/
├── packages/
│   ├── hardhat/                 # Smart contract development
│   │   ├── contracts/
│   │   │   └── YourContract.sol # KasplexLottery contract
│   │   ├── deploy/              # Deployment scripts
│   │   ├── test/                # Contract tests
│   │   └── scripts/             # Utility scripts
│   └── nextjs/                  # Frontend application
│       ├── app/
│       │   └── page.tsx         # Main lottery interface
│       ├── components/          # Reusable UI components
│       ├── hooks/               # Custom React hooks
│       └── contracts/           # Contract type definitions
├── README.md                    # This file
└── package.json                 # Project configuration
```

## Gas Optimization

- **Contract Size**: 1,981,838 gas (6.6% of block limit)
- **Ticket Purchase**: ~100,000 gas per ticket
- **Lottery Draw**: ~200,000 gas per draw
- **Prize Claim**: ~50,000 gas per claim

## Security Considerations

- **Randomness**: Uses `block.prevrandao` for fair number generation
- **Admin Fees**: Transparent 1% fee structure
- **Prize Pool**: Automatic distribution prevents fund accumulation
- **Access Control**: Owner privileges limited to fee withdrawal and emergency functions
- **Input Validation**: Comprehensive checks prevent invalid ticket purchases

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

This project is licensed under the MIT License - see the [LICENCE](LICENCE) file for details.

## Built With

- [Scaffold-ETH 2](https://scaffoldeth.io/) - Development framework
- [Hardhat](https://hardhat.org/) - Ethereum development environment
- [Next.js](https://nextjs.org/) - React framework
- [RainbowKit](https://www.rainbowkit.com/) - Wallet connection
- [Wagmi](https://wagmi.sh/) - React hooks for Ethereum
- [Tailwind CSS](https://tailwindcss.com/) - Styling framework

---

🎰 **Ready to play?** Start the local development environment and try your luck with KasplexLottery!