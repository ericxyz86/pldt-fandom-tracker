import { db } from "@/lib/db";
import {
  fandoms,
  fandomPlatforms,
  metricSnapshots,
  contentItems,
  influencers,
} from "@/lib/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import type {
  FandomWithMetrics,
  MetricSnapshot,
  ContentItem,
  Influencer,
  DemographicTag,
  FandomTier,
  Platform,
} from "@/types/fandom";

export async function getAllFandoms(): Promise<FandomWithMetrics[]> {
  const rows = await db.select().from(fandoms).orderBy(fandoms.name);

  const result: FandomWithMetrics[] = [];

  for (const row of rows) {
    const platforms = await db
      .select()
      .from(fandomPlatforms)
      .where(eq(fandomPlatforms.fandomId, row.id));

    const latestMetrics = await db
      .select()
      .from(metricSnapshots)
      .where(eq(metricSnapshots.fandomId, row.id))
      .orderBy(desc(metricSnapshots.date))
      .limit(10);

    const totalFollowers = platforms.reduce((s, p) => s + p.followers, 0);
    const avgEngRate =
      latestMetrics.length > 0
        ? latestMetrics.reduce(
            (s, m) => s + parseFloat(m.engagementRate),
            0
          ) / latestMetrics.length
        : 0;

    result.push({
      id: row.id,
      name: row.name,
      slug: row.slug,
      tier: row.tier as FandomTier,
      description: row.description,
      imageUrl: row.imageUrl,
      fandomGroup: row.fandomGroup,
      demographicTags: (row.demographicTags || []) as DemographicTag[],
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      platforms: platforms.map((p) => ({
        id: p.id,
        fandomId: p.fandomId,
        platform: p.platform as Platform,
        handle: p.handle,
        followers: p.followers,
        url: p.url,
      })),
      totalFollowers,
      avgEngagementRate: parseFloat(avgEngRate.toFixed(2)),
      weeklyGrowthRate: latestMetrics.length > 0 ? parseFloat(latestMetrics[0].growthRate) : 0,
      latestMetrics: latestMetrics.map(mapMetric),
    });
  }

  return result;
}

export async function getFandomBySlug(slug: string) {
  const rows = await db
    .select()
    .from(fandoms)
    .where(eq(fandoms.slug, slug))
    .limit(1);

  if (rows.length === 0) return null;
  const row = rows[0];

  const platforms = await db
    .select()
    .from(fandomPlatforms)
    .where(eq(fandomPlatforms.fandomId, row.id));

  const metrics = await db
    .select()
    .from(metricSnapshots)
    .where(eq(metricSnapshots.fandomId, row.id))
    .orderBy(desc(metricSnapshots.date));

  const content = await db
    .select()
    .from(contentItems)
    .where(eq(contentItems.fandomId, row.id))
    .orderBy(desc(contentItems.likes))
    .limit(20);

  const infs = await db
    .select()
    .from(influencers)
    .where(eq(influencers.fandomId, row.id))
    .orderBy(desc(influencers.relevanceScore));

  const totalFollowers = platforms.reduce((s, p) => s + p.followers, 0);
  const avgEngRate =
    metrics.length > 0
      ? metrics.reduce((s, m) => s + parseFloat(m.engagementRate), 0) /
        metrics.length
      : 0;

  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    tier: row.tier as FandomTier,
    description: row.description,
    imageUrl: row.imageUrl,
    fandomGroup: row.fandomGroup,
    demographicTags: (row.demographicTags || []) as DemographicTag[],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    platforms: platforms.map((p) => ({
      id: p.id,
      fandomId: p.fandomId,
      platform: p.platform as Platform,
      handle: p.handle,
      followers: p.followers,
      url: p.url,
    })),
    totalFollowers,
    avgEngagementRate: parseFloat(avgEngRate.toFixed(2)),
    weeklyGrowthRate: metrics.length > 0 ? parseFloat(metrics[0].growthRate) : 0,
    latestMetrics: metrics.map(mapMetric),
    content: content.map(mapContent),
    influencers: infs.map(mapInfluencer),
  };
}

function mapMetric(m: typeof metricSnapshots.$inferSelect): MetricSnapshot {
  return {
    id: m.id,
    fandomId: m.fandomId,
    platform: m.platform as Platform,
    date: m.date,
    followers: m.followers,
    postsCount: m.postsCount,
    engagementTotal: m.engagementTotal,
    engagementRate: parseFloat(m.engagementRate),
    growthRate: parseFloat(m.growthRate),
    avgLikes: m.avgLikes,
    avgComments: m.avgComments,
    avgShares: m.avgShares,
  };
}

function mapContent(c: typeof contentItems.$inferSelect): ContentItem {
  return {
    id: c.id,
    fandomId: c.fandomId,
    platform: c.platform as Platform,
    externalId: c.externalId,
    contentType: c.contentType as ContentItem["contentType"],
    text: c.text,
    url: c.url,
    likes: c.likes,
    comments: c.comments,
    shares: c.shares,
    views: c.views,
    publishedAt: c.publishedAt,
    scrapedAt: c.scrapedAt,
    hashtags: c.hashtags || [],
  };
}

function mapInfluencer(i: typeof influencers.$inferSelect): Influencer {
  return {
    id: i.id,
    fandomId: i.fandomId,
    platform: i.platform as Platform,
    username: i.username,
    displayName: i.displayName,
    followers: i.followers,
    engagementRate: parseFloat(i.engagementRate),
    profileUrl: i.profileUrl,
    avatarUrl: i.avatarUrl,
    bio: i.bio,
    relevanceScore: parseFloat(i.relevanceScore),
  };
}
