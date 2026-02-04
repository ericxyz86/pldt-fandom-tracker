import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { aiDiscoveredFandoms, fandoms, fandomPlatforms } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import type { Platform } from "@/types/fandom";

export const dynamic = "force-dynamic";

const validPlatforms = new Set(["instagram", "tiktok", "facebook", "youtube", "twitter", "reddit"]);

function parseFollowerCount(str: string): number {
  const match = str.match(/([\d.]+)\s*(M|K)?/i);
  if (!match) return 0;
  const num = parseFloat(match[1]);
  const suffix = (match[2] || "").toUpperCase();
  if (suffix === "M") return Math.round(num * 1_000_000);
  if (suffix === "K") return Math.round(num * 1_000);
  return Math.round(num);
}

function extractPlatformFollowers(estimatedSize: string): Map<string, number> {
  const map = new Map<string, number>();
  // Match patterns like "tiktok: 1.2M" or "instagram: 800K" inside parentheses
  const parenMatch = estimatedSize.match(/\(([^)]+)\)/);
  if (!parenMatch) return map;

  const parts = parenMatch[1].split(",");
  for (const part of parts) {
    const [platform, count] = part.split(":").map((s) => s.trim());
    if (platform && count) {
      map.set(platform.toLowerCase(), parseFollowerCount(count));
    }
  }
  return map;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { action } = body;

    if (!action || !["dismiss", "track"].includes(action)) {
      return NextResponse.json(
        { error: "action must be 'dismiss' or 'track'" },
        { status: 400 }
      );
    }

    // Fetch the discovered fandom
    const rows = await db
      .select()
      .from(aiDiscoveredFandoms)
      .where(eq(aiDiscoveredFandoms.id, id))
      .limit(1);

    if (rows.length === 0) {
      return NextResponse.json(
        { error: "Discovered fandom not found" },
        { status: 404 }
      );
    }

    const discovered = rows[0];

    if (action === "dismiss") {
      await db
        .update(aiDiscoveredFandoms)
        .set({ status: "dismissed", dismissedAt: new Date() })
        .where(eq(aiDiscoveredFandoms.id, id));

      return NextResponse.json({ success: true });
    }

    // action === "track"
    // Check if slug already exists in fandoms
    const existingFandom = await db
      .select({ id: fandoms.id })
      .from(fandoms)
      .where(eq(fandoms.slug, discovered.slug))
      .limit(1);

    if (existingFandom.length > 0) {
      // Already tracked — just update status
      await db
        .update(aiDiscoveredFandoms)
        .set({ status: "tracked", trackedFandomId: existingFandom[0].id })
        .where(eq(aiDiscoveredFandoms.id, id));

      return NextResponse.json({ success: true, fandomId: existingFandom[0].id });
    }

    // Create new fandom from discovered data
    const [newFandom] = await db
      .insert(fandoms)
      .values({
        name: discovered.name,
        slug: discovered.slug,
        tier: discovered.suggestedTier,
        description: discovered.description,
        fandomGroup: discovered.fandomGroup,
        demographicTags: discovered.suggestedDemographics,
        aiKeyBehavior: discovered.keyBehavior,
        aiEngagementPotential: discovered.engagementPotential,
        aiCommunityTone: discovered.communityTone,
        aiRationale: discovered.rationale,
        aiSuggestedAction: discovered.engagementPotential,
        aiGeneratedAt: discovered.generatedAt,
      })
      .returning();

    // Parse suggested handles and create platform entries with estimated followers
    const platformFollowers = extractPlatformFollowers(discovered.estimatedSize);

    for (const handleStr of discovered.suggestedHandles) {
      const colonIdx = handleStr.indexOf(":");
      if (colonIdx === -1) continue;

      const platform = handleStr.slice(0, colonIdx).toLowerCase();
      const handle = handleStr.slice(colonIdx + 1).replace(/^@/, "");

      if (!validPlatforms.has(platform) || !handle) continue;

      const followers = platformFollowers.get(platform) || 0;

      await db.insert(fandomPlatforms).values({
        fandomId: newFandom.id,
        platform: platform as Platform,
        handle,
        followers,
      });
    }

    // Update discovery record
    await db
      .update(aiDiscoveredFandoms)
      .set({ status: "tracked", trackedFandomId: newFandom.id })
      .where(eq(aiDiscoveredFandoms.id, id));

    return NextResponse.json({ success: true, fandomId: newFandom.id }, { status: 201 });
  } catch (error) {
    console.error("Failed to update discovered fandom:", error);
    return NextResponse.json(
      { error: "Failed to update discovered fandom" },
      { status: 500 }
    );
  }
}
