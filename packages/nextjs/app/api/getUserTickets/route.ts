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
    const address = searchParams.get("address");
    const lotteryId = searchParams.get("lotteryId");

    if (!address || !lotteryId) {
      return NextResponse.json(
        { error: "Address and lotteryId are required" },
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

    // Get user tickets for the specific lottery
    const userTickets = await publicClient.readContract({
      address: contractAddress as `0x${string}`,
      abi: deployedContracts[kaspa.id].KasplexLottery.abi,
      functionName: "getUserTickets",
      args: [address as `0x${string}`, BigInt(lotteryId)],
    });

    return NextResponse.json(userTickets);
  } catch (error) {
    console.error("Error fetching user tickets:", error);
    return NextResponse.json(
      { error: "Failed to fetch user tickets" },
      { status: 500 }
    );
  }
}