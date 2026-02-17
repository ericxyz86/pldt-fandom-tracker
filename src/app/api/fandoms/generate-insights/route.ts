import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { aiPageInsights } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { generateAllFandomInsights, generateAllPageInsights } from "@/lib/services/ai.service";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const LOCK_PAGE = "__generation_lock";
const LOCK_TTL_MS = 10 * 60 * 1000; // 10 minutes

async function isGenerating(): Promise<boolean> {
  const rows = await db
    .select()
    .from(aiPageInsights)
    .where(eq(aiPageInsights.page, LOCK_PAGE))
    .limit(1);

  if (rows.length === 0) return false;

  const lock = rows[0];
  const age = Date.now() - lock.generatedAt.getTime();
  if (age > LOCK_TTL_MS) {
    // Stale lock — clean it up
    await db.delete(aiPageInsights).where(eq(aiPageInsights.page, LOCK_PAGE));
    return false;
  }
  return true;
}

async function acquireLock(): Promise<boolean> {
  if (await isGenerating()) return false;
  try {
    await db
      .insert(aiPageInsights)
      .values({
        page: LOCK_PAGE,
        insights: "running",
        generatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: aiPageInsights.page,
        set: { insights: "running", generatedAt: new Date() },
      });
    return true;
  } catch {
    return false;
  }
}

async function releaseLock(result: string): Promise<void> {
  await db
    .update(aiPageInsights)
    .set({ insights: result, generatedAt: new Date() })
    .where(eq(aiPageInsights.page, LOCK_PAGE));
}

export async function POST() {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY not configured" },
      { status: 400 }
    );
  }

  const acquired = await acquireLock();
  if (!acquired) {
    return NextResponse.json({
      status: "running",
      message: "AI insight generation already in progress...",
    });
  }

  // Fire and forget — respond immediately, run in background
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

      const resultData = {
        total: results.length,
        succeeded,
        failed,
        pageInsights,
        completedAt: new Date().toISOString(),
      };

      await releaseLock(JSON.stringify(resultData));
      console.log(`[API] AI insights complete: ${succeeded}/${results.length} fandoms`);
    } catch (error) {
      console.error("[API] Generate insights failed:", error);
      await releaseLock(JSON.stringify({
        total: 0,
        succeeded: 0,
        failed: 0,
        pageInsights: { trends: false, content: false, influencers: false },
        completedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : "Unknown error",
      }));
    }
  })();

  return NextResponse.json({
    status: "started",
    message: "AI insight generation started. This takes ~60-90 seconds. Check back shortly.",
  });
}

export async function GET() {
  const rows = await db
    .select()
    .from(aiPageInsights)
    .where(eq(aiPageInsights.page, LOCK_PAGE))
    .limit(1);

  if (rows.length === 0) {
    return NextResponse.json({ generating: false, lastResult: null });
  }

  const lock = rows[0];
  const isRunning = lock.insights === "running";
  let lastResult = null;

  if (!isRunning) {
    try {
      lastResult = JSON.parse(lock.insights);
    } catch {
      lastResult = null;
    }
  }

  return NextResponse.json({ generating: isRunning, lastResult });
}
