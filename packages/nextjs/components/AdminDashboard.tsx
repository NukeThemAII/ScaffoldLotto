"use client";

import { useState } from "react";
import { formatEther } from "viem";
import { useAccount } from "wagmi";
import { useScaffoldReadContract, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { notification } from "~~/utils/scaffold-eth";

interface AdminDashboardProps {
  isOwner: boolean;
}

export const AdminDashboard = ({ isOwner }: AdminDashboardProps) => {
  const { address: connectedAddress } = useAccount();
  const [isWithdrawing, setIsWithdrawing] = useState(false);

  // Read admin balance
  const { data: adminBalance } = useScaffoldReadContract({
    contractName: "KasplexLottery",
    functionName: "adminBalance",
  });

  // Read contract owner
  const { data: contractOwner } = useScaffoldReadContract({
    contractName: "KasplexLottery",
    functionName: "owner",
  });

  // Read total tickets count
  const { data: totalTicketsCount } = useScaffoldReadContract({
    contractName: "KasplexLottery",
    functionName: "totalTicketsCount",
  });

  // Read current lottery ID
  const { data: currentLotteryId } = useScaffoldReadContract({
    contractName: "KasplexLottery",
    functionName: "currentLotteryId",
  });

  // Read jackpot rollover
  const { data: jackpotRollover } = useScaffoldReadContract({
    contractName: "KasplexLottery",
    functionName: "jackpotRollover",
  });

  // Write function for withdrawing admin fees
  const { writeContractAsync: withdrawAdminFees } = useScaffoldWriteContract("KasplexLottery");

  const handleWithdrawFees = async () => {
    if (!connectedAddress || !isOwner) {
      notification.error("Only the contract owner can withdraw admin fees");
      return;
    }

    if (!adminBalance || adminBalance === 0n) {
      notification.error("No admin fees to withdraw");
      return;
    }

    try {
      setIsWithdrawing(true);
      notification.info("💰 Withdrawing admin fees...");
      
      await withdrawAdminFees({
        functionName: "withdrawAdminFees",
      });
      
      notification.success("✅ Admin fees withdrawn successfully!");
    } catch (error: any) {
      console.error("Error withdrawing admin fees:", error);
      notification.error(`Failed to withdraw admin fees: ${error?.message || 'Unknown error'}`);
    } finally {
      setIsWithdrawing(false);
    }
  };

  if (!isOwner) {
    return null;
  }

  return (
    <div className="bg-gradient-to-r from-orange-500/20 to-red-500/20 backdrop-blur-md rounded-2xl p-6 border border-orange-500/30 mb-8">
      <h2 className="text-2xl font-bold text-orange-400 mb-6 text-center flex items-center justify-center gap-2">
        🔧 Admin Dashboard
        <span className="text-sm bg-orange-500/20 px-2 py-1 rounded-full">Owner Only</span>
      </h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        {/* Admin Balance */}
        <div className="bg-black/30 rounded-xl p-4 border border-orange-500/20">
          <div className="text-center">
            <div className="text-2xl font-bold text-orange-400">
              {adminBalance ? formatEther(adminBalance) : "0"} KAS
            </div>
            <div className="text-orange-200 text-sm">Admin Balance</div>
          </div>
        </div>

        {/* Total Tickets Sold */}
        <div className="bg-black/30 rounded-xl p-4 border border-cyan-500/20">
          <div className="text-center">
            <div className="text-2xl font-bold text-cyan-400">
              {totalTicketsCount?.toString() || "0"}
            </div>
            <div className="text-cyan-200 text-sm">Total Tickets Sold</div>
          </div>
        </div>

        {/* Current Lottery ID */}
        <div className="bg-black/30 rounded-xl p-4 border border-blue-500/20">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-400">
              #{currentLotteryId?.toString() || "0"}
            </div>
            <div className="text-blue-200 text-sm">Current Round</div>
          </div>
        </div>

        {/* Jackpot Rollover */}
        <div className="bg-black/30 rounded-xl p-4 border border-purple-500/20">
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-400">
              {jackpotRollover ? formatEther(jackpotRollover) : "0"} KAS
            </div>
            <div className="text-purple-200 text-sm">Jackpot Rollover</div>
          </div>
        </div>
      </div>

      {/* Admin Actions */}
      <div className="space-y-4">
        <div className="bg-black/30 rounded-xl p-4 border border-orange-500/20">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h3 className="text-lg font-bold text-orange-400">💰 Withdraw Admin Fees</h3>
              <p className="text-orange-200 text-sm">
                Available: {adminBalance ? formatEther(adminBalance) : "0"} KAS
              </p>
            </div>
            <button
              onClick={handleWithdrawFees}
              disabled={isWithdrawing || !adminBalance || adminBalance === 0n}
              className={`px-6 py-3 rounded-xl font-bold transition-all duration-300 ${
                !isWithdrawing && adminBalance && adminBalance > 0n
                  ? "bg-gradient-to-r from-orange-500 to-red-500 text-white hover:shadow-lg hover:shadow-orange-500/25 hover:scale-105"
                  : "bg-gray-500/20 text-gray-500 cursor-not-allowed"
              }`}
            >
              {isWithdrawing ? (
                <span className="flex items-center gap-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Withdrawing...
                </span>
              ) : (
                "💸 Withdraw Fees"
              )}
            </button>
          </div>
          
          <div className="text-xs text-orange-300 bg-orange-500/10 rounded-lg p-3">
            <p className="mb-1">ℹ️ <strong>Admin Fee Structure:</strong></p>
            <p>• 1% of each ticket purchase goes to admin fees</p>
            <p>• Fees accumulate automatically with each ticket sale</p>
            <p>• Only the contract owner can withdraw accumulated fees</p>
          </div>
        </div>

        {/* Contract Info */}
        <div className="bg-black/30 rounded-xl p-4 border border-gray-500/20">
          <h3 className="text-lg font-bold text-gray-400 mb-3">📋 Contract Information</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-400">Contract Owner:</span>
              <div className="text-white font-mono text-xs break-all">
                {contractOwner || "Loading..."}
              </div>
            </div>
            <div>
              <span className="text-gray-400">Your Address:</span>
              <div className="text-white font-mono text-xs break-all">
                {connectedAddress || "Not connected"}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};