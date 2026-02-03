import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fandoms, fandomPlatforms, scrapeRuns } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { runActor } from "@/lib/apify/client";
import { actorConfigs } from "@/lib/apify/actors";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { fandomSlug, platform } = body;

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
  const platformKey = platform || "tiktok";
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
      limit: 20,
    });

    console.log(
      `[Scrape] Running ${actorConfig.actorId} for ${fandom.name} (${platformKey})`
    );

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

    return NextResponse.json({
      success: true,
      message: `Scrape started for ${fandom.name} on ${platformKey}`,
      fandomId: fandom.id,
      platform: platformKey,
      datasetId,
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
