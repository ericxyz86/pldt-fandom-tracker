import { NextResponse } from "next/server";
import { getAllInfluencers } from "@/lib/services/fandom.service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const influencers = await getAllInfluencers();
    return NextResponse.json(influencers);
  } catch (error) {
    console.error("Failed to fetch influencers:", error);
    return NextResponse.json(
      { error: "Failed to fetch influencers" },
      { status: 500 }
    );
  }
}
