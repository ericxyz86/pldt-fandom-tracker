import { NextResponse } from "next/server";
import { getAllTrends } from "@/lib/services/fandom.service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const trends = await getAllTrends();
    return NextResponse.json(trends);
  } catch (error) {
    console.error("Failed to fetch trends:", error);
    return NextResponse.json(
      { error: "Failed to fetch trends" },
      { status: 500 }
    );
  }
}
