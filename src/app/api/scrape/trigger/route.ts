import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fandoms, fandomPlatforms, scrapeRuns } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { runActor } from "@/lib/apify/client";
import { actorConfigs } from "@/lib/apify/actors";
import { ingestDataset } from "@/lib/services/ingest.service";
import type { Platform } from "@/types/fandom";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { fandomSlug, platform, limit: requestLimit } = body;
  const limit = Math.min(Math.max(Number(requestLimit) || 20, 1), 100);

  if (!fandomSlug) {
    return NextResponse.json(
      { error: "fandomSlug is required" },
      { status: 400 }
    );
  }

  // Look up fandom
  const fandomRows = await db
    .select()
    .from(fandoms)
    .where(eq(fandoms.slug, fandomSlug))
    .limit(1);

  if (fandomRows.length === 0) {
    return NextResponse.json({ error: "Fandom not found" }, { status: 404 });
  }

  const fandom = fandomRows[0];

  // Get the platform config
  const platformKey = (platform || "tiktok") as Platform;
  const actorConfig = actorConfigs[platformKey];

  if (!actorConfig) {
    return NextResponse.json(
      { error: `No actor configured for platform: ${platformKey}` },
      { status: 400 }
    );
  }

  // Get the fandom's handle for this platform
  const platformRows = await db
    .select()
    .from(fandomPlatforms)
    .where(eq(fandomPlatforms.fandomId, fandom.id));

  const platformEntry = platformRows.find((p) => p.platform === platformKey);
  const handle = platformEntry?.handle || fandom.name;

  try {
    const input = actorConfig.buildInput({
      handle,
      keyword: fandom.name,
      limit,
    });

    console.log(
      `[Scrape] Running ${actorConfig.actorId} for ${fandom.name} (${platformKey})`
    );

    const datasetId = await runActor(actorConfig.actorId, input);

    // Log the scrape run
    const [scrapeRun] = await db.insert(scrapeRuns).values({
      actorId: actorConfig.actorId,
      fandomId: fandom.id,
      platform: actorConfig.platform,
      status: "running",
      startedAt: new Date(),
      apifyRunId: datasetId,
    }).returning({ id: scrapeRuns.id });

    // Ingest the dataset results into the database
    const ingestResult = await ingestDataset({
      datasetId,
      fandomId: fandom.id,
      platform: platformKey,
      actorId: actorConfig.actorId,
    });

    // Update scrape run with final status
    await db
      .update(scrapeRuns)
      .set({
        status: ingestResult.success ? "succeeded" : "failed",
        finishedAt: new Date(),
        itemsCount: ingestResult.itemsCount,
      })
      .where(eq(scrapeRuns.id, scrapeRun.id));

    return NextResponse.json({
      success: true,
      message: `Scrape completed for ${fandom.name} on ${platformKey}`,
      fandomId: fandom.id,
      platform: platformKey,
      datasetId,
      itemsIngested: ingestResult.itemsCount,
      influencersFound: ingestResult.influencerCount,
    });
  } catch (error) {
    console.error("[Scrape] Failed:", error);

    return NextResponse.json(
      {
        error: `Scrape failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      },
      { status: 500 }
    );
  }
}
