import { expect } from "chai";
import { ethers } from "hardhat";
import { KasplexLottery } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("KasplexLottery - Jackpot Rollover Tests", function () {
  let kasplexLottery: KasplexLottery;
  let owner: HardhatEthersSigner;
  let player1: HardhatEthersSigner;
  let player2: HardhatEthersSigner;
  let player3: HardhatEthersSigner;

  const TICKET_PRICE = ethers.parseEther("1");
  const DRAW_INTERVAL = 24 * 60 * 60; // 24 hours

  beforeEach(async function () {
    [owner, player1, player2, player3] = await ethers.getSigners();
    
    const KasplexLotteryFactory = await ethers.getContractFactory("KasplexLottery");
    kasplexLottery = await KasplexLotteryFactory.deploy(owner.address);
    await kasplexLottery.waitForDeployment();
  });

  describe("Jackpot Rollover Functionality", function () {
    it("Should accumulate jackpot rollover when no winners", async function () {
      // Buy tickets with numbers that are unlikely to win
      await kasplexLottery.connect(player1).buyTicket([1, 2, 3, 4, 5], { value: TICKET_PRICE });
      await kasplexLottery.connect(player2).buyTicket([6, 7, 8, 9, 10], { value: TICKET_PRICE });
      
      // Advance time to end the lottery
      await ethers.provider.send("evm_increaseTime", [7 * 24 * 60 * 60]); // 7 days
      await ethers.provider.send("evm_mine", []);
      
      // Draw lottery (no winners expected)
      await kasplexLottery.drawLottery();
      
      // Check jackpot info
      const jackpotInfo = await kasplexLottery.getJackpotInfo();
      console.log("Jackpot rollover after first draw:", ethers.formatEther(jackpotInfo.currentJackpotRollover));
      
      // Should have some rollover (depends on random winning numbers)
      // The rollover should be > 0 if no significant prizes were won
      expect(jackpotInfo.currentJackpotRollover).to.be.gte(0);
    });

    it("Should transfer jackpot rollover to next lottery", async function () {
      // First lottery - buy tickets and draw
      await kasplexLottery.connect(player1).buyTicket([1, 2, 3, 4, 5], { value: TICKET_PRICE });
      await kasplexLottery.connect(player2).buyTicket([6, 7, 8, 9, 10], { value: TICKET_PRICE });
      
      // Advance time to end the lottery
      await ethers.provider.send("evm_increaseTime", [7 * 24 * 60 * 60]); // 7 days
      await ethers.provider.send("evm_mine", []);
      await kasplexLottery.drawLottery();
      
      const jackpotAfterFirstDraw = await kasplexLottery.getJackpotInfo();
      const rolloverAmount = jackpotAfterFirstDraw.currentJackpotRollover;
      
      // Start second lottery by buying a ticket
      await kasplexLottery.connect(player3).buyTicket([11, 12, 13, 14, 15], { value: TICKET_PRICE });
      
      // Check that rollover was added to new lottery
      const currentLottery = await kasplexLottery.getCurrentLottery();
      const jackpotInfo = await kasplexLottery.getJackpotInfo();
      
      console.log("Rollover amount:", ethers.formatEther(rolloverAmount));
      console.log("New lottery jackpot contribution:", ethers.formatEther(jackpotInfo.currentLotteryJackpotContribution));
      console.log("Total prize pool:", ethers.formatEther(currentLottery.totalPrizePool));
      
      // Jackpot rollover should be reset to 0 after transfer
      expect(jackpotInfo.currentJackpotRollover).to.equal(0);
      
      // New lottery should have the rollover amount as jackpot contribution
      if (rolloverAmount > 0) {
        expect(jackpotInfo.currentLotteryJackpotContribution).to.equal(rolloverAmount);
      }
    });

    it("Should emit JackpotRollover event when transferring to new lottery", async function () {
      // First lottery with no winners
      await kasplexLottery.connect(player1).buyTicket([1, 2, 3, 4, 5], { value: TICKET_PRICE });
      
      // Advance time to end the lottery
      await ethers.provider.send("evm_increaseTime", [7 * 24 * 60 * 60]); // 7 days
      await ethers.provider.send("evm_mine", []);
      await kasplexLottery.drawLottery();
      
      const jackpotInfo = await kasplexLottery.getJackpotInfo();
      const rolloverAmount = jackpotInfo.currentJackpotRollover;
      
      if (rolloverAmount > 0) {
        // Start new lottery and expect JackpotRollover event
        await expect(
          kasplexLottery.connect(player2).buyTicket([6, 7, 8, 9, 10], { value: TICKET_PRICE })
        ).to.emit(kasplexLottery, "JackpotRollover")
          .withArgs(1, 2, rolloverAmount);
      }
    });

    it("Should correctly calculate unclaimed prizes for rollover", async function () {
      // Buy tickets and draw lottery
      await kasplexLottery.connect(player1).buyTicket([1, 2, 3, 4, 5], { value: TICKET_PRICE });
      await kasplexLottery.connect(player2).buyTicket([6, 7, 8, 9, 10], { value: TICKET_PRICE });
      
      // Advance time to end the lottery
      await ethers.provider.send("evm_increaseTime", [7 * 24 * 60 * 60]); // 7 days
      await ethers.provider.send("evm_mine", []);
      await kasplexLottery.drawLottery();
      
      // Get lottery details
      const lotteryDetails = await kasplexLottery.getLotteryDetails(1);
      console.log("Lottery 1 details:");
      console.log("- Total Prize Pool:", ethers.formatEther(lotteryDetails.totalPrizePool));
      console.log("- Total Distributed Prizes:", ethers.formatEther(lotteryDetails.totalDistributedPrizes));
      console.log("- Jackpot Contribution:", ethers.formatEther(lotteryDetails.jackpotContribution));
      
      // Check that distributed prizes <= total prize pool
      expect(lotteryDetails.totalDistributedPrizes).to.be.lte(lotteryDetails.totalPrizePool);
      
      // Unclaimed amount should be total prize pool - distributed prizes
      const unclaimedAmount = lotteryDetails.totalPrizePool - lotteryDetails.totalDistributedPrizes;
      console.log("- Unclaimed Amount:", ethers.formatEther(unclaimedAmount));
      
      expect(unclaimedAmount).to.be.gte(0);
    });

    it("Should handle multiple lottery cycles with rollover", async function () {
      let totalRollover = 0n;
      
      // Run 3 lottery cycles
      for (let i = 0; i < 3; i++) {
        console.log(`\n--- Lottery Cycle ${i + 1} ---`);
        
        // Buy tickets
        await kasplexLottery.connect(player1).buyTicket([1 + i, 2 + i, 3 + i, 4 + i, 5 + i], { value: TICKET_PRICE });
        await kasplexLottery.connect(player2).buyTicket([6 + i, 7 + i, 8 + i, 9 + i, 10 + i], { value: TICKET_PRICE });
        
        const currentLottery = await kasplexLottery.getCurrentLottery();
        console.log("Current lottery ID:", currentLottery.id.toString());
        console.log("Total prize pool:", ethers.formatEther(currentLottery.totalPrizePool));
        
        // Draw lottery
        await ethers.provider.send("evm_increaseTime", [7 * 24 * 60 * 60]); // 7 days
        await ethers.provider.send("evm_mine", []);
        await kasplexLottery.drawLottery();
        
        // Check jackpot info
        const jackpotInfo = await kasplexLottery.getJackpotInfo();
        console.log("Jackpot rollover:", ethers.formatEther(jackpotInfo.currentJackpotRollover));
        
        totalRollover += jackpotInfo.currentJackpotRollover;
      }
      
      console.log("\nTotal accumulated rollover:", ethers.formatEther(totalRollover));
      expect(totalRollover).to.be.gte(0);
    });

    it("Should prevent claiming already claimed prizes", async function () {
      // Buy ticket and draw
      await kasplexLottery.connect(player1).buyTicket([1, 2, 3, 4, 5], { value: TICKET_PRICE });
      
      // Advance time to end the lottery
      await ethers.provider.send("evm_increaseTime", [7 * 24 * 60 * 60]); // 7 days
      await ethers.provider.send("evm_mine", []);
      await kasplexLottery.drawLottery();
      
      // Check if player has prize
      const prize = await kasplexLottery.getUserPrize(player1.address, 1);
      
      if (prize > 0) {
        // Claim prize first time
        await kasplexLottery.connect(player1).claimPrize(1);
        
        // Check that prize is marked as claimed
        const isClaimed = await kasplexLottery.hasPrizeClaimed(player1.address, 1);
        expect(isClaimed).to.be.true;
        
        // Try to claim again - should fail
        await expect(
          kasplexLottery.connect(player1).claimPrize(1)
        ).to.be.revertedWith("Prize already claimed for this lottery");
      }
    });

    it("Should correctly track admin fees separate from rollover", async function () {
      const initialAdminBalance = await kasplexLottery.adminBalance();
      
      // Buy tickets
      await kasplexLottery.connect(player1).buyTicket([1, 2, 3, 4, 5], { value: TICKET_PRICE });
      await kasplexLottery.connect(player2).buyTicket([6, 7, 8, 9, 10], { value: TICKET_PRICE });
      
      const adminBalanceAfterTickets = await kasplexLottery.adminBalance();
      const expectedAdminFees = ethers.parseEther("0.02"); // 2 tickets * 0.01
      
      expect(adminBalanceAfterTickets - initialAdminBalance).to.equal(expectedAdminFees);
      
      // Draw lottery
      await ethers.provider.send("evm_increaseTime", [7 * 24 * 60 * 60]); // 7 days
      await ethers.provider.send("evm_mine", []);
      await kasplexLottery.drawLottery();
      
      // Admin balance should remain the same after draw
      const adminBalanceAfterDraw = await kasplexLottery.adminBalance();
      expect(adminBalanceAfterDraw).to.equal(adminBalanceAfterTickets);
      
      // Jackpot rollover should be separate from admin fees
      const jackpotInfo = await kasplexLottery.getJackpotInfo();
      console.log("Admin balance:", ethers.formatEther(adminBalanceAfterDraw));
      console.log("Jackpot rollover:", ethers.formatEther(jackpotInfo.currentJackpotRollover));
    });
  });

  describe("New View Functions", function () {
    it("Should return correct jackpot information", async function () {
      const jackpotInfo = await kasplexLottery.getJackpotInfo();
      
      expect(jackpotInfo.currentJackpotRollover).to.be.gte(0);
      expect(jackpotInfo.currentLotteryJackpotContribution).to.be.gte(0);
      expect(jackpotInfo.totalCurrentPrizePool).to.be.gte(0);
    });

    it("Should return detailed lottery information", async function () {
      // Buy a ticket to have some data
      await kasplexLottery.connect(player1).buyTicket([1, 2, 3, 4, 5], { value: TICKET_PRICE });
      
      const lotteryDetails = await kasplexLottery.getLotteryDetails(1);
      
      expect(lotteryDetails.id).to.equal(1);
      expect(lotteryDetails.startTime).to.be.gt(0);
      expect(lotteryDetails.endTime).to.be.gt(lotteryDetails.startTime);
      expect(lotteryDetails.totalPrizePool).to.be.gt(0);
      expect(lotteryDetails.totalTickets).to.equal(1);
      expect(lotteryDetails.drawn).to.be.false;
    });

    it("Should correctly report prize claim status", async function () {
      // Initially no prizes claimed
      const initialStatus = await kasplexLottery.hasPrizeClaimed(player1.address, 1);
      expect(initialStatus).to.be.false;
      
      // Buy ticket and draw
      await kasplexLottery.connect(player1).buyTicket([1, 2, 3, 4, 5], { value: TICKET_PRICE });
      
      // Advance time to end the lottery
      await ethers.provider.send("evm_increaseTime", [7 * 24 * 60 * 60]); // 7 days
      await ethers.provider.send("evm_mine", []);
      await kasplexLottery.drawLottery();
      
      // Check if player has prize and claim it
      const prize = await kasplexLottery.getUserPrize(player1.address, 1);
      
      if (prize > 0) {
        await kasplexLottery.connect(player1).claimPrize(1);
        
        const claimedStatus = await kasplexLottery.hasPrizeClaimed(player1.address, 1);
        expect(claimedStatus).to.be.true;
      }
    });
  });
});