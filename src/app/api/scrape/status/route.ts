import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { scrapeRuns, fandoms } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const fandomId = searchParams.get("fandomId");

  try {
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
