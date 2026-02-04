import { NextRequest, NextResponse } from "next/server";
import { scrapeAllFandoms } from "@/lib/services/scrape.service";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");

  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    console.log("[Cron] Starting scheduled scrape for all fandoms");
    const results = await scrapeAllFandoms();
    const succeeded = results.filter((r) => r.success).length;
    console.log(
      `[Cron] Scheduled scrape completed: ${succeeded}/${results.length} runs succeeded`
    );

    return NextResponse.json({
      success: true,
      total: results.length,
      succeeded,
      failed: results.length - succeeded,
      results,
    });
  } catch (error) {
    console.error("[Cron] Scheduled scrape failed:", error);
    return NextResponse.json(
      { error: "Scheduled scrape failed" },
      { status: 500 }
    );
  }
}
