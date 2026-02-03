import { NextResponse } from "next/server";
import {
  getMockFandoms,
  getMockMetricHistory,
  getMockContent,
  getMockInfluencers,
  getMockTrends,
} from "@/lib/data/mock";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ fandomId: string }> }
) {
  const { fandomId } = await params;
  const fandoms = getMockFandoms();
  const fandom = fandoms.find((f) => f.slug === fandomId);

  if (!fandom) {
    return NextResponse.json({ error: "Fandom not found" }, { status: 404 });
  }

  return NextResponse.json({
    ...fandom,
    metrics: getMockMetricHistory(fandom.id),
    content: getMockContent(fandom.id),
    influencers: getMockInfluencers(fandom.id),
    trends: getMockTrends(fandom.id),
  });
}
