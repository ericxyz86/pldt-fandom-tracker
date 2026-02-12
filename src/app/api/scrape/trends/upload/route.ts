import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fandoms, googleTrends, scrapeRuns } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Upload Google Trends data from an external source (e.g., Mac Mini residential IP script).
 * Accepts: { trends: [{ fandomSlug, keyword, points: [{date, value}] }] }
 * Auth: Bearer token (API_SECRET or CRON_SECRET)
 */
export async function POST(request: NextRequest) {
  // Auth check
  const auth = request.headers.get("authorization");
  const token = auth?.replace("Bearer ", "");
  const validTokens = [process.env.API_SECRET, process.env.CRON_SECRET].filter(Boolean);
  if (!token || !validTokens.includes(token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { trends } = body;

    if (!Array.isArray(trends) || trends.length === 0) {
      return NextResponse.json({ error: "Invalid payload: expected { trends: [...] }" }, { status: 400 });
    }

    // Load fandom slug → id map
    const allFandoms = await db.select().from(fandoms);
    const slugToId = new Map(allFandoms.map((f) => [f.slug, f.id]));

    let totalInserted = 0;
    let succeeded = 0;
    let failed = 0;
    const results: Array<{ fandomSlug: string; keyword: string; dataPoints: number; error?: string }> = [];

    for (const trend of trends) {
      const { fandomSlug, keyword, points } = trend;
      const fandomId = slugToId.get(fandomSlug);

      if (!fandomId) {
        results.push({ fandomSlug, keyword, dataPoints: 0, error: `Fandom not found: ${fandomSlug}` });
        failed++;
        continue;
      }

      if (!Array.isArray(points) || points.length === 0) {
        results.push({ fandomSlug, keyword, dataPoints: 0, error: "No data points" });
        failed++;
        continue;
      }

      try {
        // Delete existing trends for this fandom
        await db.delete(googleTrends).where(eq(googleTrends.fandomId, fandomId));

        // Batch insert using individual inserts (Drizzle doesn't support batch values well)
        for (const point of points) {
          await db.insert(googleTrends).values({
            fandomId,
            keyword,
            date: point.date,
            interestValue: point.value,
            region: "PH",
          });
        }

        // Create audit record
        await db.insert(scrapeRuns).values({
          actorId: "google-trends-upload",
          fandomId,
          platform: "instagram", // Matches schema constraint
          status: "succeeded",
          startedAt: new Date(),
          finishedAt: new Date(),
          itemsCount: points.length,
        });

        totalInserted += points.length;
        succeeded++;
        results.push({ fandomSlug, keyword, dataPoints: points.length });
      } catch (err) {
        console.error(`[TrendsUpload] Failed for ${fandomSlug}:`, err);
        results.push({
          fandomSlug,
          keyword,
          dataPoints: 0,
          error: err instanceof Error ? err.message : "Insert failed",
        });
        failed++;
      }
    }

    return NextResponse.json({
      total: trends.length,
      succeeded,
      failed,
      totalInserted,
      results,
    });
  } catch (err) {
    console.error("[TrendsUpload] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload failed" },
      { status: 500 }
    );
  }
}
