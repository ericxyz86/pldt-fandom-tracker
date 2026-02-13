import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fandoms, googleTrends } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { fetchRegionalInterestBatch } from "@/lib/google-trends/regional";

const API_SECRET = process.env.PLDT_API_SECRET || "";

/**
 * POST /api/scrape/regional-trends
 * 
 * Fetches regional Google Trends data for all tracked fandoms
 * and stores it in the database.
 * 
 * Auth: X-API-Secret header
 * Body: { fandomIds?: string[] } (optional, defaults to all fandoms)
 * 
 * Returns: { success: true, fandoms: number, regions: number }
 */
export async function POST(request: NextRequest) {
  // Auth check
  const apiSecret = request.headers.get("X-API-Secret");
  if (!API_SECRET || apiSecret !== API_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const { fandomIds } = body;

    // Get fandoms to process
    let fandomsToProcess;
    if (fandomIds && Array.isArray(fandomIds) && fandomIds.length > 0) {
      fandomsToProcess = await db.query.fandoms.findMany({
        where: (fandoms, { inArray }) => inArray(fandoms.id, fandomIds),
      });
    } else {
      fandomsToProcess = await db.query.fandoms.findMany();
    }

    if (fandomsToProcess.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No fandoms to process",
        fandoms: 0,
        regions: 0,
      });
    }

    console.log(`[Regional Trends] Processing ${fandomsToProcess.length} fandoms`);

    // Fetch regional data for all fandom names
    const keywords = fandomsToProcess.map((f) => f.name);
    const results = await fetchRegionalInterestBatch(keywords, "PH", "today 3-m");

    let totalRegions = 0;

    // Store regional data in database
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const fandom = fandomsToProcess[i];

      if (result.error || result.regions.length === 0) {
        console.log(`[Regional Trends] No data for ${fandom.name}: ${result.error || "empty"}`);
        continue;
      }

      // Insert regional data points
      // Store one row per region with today's date
      const today = new Date().toISOString().split("T")[0];
      
      for (const region of result.regions) {
        await db.insert(googleTrends).values({
          fandomId: fandom.id,
          keyword: fandom.name,
          date: today,
          interestValue: region.interestValue,
          region: region.regionCode,
        });
        totalRegions++;
      }

      console.log(
        `[Regional Trends] Stored ${result.regions.length} regions for ${fandom.name}`
      );
    }

    return NextResponse.json({
      success: true,
      fandoms: fandomsToProcess.length,
      regions: totalRegions,
      message: `Collected regional data for ${fandomsToProcess.length} fandoms (${totalRegions} data points)`,
    });
  } catch (error) {
    console.error("[Regional Trends] Error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
