import { NextResponse } from "next/server";
import { generateAllFandomInsights, generateAllPageInsights } from "@/lib/services/ai.service";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Track generation state in memory
let generating = false;
let lastResult: {
  total: number;
  succeeded: number;
  failed: number;
  pageInsights: { trends: boolean; content: boolean; influencers: boolean };
  completedAt: string;
} | null = null;

export async function POST() {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY not configured" },
      { status: 400 }
    );
  }

  if (generating) {
    return NextResponse.json({
      status: "running",
      message: "AI insight generation already in progress...",
    });
  }

  // Fire and forget — respond immediately, run in background
  generating = true;
  lastResult = null;

  // Don't await — let it run in the background
  (async () => {
    try {
      const results = await generateAllFandomInsights();
      let pageInsights = { trends: false, content: false, influencers: false };
      try {
        pageInsights = await generateAllPageInsights();
      } catch (error) {
        console.error("[API] Page insights generation failed:", error);
      }

      const succeeded = results.filter((r) => r.success).length;
      const failed = results.filter((r) => !r.success).length;

      lastResult = {
        total: results.length,
        succeeded,
        failed,
        pageInsights,
        completedAt: new Date().toISOString(),
      };
      console.log(`[API] AI insights complete: ${succeeded}/${results.length} fandoms`);
    } catch (error) {
      console.error("[API] Generate insights failed:", error);
      lastResult = {
        total: 0,
        succeeded: 0,
        failed: 0,
        pageInsights: { trends: false, content: false, influencers: false },
        completedAt: new Date().toISOString(),
      };
    } finally {
      generating = false;
    }
  })();

  return NextResponse.json({
    status: "started",
    message: "AI insight generation started. This takes ~60-90 seconds. Check back shortly.",
  });
}

export async function GET() {
  return NextResponse.json({
    generating,
    lastResult,
  });
}
