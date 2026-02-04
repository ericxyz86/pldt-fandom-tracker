import { NextResponse } from "next/server";
import { generateAllFandomInsights, generateAllPageInsights } from "@/lib/services/ai.service";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST() {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY not configured" },
        { status: 400 }
      );
    }

    const results = await generateAllFandomInsights();

    let pageInsights = { trends: false, content: false, influencers: false };
    try {
      pageInsights = await generateAllPageInsights();
    } catch (error) {
      console.error("[API] Page insights generation failed:", error);
    }

    const succeeded = results.filter((r) => r.success);
    const failed = results.filter((r) => !r.success);

    return NextResponse.json({
      total: results.length,
      succeeded: succeeded.length,
      failed: failed.length,
      details: results,
      pageInsights,
    });
  } catch (error) {
    console.error("[API] Generate insights failed:", error);
    return NextResponse.json(
      { error: "Failed to generate insights" },
      { status: 500 }
    );
  }
}
