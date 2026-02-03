import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fandoms, fandomPlatforms } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getAllFandoms } from "@/lib/services/fandom.service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await getAllFandoms();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Failed to fetch fandoms:", error);
    return NextResponse.json(
      { error: "Failed to fetch fandoms" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, tier, description, fandomGroup, demographicTags, platforms } = body;

    if (!name || !tier) {
      return NextResponse.json(
        { error: "name and tier are required" },
        { status: 400 }
      );
    }

    // Generate slug from name
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");

    // Check for duplicate slug
    const existing = await db
      .select({ id: fandoms.id })
      .from(fandoms)
      .where(eq(fandoms.slug, slug))
      .limit(1);

    if (existing.length > 0) {
      return NextResponse.json(
        { error: "A fandom with this name already exists" },
        { status: 409 }
      );
    }

    // Insert fandom
    const [newFandom] = await db
      .insert(fandoms)
      .values({
        name,
        slug,
        tier,
        description: description || null,
        fandomGroup: fandomGroup || null,
        demographicTags: demographicTags || [],
      })
      .returning();

    // Insert platform entries if provided
    if (platforms && Array.isArray(platforms)) {
      for (const p of platforms) {
        if (p.platform && p.handle) {
          await db.insert(fandomPlatforms).values({
            fandomId: newFandom.id,
            platform: p.platform,
            handle: p.handle,
            followers: p.followers || 0,
            url: p.url || null,
          });
        }
      }
    }

    return NextResponse.json(newFandom, { status: 201 });
  } catch (error) {
    console.error("Failed to create fandom:", error);
    return NextResponse.json(
      { error: "Failed to create fandom" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
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

    // Delete related records first, then the fandom
    await db.delete(fandomPlatforms).where(eq(fandomPlatforms.fandomId, fandomId));
    await db.delete(fandoms).where(eq(fandoms.id, fandomId));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete fandom:", error);
    return NextResponse.json(
      { error: "Failed to delete fandom" },
      { status: 500 }
    );
  }
}
