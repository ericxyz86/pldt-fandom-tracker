import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { scrapeRuns, fandoms } from "@/lib/db/schema";
import { eq, desc, and, lt, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const fandomId = searchParams.get("fandomId");

  try {
    // Auto-cleanup: mark stale "running" records (>10min) as "timed_out"
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
    await db
      .update(scrapeRuns)
      .set({ status: "failed", finishedAt: new Date() })
      .where(
        and(
          eq(scrapeRuns.status, "running"),
          lt(scrapeRuns.startedAt, tenMinAgo)
        )
      );

    const query = db
      .select({
        id: scrapeRuns.id,
        platform: scrapeRuns.platform,
        status: scrapeRuns.status,
        startedAt: scrapeRuns.startedAt,
        finishedAt: scrapeRuns.finishedAt,
        itemsCount: scrapeRuns.itemsCount,
        fandomId: scrapeRuns.fandomId,
        fandomName: fandoms.name,
      })
      .from(scrapeRuns)
      .leftJoin(fandoms, eq(scrapeRuns.fandomId, fandoms.id))
      .orderBy(desc(scrapeRuns.startedAt))
      .limit(50);

    const rows = fandomId
      ? await query.where(eq(scrapeRuns.fandomId, fandomId))
      : await query;

    return NextResponse.json(rows);
  } catch (error) {
    console.error("Failed to fetch scrape status:", error);
    return NextResponse.json(
      { error: "Failed to fetch scrape status" },
      { status: 500 }
    );
  }
}
