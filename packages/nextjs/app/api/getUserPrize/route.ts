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

    // Get user prize for the specific lottery
    const userPrize = await publicClient.readContract({
      address: contractAddress as `0x${string}`,
      abi: deployedContracts[kaspa.id].KasplexLottery.abi,
      functionName: "getUserPrize",
      args: [address as `0x${string}`, BigInt(lotteryId)],
    });

    return NextResponse.json(userPrize);
  } catch (error) {
    console.error("Error fetching user prize:", error);
    return NextResponse.json(
      { error: "Failed to fetch user prize" },
      { status: 500 }
    );
  }
}