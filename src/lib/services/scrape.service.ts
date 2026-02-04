import { db } from "@/lib/db";
import { fandoms, fandomPlatforms, scrapeRuns } from "@/lib/db/schema";
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
