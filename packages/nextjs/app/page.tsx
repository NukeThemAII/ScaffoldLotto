"use client";

import { useCallback, useEffect, useState } from "react";
import type { NextPage } from "next";
import { formatEther } from "viem";
import { useAccount } from "wagmi";
import { Address, RainbowKitCustomConnectButton } from "~~/components/scaffold-eth";
import { AdminDashboard } from "~~/components/AdminDashboard";
import { PlayerStatistics } from "~~/components/PlayerStatistics";
import {
  useScaffoldReadContract,
  useScaffoldWatchContractEvent,
  useScaffoldWriteContract,
} from "~~/hooks/scaffold-eth";
import { notification } from "~~/utils/scaffold-eth";

const Home: NextPage = () => {
  const { address: connectedAddress } = useAccount();

  // State
  const [selectedNumbers, setSelectedNumbers] = useState<number[]>([]);
  const [ticketQuantity, setTicketQuantity] = useState<number>(1);
  const [tickets, setTickets] = useState<number[][]>([]);
  const [currentTicketIndex, setCurrentTicketIndex] = useState<number>(0);
  const [activeTab, setActiveTab] = useState<'play' | 'results' | 'prizes' | 'statistics' | 'admin'>('play');
  const [claimableTickets, setClaimableTickets] = useState<any[]>([]);

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
    functionName: "getCurrentLottery",
  });

  const { data: userTickets } = useScaffoldReadContract({
    contractName: "KasplexLottery",
    functionName: "getUserTickets",
    args: connectedAddress && currentLotteryId ? [connectedAddress, currentLotteryId] : undefined,
  });

  // Get winning numbers for previous lottery (if drawn)
  const { data: winningNumbers } = useScaffoldReadContract({
    contractName: "KasplexLottery",
    functionName: "getLotteryWinningNumbers",
    args: currentLotteryId && currentLotteryId > 1n ? [currentLotteryId - 1n] : undefined,
    enabled: !!currentLotteryId && currentLotteryId > 1n,
  });

  // Get previous lottery details
  const { data: previousLottery } = useScaffoldReadContract({
    contractName: "KasplexLottery",
    functionName: "getLotteryDetails",
    args: currentLotteryId && currentLotteryId > 1n ? [currentLotteryId - 1n] : undefined,
    enabled: !!currentLotteryId && currentLotteryId > 1n,
  });

  // Get user tickets for previous lottery
  const { data: previousUserTickets } = useScaffoldReadContract({
    contractName: "KasplexLottery",
    functionName: "getUserTickets",
    args: connectedAddress && currentLotteryId && currentLotteryId > 1n ? [connectedAddress, currentLotteryId - 1n] : undefined,
    enabled: !!connectedAddress && !!currentLotteryId && currentLotteryId > 1n,
  });

  // Write contract functions
  const { writeContractAsync: buyTicket } = useScaffoldWriteContract("KasplexLottery");
  const { writeContractAsync: drawLottery } = useScaffoldWriteContract("KasplexLottery");
  const { writeContractAsync: claimPrize } = useScaffoldWriteContract("KasplexLottery");

  // Utility functions
  const generateRandomNumbers = (): number[] => {
    const numbers: number[] = [];
    while (numbers.length < 5) {
      const randomNum = Math.floor(Math.random() * 35) + 1;
      if (!numbers.includes(randomNum)) {
        numbers.push(randomNum);
      }
    }
    return numbers.sort((a, b) => a - b);
  };

  const countMatches = (userNumbers: number[], winningNumbers: number[]): number => {
    return userNumbers.filter(num => winningNumbers.includes(num)).length;
  };

  const initializeTickets = useCallback((quantity: number) => {
    const newTickets: number[][] = [];
    for (let i = 0; i < quantity; i++) {
      newTickets.push([]);
    }
    setTickets(newTickets);
    setCurrentTicketIndex(0);
    setSelectedNumbers([]);
  }, []);

  const updateCurrentTicket = useCallback((numbers: number[]) => {
    const updatedTickets = [...tickets];
    updatedTickets[currentTicketIndex] = numbers;
    setTickets(updatedTickets);
  }, [tickets, currentTicketIndex]);

  const fillRandomTicket = () => {
    const randomNumbers = generateRandomNumbers();
    setSelectedNumbers(randomNumbers);
    updateCurrentTicket(randomNumbers);
  };

  const fillAllRandomTickets = () => {
    const newTickets = tickets.map(() => generateRandomNumbers());
    setTickets(newTickets);
    setSelectedNumbers(newTickets[currentTicketIndex] || []);
  };

  // Check for claimable prizes from previous lotteries
  const checkClaimablePrizes = useCallback(async () => {
    if (!connectedAddress || !currentLotteryId) return;
    
    const claimable = [];
    // Check last 5 lotteries for unclaimed prizes
    for (let i = Math.max(1, Number(currentLotteryId) - 5); i < Number(currentLotteryId); i++) {
      try {
        // This would need to be implemented in the contract or we'd need to track it
        // For now, we'll just check the previous lottery
        if (i === Number(currentLotteryId) - 1 && previousUserTickets && winningNumbers) {
          const hasWinningTickets = Array.from(previousUserTickets).some((ticket: any) => {
            const matches = countMatches(Array.from(ticket), Array.from(winningNumbers));
            return matches >= 2;
          });
          if (hasWinningTickets) {
            claimable.push({ lotteryId: i, tickets: previousUserTickets });
          }
        }
      } catch (err) {
          console.log(`No data for lottery ${i}`, err);
        }
    }
    setClaimableTickets(claimable);
  }, [connectedAddress, currentLotteryId]);

  // Watch for events
  useScaffoldWatchContractEvent({
    contractName: "KasplexLottery",
    eventName: "TicketPurchased",
    onLogs: logs => {
      console.log("Ticket purchased:", logs);
      notification.success("🎫 Ticket purchased successfully!");
    },
  });

  useScaffoldWatchContractEvent({
    contractName: "KasplexLottery",
    eventName: "LotteryDrawn",
    onLogs: logs => {
      console.log("Lottery drawn:", logs);
      notification.success("🎲 Lottery drawn! Check your results!");
      setActiveTab('results');
    },
  });

  useScaffoldWatchContractEvent({
    contractName: "KasplexLottery",
    eventName: "PrizeClaimed",
    onLogs: logs => {
      console.log("Prize claimed:", logs);
      notification.success("🏆 Prize claimed successfully!");
      checkClaimablePrizes();
    },
  });

  // Effects
  useEffect(() => {
    initializeTickets(ticketQuantity);
  }, [ticketQuantity, initializeTickets]);

  useEffect(() => {
    updateCurrentTicket(selectedNumbers);
  }, [selectedNumbers, updateCurrentTicket]);

  useEffect(() => {
    checkClaimablePrizes();
  }, [checkClaimablePrizes]);

  const handleNumberSelect = (number: number) => {
    if (!connectedAddress) {
      notification.error("Please connect your wallet first");
      return;
    }
    
    if (!isLotteryActive) {
      notification.error("Lottery is not active");
      return;
    }
    
    if (selectedNumbers.includes(number)) {
      setSelectedNumbers(selectedNumbers.filter(n => n !== number));
    } else if (selectedNumbers.length < 5) {
      setSelectedNumbers([...selectedNumbers, number].sort((a, b) => a - b));
    } else {
      notification.warning("You can only select 5 numbers");
    }
  };

  const handleTicketNavigation = (index: number) => {
    setCurrentTicketIndex(index);
    setSelectedNumbers(tickets[index] || []);
  };

  const handleQuantityChange = (quantity: number) => {
    setTicketQuantity(Math.max(1, Math.min(10, quantity)));
  };

  const handleBuyTicket = async () => {
    if (!connectedAddress) {
      notification.error("Please connect your wallet first");
      return;
    }
    
    const incompleteTickets = tickets.filter(ticket => ticket.length !== 5);
    if (incompleteTickets.length > 0) {
      notification.error(`Please select exactly 5 numbers for all ${ticketQuantity} ticket(s)`);
      return;
    }
    
    if (!isLotteryActive) {
      notification.error("Lottery is not active");
      return;
    }

    if (!ticketPrice) {
      notification.error("Ticket price not loaded yet");
      return;
    }

    try {
      notification.info(`🎫 Purchasing ${ticketQuantity} ticket(s)...`);
      
      for (let i = 0; i < tickets.length; i++) {
        const ticketNumbers = tickets[i];
        const numbersAsUint8 = ticketNumbers.map(n => n) as [number, number, number, number, number];
        
        await buyTicket({
          functionName: "buyTicket",
          args: [numbersAsUint8],
          value: ticketPrice,
        });
      }
      
      initializeTickets(ticketQuantity);
    } catch (error: any) {
      console.error("Error buying tickets:", error);
      notification.error(`Failed to buy ticket(s): ${error?.message || 'Unknown error'}`);
    }
  };

  const handleDrawLottery = async () => {
    if (!connectedAddress) {
      notification.error("Please connect your wallet first");
      return;
    }
    
    try {
      notification.info("🎲 Drawing lottery...");
      await drawLottery({
        functionName: "drawLottery",
      });
    } catch (error) {
      console.error("Error drawing lottery:", error);
      notification.error(`Failed to draw lottery: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleClaimPrize = async (lotteryId: number) => {
    if (!connectedAddress) {
      notification.error("Please connect your wallet first");
      return;
    }

    try {
      notification.info("🏆 Claiming prize...");
      await claimPrize({
        functionName: "claimPrize",
        args: [BigInt(lotteryId)],
      });
    } catch (error) {
      console.error("Error claiming prize:", error);
      notification.error(`Failed to claim prize: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const isLotteryActive = currentLottery && !currentLottery[5];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-purple-900 to-teal-900">
      {/* Animated Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-gradient-to-br from-cyan-400/20 to-blue-600/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-gradient-to-br from-teal-400/20 to-green-600/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-gradient-to-br from-purple-400/10 to-pink-600/10 rounded-full blur-3xl animate-pulse delay-500"></div>
      </div>

      <div className="relative z-10 container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-6xl font-bold mb-4 bg-gradient-to-r from-cyan-400 via-blue-500 to-teal-400 bg-clip-text text-transparent animate-pulse">
            ⚡ GhostDAG Lottery ⚡
          </h1>
          <p className="text-xl text-cyan-200 mb-6">Decentralized • 10 BPS • Lightning Fast</p>
          
          {/* Connection Status */}
          <div className="flex justify-center items-center mb-6">
            {connectedAddress ? (
              <div className="bg-black/30 backdrop-blur-md rounded-2xl p-4 border border-cyan-500/30">
                <p className="text-cyan-400 font-medium mb-2">⚡ Connected to GhostDAG</p>
                <Address address={connectedAddress} />
              </div>
            ) : (
              <div className="bg-black/30 backdrop-blur-md rounded-2xl p-4 border border-orange-500/30">
                <p className="text-orange-400 font-medium mb-2">🔌 Connect to GhostDAG Network</p>
                <RainbowKitCustomConnectButton />
              </div>
            )}
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex justify-center mb-8">
          <div className="bg-black/30 backdrop-blur-md rounded-2xl p-2 border border-cyan-500/30">
            <div className="flex space-x-2 flex-wrap gap-2">
              {[
                { id: 'play', label: '🎮 Play', icon: '🎯' },
                { id: 'results', label: '🏆 Results', icon: '📊' },
                { id: 'prizes', label: '💎 Prizes', icon: '🎁' },
                { id: 'statistics', label: '📈 Statistics', icon: '📊' },
                { id: 'admin', label: '⚙️ Admin', icon: '🔧' }
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`px-4 py-3 rounded-xl font-semibold transition-all duration-300 text-sm ${
                    activeTab === tab.id
                      ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow-lg shadow-cyan-500/25'
                      : 'text-cyan-300 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <span className="mr-2">{tab.icon}</span>
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Current Lottery Status */}
        <div className="bg-black/30 backdrop-blur-md rounded-2xl p-6 border border-cyan-500/30 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 text-center">
            <div className="space-y-2">
              <div className="text-3xl font-bold text-cyan-400">
                #{currentLotteryId?.toString() || "--"}
              </div>
              <div className="text-cyan-200 text-sm">Current Round</div>
            </div>
            <div className="space-y-2">
              <div className="text-3xl font-bold text-teal-400">
                {currentLottery ? formatEther(currentLottery[3]) : "--"} KAS
              </div>
              <div className="text-teal-200 text-sm">Prize Pool</div>
            </div>
            <div className="space-y-2">
              <div className="text-3xl font-bold text-blue-400">
                {currentLottery ? currentLottery[4]?.toString() : "--"}
              </div>
              <div className="text-blue-200 text-sm">Total Tickets</div>
            </div>
            <div className="space-y-2">
              <div className={`text-3xl font-bold ${
                isLotteryActive ? 'text-green-400' : 'text-red-400'
              }`}>
                {isLotteryActive ? "🟢 LIVE" : "🔴 DRAWN"}
              </div>
              <div className="text-gray-300 text-sm">Status</div>
            </div>
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === 'play' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Number Selection */}
            <div className="bg-black/30 backdrop-blur-md rounded-2xl p-6 border border-cyan-500/30">
              <h2 className="text-2xl font-bold text-cyan-400 mb-6 text-center">
                🎯 Select Your Numbers
              </h2>
              
              {/* Ticket Quantity */}
              <div className="flex items-center justify-center gap-4 mb-6">
                <span className="text-cyan-200">Tickets:</span>
                <div className="flex items-center gap-2">
                  <button
                    className="btn btn-sm btn-circle bg-cyan-500/20 border-cyan-500/50 text-cyan-400 hover:bg-cyan-500/30"
                    onClick={() => handleQuantityChange(ticketQuantity - 1)}
                    disabled={ticketQuantity <= 1}
                  >
                    -
                  </button>
                  <span className="text-2xl font-bold text-white w-8 text-center">{ticketQuantity}</span>
                  <button
                    className="btn btn-sm btn-circle bg-cyan-500/20 border-cyan-500/50 text-cyan-400 hover:bg-cyan-500/30"
                    onClick={() => handleQuantityChange(ticketQuantity + 1)}
                    disabled={ticketQuantity >= 10}
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Ticket Navigation */}
              {ticketQuantity > 1 && (
                <div className="flex gap-2 flex-wrap justify-center mb-6">
                  {tickets.map((ticket, index) => (
                    <button
                      key={index}
                      onClick={() => handleTicketNavigation(index)}
                      className={`px-4 py-2 rounded-lg font-semibold transition-all ${
                        currentTicketIndex === index
                          ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white'
                          : ticket.length === 5
                          ? 'bg-green-500/20 border border-green-500/50 text-green-400'
                          : 'bg-gray-500/20 border border-gray-500/50 text-gray-400'
                      }`}
                    >
                      #{index + 1} {ticket.length === 5 ? '✓' : `(${ticket.length}/5)`}
                    </button>
                  ))}
                </div>
              )}

              {/* Number Grid */}
              <div className="grid grid-cols-7 gap-2 mb-6">
                {Array.from({ length: 35 }, (_, i) => i + 1).map(number => (
                  <button
                    key={number}
                    onClick={() => handleNumberSelect(number)}
                    disabled={!connectedAddress || !isLotteryActive}
                    className={`aspect-square rounded-lg font-bold text-lg transition-all duration-200 ${
                      selectedNumbers.includes(number)
                        ? 'bg-gradient-to-br from-cyan-400 to-blue-500 text-white shadow-lg shadow-cyan-500/25 scale-110'
                        : connectedAddress && isLotteryActive
                        ? 'bg-white/10 text-cyan-200 border border-cyan-500/30 hover:bg-cyan-500/20 hover:scale-105'
                        : 'bg-gray-500/20 text-gray-500 cursor-not-allowed'
                    }`}
                  >
                    {number}
                  </button>
                ))}
              </div>

              {/* Selected Numbers Display */}
              <div className="bg-black/50 rounded-xl p-4 mb-6">
                <p className="text-cyan-200 text-sm mb-2">Selected Numbers ({selectedNumbers.length}/5):</p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {selectedNumbers.length > 0 ? (
                    selectedNumbers.map(num => (
                      <span key={num} className="bg-gradient-to-r from-cyan-500 to-blue-500 text-white px-3 py-1 rounded-full font-bold">
                        {num}
                      </span>
                    ))
                  ) : (
                    <span className="text-gray-400">No numbers selected</span>
                  )}
                </div>
              </div>

              {/* Quick Actions */}
              <div className="flex gap-2 flex-wrap justify-center mb-6">
                <button
                  className="btn btn-sm bg-purple-500/20 border-purple-500/50 text-purple-400 hover:bg-purple-500/30"
                  onClick={fillRandomTicket}
                  disabled={!connectedAddress}
                >
                  🎲 Random
                </button>
                <button
                  className="btn btn-sm bg-purple-500/20 border-purple-500/50 text-purple-400 hover:bg-purple-500/30"
                  onClick={fillAllRandomTickets}
                  disabled={!connectedAddress}
                >
                  🎲 All Random
                </button>
                <button
                  className="btn btn-sm bg-red-500/20 border-red-500/50 text-red-400 hover:bg-red-500/30"
                  onClick={() => setSelectedNumbers([])}
                  disabled={!connectedAddress}
                >
                  🗑️ Clear
                </button>
              </div>

              {/* Buy Button */}
              <button
                onClick={handleBuyTicket}
                disabled={tickets.some(ticket => ticket.length !== 5) || !connectedAddress || !isLotteryActive}
                className={`w-full py-4 rounded-xl font-bold text-lg transition-all duration-300 ${
                  !tickets.some(ticket => ticket.length !== 5) && connectedAddress && isLotteryActive
                    ? 'bg-gradient-to-r from-green-500 to-emerald-500 text-white hover:shadow-lg hover:shadow-green-500/25 hover:scale-105'
                    : 'bg-gray-500/20 text-gray-500 cursor-not-allowed'
                }`}
              >
                {!connectedAddress 
                  ? "🔌 Connect Wallet" 
                  : tickets.some(ticket => ticket.length !== 5)
                  ? `Complete ${ticketQuantity} ticket${ticketQuantity > 1 ? 's' : ''}`
                  : `🎫 Buy ${ticketQuantity} Ticket${ticketQuantity > 1 ? 's' : ''} (${ticketPrice ? formatEther(BigInt(ticketQuantity) * ticketPrice) : '...'} KAS)`
                }
              </button>
            </div>

            {/* Your Tickets */}
            <div className="bg-black/30 backdrop-blur-md rounded-2xl p-6 border border-cyan-500/30">
              <h2 className="text-2xl font-bold text-cyan-400 mb-6 text-center">
                🎟️ Your Active Tickets
              </h2>

              {userTickets && userTickets.length > 0 ? (
                <div className="space-y-4">
                  {Array.from(userTickets).map((ticket: any, index: number) => {
                    const ticketNumbers = Array.from(ticket);
                    return (
                      <div key={index} className="bg-black/50 rounded-xl p-4 border border-cyan-500/20">
                        <div className="flex justify-between items-center mb-3">
                          <span className="font-semibold text-cyan-400">Ticket #{index + 1}</span>
                          <span className="text-xs text-gray-400">Round #{currentLotteryId?.toString()}</span>
                        </div>
                        <div className="flex justify-center gap-2">
                          {ticketNumbers.map((number, numIndex) => (
                            <div
                              key={numIndex}
                              className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center font-bold text-white text-sm"
                            >
                              {number.toString()}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  
                  <div className="bg-gradient-to-r from-cyan-500/10 to-blue-500/10 rounded-xl p-4 border border-cyan-500/20">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-cyan-400">{userTickets.length}</div>
                      <div className="text-cyan-200 text-sm">Active Tickets</div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center p-8">
                  <div className="text-6xl mb-4">🎫</div>
                  <p className="text-gray-400 mb-2">No active tickets</p>
                  <p className="text-gray-500 text-sm">Buy tickets to participate in the current lottery!</p>
                </div>
              )}

              {/* Admin Controls */}
              {connectedAddress && (
                <div className="mt-6 pt-6 border-t border-cyan-500/20">
                  <button
                    className="w-full py-3 rounded-xl bg-gradient-to-r from-orange-500 to-red-500 text-white font-bold hover:shadow-lg hover:shadow-orange-500/25 transition-all"
                    onClick={handleDrawLottery}
                  >
                    🎲 Draw Lottery (Admin)
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'results' && (
          <div className="max-w-4xl mx-auto">
            {winningNumbers && previousLottery ? (
              <div className="space-y-8">
                {/* Winning Numbers */}
                <div className="bg-gradient-to-r from-yellow-500/20 to-orange-500/20 backdrop-blur-md rounded-2xl p-8 border border-yellow-500/30">
                  <h2 className="text-3xl font-bold text-center text-yellow-400 mb-6">
                    🏆 Latest Winning Numbers
                  </h2>
                  <div className="flex justify-center gap-4 mb-6">
                    {Array.from(winningNumbers).map((number, index) => (
                      <div
                        key={index}
                        className="w-16 h-16 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center text-2xl font-bold text-white shadow-lg animate-bounce"
                        style={{ animationDelay: `${index * 0.1}s` }}
                      >
                        {number.toString()}
                      </div>
                    ))}
                  </div>
                  <div className="text-center">
                    <p className="text-yellow-200">Round #{(currentLotteryId && currentLotteryId > 1n ? currentLotteryId - 1n : 0n).toString()}</p>
                    <p className="text-yellow-300 font-bold text-xl">
                      Prize Pool: {previousLottery[3] ? formatEther(previousLottery[3]) : "0"} KAS
                    </p>
                  </div>
                </div>

                {/* Your Results */}
                {connectedAddress && previousUserTickets && previousUserTickets.length > 0 && (
                  <div className="bg-black/30 backdrop-blur-md rounded-2xl p-6 border border-cyan-500/30">
                    <h3 className="text-2xl font-bold text-cyan-400 mb-6 text-center">
                      🎫 Your Results
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {Array.from(previousUserTickets).map((ticket: any, index: number) => {
                        const ticketNumbers = Array.from(ticket);
                        const winningNumbersArray = Array.from(winningNumbers);
                        const matches = countMatches(ticketNumbers, winningNumbersArray);
                        const hasWon = matches >= 2;
                        
                        return (
                          <div
                            key={index}
                            className={`p-4 rounded-xl border-2 transition-all ${
                              hasWon
                                ? "border-yellow-400 bg-yellow-400/10 shadow-lg shadow-yellow-400/25"
                                : "border-gray-500/30 bg-gray-500/10"
                            }`}
                          >
                            <div className="text-center mb-3">
                              <span className="font-bold text-white">Ticket #{index + 1}</span>
                              {hasWon && (
                                <div className="text-yellow-400 font-bold text-lg animate-pulse">🏆 WINNER!</div>
                              )}
                            </div>
                            
                            <div className="flex justify-center gap-2 mb-3">
                              {ticketNumbers.map((number, numIndex) => {
                                const isWinning = winningNumbersArray.includes(number);
                                return (
                                  <div
                                    key={numIndex}
                                    className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                                      isWinning
                                        ? "bg-gradient-to-br from-yellow-400 to-orange-500 text-white shadow-lg scale-110"
                                        : "bg-gray-500/30 text-gray-300"
                                    }`}
                                  >
                                    {number.toString()}
                                  </div>
                                );
                              })}
                            </div>
                            
                            <div className="text-center">
                              <div className="text-sm text-gray-300">
                                <span className="font-semibold">{matches}</span> matches
                              </div>
                              {hasWon && (
                                <div className="text-yellow-400 text-sm font-bold">
                                  {matches === 5 && "🎊 JACKPOT!"}
                                  {matches === 4 && "🎉 4 Matches!"}
                                  {matches === 3 && "🎈 3 Matches!"}
                                  {matches === 2 && "🎁 2 Matches!"}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center p-12">
                <div className="text-8xl mb-6">🎲</div>
                <h2 className="text-2xl font-bold text-gray-400 mb-4">No Results Yet</h2>
                <p className="text-gray-500">The lottery hasn't been drawn yet. Check back after the draw!</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'prizes' && (
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold text-center text-cyan-400 mb-8">
              💎 Claim Your Prizes
            </h2>
            
            {claimableTickets.length > 0 ? (
              <div className="space-y-6">
                {claimableTickets.map((claimable, index) => (
                  <div key={index} className="bg-gradient-to-r from-green-500/20 to-emerald-500/20 backdrop-blur-md rounded-2xl p-6 border border-green-500/30">
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-xl font-bold text-green-400">
                        🏆 Round #{claimable.lotteryId} - Unclaimed Prize
                      </h3>
                      <button
                        onClick={() => handleClaimPrize(claimable.lotteryId)}
                        className="px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-500 text-white font-bold rounded-xl hover:shadow-lg hover:shadow-green-500/25 transition-all"
                      >
                        💰 Claim Prize
                      </button>
                    </div>
                    <p className="text-green-200">You have winning tickets from this lottery round!</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center p-12">
                <div className="text-8xl mb-6">💎</div>
                <h3 className="text-2xl font-bold text-gray-400 mb-4">No Prizes to Claim</h3>
                <p className="text-gray-500">You don&apos;t have any unclaimed prizes at the moment.</p>
                <p className="text-gray-500 text-sm">Prizes will appear here automatically when you have winning tickets!</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'statistics' && <PlayerStatistics />}

        {activeTab === 'admin' && <AdminDashboard />}
      </div>
    </div>
  );
};

export default Home;
