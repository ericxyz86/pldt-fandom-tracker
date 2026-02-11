import { NextResponse } from "next/server";
import { scrapeGoogleTrends } from "@/lib/services/scrape.service";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min timeout for all fandoms

export async function POST() {
  try {
    const result = await scrapeGoogleTrends();
    return NextResponse.json(result);
  } catch (error) {
    console.error("Google Trends scrape error:", error);
    return NextResponse.json(
      { error: "Failed to scrape Google Trends" },
      { status: 500 }
    );
  }
}
