//SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

// Useful for debugging. Remove when deploying to a live network.
import "hardhat/console.sol";

/**
 * @title KasplexLottery
 * @dev Autonomous lottery smart contract with 5/1-35 rules
 * @author Solidity Expert
 */
contract KasplexLottery {
    // Constants
    uint256 public constant TICKET_PRICE = 1 ether; // 1 KAS
    uint256 public constant ADMIN_FEE_PERCENT = 1; // 1%
    uint256 public constant DRAW_INTERVAL = 1 minutes; // 1 minute for testing
    uint256 public constant MIN_NUMBERS = 1;
    uint256 public constant MAX_NUMBERS = 35;
    uint256 public constant NUMBERS_PER_TICKET = 5;
    
    // State Variables
    address public immutable owner;
    uint256 public currentLotteryId;
    uint256 public lastDrawTime;
    uint256 public jackpotRollover; // Accumulated unclaimed prizes from previous lotteries
    
    struct Ticket {
        address player;
        uint8[5] numbers;
        uint256 lotteryId;
    }
    
    struct Lottery {
        uint256 id;
        uint256 startTime;
        uint256 endTime;
        uint256 totalPrizePool;
        uint256 totalTickets;
        uint8[5] winningNumbers;
        bool drawn;
        uint256 totalDistributedPrizes; // Total prizes distributed to winners
        uint256 jackpotContribution; // Amount added from rollover
        mapping(address => uint256[]) playerTickets; // player => ticket indices
        mapping(uint256 => uint256) matchWinners; // matches => count
        mapping(uint256 => uint256) matchPrizes; // matches => prize amount
        mapping(address => bool) prizeClaimed; // Track if player claimed prize
    }
    
    // Storage
    mapping(uint256 => Lottery) public lotteries;
    mapping(uint256 => Ticket) public tickets;
    mapping(address => uint256) public pendingWithdrawals;
    
    uint256 public totalTicketsCount;
    uint256 public adminBalance;
    
    // Events
    event LotteryStarted(uint256 indexed lotteryId, uint256 startTime, uint256 endTime, uint256 jackpotRollover);
    event TicketPurchased(uint256 indexed lotteryId, address indexed player, uint256 ticketId, uint8[5] numbers);
    event LotteryDrawn(uint256 indexed lotteryId, uint8[5] winningNumbers, uint256 totalPrizePool, uint256 jackpotContribution);
    event PrizeDistributed(uint256 indexed lotteryId, uint256 matches, uint256 winners, uint256 prizePerWinner);
    event PrizeClaimed(address indexed player, uint256 amount, uint256 indexed lotteryId);
    event AdminFeesWithdrawn(address indexed admin, uint256 amount);
    event JackpotRollover(uint256 indexed fromLotteryId, uint256 indexed toLotteryId, uint256 amount);
    
    // Constructor
    constructor(address _owner) {
        owner = _owner;
        _startNewLottery();
    }
    
    // Modifiers
    modifier onlyOwner() {
        require(msg.sender == owner, "Not the owner");
        _;
    }
    
    modifier validNumbers(uint8[5] memory numbers) {
        for (uint i = 0; i < NUMBERS_PER_TICKET; i++) {
            require(numbers[i] >= MIN_NUMBERS && numbers[i] <= MAX_NUMBERS, "Invalid number range");
            // Check for duplicates
            for (uint j = i + 1; j < NUMBERS_PER_TICKET; j++) {
                require(numbers[i] != numbers[j], "Duplicate numbers not allowed");
            }
        }
        _;
    }
    
    /**
     * @dev Purchase a lottery ticket with selected numbers
     * @param numbers Array of 5 unique numbers between 1-35
     */
    function buyTicket(uint8[5] memory numbers) external payable validNumbers(numbers) {
        require(msg.value == TICKET_PRICE, "Incorrect ticket price");
        
        // Check if current lottery is still active
        if (block.timestamp >= lotteries[currentLotteryId].endTime) {
            _drawLottery();
            _startNewLottery();
        }
        
        // Sort numbers for consistency
        _sortNumbers(numbers);
        
        // Create ticket
        uint256 ticketId = totalTicketsCount++;
        tickets[ticketId] = Ticket({
            player: msg.sender,
            numbers: numbers,
            lotteryId: currentLotteryId
        });
        
        // Update lottery data
        Lottery storage lottery = lotteries[currentLotteryId];
        lottery.playerTickets[msg.sender].push(ticketId);
        lottery.totalTickets++;
        
        // Calculate admin fee and add to prize pool
        uint256 adminFee = (msg.value * ADMIN_FEE_PERCENT) / 100;
        adminBalance += adminFee;
        lottery.totalPrizePool += (msg.value - adminFee);
        
        emit TicketPurchased(currentLotteryId, msg.sender, ticketId, numbers);
    }
    
    /**
     * @dev Manually trigger lottery draw (can be called by anyone if time has passed)
     */
    function drawLottery() external {
        require(block.timestamp >= lotteries[currentLotteryId].endTime, "Lottery still active");
        require(!lotteries[currentLotteryId].drawn, "Lottery already drawn");
        
        _drawLottery();
        _startNewLottery();
    }
    
    /**
     * @dev Internal function to draw lottery and distribute prizes
     */
    function _drawLottery() internal {
        Lottery storage lottery = lotteries[currentLotteryId];
        require(!lottery.drawn, "Already drawn");
        
        if (lottery.totalTickets == 0) {
            lottery.drawn = true;
            return;
        }
        
        // Generate winning numbers using block-based randomness
        uint8[5] memory winningNumbers = _generateWinningNumbers();
        lottery.winningNumbers = winningNumbers;
        lottery.drawn = true;
        
        // Count winners by match level
        _countWinners(currentLotteryId);
        
        // Distribute prizes
        _distributePrizes(currentLotteryId);
        
        // Calculate and process jackpot rollover
        _processJackpotRollover(currentLotteryId);
        
        emit LotteryDrawn(currentLotteryId, winningNumbers, lottery.totalPrizePool, lottery.jackpotContribution);
    }
    
    /**
     * @dev Generate winning numbers using block-based randomness
     */
    function _generateWinningNumbers() internal view returns (uint8[5] memory) {
        uint8[5] memory numbers;
        uint256 seed = uint256(keccak256(abi.encodePacked(
            block.timestamp,
            block.prevrandao,
            block.number,
            blockhash(block.number - 1),
            currentLotteryId
        )));
        
        bool[36] memory used; // Track used numbers (index 0 unused, 1-35 valid)
        
        for (uint i = 0; i < NUMBERS_PER_TICKET; i++) {
            uint8 number;
            do {
                seed = uint256(keccak256(abi.encodePacked(seed, i)));
                number = uint8((seed % MAX_NUMBERS) + 1);
            } while (used[number]);
            
            used[number] = true;
            numbers[i] = number;
        }
        
        _sortNumbers(numbers);
        return numbers;
    }
    
    /**
     * @dev Count winners for each match level
     */
    function _countWinners(uint256 lotteryId) internal {
        Lottery storage lottery = lotteries[lotteryId];
        
        // Iterate through all tickets to find ones for this lottery
        for (uint256 i = 0; i < totalTicketsCount; i++) {
            if (tickets[i].lotteryId == lotteryId) {
                uint256 matches = _countMatches(tickets[i].numbers, lottery.winningNumbers);
                if (matches >= 2) { // Minimum 2 matches to win
                    lottery.matchWinners[matches]++;
                }
            }
        }
    }
    
    /**
     * @dev Distribute prizes based on match levels with jackpot rollover
     */
    function _distributePrizes(uint256 lotteryId) internal {
        Lottery storage lottery = lotteries[lotteryId];
        uint256 totalPrizePool = lottery.totalPrizePool;
        
        // Prize distribution: 5 matches: 50%, 4 matches: 30%, 3 matches: 15%, 2 matches: 5%
        uint256[6] memory prizePercentages = [uint256(0), uint256(0), uint256(5), uint256(15), uint256(30), uint256(50)]; // Index = matches
        
        uint256 totalDistributed = 0;
        
        for (uint256 matches = 2; matches <= 5; matches++) {
            uint256 winners = lottery.matchWinners[matches];
            if (winners > 0) {
                uint256 totalPrizeForLevel = (totalPrizePool * prizePercentages[matches]) / 100;
                uint256 prizePerWinner = totalPrizeForLevel / winners;
                lottery.matchPrizes[matches] = prizePerWinner;
                totalDistributed += totalPrizeForLevel;
                
                emit PrizeDistributed(lotteryId, matches, winners, prizePerWinner);
            }
        }
        
        // Store total distributed prizes for rollover calculation
        lottery.totalDistributedPrizes = totalDistributed;
        
        // Distribute prizes to winners
        for (uint256 i = 0; i < totalTicketsCount; i++) {
            if (tickets[i].lotteryId == lotteryId) {
                uint256 matches = _countMatches(tickets[i].numbers, lottery.winningNumbers);
                if (matches >= 2) {
                    pendingWithdrawals[tickets[i].player] += lottery.matchPrizes[matches];
                }
            }
        }
    }
    
    /**
     * @dev Process jackpot rollover by calculating unclaimed prizes
     */
    function _processJackpotRollover(uint256 lotteryId) internal {
        Lottery storage lottery = lotteries[lotteryId];
        
        // Calculate unclaimed prizes (total prize pool - distributed prizes - admin fees already deducted)
        uint256 unclaimedPrizes = lottery.totalPrizePool - lottery.totalDistributedPrizes;
        
        // Add unclaimed prizes to jackpot rollover for next lottery
        if (unclaimedPrizes > 0) {
            jackpotRollover += unclaimedPrizes;
        }
    }
    
    /**
     * @dev Count matching numbers between ticket and winning numbers
     */
    function _countMatches(uint8[5] memory ticketNumbers, uint8[5] memory winningNumbers) internal pure returns (uint256) {
        uint256 matches = 0;
        for (uint i = 0; i < NUMBERS_PER_TICKET; i++) {
            for (uint j = 0; j < NUMBERS_PER_TICKET; j++) {
                if (ticketNumbers[i] == winningNumbers[j]) {
                    matches++;
                    break;
                }
            }
        }
        return matches;
    }
    
    /**
     * @dev Start a new lottery with jackpot rollover
     */
    function _startNewLottery() internal {
        currentLotteryId++;
        uint256 startTime = block.timestamp;
        uint256 endTime = startTime + DRAW_INTERVAL;
        
        Lottery storage newLottery = lotteries[currentLotteryId];
        newLottery.id = currentLotteryId;
        newLottery.startTime = startTime;
        newLottery.endTime = endTime;
        newLottery.drawn = false;
        
        // Add jackpot rollover to new lottery
        if (jackpotRollover > 0) {
            newLottery.totalPrizePool += jackpotRollover;
            newLottery.jackpotContribution = jackpotRollover;
            
            emit JackpotRollover(currentLotteryId - 1, currentLotteryId, jackpotRollover);
            jackpotRollover = 0; // Reset rollover after adding to new lottery
        }
        
        lastDrawTime = startTime;
        
        emit LotteryStarted(currentLotteryId, startTime, endTime, newLottery.jackpotContribution);
    }
    
    /**
     * @dev Sort numbers in ascending order
     */
    function _sortNumbers(uint8[5] memory numbers) internal pure {
        for (uint i = 0; i < NUMBERS_PER_TICKET - 1; i++) {
            for (uint j = 0; j < NUMBERS_PER_TICKET - i - 1; j++) {
                if (numbers[j] > numbers[j + 1]) {
                    uint8 temp = numbers[j];
                    numbers[j] = numbers[j + 1];
                    numbers[j + 1] = temp;
                }
            }
        }
    }
    
    /**
     * @dev Claim pending prize winnings
     */
    function claimPrize(uint256 lotteryId) external {
        require(lotteries[lotteryId].drawn, "Lottery not drawn yet");
        require(!lotteries[lotteryId].prizeClaimed[msg.sender], "Prize already claimed for this lottery");
        
        uint256 amount = getUserPrize(msg.sender, lotteryId);
        require(amount > 0, "No prize to claim");
        
        // Mark prize as claimed for this lottery
        lotteries[lotteryId].prizeClaimed[msg.sender] = true;
        
        // Deduct from pending withdrawals
        pendingWithdrawals[msg.sender] -= amount;
        
        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "Prize transfer failed");
        
        emit PrizeClaimed(msg.sender, amount, lotteryId);
    }
    
    /**
     * @dev Owner withdraws admin fees
     */
    function withdrawAdminFees() external onlyOwner {
        uint256 amount = adminBalance;
        require(amount > 0, "No admin fees to withdraw");
        
        adminBalance = 0;
        
        (bool success, ) = owner.call{value: amount}("");
        require(success, "Admin fee transfer failed");
        
        emit AdminFeesWithdrawn(owner, amount);
    }
    
    // View Functions
    function getCurrentLottery() external view returns (
        uint256 id,
        uint256 startTime,
        uint256 endTime,
        uint256 totalPrizePool,
        uint256 totalTickets,
        bool drawn
    ) {
        Lottery storage lottery = lotteries[currentLotteryId];
        return (
            lottery.id,
            lottery.startTime,
            lottery.endTime,
            lottery.totalPrizePool,
            lottery.totalTickets,
            lottery.drawn
        );
    }
    
    function getJackpotInfo() external view returns (
        uint256 currentJackpotRollover,
        uint256 currentLotteryJackpotContribution,
        uint256 totalCurrentPrizePool
    ) {
        Lottery storage lottery = lotteries[currentLotteryId];
        return (
            jackpotRollover,
            lottery.jackpotContribution,
            lottery.totalPrizePool
        );
    }
    
    function getLotteryWinningNumbers(uint256 lotteryId) external view returns (uint8[5] memory) {
        require(lotteries[lotteryId].drawn, "Lottery not drawn yet");
        return lotteries[lotteryId].winningNumbers;
    }
    
    function getPlayerTickets(address player, uint256 lotteryId) external view returns (uint256[] memory) {
        return lotteries[lotteryId].playerTickets[player];
    }
    
    function getTicket(uint256 ticketId) external view returns (address player, uint8[5] memory numbers, uint256 lotteryId) {
        Ticket storage ticket = tickets[ticketId];
        return (ticket.player, ticket.numbers, ticket.lotteryId);
    }
    
    function getPendingPrize(address player) external view returns (uint256) {
        return pendingWithdrawals[player];
    }
    
    function getUserPrize(address player, uint256 lotteryId) public view returns (uint256) {
        require(lotteries[lotteryId].drawn, "Lottery not drawn yet");
        
        uint256 totalPrize = 0;
        for (uint256 i = 0; i < totalTicketsCount; i++) {
            if (tickets[i].lotteryId == lotteryId && tickets[i].player == player) {
                uint256 matches = _countMatches(tickets[i].numbers, lotteries[lotteryId].winningNumbers);
                if (matches >= 2) {
                    totalPrize += lotteries[lotteryId].matchPrizes[matches];
                }
            }
        }
        return totalPrize;
    }
    
    function getUserTickets(address player, uint256 lotteryId) external view returns (uint8[5][] memory) {
        uint256[] memory ticketIds = lotteries[lotteryId].playerTickets[player];
        uint8[5][] memory userTickets = new uint8[5][](ticketIds.length);
        
        for (uint256 i = 0; i < ticketIds.length; i++) {
            userTickets[i] = tickets[ticketIds[i]].numbers;
        }
        
        return userTickets;
    }
    
    function getTimeUntilDraw() external view returns (uint256) {
        uint256 endTime = lotteries[currentLotteryId].endTime;
        if (block.timestamp >= endTime) {
            return 0;
        }
        return endTime - block.timestamp;
    }
    
    function hasPrizeClaimed(address player, uint256 lotteryId) external view returns (bool) {
        return lotteries[lotteryId].prizeClaimed[player];
    }
    
    function getLotteryDetails(uint256 lotteryId) external view returns (
        uint256 id,
        uint256 startTime,
        uint256 endTime,
        uint256 totalPrizePool,
        uint256 totalTickets,
        uint256 totalDistributedPrizes,
        uint256 jackpotContribution,
        bool drawn
    ) {
        Lottery storage lottery = lotteries[lotteryId];
        return (
            lottery.id,
            lottery.startTime,
            lottery.endTime,
            lottery.totalPrizePool,
            lottery.totalTickets,
            lottery.totalDistributedPrizes,
            lottery.jackpotContribution,
            lottery.drawn
        );
    }
    
    /**
     * @dev Emergency function to pause contract (only owner)
     */
    function emergencyWithdraw() external onlyOwner {
        (bool success, ) = owner.call{value: address(this).balance}("");
        require(success, "Emergency withdrawal failed");
    }
    
    /**
     * @dev Function to receive ETH
     */
    receive() external payable {}
}
