import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { fandomId, platform } = body;

  if (!fandomId || !platform) {
    return NextResponse.json(
      { error: "fandomId and platform are required" },
      { status: 400 }
    );
  }

  // In production, this would:
  // 1. Look up the fandom and platform config
  // 2. Call the appropriate Apify actor
  // 3. Return the run ID
  console.log(`[Scrape] Manual trigger: fandom=${fandomId} platform=${platform}`);

  return NextResponse.json({
    success: true,
    message: "Scrape triggered",
    fandomId,
    platform,
    runId: `mock-run-${Date.now()}`,
  });
}
