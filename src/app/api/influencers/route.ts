import { NextRequest, NextResponse } from "next/server";
import { getAllInfluencers } from "@/lib/services/fandom.service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "50") || 50, 200);
    const offset = parseInt(searchParams.get("offset") || "0") || 0;
    const influencers = await getAllInfluencers(limit, offset);
    return NextResponse.json(influencers);
  } catch (error) {
    console.error("Failed to fetch influencers:", error);
    return NextResponse.json(
      { error: "Failed to fetch influencers" },
      { status: 500 }
    );
  }
}
