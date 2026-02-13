import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fandoms, googleTrends } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { fetchRegionalInterestBatch } from "@/lib/google-trends/regional";

const API_SECRET = process.env.PLDT_API_SECRET || "";

/**
 * Extract artist/group name from fandom name.
 * Examples:
 * - "BTS ARMY" → "BTS"
 * - "BINI Blooms" → "BINI"
 * - "SB19 A'TIN" → "SB19"
 * - "SEVENTEEN CARAT" → "SEVENTEEN"
 */
function extractArtistName(fandomName: string): string {
  // Common fandom suffixes to remove
  const suffixes = [
    " ARMY",
    " A'TIN",
    " Blooms",
    " CARAT",
    " BLINK",
    " ONCE",
    " Fans",
    " Nation",
    " Squad",
    " Stans",
  ];

  for (const suffix of suffixes) {
    if (fandomName.endsWith(suffix)) {
      return fandomName.slice(0, -suffix.length).trim();
    }
  }

  // If no suffix found, try to get first word (usually the artist name)
  const words = fandomName.split(" ");
  if (words.length > 1) {
    return words[0];
  }

  return fandomName;
}

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

    // For each fandom, collect data for BOTH:
    // 1. Fandom name (e.g., "BTS ARMY")
    // 2. Group/artist name (extracted from fandom name or fandom_group field)
    const searchTerms: Array<{ fandomId: string; keyword: string; type: "fandom" | "artist" }> = [];

    for (const fandom of fandomsToProcess) {
      // Always include the fandom name
      searchTerms.push({
        fandomId: fandom.id,
        keyword: fandom.name,
        type: "fandom",
      });

      // Try to extract the artist/group name
      // Pattern: "ARTIST Fandom" → "ARTIST"
      // Examples: "BTS ARMY" → "BTS", "BINI Blooms" → "BINI", "SB19 A'TIN" → "SB19"
      const artistName = fandom.fandomGroup || extractArtistName(fandom.name);
      
      if (artistName && artistName !== fandom.name) {
        searchTerms.push({
          fandomId: fandom.id,
          keyword: artistName,
          type: "artist",
        });
      }
    }

    console.log(`[Regional Trends] Collecting data for ${searchTerms.length} search terms (${fandomsToProcess.length} fandoms × 2)`);

    // Fetch regional data for all keywords
    const keywords = searchTerms.map((t) => t.keyword);
    const results = await fetchRegionalInterestBatch(keywords, "PH", "today 3-m");

    let totalRegions = 0;

    // Store regional data in database
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const searchTerm = searchTerms[i];

      if (result.error || result.regions.length === 0) {
        console.log(`[Regional Trends] No data for "${searchTerm.keyword}" (${searchTerm.type}): ${result.error || "empty"}`);
        continue;
      }

      // Insert regional data points
      // Store one row per region with today's date
      const today = new Date().toISOString().split("T")[0];
      
      for (const region of result.regions) {
        await db.insert(googleTrends).values({
          fandomId: searchTerm.fandomId,
          keyword: searchTerm.keyword,
          date: today,
          interestValue: region.interestValue,
          region: region.regionCode,
        });
        totalRegions++;
      }

      console.log(
        `[Regional Trends] Stored ${result.regions.length} regions for "${searchTerm.keyword}" (${searchTerm.type})`
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
