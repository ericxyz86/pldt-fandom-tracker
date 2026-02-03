import { db } from "@/lib/db";
import { fandoms, contentItems } from "@/lib/db/schema";
import { desc, sql } from "drizzle-orm";
import type { FandomDiscovery, Platform } from "@/types/fandom";

// Known Philippine entertainment keywords that indicate a fandom
const PH_FANDOM_INDICATORS = [
  // P-Pop groups
  "ppop", "p-pop", "opm",
  // Common fandom suffixes
  "nation", "army", "blooms", "atin", "fans", "stans",
  // Philippine entertainment
  "abs-cbn", "gma", "star magic", "viva", "cornerstone",
  // Platforms/shows
  "idol philippines", "the voice ph", "pinoy big brother",
];

// Words to exclude from fandom detection (too generic)
const EXCLUDE_WORDS = new Set([
  "fyp", "foryou", "foryoupage", "viral", "trending", "philippines",
  "pinoy", "filipino", "pilipinas", "manila", "cebu", "davao",
  "love", "like", "follow", "share", "comment", "subscribe",
  "reels", "shorts", "tiktok", "instagram", "facebook", "youtube",
  "music", "dance", "kpop", "cpop", "jpop", "concert", "live",
  "2024", "2025", "2026", "new", "latest", "update", "news",
]);

/**
 * Analyzes scraped content to discover frequently mentioned but untracked fandoms.
 * Examines hashtags, mentions, and text content for patterns that suggest
 * new fandom communities worth tracking.
 */
export async function discoverFandoms(): Promise<FandomDiscovery[]> {
  // Get all currently tracked fandom names/slugs for exclusion
  const trackedFandoms = await db.select({
    name: fandoms.name,
    slug: fandoms.slug,
  }).from(fandoms);

  const trackedNames = new Set(
    trackedFandoms.flatMap((f) => [
      f.name.toLowerCase(),
      f.slug.toLowerCase(),
      // Also exclude individual words from fandom names
      ...f.name.toLowerCase().split(/\s+/),
    ])
  );

  // Get recent content items with hashtags
  const recentContent = await db
    .select({
      hashtags: contentItems.hashtags,
      text: contentItems.text,
      platform: contentItems.platform,
      likes: contentItems.likes,
      views: contentItems.views,
      comments: contentItems.comments,
      shares: contentItems.shares,
    })
    .from(contentItems)
    .orderBy(desc(contentItems.scrapedAt))
    .limit(1000);

  // Count hashtag occurrences and track engagement
  const hashtagStats = new Map<
    string,
    {
      count: number;
      totalEngagement: number;
      platforms: Set<Platform>;
      samples: string[];
    }
  >();

  for (const item of recentContent) {
    const tags = item.hashtags ?? [];
    const engagement =
      (item.likes ?? 0) +
      (item.comments ?? 0) +
      (item.shares ?? 0) +
      (item.views ?? 0);

    for (const rawTag of tags) {
      const tag = rawTag.toLowerCase().replace(/^#/, "").trim();
      if (!tag || tag.length < 3 || tag.length > 40) continue;
      if (EXCLUDE_WORDS.has(tag)) continue;
      if (trackedNames.has(tag)) continue;

      // Check if tag contains a tracked fandom name
      const isTracked = trackedFandoms.some(
        (f) =>
          tag.includes(f.slug.toLowerCase()) ||
          tag.includes(f.name.toLowerCase().replace(/\s+/g, ""))
      );
      if (isTracked) continue;

      const existing = hashtagStats.get(tag) || {
        count: 0,
        totalEngagement: 0,
        platforms: new Set<Platform>(),
        samples: [],
      };

      existing.count++;
      existing.totalEngagement += engagement;
      existing.platforms.add(item.platform as Platform);
      if (existing.samples.length < 3 && item.text) {
        existing.samples.push(
          item.text.length > 120 ? item.text.slice(0, 120) + "..." : item.text
        );
      }

      hashtagStats.set(tag, existing);
    }

    // Also check text for @mentions that could be fandom accounts
    if (item.text) {
      const mentions = item.text.match(/@(\w{3,30})/g) || [];
      for (const rawMention of mentions) {
        const mention = rawMention.slice(1).toLowerCase();
        if (EXCLUDE_WORDS.has(mention)) continue;
        if (trackedNames.has(mention)) continue;

        const isTracked = trackedFandoms.some(
          (f) =>
            mention.includes(f.slug.toLowerCase()) ||
            f.slug.toLowerCase().includes(mention)
        );
        if (isTracked) continue;

        const existing = hashtagStats.get(`@${mention}`) || {
          count: 0,
          totalEngagement: 0,
          platforms: new Set<Platform>(),
          samples: [],
        };

        existing.count++;
        existing.totalEngagement += engagement;
        existing.platforms.add(item.platform as Platform);
        if (existing.samples.length < 3) {
          existing.samples.push(
            item.text.length > 120
              ? item.text.slice(0, 120) + "..."
              : item.text
          );
        }

        hashtagStats.set(`@${mention}`, existing);
      }
    }
  }

  // Filter to significant discoveries (appeared 3+ times)
  const discoveries: FandomDiscovery[] = [];

  for (const [tag, stats] of hashtagStats) {
    if (stats.count < 3) continue;

    // Calculate confidence based on frequency, engagement, and multi-platform presence
    const frequencyScore = Math.min(stats.count / 10, 1) * 40;
    const engagementScore =
      Math.min(stats.totalEngagement / 100000, 1) * 30;
    const platformScore = Math.min(stats.platforms.size / 3, 1) * 20;
    const indicatorBonus = PH_FANDOM_INDICATORS.some((ind) =>
      tag.includes(ind)
    )
      ? 10
      : 0;
    const confidence = Math.round(
      frequencyScore + engagementScore + platformScore + indicatorBonus
    );

    if (confidence < 15) continue;

    // Determine suggested tier based on engagement
    const avgEngagement = stats.totalEngagement / stats.count;
    const suggestedTier =
      avgEngagement > 50000
        ? "trending"
        : avgEngagement > 10000
          ? "emerging"
          : "emerging";

    // Determine group from tag patterns
    let suggestedGroup = "Unknown";
    if (
      tag.includes("pop") ||
      tag.includes("idol") ||
      tag.includes("sb19") ||
      tag.includes("bini")
    ) {
      suggestedGroup = "P-Pop";
    } else if (
      tag.includes("kpop") ||
      tag.includes("korean") ||
      tag.includes("bts") ||
      tag.includes("blackpink")
    ) {
      suggestedGroup = "K-Pop";
    } else if (
      tag.includes("drag") ||
      tag.includes("pageant") ||
      tag.includes("queen")
    ) {
      suggestedGroup = "Reality TV";
    } else if (
      tag.includes("aldub") ||
      tag.includes("abs") ||
      tag.includes("gma")
    ) {
      suggestedGroup = "TV Fandoms";
    }

    const primaryPlatform = [...stats.platforms][0] || "tiktok";

    discoveries.push({
      name: tag.startsWith("@") ? tag.slice(1) : tag,
      source: tag.startsWith("@") ? "mention" : "hashtag",
      platform: primaryPlatform,
      occurrences: stats.count,
      sampleContent: stats.samples,
      estimatedReach: stats.totalEngagement,
      suggestedTier,
      suggestedGroup,
      confidence,
    });
  }

  // Sort by confidence descending
  discoveries.sort((a, b) => b.confidence - a.confidence);

  // Return top 20
  return discoveries.slice(0, 20);
}

/**
 * Called during ingest to check if scraped data contains references
 * to entities that aren't currently tracked. Returns discovery
 * candidates found within a single scrape batch.
 */
export async function analyzeScrapeBatch(
  items: Array<{ hashtags?: string[]; text?: string }>,
  platform: Platform
): Promise<Array<{ tag: string; count: number }>> {
  const trackedFandoms = await db
    .select({ name: fandoms.name, slug: fandoms.slug })
    .from(fandoms);

  const trackedNames = new Set(
    trackedFandoms.flatMap((f) => [
      f.name.toLowerCase(),
      f.slug.toLowerCase(),
      ...f.name.toLowerCase().split(/\s+/),
    ])
  );

  const tagCounts = new Map<string, number>();

  for (const item of items) {
    const tags = item.hashtags ?? [];
    for (const rawTag of tags) {
      const tag = rawTag.toLowerCase().replace(/^#/, "").trim();
      if (!tag || tag.length < 3 || EXCLUDE_WORDS.has(tag)) continue;
      if (trackedNames.has(tag)) continue;

      const isTracked = trackedFandoms.some(
        (f) =>
          tag.includes(f.slug.toLowerCase()) ||
          tag.includes(f.name.toLowerCase().replace(/\s+/g, ""))
      );
      if (isTracked) continue;

      tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
    }
  }

  return [...tagCounts.entries()]
    .filter(([, count]) => count >= 3)
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}
