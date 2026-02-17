import { NextRequest, NextResponse } from "next/server";
import { getAllTrends } from "@/lib/services/fandom.service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "1000") || 1000, 5000);
    const offset = parseInt(searchParams.get("offset") || "0") || 0;
    const trends = await getAllTrends(limit, offset);
    return NextResponse.json(trends);
  } catch (error) {
    console.error("Failed to fetch trends:", error);
    return NextResponse.json(
      { error: "Failed to fetch trends" },
      { status: 500 }
    );
  }
}
