import { db } from "@/lib/db";
import {
  fandoms,
  fandomPlatforms,
  metricSnapshots,
  contentItems,
  influencers,
  googleTrends,
  scrapeRuns,
} from "@/lib/db/schema";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { getDatasetItems } from "@/lib/apify/client";
import {
  normalizeContent,
  normalizeMetrics,
  normalizeInfluencers,
} from "@/lib/apify/normalize";
import { analyzeScrapeBatch } from "@/lib/services/discovery.service";
import type { Platform } from "@/types/fandom";

export interface IngestResult {
  success: boolean;
  itemsCount: number;
  influencerCount: number;
  discoveries: Array<{ tag: string; count: number }>;
  error?: string;
}

/**
 * Ingest raw items directly (used by the failover provider system).
 * Skips the Apify dataset fetch step.
 */
export async function ingestRawItems(params: {
  rawItems: Record<string, unknown>[];
  fandomId: string;
  platform: Platform;
  source: string;
}): Promise<IngestResult> {
  const { rawItems, fandomId, platform: validPlatform, source } = params;

  if (rawItems.length === 0) {
    return { success: true, itemsCount: 0, influencerCount: 0, discoveries: [] };
  }

  return ingestItems(rawItems, fandomId, validPlatform, source);
}

export async function ingestDataset(params: {
  datasetId: string;
  fandomId: string;
  platform: Platform;
  actorId?: string;
}): Promise<IngestResult> {
  const { datasetId, fandomId, platform: validPlatform, actorId } = params;

  const rawItems = await getDatasetItems(datasetId);

  if (rawItems.length === 0) {
    return { success: true, itemsCount: 0, influencerCount: 0, discoveries: [] };
  }

  // Handle Google Trends separately
  if (actorId === "apify/google-trends-scraper") {
    const inserted = await ingestGoogleTrends(rawItems, fandomId);
    await updateScrapeRun(datasetId, "succeeded", inserted);
    return { success: true, itemsCount: inserted, influencerCount: 0, discoveries: [] };
  }

  const result = await ingestItems(rawItems, fandomId, validPlatform, "apify");

  await updateScrapeRun(datasetId, "succeeded", result.itemsCount);

  return result;
}

/**
 * Core ingestion logic shared by both ingestDataset and ingestRawItems.
 */
async function ingestItems(
  rawItems: Record<string, unknown>[],
  fandomId: string,
  validPlatform: Platform,
  source: string
): Promise<IngestResult> {
  let totalInserted = 0;

  // 1. Normalize and batch insert content items (dedup by externalId)
  const normalizedContent = normalizeContent(validPlatform, rawItems);

  if (normalizedContent.length > 0) {
    // Batch lookup: find all existing externalIds in one query
    const allExternalIds = normalizedContent.map((item) => item.externalId);
    const existingRows = await db
      .select({ externalId: contentItems.externalId })
      .from(contentItems)
      .where(
        and(
          eq(contentItems.fandomId, fandomId),
          inArray(contentItems.externalId, allExternalIds)
        )
      );
    const existingIds = new Set(existingRows.map((r) => r.externalId));

    // Filter to only new items and batch insert
    const newItems = normalizedContent
      .filter((item) => !existingIds.has(item.externalId))
      .map((item) => ({
        fandomId,
        platform: validPlatform,
        externalId: item.externalId,
        contentType: item.contentType,
        text: item.text,
        url: item.url,
        likes: item.likes,
        comments: item.comments,
        shares: item.shares,
        views: item.views,
        publishedAt: (() => {
          if (!item.publishedAt) return null;
          const d = new Date(item.publishedAt);
          return isNaN(d.getTime()) ? null : d;
        })(),
        hashtags: item.hashtags,
      }));

    if (newItems.length > 0) {
      await db.insert(contentItems).values(newItems);
      totalInserted = newItems.length;
    }
  }

  // 2. Insert metric snapshot for today
  const normalizedMetrics = normalizeMetrics(validPlatform, rawItems);
  const today = new Date().toISOString().split("T")[0];

  // Fallback: if normalizer couldn't extract followers, use stored fandom_platforms value
  if (normalizedMetrics.followers === 0) {
    const storedPlatform = await db
      .select({ followers: fandomPlatforms.followers })
      .from(fandomPlatforms)
      .where(
        and(
          eq(fandomPlatforms.fandomId, fandomId),
          eq(fandomPlatforms.platform, validPlatform)
        )
      )
      .limit(1);
    if (storedPlatform.length > 0 && storedPlatform[0].followers > 0) {
      normalizedMetrics.followers = storedPlatform[0].followers;
    }
  }

  // Compute growth rate by comparing against previous snapshot
  let growthRate = 0;
  if (normalizedMetrics.followers > 0) {
    const previousSnapshot = await db
      .select({ followers: metricSnapshots.followers, date: metricSnapshots.date })
      .from(metricSnapshots)
      .where(
        and(
          eq(metricSnapshots.fandomId, fandomId),
          eq(metricSnapshots.platform, validPlatform),
          sql`${metricSnapshots.date} < ${today}`
        )
      )
      .orderBy(desc(metricSnapshots.date))
      .limit(1);

    if (previousSnapshot.length > 0 && previousSnapshot[0].followers > 0) {
      growthRate =
        ((normalizedMetrics.followers - previousSnapshot[0].followers) /
          previousSnapshot[0].followers) *
        100;
    }
  }

  // Compute engagement rate from this batch
  const totalEng =
    normalizedMetrics.avgLikes + normalizedMetrics.avgComments + normalizedMetrics.avgShares;
  const engagementRate =
    normalizedMetrics.followers > 0
      ? (totalEng / normalizedMetrics.followers) * 100
      : 0;

  await db.insert(metricSnapshots).values({
    fandomId,
    platform: validPlatform,
    date: today,
    followers: normalizedMetrics.followers,
    postsCount: normalizedMetrics.postsCount,
    engagementTotal: normalizedMetrics.engagementTotal,
    engagementRate: engagementRate.toFixed(4),
    growthRate: growthRate.toFixed(4),
    avgLikes: normalizedMetrics.avgLikes,
    avgComments: normalizedMetrics.avgComments,
    avgShares: normalizedMetrics.avgShares,
  }).onConflictDoUpdate({
    target: [metricSnapshots.fandomId, metricSnapshots.platform, metricSnapshots.date],
    set: {
      followers: normalizedMetrics.followers,
      postsCount: normalizedMetrics.postsCount,
      engagementTotal: normalizedMetrics.engagementTotal,
      engagementRate: engagementRate.toFixed(4),
      growthRate: growthRate.toFixed(4),
      avgLikes: normalizedMetrics.avgLikes,
      avgComments: normalizedMetrics.avgComments,
      avgShares: normalizedMetrics.avgShares,
    },
  });

  // 3. Update follower count on fandom_platforms
  if (normalizedMetrics.followers > 0) {
    await db
      .update(fandomPlatforms)
      .set({ followers: normalizedMetrics.followers })
      .where(
        and(
          eq(fandomPlatforms.fandomId, fandomId),
          eq(fandomPlatforms.platform, validPlatform)
        )
      );
  }

  // 4. Extract influencer data from raw items
  const MIN_POSTS = 5;
  const PH_PATTERNS = /\b(philippines|filipino|filipina|pinoy|pinay|manila|cebu|davao|quezon|makati|taguig|pasig|bgc|ph)\b/i;

  const normalizedInfluencers = normalizeInfluencers(validPlatform, rawItems);
  const validInfluencers = normalizedInfluencers.filter((i) => {
    if (!i.username || i.followers <= 1000) return false;
    if (i.postCount < MIN_POSTS) return false;
    if (i.location && !PH_PATTERNS.test(i.location)) return false;
    return true;
  });
  // Batch upsert influencers
  for (const inf of validInfluencers) {
    await db
      .insert(influencers)
      .values({
        fandomId,
        platform: validPlatform,
        username: inf.username,
        displayName: inf.displayName,
        followers: inf.followers,
        engagementRate: String(inf.engagementRate),
        profileUrl: inf.profileUrl,
        avatarUrl: inf.avatarUrl,
        bio: inf.bio,
        relevanceScore: "0",
      })
      .onConflictDoUpdate({
        target: [influencers.fandomId, influencers.platform, influencers.username],
        set: {
          displayName: inf.displayName,
          followers: inf.followers,
          engagementRate: String(inf.engagementRate),
          profileUrl: inf.profileUrl,
          avatarUrl: inf.avatarUrl,
          bio: inf.bio,
        },
      });
  }

  // 5. Analyze batch for potential new fandoms
  const newFandomCandidates = await analyzeScrapeBatch(
    rawItems.map((r) => ({
      hashtags: (r.hashtags as string[]) ?? [],
      text: (r.text as string) ?? "",
    })),
    validPlatform
  );

  console.log(`[Ingest] ${validPlatform} (${source}): ${totalInserted} new items, ${validInfluencers.length} influencers`);

  return {
    success: true,
    itemsCount: totalInserted,
    influencerCount: validInfluencers.length,
    discoveries: newFandomCandidates,
  };
}

async function ingestGoogleTrends(
  rawItems: Record<string, unknown>[],
  fandomId?: string
): Promise<number> {
  let inserted = 0;

  // Cache fandom rows for matching (avoids N+1 query per item)
  let cachedFandomRows: typeof fandoms.$inferSelect[] | null = null;
  async function getFandomRows() {
    if (!cachedFandomRows) {
      cachedFandomRows = await db.select().from(fandoms);
    }
    return cachedFandomRows;
  }

  for (const item of rawItems) {
    const searchTerm = (item.searchTerm || item.keyword || "") as string;
    const timelineData = (item.interestOverTime || item.timelineData || []) as Array<{
      date?: string;
      time?: string;
      value?: number[];
      formattedValue?: string[];
    }>;

    let matchedFandomId = fandomId;
    if (!matchedFandomId) {
      const fandomRows = await getFandomRows();
      const match = fandomRows.find(
        (f) =>
          searchTerm.toLowerCase().includes(f.name.toLowerCase()) ||
          f.name
            .toLowerCase()
            .includes(searchTerm.toLowerCase().replace(" philippines", ""))
      );
      matchedFandomId = match?.id;
    }

    if (!matchedFandomId) continue;

    // Batch collect all valid trend points for this search term
    const batchValues: {
      fandomId: string;
      keyword: string;
      date: string;
      interestValue: number;
      region: string;
    }[] = [];

    for (const point of timelineData) {
      const date = point.date || point.time || "";
      const value = point.value?.[0] ?? 0;
      if (!date) continue;

      const parsedDate = parseGoogleTrendsDate(date);
      if (!parsedDate) continue;

      batchValues.push({
        fandomId: matchedFandomId,
        keyword: searchTerm,
        date: parsedDate,
        interestValue: value,
        region: "PH",
      });
    }

    // Batch insert all trend points for this search term
    if (batchValues.length > 0) {
      await db.insert(googleTrends).values(batchValues).onConflictDoUpdate({
        target: [googleTrends.fandomId, googleTrends.keyword, googleTrends.date, googleTrends.region],
        set: { interestValue: sql`excluded.interest_value` },
      });
      inserted += batchValues.length;
    }
  }

  return inserted;
}

function parseGoogleTrendsDate(dateStr: string): string | null {
  if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
    return dateStr.split("T")[0];
  }

  const months: Record<string, string> = {
    Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
    Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
  };

  const match = dateStr.match(
    /(\w{3})\s+(\d{1,2})(?:\s*[–-]\s*\d{1,2})?,?\s*(\d{4})/
  );
  if (match) {
    const month = months[match[1]];
    const day = match[2].padStart(2, "0");
    if (month) return `${match[3]}-${month}-${day}`;
  }

  const monthMatch = dateStr.match(/(\w{3})\s+(\d{4})/);
  if (monthMatch) {
    const month = months[monthMatch[1]];
    if (month) return `${monthMatch[2]}-${month}-01`;
  }

  return null;
}

export async function updateScrapeRun(
  datasetId: string,
  status: "succeeded" | "failed",
  itemsCount: number
) {
  try {
    await db
      .update(scrapeRuns)
      .set({ status, finishedAt: new Date(), itemsCount })
      .where(eq(scrapeRuns.apifyRunId, datasetId));
  } catch (e) {
    console.warn("[updateScrapeRun] Failed to update scrape run:", datasetId, e);
  }
}
