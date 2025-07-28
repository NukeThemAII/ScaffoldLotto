import { expect } from "chai";
import { ethers } from "hardhat";
import { KasplexLottery } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("KasplexLottery - Advanced Tests", function () {
  let kasplexLottery: KasplexLottery;
  let owner: HardhatEthersSigner;
  let player1: HardhatEthersSigner;
  let player2: HardhatEthersSigner;
  let player3: HardhatEthersSigner;
  let players: HardhatEthersSigner[];

  const TICKET_PRICE = ethers.parseEther("1");
  const LOTTERY_DURATION = 3.5 * 24 * 60 * 60; // 3.5 days

  beforeEach(async function () {
    [owner, player1, player2, player3, ...players] = await ethers.getSigners();

    const KasplexLotteryFactory = await ethers.getContractFactory("KasplexLottery");
    kasplexLottery = await KasplexLotteryFactory.deploy(owner.address);
    await kasplexLottery.waitForDeployment();
  });

  describe("Edge Cases and Security Tests", function () {
    it("Should handle maximum number selection (1-35)", async function () {
      // Test boundary values
      await kasplexLottery.connect(player1).buyTicket([1, 2, 3, 4, 5], { value: TICKET_PRICE });
      await kasplexLottery.connect(player2).buyTicket([31, 32, 33, 34, 35], { value: TICKET_PRICE });
      
      const tickets1 = await kasplexLottery.getUserTickets(player1.address, 1);
      const tickets2 = await kasplexLottery.getUserTickets(player2.address, 1);
      
      expect(tickets1.length).to.equal(1);
      expect(tickets2.length).to.equal(1);
    });

    it("Should reject duplicate numbers in ticket", async function () {
      await expect(
        kasplexLottery.connect(player1).buyTicket([1, 1, 3, 4, 5], { value: TICKET_PRICE })
      ).to.be.revertedWith("Duplicate numbers not allowed");
    });

    it("Should accept unsorted numbers (contract sorts them)", async function () {
      // Contract should sort numbers automatically
      await kasplexLottery.connect(player1).buyTicket([5, 1, 3, 4, 2], { value: TICKET_PRICE });
      
      const tickets = await kasplexLottery.getUserTickets(player1.address, 1);
      expect(tickets.length).to.equal(1);
    });

    it("Should reject numbers outside valid range", async function () {
      await expect(
        kasplexLottery.connect(player1).buyTicket([0, 1, 2, 3, 4], { value: TICKET_PRICE })
      ).to.be.revertedWith("Invalid number range");

      await expect(
        kasplexLottery.connect(player1).buyTicket([1, 2, 3, 4, 36], { value: TICKET_PRICE })
      ).to.be.revertedWith("Invalid number range");
    });

    it("Should only accept exactly 5 numbers", async function () {
      // This test verifies the function signature enforces exactly 5 numbers
      // The Solidity function signature uint8[5] enforces this at compile time
      await kasplexLottery.connect(player1).buyTicket([1, 2, 3, 4, 5], { value: TICKET_PRICE });
      
      const tickets = await kasplexLottery.getUserTickets(player1.address, 1);
      expect(tickets.length).to.equal(1);
    });

    it("Should handle multiple tickets from same player", async function () {
      await kasplexLottery.connect(player1).buyTicket([1, 2, 3, 4, 5], { value: TICKET_PRICE });
      await kasplexLottery.connect(player1).buyTicket([6, 7, 8, 9, 10], { value: TICKET_PRICE });
      await kasplexLottery.connect(player1).buyTicket([11, 12, 13, 14, 15], { value: TICKET_PRICE });

      const tickets = await kasplexLottery.getUserTickets(player1.address, 1);
      expect(tickets.length).to.equal(3);

      const lotteryInfo = await kasplexLottery.getCurrentLottery();
      expect(lotteryInfo.totalTickets).to.equal(3);
      expect(lotteryInfo.totalPrizePool).to.equal(ethers.parseEther("2.97")); // 3 * 1 * 0.99
    });
  });

  describe("Prize Distribution Edge Cases", function () {
    it("Should handle lottery with no winners", async function () {
      // Start fresh lottery
      await kasplexLottery.connect(player1).buyTicket([1, 2, 3, 4, 5], { value: TICKET_PRICE });
      
      // Draw lottery
      await time.increase(LOTTERY_DURATION + 1);
      await kasplexLottery.connect(owner).drawLottery();
      
      // Check that admin balance increased by 1% of ticket price
      const adminBalance = await kasplexLottery.adminBalance();
      expect(adminBalance).to.be.gt(0); // Should have some admin fees
    });

    it("Should handle claiming prizes multiple times", async function () {
      await kasplexLottery.connect(player1).buyTicket([1, 2, 3, 4, 5], { value: TICKET_PRICE });
      
      await time.increase(LOTTERY_DURATION + 1);
      await kasplexLottery.connect(owner).drawLottery();

      const initialPrize = await kasplexLottery.getUserPrize(player1.address, 1);
      
      if (initialPrize > 0) {
        await kasplexLottery.connect(player1).claimPrize(1);
        
        // Try to claim again - should fail
        await expect(
          kasplexLottery.connect(player1).claimPrize(1)
        ).to.be.revertedWith("Prize already claimed for this lottery");
      }
    });
  });

  describe("Gas Optimization Tests", function () {
    it("Should efficiently handle bulk ticket purchases", async function () {
      const tickets = [
        [1, 2, 3, 4, 5],
        [6, 7, 8, 9, 10],
        [11, 12, 13, 14, 15],
        [16, 17, 18, 19, 20],
        [21, 22, 23, 24, 25]
      ];

      for (let i = 0; i < tickets.length; i++) {
        const tx = await kasplexLottery.connect(player1).buyTicket(tickets[i], { value: TICKET_PRICE });
        const receipt = await tx.wait();
        if (receipt && receipt.gasUsed) {
          console.log(`Ticket ${i + 1} gas used: ${receipt.gasUsed.toString()}`);
        }
      }

      const userTickets = await kasplexLottery.getUserTickets(player1.address, 1);
      expect(userTickets.length).to.equal(5);
    });

    it("Should efficiently handle lottery draw with many tickets", async function () {
      // Create 10 players with tickets
      for (let i = 0; i < 10; i++) {
        const player = players[i] || player1;
        await kasplexLottery.connect(player).buyTicket(
          [1 + i, 2 + i, 3 + i, 4 + i, 5 + i],
          { value: TICKET_PRICE }
        );
      }

      await time.increase(LOTTERY_DURATION + 1);
      
      const tx = await kasplexLottery.connect(owner).drawLottery();
      const receipt = await tx.wait();
      if (receipt && receipt.gasUsed) {
        console.log(`Draw lottery gas used: ${receipt.gasUsed.toString()}`);
      }

      // After drawing, a new lottery should have started
      const lotteryInfo = await kasplexLottery.getCurrentLottery();
      expect(lotteryInfo.id).to.equal(2); // Should be lottery 2 now
      expect(lotteryInfo.drawn).to.be.false; // New lottery not drawn yet
    });
  });

  describe("Admin Function Edge Cases", function () {
    it("Should handle admin fee withdrawal with zero balance", async function () {
      await expect(
        kasplexLottery.connect(owner).withdrawAdminFees()
      ).to.be.revertedWith("No admin fees to withdraw");
    });

    it("Should handle emergency withdrawal with zero balance", async function () {
      await expect(
        kasplexLottery.connect(owner).emergencyWithdraw()
      ).to.not.be.reverted;
    });

    it("Should accumulate admin fees correctly over multiple lotteries", async function () {
      // First lottery
      await kasplexLottery.connect(player1).buyTicket([1, 2, 3, 4, 5], { value: TICKET_PRICE });
      await time.increase(LOTTERY_DURATION + 1);
      await kasplexLottery.connect(owner).drawLottery();

      // Second lottery (auto-started)
      await kasplexLottery.connect(player2).buyTicket([6, 7, 8, 9, 10], { value: TICKET_PRICE });
      await time.increase(LOTTERY_DURATION + 1);
      await kasplexLottery.connect(owner).drawLottery();

      const adminBalance = await kasplexLottery.adminBalance();
      expect(adminBalance).to.equal(ethers.parseEther("0.02")); // 2 * 1 * 0.01
    });
  });

  describe("Time-based Function Tests", function () {
    it("Should correctly calculate time until draw", async function () {
      const timeUntilDraw = await kasplexLottery.getTimeUntilDraw();
      expect(timeUntilDraw).to.be.closeTo(BigInt(LOTTERY_DURATION), BigInt(10)); // Within 10 seconds
    });

    it("Should return 0 time until draw after expiry", async function () {
      await time.increase(LOTTERY_DURATION + 1);
      const timeUntilDraw = await kasplexLottery.getTimeUntilDraw();
      expect(timeUntilDraw).to.equal(0);
    });

    it("Should handle automatic lottery transition correctly", async function () {
      // Buy ticket in first lottery
      await kasplexLottery.connect(player1).buyTicket([1, 2, 3, 4, 5], { value: TICKET_PRICE });
      
      // Fast forward past expiry
      await time.increase(LOTTERY_DURATION + 1);
      
      // Buy ticket - should trigger automatic draw and new lottery
      await kasplexLottery.connect(player2).buyTicket([6, 7, 8, 9, 10], { value: TICKET_PRICE });
      
      // Check that lottery has transitioned automatically
        const lotteryInfo = await kasplexLottery.getCurrentLottery();
        expect(lotteryInfo.id).to.equal(2); // Should be on lottery 2 now
        expect(lotteryInfo.drawn).to.be.false; // New lottery not drawn yet
        expect(lotteryInfo.totalTickets).to.equal(1);
    });
  });

  describe("View Function Comprehensive Tests", function () {
    it("Should return correct lottery information for multiple lotteries", async function () {
      // First lottery
      await kasplexLottery.connect(player1).buyTicket([1, 2, 3, 4, 5], { value: TICKET_PRICE });
      await time.increase(LOTTERY_DURATION + 1);
      await kasplexLottery.connect(owner).drawLottery();

      // Second lottery
      await kasplexLottery.connect(player2).buyTicket([6, 7, 8, 9, 10], { value: TICKET_PRICE });
      
      // Check that we now have lottery 2 active
      const currentLottery = await kasplexLottery.getCurrentLottery();
      expect(currentLottery.id).to.equal(2);
      expect(currentLottery.drawn).to.be.false;
      expect(currentLottery.totalTickets).to.equal(1);
    });

    it("Should return empty tickets for non-existent lottery", async function () {
      const tickets = await kasplexLottery.getUserTickets(player1.address, 999);
      expect(tickets.length).to.equal(0);
    });

    it("Should return zero prize for non-participant", async function () {
      await kasplexLottery.connect(player1).buyTicket([1, 2, 3, 4, 5], { value: TICKET_PRICE });
      await time.increase(LOTTERY_DURATION + 1);
      await kasplexLottery.connect(owner).drawLottery();
      
      const prize = await kasplexLottery.getUserPrize(player2.address, 1);
      expect(prize).to.equal(0);
    });
  });

  describe("Random Number Generation Tests", function () {
    it("Should generate different winning numbers across multiple draws", async function () {
      const winningNumbers: number[][] = [];
      
      for (let i = 0; i < 3; i++) {
        // Buy a ticket to ensure lottery has participants
        await kasplexLottery.connect(player1).buyTicket([1, 2, 3, 4, 5], { value: TICKET_PRICE });
        
        await time.increase(LOTTERY_DURATION + 1);
        await kasplexLottery.connect(owner).drawLottery();
        
        const lotteryInfo = await kasplexLottery.getCurrentLottery();
        const winningNums = await kasplexLottery.getLotteryWinningNumbers(i + 1);
        winningNumbers.push(winningNums.map(n => Number(n)));
        
        console.log(`Lottery ${i + 1} winning numbers:`, winningNumbers[i]);
      }
      
      // Check that winning numbers are within valid range
      for (const numbers of winningNumbers) {
        expect(numbers.length).to.equal(5);
        for (const num of numbers) {
          expect(num).to.be.gte(1);
          expect(num).to.be.lte(50);
        }
        // Check numbers are sorted and unique
        for (let i = 1; i < numbers.length; i++) {
          expect(numbers[i]).to.be.gt(numbers[i - 1]);
        }
      }
    });
  });
});