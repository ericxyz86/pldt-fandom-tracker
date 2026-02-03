import { db } from "@/lib/db";
import {
  fandoms,
  fandomPlatforms,
  metricSnapshots,
  contentItems,
  influencers,
  googleTrends,
} from "@/lib/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import type {
  FandomWithMetrics,
  MetricSnapshot,
  ContentItem,
  Influencer,
  Recommendation,
  DemographicTag,
  FandomTier,
  Platform,
} from "@/types/fandom";

export async function getAllFandoms(): Promise<FandomWithMetrics[]> {
  // Batch all queries in parallel instead of N+1
  const [rows, allPlatforms, allMetrics, engagementStats] = await Promise.all([
    db.select().from(fandoms).orderBy(fandoms.name),
    db.select().from(fandomPlatforms),
    db
      .select()
      .from(metricSnapshots)
      .orderBy(desc(metricSnapshots.date)),
    db
      .select({
        fandomId: contentItems.fandomId,
        totalViews: sql<number>`coalesce(sum(${contentItems.views}), 0)`,
        totalEngagement: sql<number>`coalesce(sum(${contentItems.likes} + ${contentItems.comments} + ${contentItems.shares}), 0)`,
      })
      .from(contentItems)
      .groupBy(contentItems.fandomId),
  ]);

  // Index by fandomId for O(1) lookups
  const platformsByFandom = new Map<string, typeof allPlatforms>();
  for (const p of allPlatforms) {
    const list = platformsByFandom.get(p.fandomId) || [];
    list.push(p);
    platformsByFandom.set(p.fandomId, list);
  }

  const metricsByFandom = new Map<string, typeof allMetrics>();
  for (const m of allMetrics) {
    const list = metricsByFandom.get(m.fandomId) || [];
    if (list.length < 10) list.push(m);
    metricsByFandom.set(m.fandomId, list);
  }

  const engByFandom = new Map<string, { totalViews: number; totalEngagement: number }>();
  for (const e of engagementStats) {
    engByFandom.set(e.fandomId, {
      totalViews: Number(e.totalViews),
      totalEngagement: Number(e.totalEngagement),
    });
  }

  return rows.map((row) => {
    const platforms = platformsByFandom.get(row.id) || [];
    const latestMetrics = metricsByFandom.get(row.id) || [];
    const eng = engByFandom.get(row.id) || { totalViews: 0, totalEngagement: 0 };
    const totalFollowers = platforms.reduce((s, p) => s + p.followers, 0);
    const engRate =
      eng.totalViews > 0 ? (eng.totalEngagement / eng.totalViews) * 100 : 0;

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
      avgEngagementRate: parseFloat(engRate.toFixed(2)),
      weeklyGrowthRate:
        latestMetrics.length > 0
          ? parseFloat(latestMetrics[0].growthRate)
          : 0,
      latestMetrics: latestMetrics.map(mapMetric),
    };
  });
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

  const totalViews = content.reduce((s, c) => s + c.views, 0);
  const totalEngagement = content.reduce(
    (s, c) => s + c.likes + c.comments + c.shares,
    0
  );
  const engRate =
    totalViews > 0 ? (totalEngagement / totalViews) * 100 : 0;

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
    avgEngagementRate: parseFloat(engRate.toFixed(2)),
    weeklyGrowthRate: metrics.length > 0 ? parseFloat(metrics[0].growthRate) : 0,
    latestMetrics: metrics.map(mapMetric),
    content: content.map(mapContent),
    influencers: infs.map(mapInfluencer),
  };
}

export async function getAllContent() {
  const rows = await db
    .select({
      content: contentItems,
      fandomName: fandoms.name,
    })
    .from(contentItems)
    .innerJoin(fandoms, eq(contentItems.fandomId, fandoms.id))
    .orderBy(desc(contentItems.likes))
    .limit(50);

  return rows.map((r) => ({
    ...mapContent(r.content),
    fandomName: r.fandomName,
  }));
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

export async function getAllInfluencers() {
  const rows = await db
    .select({
      influencer: influencers,
      fandomName: fandoms.name,
      fandomTier: fandoms.tier,
    })
    .from(influencers)
    .innerJoin(fandoms, eq(influencers.fandomId, fandoms.id))
    .orderBy(desc(influencers.relevanceScore))
    .limit(100);

  return rows.map((r) => ({
    ...mapInfluencer(r.influencer),
    fandomName: r.fandomName,
    tier: r.fandomTier as FandomTier,
  }));
}

export async function getAllTrends() {
  const rows = await db
    .select({
      trend: googleTrends,
      fandomName: fandoms.name,
      fandomSlug: fandoms.slug,
    })
    .from(googleTrends)
    .innerJoin(fandoms, eq(googleTrends.fandomId, fandoms.id))
    .orderBy(googleTrends.date);

  return rows.map((r) => ({
    id: r.trend.id,
    fandomId: r.trend.fandomId,
    keyword: r.trend.keyword,
    date: r.trend.date,
    interestValue: r.trend.interestValue,
    region: r.trend.region,
    fandomName: r.fandomName,
    fandomSlug: r.fandomSlug,
  }));
}

export async function getRecommendations(): Promise<Recommendation[]> {
  // Fetch fandoms and content counts in parallel (single batch)
  const [allFandoms, contentCounts] = await Promise.all([
    getAllFandoms(),
    db
      .select({
        fandomId: contentItems.fandomId,
        count: sql<number>`count(*)`,
      })
      .from(contentItems)
      .groupBy(contentItems.fandomId),
  ]);

  const countMap = new Map(
    contentCounts.map((c) => [c.fandomId, Number(c.count)])
  );

  const recommendations: Recommendation[] = allFandoms.map((f) => {
    const segment: "postpaid" | "prepaid" =
      f.demographicTags.includes("abc" as DemographicTag) ? "postpaid" : "prepaid";

    const volume = countMap.get(f.id) || 0;
    const engScore = Math.min(f.avgEngagementRate * 2, 40);
    const growthScore = Math.min(Math.max(f.weeklyGrowthRate * 3, 0), 30);
    const volumeScore = Math.min((volume / 10) * 30, 30);
    const score = Math.round(engScore + growthScore + volumeScore);

    const bestPlatform = f.platforms.length > 0
      ? f.platforms.reduce((a, b) => (a.followers > b.followers ? a : b))
      : null;

    const isHighGrowth = f.weeklyGrowthRate > 2;
    const isHighEngagement = f.avgEngagementRate > 10;

    let rationale = "";
    let action = "";

    if (isHighGrowth && isHighEngagement) {
      rationale = `${f.name} shows strong momentum with ${f.avgEngagementRate.toFixed(1)}% engagement and ${f.weeklyGrowthRate.toFixed(1)}% weekly growth. High ROI potential for ${segment === "postpaid" ? "ABC Postpaid" : "CDE Prepaid"} campaigns.`;
      action = `Launch a branded content partnership on ${bestPlatform?.platform || "tiktok"} with top fan creators. Consider sponsored hashtag challenge.`;
    } else if (isHighGrowth) {
      rationale = `${f.name} is growing rapidly at ${f.weeklyGrowthRate.toFixed(1)}% weekly. Early investment could capture this audience before competitors.`;
      action = `Sponsor emerging content creators in this fandom. Run awareness ads targeting fandom keywords.`;
    } else if (isHighEngagement) {
      rationale = `${f.name} has a highly engaged community at ${f.avgEngagementRate.toFixed(1)}% engagement rate. Strong potential for conversion-focused campaigns.`;
      action = `Create co-branded content with fan accounts. Run engagement-based ad campaigns on ${bestPlatform?.platform || "tiktok"}.`;
    } else {
      rationale = `${f.name} is an established fandom with steady presence. Suitable for brand visibility campaigns targeting ${segment === "postpaid" ? "ABC Postpaid" : "CDE Prepaid"} segment.`;
      action = `Maintain brand presence through periodic sponsored posts. Monitor for trending moments to amplify.`;
    }

    return {
      id: f.id,
      fandomId: f.id,
      fandomName: f.name,
      tier: f.tier,
      segment,
      score,
      rationale,
      suggestedPlatform: (bestPlatform?.platform || "tiktok") as Platform,
      suggestedAction: action,
      estimatedReach: f.totalFollowers,
      demographicTags: f.demographicTags,
    };
  });

  return recommendations.sort((a, b) => b.score - a.score);
}
