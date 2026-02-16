import { db } from "@/lib/db";
import { fandoms, fandomPlatforms, scrapeRuns, googleTrends as googleTrends_table } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
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
  // Reddit is scraped via local push endpoint (Mac Mini residential IP)
  // because Reddit blocks all datacenter/Apify IPs
  if (platform === "reddit") {
    return {
      fandomId,
      platform,
      success: true,
      itemsCount: 0,
      error: "Reddit data arrives via /api/scrape/reddit-push (local scraper)",
    };
  }

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

  // Insert scrape run record first so we can update it on failure
  const [scrapeRun] = await db
    .insert(scrapeRuns)
    .values({
      actorId: actorConfig.actorId,
      fandomId: fandom.id,
      platform: actorConfig.platform,
      status: "running",
      startedAt: new Date(),
    })
    .returning({ id: scrapeRuns.id });

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

    // Update scrape run with the Apify dataset ID
    await db
      .update(scrapeRuns)
      .set({ apifyRunId: datasetId })
      .where(eq(scrapeRuns.id, scrapeRun.id));

    // Ingest the results immediately
    const result = await ingestDataset({
      datasetId,
      fandomId: fandom.id,
      platform,
      actorId: actorConfig.actorId,
    });

    return {
      fandomId,
      platform,
      success: result.success,
      itemsCount: result.itemsCount,
    };
  } catch (error) {
    console.error(`[Scrape] Failed for ${fandom.name} (${platform}):`, error);

    // Mark the scrape run as failed so it doesn't stay stuck in "running"
    await db
      .update(scrapeRuns)
      .set({ status: "failed", finishedAt: new Date() })
      .where(eq(scrapeRuns.id, scrapeRun.id))
      .catch((e) => console.error(`[Scrape] Failed to update scrape run:`, e));

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

  // Trigger regional Google Trends collection for this fandom
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://pldt-fandom.aiailabs.net';
    await fetch(`${baseUrl}/api/scrape/regional-trends`, {
      method: 'POST',
      headers: {
        'X-API-Secret': process.env.PLDT_API_SECRET || '',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fandomIds: [fandomId] }),
    });
    console.log(`[Scrape] Triggered regional trends collection for ${fandomId}`);
  } catch (error) {
    console.error(`[Scrape] Regional trends trigger failed for ${fandomId}:`, error);
  }

  return results;
}

/**
 * Scrape Google Trends for all tracked fandoms.
 * Uses comparative batch queries (5 keywords per batch) so values are
 * normalized relative to each other, not individually.
 */
export async function scrapeGoogleTrends(): Promise<{
  total: number;
  succeeded: number;
  failed: number;
  results: Array<{ fandom: string; keyword: string; dataPoints: number; error?: string }>;
}> {
  const { fetchGoogleTrendsComparative } = await import("@/lib/google-trends/client");

  const allFandoms = await db.select().from(fandoms);

  // Build keyword map: use disambiguated names for Google search
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
      await db.delete(googleTrends_table).where(eq(googleTrends_table.fandomId, fandom.id));

      for (const point of trend.dataPoints) {
        await db.insert(googleTrends_table).values({
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

  // Trigger regional Google Trends collection after comparative scrape
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://pldt-fandom.aiailabs.net';
    await fetch(`${baseUrl}/api/scrape/regional-trends`, {
      method: 'POST',
      headers: {
        'X-API-Secret': process.env.PLDT_API_SECRET || '',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}), // Empty body = all fandoms
    });
    console.log('[GoogleTrends] Triggered regional trends collection for all fandoms');
  } catch (error) {
    console.error('[GoogleTrends] Regional trends trigger failed:', error);
  }

  return { total: allFandoms.length, succeeded, failed, results };
}

/**
 * Simplify a fandom name into a disambiguated Google-searchable keyword.
 * Adds context words for ambiguous terms (e.g., "SEVENTEEN kpop" not just "SEVENTEEN").
 */
function simplifyKeyword(name: string): string {
  const mappings: Record<string, string> = {
    "BINI Blooms": "BINI",
    "BTS ARMY": "BTS",
    "NewJeans Bunnies": "NewJeans",
    "SEVENTEEN CARAT": "SEVENTEEN kpop",
    "KAIA Fans": "KAIA girl group",
    "ALAMAT Fans": "ALAMAT pboy group",
    "G22 Fans": "G22 girl group",
    "VXON - Vixies": "VXON group",
    "YGIG - WeGo": "YGIG group",
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
  if (name.includes("PLUUS")) return "PLUUS band";
  if (name.includes("MLBB") || name.includes("MPL")) return "MPL Philippines";
  if (name.includes("Roblox")) return "Roblox Philippines";
  if (name.includes("Genshin")) return "Genshin Impact Philippines";
  if (name.includes("Valorant")) return "Valorant Philippines";
  if (name.includes("BookTok")) return "BookTok Philippines";
  if (name.includes("Cosplay")) return "Cosplay Philippines";

  // Default: first two words max
  const cleaned = name.split(/[/\\(]/)[0].trim();
  const words = cleaned.split(/\s+/);
  return words.slice(0, 2).join(" ");
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

  // Trigger regional Google Trends collection for all fandoms
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://pldt-fandom.aiailabs.net';
    await fetch(`${baseUrl}/api/scrape/regional-trends`, {
      method: 'POST',
      headers: {
        'X-API-Secret': process.env.PLDT_API_SECRET || '',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}), // Empty body = all fandoms
    });
    console.log('[Scrape] Triggered regional trends collection for all fandoms');
  } catch (error) {
    console.error('[Scrape] Regional trends trigger failed:', error);
  }

  return allResults;
}
