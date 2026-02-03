import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { actorId, fandomId, datasetId } = body;

  if (!actorId || !datasetId) {
    return NextResponse.json(
      { error: "actorId and datasetId are required" },
      { status: 400 }
    );
  }

  // In production, this would:
  // 1. Fetch dataset items from Apify
  // 2. Normalize the data
  // 3. Insert into PostgreSQL
  // For now, return a success response
  console.log(
    `[Ingest] Received webhook: actor=${actorId} fandom=${fandomId} dataset=${datasetId}`
  );

  return NextResponse.json({
    success: true,
    message: "Data ingestion queued",
    actorId,
    fandomId,
    datasetId,
  });
}
