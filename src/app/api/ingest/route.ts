import { NextRequest, NextResponse } from "next/server";
import { ingestDataset, updateScrapeRun } from "@/lib/services/ingest.service";
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

  if (!actorId?.includes("google-trends") && (!fandomId || !platform)) {
    return NextResponse.json(
      { error: "fandomId and platform are required for platform scrapes" },
      { status: 400 }
    );
  }

  try {
    const result = await ingestDataset({
      datasetId,
      fandomId,
      platform: platform as Platform,
      actorId,
    });

    return NextResponse.json({
      success: result.success,
      message: `Ingested ${result.itemsCount} content items, 1 metric snapshot, ${result.influencerCount} influencers`,
      itemsCount: result.itemsCount,
      discoveries: result.discoveries.length > 0 ? result.discoveries : undefined,
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
