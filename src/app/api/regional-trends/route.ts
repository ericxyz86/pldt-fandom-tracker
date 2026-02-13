import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { googleTrends, fandoms } from "@/lib/db/schema";
import { eq, desc, and, sql } from "drizzle-orm";

/**
 * GET /api/regional-trends?fandomId={id}
 * 
 * Fetches latest regional breakdown for a fandom.
 * Returns interest level by region (Philippine provinces/regions).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const fandomId = searchParams.get("fandomId");

  if (!fandomId) {
    return NextResponse.json(
      { error: "fandomId required" },
      { status: 400 }
    );
  }

  try {
    // Get the fandom
    const fandom = await db.query.fandoms.findFirst({
      where: eq(fandoms.id, fandomId),
    });

    if (!fandom) {
      return NextResponse.json({ error: "Fandom not found" }, { status: 404 });
    }

    // Get latest regional data (most recent date with regional breakdown)
    // Query for the most recent date that has regional data (region != 'PH')
    const latestRegionalDate = await db
      .select({ date: googleTrends.date })
      .from(googleTrends)
      .where(
        and(
          eq(googleTrends.fandomId, fandomId),
          sql`${googleTrends.region} != 'PH'`
        )
      )
      .orderBy(desc(googleTrends.date))
      .limit(1);

    if (latestRegionalDate.length === 0) {
      return NextResponse.json({
        fandomId,
        fandomName: fandom.name,
        regions: [],
        message: "No regional data available",
      });
    }

    const targetDate = latestRegionalDate[0].date;

    // Fetch all regional data for that date
    // Group by keyword to show both fandom name and artist name results
    const regionalData = await db
      .select()
      .from(googleTrends)
      .where(
        and(
          eq(googleTrends.fandomId, fandomId),
          eq(googleTrends.date, targetDate),
          sql`${googleTrends.region} != 'PH'`
        )
      )
      .orderBy(desc(googleTrends.interestValue));

    // Group by keyword
    const byKeyword: Record<string, typeof regionalData> = {};
    for (const row of regionalData) {
      if (!byKeyword[row.keyword]) {
        byKeyword[row.keyword] = [];
      }
      byKeyword[row.keyword].push(row);
    }

    // Map region codes to human-readable names
    // Google Trends uses inconsistent codes — some are ISO 3166-2, some are custom
    const regionNames: Record<string, string> = {
      // Standard codes
      "PH-NCR": "Metro Manila (NCR)",
      "PH-CAL": "Calabarzon",
      "PH-CEN": "Central Luzon",
      "PH-CAR": "Cordillera (CAR)",
      
      // Numbered regions
      "PH-01": "Ilocos Region",
      "PH-02": "Cagayan Valley",
      "PH-03": "Central Luzon",
      "PH-05": "Bicol Region",
      "PH-06": "Western Visayas",
      "PH-07": "Central Visayas",
      "PH-08": "Eastern Visayas",
      "PH-09": "Zamboanga Peninsula",
      "PH-10": "Northern Mindanao",
      "PH-11": "Davao Region",
      "PH-12": "Soccsksargen",
      "PH-13": "Caraga",
      "PH-14": "ARMM (defunct)",
      "PH-15": "Cordillera (CAR)",
      
      // Google's weird codes
      "PH-00": "Metro Manila (NCR)", // Google sometimes uses 00 for NCR
      "PH-40": "Calabarzon (Region IV-A)", // Alternative code
      "PH-41": "MIMAROPA (Region IV-B)",
    };

    // Convert each keyword's data to the response format
    const datasets = Object.entries(byKeyword).map(([keyword, rows]) => ({
      keyword,
      regions: rows.map((r) => ({
        regionCode: r.region,
        regionName: regionNames[r.region] || r.region,
        interestValue: r.interestValue,
      })),
    }));

    return NextResponse.json({
      fandomId,
      fandomName: fandom.name,
      date: targetDate,
      datasets, // Array of { keyword, regions[] }
    });
  } catch (error) {
    console.error("[Regional Trends API] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
