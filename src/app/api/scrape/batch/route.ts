import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { db } from "@/lib/db";
import { fandoms, scrapeRuns } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import {
  scrapeAllPlatformsForFandom,
  scrapeAllFandoms,
} from "@/lib/services/scrape.service";

async function hasActiveScrape(): Promise<boolean> {
  const active = await db
    .select({ count: sql<number>`count(*)` })
    .from(scrapeRuns)
    .where(
      and(
        eq(scrapeRuns.status, "running"),
        sql`${scrapeRuns.startedAt} > now() - interval '30 minutes'`
      )
    );
  return Number(active[0].count) > 0;
}

export async function POST(req: NextRequest) {
  if (await hasActiveScrape()) {
    return NextResponse.json(
      { error: "A scrape is already running. Please wait for it to complete." },
      { status: 409 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const { fandomSlug } = body;

  if (fandomSlug) {
    // Scrape all platforms for a specific fandom
    const fandomRows = await db
      .select()
      .from(fandoms)
      .where(eq(fandoms.slug, fandomSlug))
      .limit(1);

    if (fandomRows.length === 0) {
      return NextResponse.json({ error: "Fandom not found" }, { status: 404 });
    }

    const fandom = fandomRows[0];

    after(async () => {
      console.log(`[Batch Scrape] Starting all platforms for ${fandom.name}`);
      const results = await scrapeAllPlatformsForFandom(fandom.id);
      const succeeded = results.filter((r) => r.success).length;
      console.log(
        `[Batch Scrape] Completed ${fandom.name}: ${succeeded}/${results.length} platforms succeeded`
      );
    });

    return NextResponse.json(
      {
        success: true,
        message: `Batch scrape started for ${fandom.name} (all platforms)`,
        fandomId: fandom.id,
      },
      { status: 202 }
    );
  }

  // Scrape all fandoms, all platforms
  after(async () => {
    console.log("[Batch Scrape] Starting global scrape for all fandoms");
    const results = await scrapeAllFandoms();
    const succeeded = results.filter((r) => r.success).length;
    console.log(
      `[Batch Scrape] Global scrape completed: ${succeeded}/${results.length} total runs succeeded`
    );
  });

  return NextResponse.json(
    {
      success: true,
      message: "Global batch scrape started for all fandoms and platforms",
    },
    { status: 202 }
  );
}
