import { NextRequest, NextResponse } from "next/server";
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
import { eq, and } from "drizzle-orm";
import { getDatasetItems } from "@/lib/apify/client";
import {
  normalizeContent,
  normalizeMetrics,
  normalizeInfluencers,
} from "@/lib/apify/normalize";
import { analyzeScrapeBatch } from "@/lib/services/discovery.service";
import type { Platform } from "@/types/fandom";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { datasetId, fandomId, platform, actorId } = body;

  if (!datasetId) {
    return NextResponse.json(
      { error: "datasetId is required" },
      { status: 400 }
    );
  }

  try {
    const rawItems = await getDatasetItems(datasetId);

    if (rawItems.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No items in dataset",
        itemsCount: 0,
      });
    }

    const isGoogleTrends = actorId === "apify/google-trends-scraper";

    if (isGoogleTrends) {
      const inserted = await ingestGoogleTrends(rawItems, fandomId);
      await updateScrapeRun(datasetId, "succeeded", inserted);
      return NextResponse.json({
        success: true,
        message: `Ingested ${inserted} Google Trends data points`,
        itemsCount: inserted,
      });
    }

    if (!fandomId || !platform) {
      return NextResponse.json(
        { error: "fandomId and platform are required for platform scrapes" },
        { status: 400 }
      );
    }

    const validPlatform = platform as Platform;
    let totalInserted = 0;

    // 1. Normalize and insert content items (upsert by externalId)
    const normalizedContent = normalizeContent(validPlatform, rawItems);
    for (const item of normalizedContent) {
      const existing = await db
        .select({ id: contentItems.id })
        .from(contentItems)
        .where(
          and(
            eq(contentItems.fandomId, fandomId),
            eq(contentItems.externalId, item.externalId)
          )
        )
        .limit(1);

      if (existing.length === 0) {
        await db.insert(contentItems).values({
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
          publishedAt: item.publishedAt ? new Date(item.publishedAt) : null,
          hashtags: item.hashtags,
        });
        totalInserted++;
      }
    }

    // 2. Insert metric snapshot for today
    const normalizedMetrics = normalizeMetrics(validPlatform, rawItems);
    const today = new Date().toISOString().split("T")[0];
    await db.insert(metricSnapshots).values({
      fandomId,
      platform: validPlatform,
      date: today,
      followers: normalizedMetrics.followers,
      postsCount: normalizedMetrics.postsCount,
      engagementTotal: normalizedMetrics.engagementTotal,
      engagementRate: "0",
      growthRate: "0",
      avgLikes: normalizedMetrics.avgLikes,
      avgComments: normalizedMetrics.avgComments,
      avgShares: normalizedMetrics.avgShares,
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

    // 4. Extract influencer data from raw items (profiles with >1k followers)
    const normalizedInfluencers = normalizeInfluencers(validPlatform, rawItems);
    const validInfluencers = normalizedInfluencers.filter(
      (i) => i.username && i.followers > 1000
    );
    for (const inf of validInfluencers) {
      const existing = await db
        .select({ id: influencers.id })
        .from(influencers)
        .where(
          and(
            eq(influencers.fandomId, fandomId),
            eq(influencers.username, inf.username)
          )
        )
        .limit(1);

      if (existing.length === 0) {
        await db.insert(influencers).values({
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
        });
      }
    }

    // 5. Analyze batch for potential new fandoms
    const newFandomCandidates = await analyzeScrapeBatch(
      rawItems.map((r) => ({
        hashtags: (r.hashtags as string[]) ?? [],
        text: (r.text as string) ?? "",
      })),
      validPlatform
    );

    await updateScrapeRun(datasetId, "succeeded", totalInserted);

    return NextResponse.json({
      success: true,
      message: `Ingested ${totalInserted} content items, 1 metric snapshot, ${validInfluencers.length} influencers`,
      itemsCount: totalInserted,
      discoveries: newFandomCandidates.length > 0 ? newFandomCandidates : undefined,
    });
  } catch (error) {
    console.error("[Ingest] Failed:", error);
    await updateScrapeRun(datasetId, "failed", 0);
    return NextResponse.json(
      {
        error: `Ingest failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      },
      { status: 500 }
    );
  }
}

async function ingestGoogleTrends(
  rawItems: Record<string, unknown>[],
  fandomId?: string
): Promise<number> {
  let inserted = 0;

  for (const item of rawItems) {
    const searchTerm = (item.searchTerm || item.keyword || "") as string;
    const timelineData = (item.interestOverTime || item.timelineData || []) as Array<{
      date?: string;
      time?: string;
      value?: number[];
      formattedValue?: string[];
    }>;

    // Match search term to a fandom
    let matchedFandomId = fandomId;
    if (!matchedFandomId) {
      const fandomRows = await db.select().from(fandoms);
      const match = fandomRows.find((f) =>
        searchTerm.toLowerCase().includes(f.name.toLowerCase()) ||
        f.name.toLowerCase().includes(searchTerm.toLowerCase().replace(" philippines", ""))
      );
      matchedFandomId = match?.id;
    }

    if (!matchedFandomId) continue;

    for (const point of timelineData) {
      const date = point.date || point.time || "";
      const value = point.value?.[0] ?? 0;
      if (!date) continue;

      const parsedDate = parseGoogleTrendsDate(date);
      if (!parsedDate) continue;

      await db.insert(googleTrends).values({
        fandomId: matchedFandomId,
        keyword: searchTerm,
        date: parsedDate,
        interestValue: value,
        region: "PH",
      });
      inserted++;
    }
  }

  return inserted;
}

function parseGoogleTrendsDate(dateStr: string): string | null {
  // ISO format
  if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
    return dateStr.split("T")[0];
  }

  const months: Record<string, string> = {
    Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
    Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
  };

  // "Feb 4 – 10, 2025" or "Feb 4, 2025"
  const match = dateStr.match(/(\w{3})\s+(\d{1,2})(?:\s*[–-]\s*\d{1,2})?,?\s*(\d{4})/);
  if (match) {
    const month = months[match[1]];
    const day = match[2].padStart(2, "0");
    if (month) return `${match[3]}-${month}-${day}`;
  }

  // "Feb 2025" monthly format
  const monthMatch = dateStr.match(/(\w{3})\s+(\d{4})/);
  if (monthMatch) {
    const month = months[monthMatch[1]];
    if (month) return `${monthMatch[2]}-${month}-01`;
  }

  return null;
}

async function updateScrapeRun(
  datasetId: string,
  status: "succeeded" | "failed",
  itemsCount: number
) {
  try {
    await db
      .update(scrapeRuns)
      .set({ status, finishedAt: new Date(), itemsCount })
      .where(eq(scrapeRuns.apifyRunId, datasetId));
  } catch {
    // Scrape run record might not exist
  }
}
