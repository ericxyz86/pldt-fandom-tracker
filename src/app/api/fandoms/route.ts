import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { db } from "@/lib/db";
import { fandoms, fandomPlatforms } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getAllFandoms } from "@/lib/services/fandom.service";
import { scrapeAllPlatformsForFandom } from "@/lib/services/scrape.service";
import { researchSingleFandom } from "@/lib/services/ai.service";
import type { Platform } from "@/types/fandom";
import { VALID_PLATFORMS } from "@/lib/constants";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const dateFrom = searchParams.get("from") || undefined;
    const dateTo = searchParams.get("to") || undefined;
    const data = await getAllFandoms(dateFrom, dateTo);
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
    const {
      name,
      tier,
      description,
      fandomGroup,
      demographicTags,
      platforms,
      scrapeImmediately,
      useAIResearch,
    } = body;

    if (!name) {
      return NextResponse.json(
        { error: "name is required" },
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

    let fandomData: {
      name: string;
      slug: string;
      tier: "emerging" | "trending" | "existing";
      description: string | null;
      fandomGroup: string | null;
      demographicTags: string[];
      aiKeyBehavior?: string | null;
      aiEngagementPotential?: string | null;
      aiCommunityTone?: string | null;
      aiRationale?: string | null;
      aiGeneratedAt?: Date | null;
    };
    let platformsToInsert: Array<{ platform: string; handle: string; followers: number }> = [];

    // AI Research mode: Let AI fill in all the details
    if (useAIResearch) {
      console.log(`[AI Research] Researching fandom: ${name}`);
      const researched = await researchSingleFandom(name, {
        tier,
        fandomGroup,
        description,
        platforms: platforms?.filter((p: { handle: string }) => p.handle?.trim()),
      });

      if (!researched) {
        return NextResponse.json(
          { error: "AI research failed. Please try again or add details manually." },
          { status: 500 }
        );
      }

      fandomData = {
        name: researched.name,
        slug,
        tier: researched.tier,
        description: researched.description,
        fandomGroup: researched.fandomGroup,
        demographicTags: researched.demographicTags,
        aiKeyBehavior: researched.aiKeyBehavior,
        aiEngagementPotential: researched.aiEngagementPotential,
        aiCommunityTone: researched.aiCommunityTone,
        aiRationale: researched.aiRationale,
        aiGeneratedAt: new Date(),
      };
      platformsToInsert = researched.platforms;
      console.log(`[AI Research] Found ${platformsToInsert.length} platforms for ${name}`);
    } else {
      // Manual mode: Use provided data
      if (!tier) {
        return NextResponse.json(
          { error: "tier is required when not using AI research" },
          { status: 400 }
        );
      }

      fandomData = {
        name,
        slug,
        tier,
        description: description || null,
        fandomGroup: fandomGroup || null,
        demographicTags: demographicTags || [],
      };

      if (platforms && Array.isArray(platforms)) {
        platformsToInsert = platforms
          .filter((p: { platform: string; handle: string }) => p.platform && p.handle?.trim())
          .map((p: { platform: string; handle: string; followers?: number }) => ({
            platform: p.platform,
            handle: p.handle,
            followers: p.followers || 0,
          }));
      }
    }

    // Insert fandom
    const [newFandom] = await db
      .insert(fandoms)
      .values(fandomData)
      .returning();

    // Insert platform entries
    const validPlatforms = VALID_PLATFORMS;
    const insertedPlatforms: Array<{ platform: string; handle: string }> = [];
    for (const p of platformsToInsert) {
      // Validate platform type
      if (!validPlatforms.includes(p.platform as Platform)) {
        continue;
      }
      await db.insert(fandomPlatforms).values({
        fandomId: newFandom.id,
        platform: p.platform as Platform,
        handle: p.handle,
        followers: p.followers,
        url: null,
      });
      insertedPlatforms.push({ platform: p.platform, handle: p.handle });
    }

    // Trigger background scraping if requested and there are platforms to scrape
    if (scrapeImmediately && insertedPlatforms.length > 0) {
      after(async () => {
        console.log(`[Auto Scrape] Starting scrape for newly added fandom: ${newFandom.name}`);
        const results = await scrapeAllPlatformsForFandom(newFandom.id);
        const succeeded = results.filter((r) => r.success).length;
        console.log(
          `[Auto Scrape] Completed ${newFandom.name}: ${succeeded}/${results.length} platforms succeeded`
        );
      });
    }

    return NextResponse.json(
      {
        ...newFandom,
        platforms: insertedPlatforms,
        aiResearched: useAIResearch === true,
        scrapeStarted: scrapeImmediately && insertedPlatforms.length > 0,
      },
      { status: 201 }
    );
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
