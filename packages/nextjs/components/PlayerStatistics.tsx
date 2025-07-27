"use client";

import { useEffect, useState } from "react";
import { formatEther } from "viem";
import { useAccount } from "wagmi";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";

interface PlayerStats {
  totalTicketsBought: number;
  totalKasSpent: bigint;
  totalKasWon: bigint;
  totalLotteriesParticipated: number;
  winningTickets: number;
  currentPendingPrize: bigint;
  winRate: number;
  profitLoss: bigint;
  averageTicketsPerLottery: number;
  bestMatch: number;
  totalMatches: { [key: number]: number };
}

interface LotteryStats {
  totalLotteries: number;
  totalTicketsSold: number;
  totalPrizesDistributed: bigint;
  averagePrizePool: bigint;
  largestPrizePool: bigint;
  totalJackpotRollovers: bigint;
}

export const PlayerStatistics = () => {
  const { address: connectedAddress } = useAccount();
  const [playerStats, setPlayerStats] = useState<PlayerStats | null>(null);
  const [lotteryStats, setLotteryStats] = useState<LotteryStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Read contract data
  const { data: currentLotteryId } = useScaffoldReadContract({
    contractName: "KasplexLottery",
    functionName: "currentLotteryId",
  });

  const { data: totalTicketsCount } = useScaffoldReadContract({
    contractName: "KasplexLottery",
    functionName: "totalTicketsCount",
  });

  const { data: pendingPrize } = useScaffoldReadContract({
    contractName: "KasplexLottery",
    functionName: "getPendingPrize",
    args: connectedAddress ? [connectedAddress] : undefined,
  });

  const { data: ticketPrice } = useScaffoldReadContract({
    contractName: "KasplexLottery",
    functionName: "TICKET_PRICE",
  });

  const { data: jackpotRollover } = useScaffoldReadContract({
    contractName: "KasplexLottery",
    functionName: "jackpotRollover",
  });

  // Calculate comprehensive statistics
  const calculatePlayerStatistics = async () => {
    if (!connectedAddress || !currentLotteryId || !ticketPrice) return;

    setIsLoading(true);
    try {
      const stats: PlayerStats = {
        totalTicketsBought: 0,
        totalKasSpent: 0n,
        totalKasWon: 0n,
        totalLotteriesParticipated: 0,
        winningTickets: 0,
        currentPendingPrize: pendingPrize || 0n,
        winRate: 0,
        profitLoss: 0n,
        averageTicketsPerLottery: 0,
        bestMatch: 0,
        totalMatches: { 2: 0, 3: 0, 4: 0, 5: 0 },
      };

      const lotteriesParticipated = new Set<number>();
      let totalPrizesWon = 0n;

      // Iterate through all lotteries to calculate stats
      for (let lotteryId = 1; lotteryId <= Number(currentLotteryId); lotteryId++) {
        try {
          // Get user tickets for this lottery
          const userTicketsResponse = await fetch(`/api/getUserTickets?address=${connectedAddress}&lotteryId=${lotteryId}`);
          if (userTicketsResponse.ok) {
            const userTickets = await userTicketsResponse.json();
            
            if (userTickets && userTickets.length > 0) {
              lotteriesParticipated.add(lotteryId);
              stats.totalTicketsBought += userTickets.length;
              stats.totalKasSpent += BigInt(userTickets.length) * ticketPrice;

              // Check if lottery is drawn and calculate winnings
              const lotteryDetailsResponse = await fetch(`/api/getLotteryDetails?lotteryId=${lotteryId}`);
              if (lotteryDetailsResponse.ok) {
                const lotteryDetails = await lotteryDetailsResponse.json();
                
                if (lotteryDetails.drawn) {
                  // Get winning numbers
                  const winningNumbersResponse = await fetch(`/api/getWinningNumbers?lotteryId=${lotteryId}`);
                  if (winningNumbersResponse.ok) {
                    const winningNumbers = await winningNumbersResponse.json();
                    
                    // Calculate matches for each ticket
                    userTickets.forEach((ticket: number[]) => {
                      const matches = countMatches(ticket, winningNumbers);
                      if (matches >= 2) {
                        stats.winningTickets++;
                        stats.totalMatches[matches]++;
                        stats.bestMatch = Math.max(stats.bestMatch, matches);
                      }
                    });

                    // Get user prize for this lottery
                    const userPrizeResponse = await fetch(`/api/getUserPrize?address=${connectedAddress}&lotteryId=${lotteryId}`);
                    if (userPrizeResponse.ok) {
                      const userPrize = await userPrizeResponse.json();
                      if (userPrize > 0) {
                        totalPrizesWon += BigInt(userPrize);
                      }
                    }
                  }
                }
              }
            }
          }
        } catch (error) {
          console.log(`No data for lottery ${lotteryId}`);
        }
      }

      stats.totalLotteriesParticipated = lotteriesParticipated.size;
      stats.totalKasWon = totalPrizesWon;
      stats.winRate = stats.totalTicketsBought > 0 ? (stats.winningTickets / stats.totalTicketsBought) * 100 : 0;
      stats.profitLoss = stats.totalKasWon - stats.totalKasSpent;
      stats.averageTicketsPerLottery = stats.totalLotteriesParticipated > 0 ? stats.totalTicketsBought / stats.totalLotteriesParticipated : 0;

      setPlayerStats(stats);
    } catch (error) {
      console.error("Error calculating player statistics:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Calculate lottery-wide statistics
  const calculateLotteryStatistics = async () => {
    if (!currentLotteryId) return;

    try {
      const stats: LotteryStats = {
        totalLotteries: Number(currentLotteryId),
        totalTicketsSold: Number(totalTicketsCount || 0),
        totalPrizesDistributed: 0n,
        averagePrizePool: 0n,
        largestPrizePool: 0n,
        totalJackpotRollovers: jackpotRollover || 0n,
      };

      let totalPrizePoolSum = 0n;
      let drawnLotteries = 0;

      // Iterate through all lotteries to calculate global stats
      for (let lotteryId = 1; lotteryId < Number(currentLotteryId); lotteryId++) {
        try {
          const lotteryDetailsResponse = await fetch(`/api/getLotteryDetails?lotteryId=${lotteryId}`);
          if (lotteryDetailsResponse.ok) {
            const lotteryDetails = await lotteryDetailsResponse.json();
            
            if (lotteryDetails.drawn) {
              drawnLotteries++;
              const prizePool = BigInt(lotteryDetails.totalPrizePool);
              totalPrizePoolSum += prizePool;
              stats.totalPrizesDistributed += BigInt(lotteryDetails.totalDistributedPrizes || 0);
              
              if (prizePool > stats.largestPrizePool) {
                stats.largestPrizePool = prizePool;
              }
            }
          }
        } catch (error) {
          console.log(`No data for lottery ${lotteryId}`);
        }
      }

      stats.averagePrizePool = drawnLotteries > 0 ? totalPrizePoolSum / BigInt(drawnLotteries) : 0n;
      setLotteryStats(stats);
    } catch (error) {
      console.error("Error calculating lottery statistics:", error);
    }
  };

  const countMatches = (userNumbers: number[], winningNumbers: number[]): number => {
    return userNumbers.filter(num => winningNumbers.includes(num)).length;
  };

  useEffect(() => {
    if (connectedAddress && currentLotteryId) {
      calculatePlayerStatistics();
      calculateLotteryStatistics();
    }
  }, [connectedAddress, currentLotteryId, pendingPrize]);

  if (!connectedAddress) {
    return (
      <div className="bg-black/30 backdrop-blur-md rounded-2xl p-8 border border-cyan-500/30 text-center">
        <div className="text-6xl mb-4">📊</div>
        <h2 className="text-2xl font-bold text-gray-400 mb-4">Player Statistics</h2>
        <p className="text-gray-500">Connect your wallet to view detailed statistics</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Personal Statistics */}
      <div className="bg-gradient-to-r from-cyan-500/20 to-blue-500/20 backdrop-blur-md rounded-2xl p-6 border border-cyan-500/30">
        <h2 className="text-2xl font-bold text-cyan-400 mb-6 text-center flex items-center justify-center gap-2">
          📊 Your Statistics
          {isLoading && <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-cyan-400"></div>}
        </h2>
        
        {playerStats ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Total Tickets */}
            <div className="bg-black/30 rounded-xl p-4 border border-cyan-500/20">
              <div className="text-center">
                <div className="text-2xl font-bold text-cyan-400">
                  {playerStats.totalTicketsBought}
                </div>
                <div className="text-cyan-200 text-sm">Tickets Bought</div>
              </div>
            </div>

            {/* Total Spent */}
            <div className="bg-black/30 rounded-xl p-4 border border-red-500/20">
              <div className="text-center">
                <div className="text-2xl font-bold text-red-400">
                  {formatEther(playerStats.totalKasSpent)} KAS
                </div>
                <div className="text-red-200 text-sm">Total Spent</div>
              </div>
            </div>

            {/* Total Won */}
            <div className="bg-black/30 rounded-xl p-4 border border-green-500/20">
              <div className="text-center">
                <div className="text-2xl font-bold text-green-400">
                  {formatEther(playerStats.totalKasWon)} KAS
                </div>
                <div className="text-green-200 text-sm">Total Won</div>
              </div>
            </div>

            {/* Profit/Loss */}
            <div className="bg-black/30 rounded-xl p-4 border border-yellow-500/20">
              <div className="text-center">
                <div className={`text-2xl font-bold ${
                  playerStats.profitLoss >= 0n ? 'text-green-400' : 'text-red-400'
                }`}>
                  {playerStats.profitLoss >= 0n ? '+' : ''}{formatEther(playerStats.profitLoss)} KAS
                </div>
                <div className="text-yellow-200 text-sm">Profit/Loss</div>
              </div>
            </div>

            {/* Win Rate */}
            <div className="bg-black/30 rounded-xl p-4 border border-purple-500/20">
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-400">
                  {playerStats.winRate.toFixed(1)}%
                </div>
                <div className="text-purple-200 text-sm">Win Rate</div>
              </div>
            </div>

            {/* Winning Tickets */}
            <div className="bg-black/30 rounded-xl p-4 border border-orange-500/20">
              <div className="text-center">
                <div className="text-2xl font-bold text-orange-400">
                  {playerStats.winningTickets}
                </div>
                <div className="text-orange-200 text-sm">Winning Tickets</div>
              </div>
            </div>

            {/* Lotteries Participated */}
            <div className="bg-black/30 rounded-xl p-4 border border-teal-500/20">
              <div className="text-center">
                <div className="text-2xl font-bold text-teal-400">
                  {playerStats.totalLotteriesParticipated}
                </div>
                <div className="text-teal-200 text-sm">Lotteries Played</div>
              </div>
            </div>

            {/* Best Match */}
            <div className="bg-black/30 rounded-xl p-4 border border-pink-500/20">
              <div className="text-center">
                <div className="text-2xl font-bold text-pink-400">
                  {playerStats.bestMatch > 0 ? `${playerStats.bestMatch}/5` : 'None'}
                </div>
                <div className="text-pink-200 text-sm">Best Match</div>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center p-8">
            <div className="text-6xl mb-4">📈</div>
            <p className="text-gray-400">Loading your statistics...</p>
          </div>
        )}

        {/* Match Breakdown */}
        {playerStats && playerStats.winningTickets > 0 && (
          <div className="mt-6 bg-black/30 rounded-xl p-4 border border-cyan-500/20">
            <h3 className="text-lg font-bold text-cyan-400 mb-4 text-center">🎯 Match Breakdown</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[2, 3, 4, 5].map(matches => (
                <div key={matches} className="text-center">
                  <div className="text-xl font-bold text-white">
                    {playerStats.totalMatches[matches]}
                  </div>
                  <div className="text-sm text-gray-300">
                    {matches}/5 Matches
                    {matches === 5 && ' 🏆'}
                    {matches === 4 && ' 🥈'}
                    {matches === 3 && ' 🥉'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Pending Prize */}
        {playerStats && playerStats.currentPendingPrize > 0n && (
          <div className="mt-6 bg-gradient-to-r from-green-500/20 to-emerald-500/20 rounded-xl p-4 border border-green-500/30">
            <div className="text-center">
              <h3 className="text-lg font-bold text-green-400 mb-2">💰 Pending Prize</h3>
              <div className="text-2xl font-bold text-green-400">
                {formatEther(playerStats.currentPendingPrize)} KAS
              </div>
              <p className="text-green-200 text-sm mt-2">Available to claim in the Prizes tab</p>
            </div>
          </div>
        )}
      </div>

      {/* Global Lottery Statistics */}
      <div className="bg-gradient-to-r from-purple-500/20 to-pink-500/20 backdrop-blur-md rounded-2xl p-6 border border-purple-500/30">
        <h2 className="text-2xl font-bold text-purple-400 mb-6 text-center">🌍 Global Lottery Statistics</h2>
        
        {lotteryStats ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Total Lotteries */}
            <div className="bg-black/30 rounded-xl p-4 border border-purple-500/20">
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-400">
                  {lotteryStats.totalLotteries}
                </div>
                <div className="text-purple-200 text-sm">Total Lotteries</div>
              </div>
            </div>

            {/* Total Tickets Sold */}
            <div className="bg-black/30 rounded-xl p-4 border border-blue-500/20">
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-400">
                  {lotteryStats.totalTicketsSold.toLocaleString()}
                </div>
                <div className="text-blue-200 text-sm">Total Tickets Sold</div>
              </div>
            </div>

            {/* Average Prize Pool */}
            <div className="bg-black/30 rounded-xl p-4 border border-teal-500/20">
              <div className="text-center">
                <div className="text-2xl font-bold text-teal-400">
                  {formatEther(lotteryStats.averagePrizePool)} KAS
                </div>
                <div className="text-teal-200 text-sm">Avg Prize Pool</div>
              </div>
            </div>

            {/* Largest Prize Pool */}
            <div className="bg-black/30 rounded-xl p-4 border border-yellow-500/20">
              <div className="text-center">
                <div className="text-2xl font-bold text-yellow-400">
                  {formatEther(lotteryStats.largestPrizePool)} KAS
                </div>
                <div className="text-yellow-200 text-sm">Largest Prize Pool</div>
              </div>
            </div>

            {/* Total Prizes Distributed */}
            <div className="bg-black/30 rounded-xl p-4 border border-green-500/20">
              <div className="text-center">
                <div className="text-2xl font-bold text-green-400">
                  {formatEther(lotteryStats.totalPrizesDistributed)} KAS
                </div>
                <div className="text-green-200 text-sm">Prizes Distributed</div>
              </div>
            </div>

            {/* Jackpot Rollover */}
            <div className="bg-black/30 rounded-xl p-4 border border-orange-500/20">
              <div className="text-center">
                <div className="text-2xl font-bold text-orange-400">
                  {formatEther(lotteryStats.totalJackpotRollovers)} KAS
                </div>
                <div className="text-orange-200 text-sm">Jackpot Rollover</div>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center p-8">
            <div className="text-6xl mb-4">🌍</div>
            <p className="text-gray-400">Loading global statistics...</p>
          </div>
        )}
      </div>
    </div>
  );
};