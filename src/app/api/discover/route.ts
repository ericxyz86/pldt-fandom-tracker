import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { db } from "@/lib/db";
import { aiDiscoveredFandoms, aiPageInsights } from "@/lib/db/schema";
import { eq, desc, inArray } from "drizzle-orm";
import { discoverNewFandoms } from "@/lib/services/ai.service";

export const dynamic = "force-dynamic";

// Discovery status is stored in ai_page_insights with page = "discovery_status"
async function getDiscoveryStatus(): Promise<"idle" | "running"> {
  const rows = await db
    .select()
    .from(aiPageInsights)
    .where(eq(aiPageInsights.page, "discovery_status"))
    .limit(1);
  if (rows.length === 0) return "idle";
  try {
    const parsed = JSON.parse(rows[0].insights);
    return parsed.status === "running" ? "running" : "idle";
  } catch {
    return "idle";
  }
}

async function setDiscoveryStatus(status: "idle" | "running", error?: string) {
  const data = JSON.stringify({ status, error: error || null });
  const existing = await db
    .select()
    .from(aiPageInsights)
    .where(eq(aiPageInsights.page, "discovery_status"))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(aiPageInsights)
      .set({ insights: data, generatedAt: new Date() })
      .where(eq(aiPageInsights.page, "discovery_status"));
  } else {
    await db.insert(aiPageInsights).values({
      page: "discovery_status",
      insights: data,
      generatedAt: new Date(),
    });
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const statusOnly = searchParams.get("status");

  if (statusOnly !== null) {
    const status = await getDiscoveryStatus();
    return NextResponse.json({ status });
  }

  try {
    const results = await db
      .select()
      .from(aiDiscoveredFandoms)
      .where(eq(aiDiscoveredFandoms.status, "discovered"))
      .orderBy(desc(aiDiscoveredFandoms.overallScore));

    return NextResponse.json(results);
  } catch (error) {
    console.error("Failed to fetch discovered fandoms:", error);
    return NextResponse.json(
      { error: "Failed to fetch discovered fandoms" },
      { status: 500 }
    );
  }
}

export async function POST() {
  const currentStatus = await getDiscoveryStatus();
  if (currentStatus === "running") {
    return NextResponse.json(
      { message: "Discovery already in progress" },
      { status: 202 }
    );
  }

  await setDiscoveryStatus("running");

  after(async () => {
    try {
      await discoverNewFandoms();
      await setDiscoveryStatus("idle");
    } catch (error) {
      console.error("Failed to discover fandoms:", error);
      const message = error instanceof Error ? error.message : "Discovery failed";
      await setDiscoveryStatus("idle", message);
    }
  });

  return NextResponse.json({ message: "Discovery started" }, { status: 202 });
}

// Bulk actions on discovered fandoms
// Body: { ids: string[], action: "clear" | "dismiss" }
// clear = delete from DB (can be re-discovered)
// dismiss = set status to dismissed (permanently excluded)
export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const { ids, action } = body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { error: "ids array is required" },
        { status: 400 }
      );
    }

    if (!action || !["clear", "dismiss"].includes(action)) {
      return NextResponse.json(
        { error: "action must be 'clear' or 'dismiss'" },
        { status: 400 }
      );
    }

    if (action === "clear") {
      await db
        .update(aiDiscoveredFandoms)
        .set({ status: "cleared" })
        .where(inArray(aiDiscoveredFandoms.id, ids));
    } else {
      await db
        .update(aiDiscoveredFandoms)
        .set({ status: "dismissed", dismissedAt: new Date() })
        .where(inArray(aiDiscoveredFandoms.id, ids));
    }

    return NextResponse.json({ success: true, count: ids.length });
  } catch (error) {
    console.error("Failed to bulk update discovered fandoms:", error);
    return NextResponse.json(
      { error: "Failed to update discovered fandoms" },
      { status: 500 }
    );
  }
}
