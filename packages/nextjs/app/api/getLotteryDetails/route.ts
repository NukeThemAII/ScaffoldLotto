import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http } from "viem";
import { kaspa } from "viem/chains";
import deployedContracts from "~~/contracts/deployedContracts";

const publicClient = createPublicClient({
  chain: kaspa,
  transport: http(),
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const lotteryId = searchParams.get("lotteryId");

    if (!lotteryId) {
      return NextResponse.json(
        { error: "LotteryId is required" },
        { status: 400 }
      );
    }

    const contractAddress = deployedContracts[kaspa.id]?.KasplexLottery?.address;
    if (!contractAddress) {
      return NextResponse.json(
        { error: "Contract not found" },
        { status: 500 }
      );
    }

    // Get lottery details
    const lotteryDetails = await publicClient.readContract({
      address: contractAddress as `0x${string}`,
      abi: deployedContracts[kaspa.id].KasplexLottery.abi,
      functionName: "getLotteryDetails",
      args: [BigInt(lotteryId)],
    });

    return NextResponse.json(lotteryDetails);
  } catch (error) {
    console.error("Error fetching lottery details:", error);
    return NextResponse.json(
      { error: "Failed to fetch lottery details" },
      { status: 500 }
    );
  }
}