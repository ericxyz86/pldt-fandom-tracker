import { db } from "@/lib/db";
import { fandoms, fandomPlatforms, scrapeRuns, googleTrends } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { fetchGoogleTrendsComparative } from "@/lib/google-trends/client";
import { runActor } from "@/lib/apify/client";
import { actorConfigs } from "@/lib/apify/actors";
import { ingestDataset, updateScrapeRun } from "@/lib/services/ingest.service";
import { generateFandomInsights, generateAllFandomInsights, generateAllPageInsights } from "@/lib/services/ai.service";
import type { Platform } from "@/types/fandom";

const DELAY_BETWEEN_BATCHES_MS = 2000;
const FANDOMS_PER_BATCH = 3;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface ScrapeResult {
  fandomId: string;
  platform: string;
  success: boolean;
  itemsCount: number;
  error?: string;
}

/**
 * Scrape a single platform for a single fandom.
 * Chains trigger + ingest in one call.
 */
export async function scrapeFandomPlatform(
  fandomId: string,
  platform: Platform
): Promise<ScrapeResult> {
  const actorConfig = actorConfigs[platform];
  if (!actorConfig) {
    return {
      fandomId,
      platform,
      success: false,
      itemsCount: 0,
      error: `No actor configured for platform: ${platform}`,
    };
  }

  // Look up fandom
  const fandomRows = await db
    .select()
    .from(fandoms)
    .where(eq(fandoms.id, fandomId))
    .limit(1);

  if (fandomRows.length === 0) {
    return { fandomId, platform, success: false, itemsCount: 0, error: "Fandom not found" };
  }
  const fandom = fandomRows[0];

  // Get the handle for this platform
  const platformRows = await db
    .select()
    .from(fandomPlatforms)
    .where(eq(fandomPlatforms.fandomId, fandomId));

  const platformEntry = platformRows.find((p) => p.platform === platform);
  const handle = platformEntry?.handle || fandom.name;

  try {
    const input = actorConfig.buildInput({
      handle,
      keyword: fandom.name,
      limit: 20,
    });

    console.log(
      `[Scrape] Running ${actorConfig.actorId} for ${fandom.name} (${platform})`
    );

    // Run actor (blocking — waits for Apify to finish)
    const datasetId = await runActor(actorConfig.actorId, input);

    // Log the scrape run
    await db.insert(scrapeRuns).values({
      actorId: actorConfig.actorId,
      fandomId: fandom.id,
      platform: actorConfig.platform,
      status: "running",
      startedAt: new Date(),
      apifyRunId: datasetId,
    });

    // Ingest the results immediately
    try {
      const result = await ingestDataset({
        datasetId,
        fandomId: fandom.id,
        platform,
        actorId: actorConfig.actorId,
      });

      // ingestDataset calls updateScrapeRun on success, but ensure it's marked done
      await updateScrapeRun(datasetId, "succeeded", result.itemsCount);

      return {
        fandomId,
        platform,
        success: result.success,
        itemsCount: result.itemsCount,
      };
    } catch (ingestError) {
      // Mark run as failed if ingest crashes
      console.error(`[Scrape] Ingest failed for ${fandom.name} (${platform}):`, ingestError);
      await updateScrapeRun(datasetId, "failed", 0);
      return {
        fandomId,
        platform,
        success: false,
        itemsCount: 0,
        error: ingestError instanceof Error ? ingestError.message : "Ingest failed",
      };
    }
  } catch (error) {
    console.error(`[Scrape] Failed for ${fandom.name} (${platform}):`, error);
    return {
      fandomId,
      platform,
      success: false,
      itemsCount: 0,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Scrape all configured platforms for a single fandom, sequentially.
 */
export async function scrapeAllPlatformsForFandom(
  fandomId: string
): Promise<ScrapeResult[]> {
  const platformRows = await db
    .select()
    .from(fandomPlatforms)
    .where(eq(fandomPlatforms.fandomId, fandomId));

  // Only scrape platforms that have actor configs (skip googleTrends key)
  const platformKeys = platformRows
    .map((p) => p.platform as Platform)
    .filter((p) => actorConfigs[p] && actorConfigs[p].platform === p);

  // Run all platforms in parallel — each is a separate Apify actor
  const settled = await Promise.allSettled(
    platformKeys.map((platform) => scrapeFandomPlatform(fandomId, platform))
  );

  const results = settled.map((result, i) =>
    result.status === "fulfilled"
      ? result.value
      : { fandomId, platform: platformKeys[i], success: false, itemsCount: 0, error: String(result.reason) }
  );

  // Generate AI insights for this fandom after scraping
  try {
    await generateFandomInsights(fandomId);
  } catch (error) {
    console.error(`[Scrape] AI insight generation failed for ${fandomId}:`, error);
  }

  return results;
}

/**
 * Scrape all fandoms across all their configured platforms, sequentially.
 */
export async function scrapeAllFandoms(): Promise<ScrapeResult[]> {
  const allFandoms = await db.select().from(fandoms);
  const allResults: ScrapeResult[] = [];

  // Process fandoms in batches of FANDOMS_PER_BATCH concurrently
  for (let i = 0; i < allFandoms.length; i += FANDOMS_PER_BATCH) {
    const batch = allFandoms.slice(i, i + FANDOMS_PER_BATCH);
    const batchResults = await Promise.all(
      batch.map((f) => scrapeAllPlatformsForFandom(f.id))
    );
    allResults.push(...batchResults.flat());

    // Delay between batches to avoid overwhelming Apify
    if (i + FANDOMS_PER_BATCH < allFandoms.length) {
      await delay(DELAY_BETWEEN_BATCHES_MS);
    }
  }

  // Generate page-level AI insights after all scraping is done
  try {
    await generateAllPageInsights();
  } catch (error) {
    console.error("[Scrape] Page insight generation failed:", error);
  }

  return allResults;
}


/**
 * Scrape Google Trends interest-over-time data for all fandoms.
 * Uses comparative batch queries (5 keywords per batch) so values are
 * normalized relative to each other, not individually.
 */
export async function scrapeGoogleTrends(): Promise<{
  total: number;
  succeeded: number;
  failed: number;
  results: Array<{ fandom: string; keyword: string; dataPoints: number; error?: string }>;
}> {
  const allFandoms = await db.select().from(fandoms);

  // Build keyword map: use short/searchable names, not fandom display names
  const keywordMap: Map<string, { id: string; name: string }> = new Map();
  for (const f of allFandoms) {
    const keyword = simplifyKeyword(f.name);
    keywordMap.set(keyword, { id: f.id, name: f.name });
  }

  const keywords = Array.from(keywordMap.keys());
  console.log(`[GoogleTrends] Scraping ${keywords.length} keywords in comparative batches...`);

  const trendResults = await fetchGoogleTrendsComparative(keywords, "PH", "today 3-m");

  const results: Array<{ fandom: string; keyword: string; dataPoints: number; error?: string }> = [];
  let succeeded = 0;
  let failed = 0;

  for (const trend of trendResults) {
    const fandom = keywordMap.get(trend.keyword);
    if (!fandom) continue;

    if (trend.error || trend.dataPoints.length === 0) {
      results.push({ fandom: fandom.name, keyword: trend.keyword, dataPoints: 0, error: trend.error || "No data" });
      failed++;
    } else {
      await db.delete(googleTrends).where(eq(googleTrends.fandomId, fandom.id));

      for (const point of trend.dataPoints) {
        await db.insert(googleTrends).values({
          fandomId: fandom.id,
          keyword: trend.keyword,
          date: point.date,
          interestValue: point.value,
          region: "PH",
        });
      }

      results.push({ fandom: fandom.name, keyword: trend.keyword, dataPoints: trend.dataPoints.length });
      succeeded++;
    }
  }

  return { total: allFandoms.length, succeeded, failed, results };
}

/**
 * Simplify a fandom name into a Google-searchable keyword.
 */
function simplifyKeyword(name: string): string {
  const mappings: Record<string, string> = {
    "BINI Blooms": "BINI",
    "BTS ARMY": "BTS",
    "NewJeans Bunnies": "NewJeans",
    "SEVENTEEN CARAT": "SEVENTEEN",
    "KAIA Fans": "KAIA",
    "ALAMAT Fans": "ALAMAT",
    "G22 Fans": "G22",
    "VXON - Vixies": "VXON",
    "YGIG - WeGo": "YGIG",
    "JMFyang Fans": "JMFyang",
    "AshDres Fans": "AshDres",
    "AlDub Nation": "AlDub",
    "Cup of Joe (Joewahs)": "Cup of Joe band",
    "Team Payaman / Cong TV Universe Fans": "Cong TV",
    "r/DragRacePhilippines": "Drag Race Philippines",
  };

  if (mappings[name]) return mappings[name];

  // Check SB19 specifically (has apostrophe issues)
  if (name.includes("SB19")) return "SB19";
  if (name.includes("PLUUS")) return "PLUUS";

  // Fuzzy: check partial match
  for (const [key, val] of Object.entries(mappings)) {
    if (name.toLowerCase().startsWith(key.toLowerCase().split(" ")[0])) return val;
  }

  // Names with slashes, parens, long descriptions — take first meaningful part
  const cleaned = name.split(/[/\\(]/)[0].trim();
  if (cleaned.includes(":")) return cleaned.split(":")[1]?.trim() || cleaned;

  // Default: first two words max
  const words = cleaned.split(/\s+/);
  return words.slice(0, 2).join(" ");
}
