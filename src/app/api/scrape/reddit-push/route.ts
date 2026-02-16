import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  fandoms,
  fandomPlatforms,
  scrapeRuns,
  contentItems,
  metricSnapshots,
} from "@/lib/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";

/**
 * POST /api/scrape/reddit-push
 *
 * Accepts pre-scraped Reddit data pushed from a local Mac Mini script.
 * Reddit blocks datacenter IPs (Hetzner/Apify), so we scrape from a
 * residential IP and push results here.
 *
 * Body: {
 *   fandomId: string,
 *   keyword: string,
 *   items: Array<{
 *     id: string,
 *     title: string,
 *     selftext?: string,
 *     url: string,
 *     permalink: string,
 *     score: number,
 *     num_comments: number,
 *     author: string,
 *     subreddit: string,
 *     created_utc: number,
 *   }>
 * }
 */
export async function POST(req: NextRequest) {
  // Auth: require API secret
  const apiSecret = process.env.PLDT_API_SECRET || process.env.API_SECRET;
  const authHeader = req.headers.get("authorization");
  const xApiSecret = req.headers.get("x-api-secret");

  if (!apiSecret) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const isAuthed =
    (authHeader === `Bearer ${apiSecret}`) ||
    (xApiSecret === apiSecret);

  if (!isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { fandomId, keyword, items } = body;

  if (!fandomId || !Array.isArray(items)) {
    return NextResponse.json(
      { error: "fandomId and items[] are required" },
      { status: 400 }
    );
  }

  // Verify fandom exists
  const fandomRows = await db
    .select()
    .from(fandoms)
    .where(eq(fandoms.id, fandomId))
    .limit(1);

  if (fandomRows.length === 0) {
    return NextResponse.json({ error: "Fandom not found" }, { status: 404 });
  }

  const fandom = fandomRows[0];

  // Create a scrape run record
  const [scrapeRun] = await db
    .insert(scrapeRuns)
    .values({
      actorId: "local/reddit-push",
      fandomId: fandom.id,
      platform: "reddit",
      status: "running",
      startedAt: new Date(),
    })
    .returning({ id: scrapeRuns.id });

  try {
    let totalInserted = 0;

    // Insert content items (upsert by externalId)
    for (const item of items) {
      const externalId = item.id || "";
      if (!externalId) continue;

      const existing = await db
        .select({ id: contentItems.id })
        .from(contentItems)
        .where(
          and(
            eq(contentItems.fandomId, fandomId),
            eq(contentItems.externalId, externalId)
          )
        )
        .limit(1);

      if (existing.length === 0) {
        await db.insert(contentItems).values({
          fandomId,
          platform: "reddit",
          externalId,
          contentType: "thread",
          text: item.title || null,
          url: item.permalink
            ? `https://www.reddit.com${item.permalink}`
            : item.url || null,
          likes: item.score || 0,
          comments: item.num_comments || 0,
          shares: 0,
          views: 0,
          publishedAt: item.created_utc
            ? new Date(item.created_utc * 1000)
            : null,
          hashtags: [],
        });
        totalInserted++;
      }
    }

    // Insert metric snapshot for today
    const today = new Date().toISOString().split("T")[0];
    const totalLikes = items.reduce(
      (sum: number, item: any) => sum + (item.score || 0),
      0
    );
    const totalComments = items.reduce(
      (sum: number, item: any) => sum + (item.num_comments || 0),
      0
    );

    // Get previous snapshot for growth rate
    const previousSnapshot = await db
      .select({
        followers: metricSnapshots.followers,
      })
      .from(metricSnapshots)
      .where(
        and(
          eq(metricSnapshots.fandomId, fandomId),
          eq(metricSnapshots.platform, "reddit"),
          sql`${metricSnapshots.date} < ${today}`
        )
      )
      .orderBy(desc(metricSnapshots.date))
      .limit(1);

    // Reddit doesn't have "followers" per se, but we can track engagement
    await db
      .insert(metricSnapshots)
      .values({
        fandomId,
        platform: "reddit",
        date: today,
        followers: 0,
        postsCount: items.length,
        engagementTotal: totalLikes + totalComments,
        engagementRate: "0",
        growthRate: "0",
        avgLikes: items.length
          ? Math.round(totalLikes / items.length)
          : 0,
        avgComments: items.length
          ? Math.round(totalComments / items.length)
          : 0,
        avgShares: 0,
      })
      .onConflictDoUpdate({
        target: [
          metricSnapshots.fandomId,
          metricSnapshots.platform,
          metricSnapshots.date,
        ],
        set: {
          postsCount: items.length,
          engagementTotal: totalLikes + totalComments,
          avgLikes: items.length
            ? Math.round(totalLikes / items.length)
            : 0,
          avgComments: items.length
            ? Math.round(totalComments / items.length)
            : 0,
        },
      });

    // Mark scrape run as succeeded
    await db
      .update(scrapeRuns)
      .set({
        status: "succeeded",
        finishedAt: new Date(),
        itemsCount: totalInserted,
      })
      .where(eq(scrapeRuns.id, scrapeRun.id));

    console.log(
      `[Reddit Push] ${fandom.name}: ${totalInserted} new items from ${items.length} total (keyword: ${keyword || fandom.name})`
    );

    return NextResponse.json({
      success: true,
      fandomId,
      fandomName: fandom.name,
      keyword: keyword || fandom.name,
      totalItems: items.length,
      newItems: totalInserted,
    });
  } catch (error) {
    console.error(`[Reddit Push] Failed for ${fandom.name}:`, error);

    await db
      .update(scrapeRuns)
      .set({ status: "failed", finishedAt: new Date() })
      .where(eq(scrapeRuns.id, scrapeRun.id))
      .catch(() => {});

    return NextResponse.json(
      {
        error: `Reddit push failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      },
      { status: 500 }
    );
  }
}
