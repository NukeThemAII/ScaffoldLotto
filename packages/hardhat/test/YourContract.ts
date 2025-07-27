import { expect } from "chai";
import { ethers } from "hardhat";
import { KasplexLottery } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("KasplexLottery", function () {
  let kasplexLottery: KasplexLottery;
  let owner: HardhatEthersSigner;
  let player1: HardhatEthersSigner;
  let player2: HardhatEthersSigner;
  let player3: HardhatEthersSigner;

  const TICKET_PRICE = ethers.parseEther("1"); // 1 KAS
  const DRAW_INTERVAL = 3.5 * 24 * 60 * 60; // 3.5 days in seconds

  before(async () => {
    [owner, player1, player2, player3] = await ethers.getSigners();
    const kasplexLotteryFactory = await ethers.getContractFactory("KasplexLottery");
    kasplexLottery = (await kasplexLotteryFactory.deploy(owner.address)) as KasplexLottery;
    await kasplexLottery.waitForDeployment();
  });

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      expect(await kasplexLottery.owner()).to.equal(owner.address);
    });

    it("Should start with lottery ID 1", async function () {
      expect(await kasplexLottery.currentLotteryId()).to.equal(1);
    });

    it("Should have correct constants", async function () {
      expect(await kasplexLottery.TICKET_PRICE()).to.equal(TICKET_PRICE);
      expect(await kasplexLottery.ADMIN_FEE_PERCENT()).to.equal(1);
      expect(await kasplexLottery.MIN_NUMBERS()).to.equal(1);
      expect(await kasplexLottery.MAX_NUMBERS()).to.equal(35);
      expect(await kasplexLottery.NUMBERS_PER_TICKET()).to.equal(5);
    });

    it("Should initialize first lottery", async function () {
      const lottery = await kasplexLottery.getCurrentLottery();
      expect(lottery.id).to.equal(1);
      expect(lottery.totalTickets).to.equal(0);
      expect(lottery.totalPrizePool).to.equal(0);
      expect(lottery.drawn).to.equal(false);
    });
  });

  describe("Ticket Purchase", function () {
    it("Should allow buying a valid ticket", async function () {
      const numbers: [number, number, number, number, number] = [1, 5, 10, 20, 35];
      
      await expect(
        kasplexLottery.connect(player1).buyTicket(numbers, { value: TICKET_PRICE })
      ).to.emit(kasplexLottery, "TicketPurchased")
        .withArgs(1, player1.address, 0, numbers);

      const lottery = await kasplexLottery.getCurrentLottery();
      expect(lottery.totalTickets).to.equal(1);
      expect(lottery.totalPrizePool).to.equal(ethers.parseEther("0.99")); // 99% after 1% admin fee
    });

    it("Should reject tickets with incorrect price", async function () {
      const numbers: [number, number, number, number, number] = [2, 6, 11, 21, 34];
      
      await expect(
        kasplexLottery.connect(player1).buyTicket(numbers, { value: ethers.parseEther("0.5") })
      ).to.be.revertedWith("Incorrect ticket price");
    });

    it("Should reject tickets with invalid numbers", async function () {
      // Test number out of range
      const invalidNumbers1: [number, number, number, number, number] = [0, 5, 10, 20, 35];
      await expect(
        kasplexLottery.connect(player1).buyTicket(invalidNumbers1, { value: TICKET_PRICE })
      ).to.be.revertedWith("Invalid number range");

      // Test number too high
      const invalidNumbers2: [number, number, number, number, number] = [1, 5, 10, 20, 36];
      await expect(
        kasplexLottery.connect(player1).buyTicket(invalidNumbers2, { value: TICKET_PRICE })
      ).to.be.revertedWith("Invalid number range");

      // Test duplicate numbers
      const invalidNumbers3: [number, number, number, number, number] = [1, 5, 10, 10, 35];
      await expect(
        kasplexLottery.connect(player1).buyTicket(invalidNumbers3, { value: TICKET_PRICE })
      ).to.be.revertedWith("Duplicate numbers not allowed");
    });

    it("Should allow multiple players to buy tickets", async function () {
      const numbers2: [number, number, number, number, number] = [3, 7, 14, 28, 33];
      const numbers3: [number, number, number, number, number] = [2, 8, 16, 24, 32];
      
      await kasplexLottery.connect(player2).buyTicket(numbers2, { value: TICKET_PRICE });
      await kasplexLottery.connect(player3).buyTicket(numbers3, { value: TICKET_PRICE });

      const lottery = await kasplexLottery.getCurrentLottery();
      expect(lottery.totalTickets).to.equal(3);
      expect(lottery.totalPrizePool).to.equal(ethers.parseEther("2.97")); // 3 tickets * 0.99
    });

    it("Should track admin fees correctly", async function () {
      const adminBalance = await kasplexLottery.adminBalance();
      expect(adminBalance).to.equal(ethers.parseEther("0.03")); // 3 tickets * 0.01
    });
  });

  describe("Lottery Draw", function () {
    it("Should not allow drawing before time expires", async function () {
      await expect(
        kasplexLottery.connect(player1).drawLottery()
      ).to.be.revertedWith("Lottery still active");
    });

    it("Should allow drawing after time expires", async function () {
      // Fast forward time to after lottery end
      await time.increase(DRAW_INTERVAL + 1);
      
      await expect(
        kasplexLottery.connect(player1).drawLottery()
      ).to.emit(kasplexLottery, "LotteryDrawn");

      const lottery = await kasplexLottery.getCurrentLottery();
      expect(lottery.id).to.equal(2); // Should start new lottery
    });

    it("Should not allow drawing the same lottery twice", async function () {
      await expect(
        kasplexLottery.connect(player1).drawLottery()
      ).to.be.revertedWith("Lottery still active");
    });
  });

  describe("Prize Distribution", function () {
    let lotteryId: number;
    
    beforeEach(async function () {
      // Start fresh lottery and buy some tickets
      lotteryId = Number(await kasplexLottery.currentLotteryId());
      
      // Buy tickets with known numbers for testing
      const numbers1: [number, number, number, number, number] = [1, 2, 3, 4, 5];
      const numbers2: [number, number, number, number, number] = [6, 7, 8, 9, 10];
      
      await kasplexLottery.connect(player1).buyTicket(numbers1, { value: TICKET_PRICE });
      await kasplexLottery.connect(player2).buyTicket(numbers2, { value: TICKET_PRICE });
    });

    it("Should generate winning numbers within valid range", async function () {
      await time.increase(DRAW_INTERVAL + 1);
      await kasplexLottery.connect(player1).drawLottery();
      
      const winningNumbers = await kasplexLottery.getLotteryWinningNumbers(lotteryId);
      
      for (let i = 0; i < 5; i++) {
        expect(winningNumbers[i]).to.be.gte(1);
        expect(winningNumbers[i]).to.be.lte(35);
      }
      
      // Check for duplicates
      const uniqueNumbers = new Set(winningNumbers.map(n => Number(n)));
      expect(uniqueNumbers.size).to.equal(5);
    });
  });

  describe("Prize Claiming", function () {
    it("Should allow players to claim prizes", async function () {
      // Buy a ticket
      await kasplexLottery.connect(player1).buyTicket([1, 2, 3, 4, 5], { value: TICKET_PRICE });
      
      // Fast forward time and draw
      await time.increase(DRAW_INTERVAL + 1);
      await kasplexLottery.drawLottery();
      
      // Check if player has any prize (this depends on random generation)
       const prize = await kasplexLottery.getUserPrize(player1.address, 1);
       
       if (prize > 0) {
         await expect(kasplexLottery.connect(player1).claimPrize(1))
           .to.emit(kasplexLottery, "PrizeClaimed")
           .withArgs(player1.address, prize, 1);
       }
    });

    it("Should reject claiming when no prize available", async function () {
      // Try to claim from a non-existent lottery
      await expect(kasplexLottery.connect(player1).claimPrize(999))
        .to.be.revertedWith("Lottery not drawn yet");
        
      // Buy a ticket and draw lottery
      await kasplexLottery.connect(player1).buyTicket([1, 2, 3, 4, 5], { value: TICKET_PRICE });
      await time.increase(DRAW_INTERVAL + 1);
      await kasplexLottery.drawLottery();
      
      // Try to claim with an address that has no winning tickets
      await expect(kasplexLottery.connect(player3).claimPrize(1))
        .to.be.revertedWith("No prize to claim");
    });
  });

  describe("Admin Functions", function () {
    it("Should allow owner to withdraw admin fees", async function () {
      const adminBalance = await kasplexLottery.adminBalance();
      
      if (adminBalance > 0) {
        await expect(
          kasplexLottery.connect(owner).withdrawAdminFees()
        ).to.emit(kasplexLottery, "AdminFeesWithdrawn")
          .withArgs(owner.address, adminBalance);
        
        expect(await kasplexLottery.adminBalance()).to.equal(0);
      }
    });

    it("Should reject non-owner admin fee withdrawal", async function () {
      await expect(
        kasplexLottery.connect(player1).withdrawAdminFees()
      ).to.be.revertedWith("Not the owner");
    });

    it("Should allow emergency withdrawal by owner", async function () {
      await expect(
        kasplexLottery.connect(owner).emergencyWithdraw()
      ).to.not.be.reverted;
    });

    it("Should reject emergency withdrawal by non-owner", async function () {
      await expect(
        kasplexLottery.connect(player1).emergencyWithdraw()
      ).to.be.revertedWith("Not the owner");
    });
  });

  describe("View Functions", function () {
    it("Should return correct lottery information", async function () {
      const lottery = await kasplexLottery.getCurrentLottery();
      expect(lottery.id).to.be.gt(0);
      expect(lottery.startTime).to.be.gt(0);
      expect(lottery.endTime).to.be.gt(lottery.startTime);
    });

    it("Should return time until draw", async function () {
      const timeUntilDraw = await kasplexLottery.getTimeUntilDraw();
      expect(timeUntilDraw).to.be.gte(0);
    });

    it("Should return player tickets", async function () {
      const currentLotteryId = await kasplexLottery.currentLotteryId();
      const playerTickets = await kasplexLottery.getPlayerTickets(player1.address, currentLotteryId);
      expect(Array.isArray(playerTickets)).to.be.true;
    });
  });

  describe("Automatic Lottery Transition", function () {
    it("Should automatically draw and start new lottery when buying ticket after expiry", async function () {
      const currentLotteryId = await kasplexLottery.currentLotteryId();
      
      // Fast forward time
      await time.increase(DRAW_INTERVAL + 1);
      
      // Buy ticket should trigger draw and new lottery
      const numbers: [number, number, number, number, number] = [15, 16, 17, 18, 19];
      await kasplexLottery.connect(player1).buyTicket(numbers, { value: TICKET_PRICE });
      
      const newLotteryId = await kasplexLottery.currentLotteryId();
      expect(newLotteryId).to.equal(currentLotteryId + 1n);
    });
  });
});
