import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fandoms, fandomPlatforms } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getFandomBySlug } from "@/lib/services/fandom.service";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ fandomId: string }> }
) {
  const { fandomId } = await params;
  const { searchParams } = new URL(req.url);
  const dateFrom = searchParams.get("from") || undefined;
  const dateTo = searchParams.get("to") || undefined;

  try {
    const fandom = await getFandomBySlug(fandomId, dateFrom, dateTo);

    if (!fandom) {
      return NextResponse.json({ error: "Fandom not found" }, { status: 404 });
    }

    return NextResponse.json(fandom);
  } catch (error) {
    console.error("Failed to fetch fandom:", error);
    return NextResponse.json(
      { error: "Failed to fetch fandom" },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ fandomId: string }> }
) {
  const { fandomId } = await params;

  try {
    const body = await req.json();
    const { name, tier, description, fandomGroup, demographicTags, platforms } = body;

    // Look up fandom by slug (fandomId param is the slug)
    const rows = await db
      .select({ id: fandoms.id })
      .from(fandoms)
      .where(eq(fandoms.slug, fandomId))
      .limit(1);

    if (rows.length === 0) {
      return NextResponse.json({ error: "Fandom not found" }, { status: 404 });
    }

    const id = rows[0].id;

    // Build update fields
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (name !== undefined) updates.name = name;
    if (tier !== undefined) updates.tier = tier;
    if (description !== undefined) updates.description = description || null;
    if (fandomGroup !== undefined) updates.fandomGroup = fandomGroup || null;
    if (demographicTags !== undefined) updates.demographicTags = demographicTags;

    const [updated] = await db
      .update(fandoms)
      .set(updates)
      .where(eq(fandoms.id, id))
      .returning();

    // Replace platforms if provided
    if (platforms && Array.isArray(platforms)) {
      await db.delete(fandomPlatforms).where(eq(fandomPlatforms.fandomId, id));
      for (const p of platforms) {
        if (p.platform && p.handle) {
          await db.insert(fandomPlatforms).values({
            fandomId: id,
            platform: p.platform,
            handle: p.handle,
            followers: p.followers || 0,
            url: p.url || null,
          });
        }
      }
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Failed to update fandom:", error);
    return NextResponse.json(
      { error: "Failed to update fandom" },
      { status: 500 }
    );
  }
}
