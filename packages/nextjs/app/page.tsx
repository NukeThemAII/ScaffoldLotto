"use client";

import { useState, useEffect } from "react";
import type { NextPage } from "next";
import { useAccount } from "wagmi";
import { parseEther, formatEther } from "viem";
import { Address } from "~~/components/scaffold-eth";
import {
  useScaffoldReadContract,
  useScaffoldWriteContract,
  useScaffoldWatchContractEvent,
} from "~~/hooks/scaffold-eth";

const Home: NextPage = () => {
  const { address: connectedAddress } = useAccount();
  const [selectedNumbers, setSelectedNumbers] = useState<number[]>([]);
  const [claimLotteryId, setClaimLotteryId] = useState<string>("");

  // Read contract data
  const { data: currentLotteryId } = useScaffoldReadContract({
    contractName: "KasplexLottery",
    functionName: "currentLotteryId",
  });

  const { data: ticketPrice } = useScaffoldReadContract({
    contractName: "KasplexLottery",
    functionName: "TICKET_PRICE",
  });

  const { data: currentLottery } = useScaffoldReadContract({
    contractName: "KasplexLottery",
    functionName: "lotteries",
    args: currentLotteryId ? [currentLotteryId] : undefined,
  });

  const { data: userTickets } = useScaffoldReadContract({
    contractName: "KasplexLottery",
    functionName: "getUserTickets",
    args: connectedAddress && currentLotteryId ? [connectedAddress, currentLotteryId] : undefined,
  });

  const { data: userPrize } = useScaffoldReadContract({
    contractName: "KasplexLottery",
    functionName: "getUserPrize",
    args: connectedAddress && claimLotteryId ? [connectedAddress, BigInt(claimLotteryId || "0")] : undefined,
  });

  // Write contract functions
  const { writeContractAsync: buyTicket } = useScaffoldWriteContract("KasplexLottery");
  const { writeContractAsync: drawLottery } = useScaffoldWriteContract("KasplexLottery");
  const { writeContractAsync: claimPrize } = useScaffoldWriteContract("KasplexLottery");

  // Watch for events
  useScaffoldWatchContractEvent({
    contractName: "KasplexLottery",
    eventName: "TicketPurchased",
    onLogs: logs => {
      console.log("Ticket purchased:", logs);
    },
  });

  useScaffoldWatchContractEvent({
    contractName: "KasplexLottery",
    eventName: "LotteryDrawn",
    onLogs: logs => {
      console.log("Lottery drawn:", logs);
    },
  });

  const handleNumberSelect = (number: number) => {
    if (selectedNumbers.includes(number)) {
      setSelectedNumbers(selectedNumbers.filter(n => n !== number));
    } else if (selectedNumbers.length < 5) {
      setSelectedNumbers([...selectedNumbers, number].sort((a, b) => a - b));
    }
  };

  const handleBuyTicket = async () => {
    if (selectedNumbers.length !== 5) {
      alert("Please select exactly 5 numbers");
      return;
    }

    try {
      await buyTicket({
        functionName: "buyTicket",
        args: [selectedNumbers.map(n => BigInt(n))],
        value: ticketPrice,
      });
      setSelectedNumbers([]);
    } catch (error) {
      console.error("Error buying ticket:", error);
    }
  };

  const handleDrawLottery = async () => {
    try {
      await drawLottery({
        functionName: "drawLottery",
      });
    } catch (error) {
      console.error("Error drawing lottery:", error);
    }
  };

  const handleClaimPrize = async () => {
    if (!claimLotteryId) {
      alert("Please enter a lottery ID");
      return;
    }

    try {
      await claimPrize({
        functionName: "claimPrize",
        args: [BigInt(claimLotteryId)],
      });
      setClaimLotteryId("");
    } catch (error) {
      console.error("Error claiming prize:", error);
    }
  };

  const isLotteryActive = currentLottery && currentLottery[1] === 0; // status === Active
  const nextDrawTime = currentLottery ? new Date(Number(currentLottery[3]) * 1000) : null;

  return (
    <>
      <div className="flex items-center flex-col grow pt-10">
        <div className="px-5">
          <h1 className="text-center">
            <span className="block text-2xl mb-2">🎰 Welcome to</span>
            <span className="block text-4xl font-bold">Kasplex Lottery</span>
          </h1>
          <div className="flex justify-center items-center space-x-2 flex-col">
            <p className="my-2 font-medium">Connected Address:</p>
            <Address address={connectedAddress} />
          </div>
        </div>

        <div className="grow bg-base-300 w-full mt-16 px-8 py-12">
          <div className="flex justify-center items-start gap-8 flex-col lg:flex-row">
            {/* Current Lottery Info */}
            <div className="flex flex-col bg-base-100 px-6 py-6 text-center items-center max-w-md rounded-3xl">
              <h2 className="text-2xl font-bold mb-4">🎯 Current Lottery</h2>
              <div className="space-y-2 text-left w-full">
                <p><strong>Lottery ID:</strong> {currentLotteryId?.toString() || "Loading..."}</p>
                <p><strong>Status:</strong> {isLotteryActive ? "🟢 Active" : "🔴 Drawn"}</p>
                <p><strong>Ticket Price:</strong> {ticketPrice ? formatEther(ticketPrice) : "Loading..."} KAS</p>
                <p><strong>Prize Pool:</strong> {currentLottery ? formatEther(currentLottery[2]) : "Loading..."} KAS</p>
                {nextDrawTime && (
                  <p><strong>Next Draw:</strong> {nextDrawTime.toLocaleString()}</p>
                )}
                {currentLottery && currentLottery[1] === 1 && ( // status === Drawn
                  <div>
                    <p><strong>Winning Numbers:</strong></p>
                    <div className="flex gap-2 justify-center mt-2">
                      {currentLottery[4]?.map((num: bigint, index: number) => (
                        <div key={index} className="w-8 h-8 bg-primary text-primary-content rounded-full flex items-center justify-center font-bold">
                          {num.toString()}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              {isLotteryActive && (
                <button
                  className="btn btn-secondary mt-4"
                  onClick={handleDrawLottery}
                >
                  🎲 Draw Lottery (Admin)
                </button>
              )}
            </div>

            {/* Buy Ticket */}
            <div className="flex flex-col bg-base-100 px-6 py-6 text-center items-center max-w-md rounded-3xl">
              <h2 className="text-2xl font-bold mb-4">🎫 Buy Ticket</h2>
              <p className="mb-4">Select 5 numbers (1-35):</p>
              
              <div className="grid grid-cols-7 gap-2 mb-4">
                {Array.from({ length: 35 }, (_, i) => i + 1).map(number => (
                  <button
                    key={number}
                    className={`w-10 h-10 rounded-full font-bold ${
                      selectedNumbers.includes(number)
                        ? "bg-primary text-primary-content"
                        : "bg-base-200 hover:bg-base-300"
                    }`}
                    onClick={() => handleNumberSelect(number)}
                    disabled={!isLotteryActive}
                  >
                    {number}
                  </button>
                ))}
              </div>
              
              <div className="mb-4">
                <p><strong>Selected:</strong> {selectedNumbers.join(", ") || "None"}</p>
                <p><strong>Numbers selected:</strong> {selectedNumbers.length}/5</p>
              </div>
              
              <button
                className="btn btn-primary"
                onClick={handleBuyTicket}
                disabled={!isLotteryActive || selectedNumbers.length !== 5 || !connectedAddress}
              >
                🎫 Buy Ticket ({ticketPrice ? formatEther(ticketPrice) : "..."} KAS)
              </button>
            </div>

            {/* User Tickets & Prize Claim */}
            <div className="flex flex-col bg-base-100 px-6 py-6 text-center items-center max-w-md rounded-3xl">
              <h2 className="text-2xl font-bold mb-4">🎟️ Your Tickets</h2>
              
              {userTickets && userTickets.length > 0 ? (
                <div className="space-y-2 mb-4 w-full">
                  <p><strong>Current Lottery Tickets:</strong></p>
                  {userTickets.map((ticket: any, index: number) => (
                    <div key={index} className="bg-base-200 p-2 rounded">
                      <div className="flex gap-1 justify-center">
                        {ticket.map((num: bigint, numIndex: number) => (
                          <div key={numIndex} className="w-6 h-6 bg-accent text-accent-content rounded-full flex items-center justify-center text-xs font-bold">
                            {num.toString()}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mb-4">No tickets for current lottery</p>
              )}
              
              <div className="divider">Prize Claim</div>
              
              <div className="space-y-2 w-full">
                <input
                  type="number"
                  placeholder="Lottery ID to claim"
                  className="input input-bordered w-full"
                  value={claimLotteryId}
                  onChange={(e) => setClaimLotteryId(e.target.value)}
                />
                
                {userPrize && userPrize > 0n && (
                  <p className="text-success font-bold">
                    💰 Prize Available: {formatEther(userPrize)} KAS
                  </p>
                )}
                
                <button
                  className="btn btn-success w-full"
                  onClick={handleClaimPrize}
                  disabled={!claimLotteryId || !connectedAddress}
                >
                  🏆 Claim Prize
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default Home;
