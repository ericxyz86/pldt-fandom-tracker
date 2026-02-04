import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fandoms, fandomPlatforms, aiDiscoveredFandoms } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const slug = searchParams.get("slug");

    if (!slug) {
      return NextResponse.json(
        { error: "slug is required" },
        { status: 400 }
      );
    }

    const rows = await db
      .select({ id: fandoms.id })
      .from(fandoms)
      .where(eq(fandoms.slug, slug))
      .limit(1);

    if (rows.length === 0) {
      return NextResponse.json(
        { error: "Fandom not found" },
        { status: 404 }
      );
    }

    const fandomId = rows[0].id;

    // Reset any ai_discovered_fandoms record that references this fandom
    await db
      .update(aiDiscoveredFandoms)
      .set({ status: "discovered", trackedFandomId: null })
      .where(eq(aiDiscoveredFandoms.trackedFandomId, fandomId));

    // Delete the fandom and its platform entries
    await db.delete(fandomPlatforms).where(eq(fandomPlatforms.fandomId, fandomId));
    await db.delete(fandoms).where(eq(fandoms.id, fandomId));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to untrack fandom:", error);
    return NextResponse.json(
      { error: "Failed to untrack fandom" },
      { status: 500 }
    );
  }
}
