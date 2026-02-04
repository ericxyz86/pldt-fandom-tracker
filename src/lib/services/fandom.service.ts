import { db } from "@/lib/db";
import {
  fandoms,
  fandomPlatforms,
  metricSnapshots,
  contentItems,
  influencers,
  googleTrends,
  scrapeRuns,
} from "@/lib/db/schema";
import { eq, desc, sql, gte, lte, and } from "drizzle-orm";
import type {
  FandomWithMetrics,
  MetricSnapshot,
  ContentItem,
  ContentInsight,
  Influencer,
  Recommendation,
  DemographicTag,
  FandomTier,
  Platform,
} from "@/types/fandom";

export async function getAllFandoms(dateFrom?: string, dateTo?: string): Promise<FandomWithMetrics[]> {
  // Build date filter conditions for metrics
  const metricsConditions = [];
  if (dateFrom) metricsConditions.push(gte(metricSnapshots.date, dateFrom));
  if (dateTo) metricsConditions.push(lte(metricSnapshots.date, dateTo));
  const metricsWhere = metricsConditions.length > 0 ? and(...metricsConditions) : undefined;

  // Batch all queries in parallel instead of N+1
  const [rows, allPlatforms, allMetrics, engagementStats, scrapeCounts] = await Promise.all([
    db.select().from(fandoms).orderBy(fandoms.name),
    db.select().from(fandomPlatforms),
    metricsWhere
      ? db.select().from(metricSnapshots).where(metricsWhere).orderBy(desc(metricSnapshots.date))
      : db.select().from(metricSnapshots).orderBy(desc(metricSnapshots.date)),
    db
      .select({
        fandomId: contentItems.fandomId,
        totalViews: sql<number>`coalesce(sum(${contentItems.views}), 0)`,
        totalEngagement: sql<number>`coalesce(sum(${contentItems.likes} + ${contentItems.comments} + ${contentItems.shares}), 0)`,
      })
      .from(contentItems)
      .groupBy(contentItems.fandomId),
    db
      .select({
        fandomId: scrapeRuns.fandomId,
        count: sql<number>`count(*)`,
      })
      .from(scrapeRuns)
      .where(eq(scrapeRuns.status, "succeeded"))
      .groupBy(scrapeRuns.fandomId),
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
    list.push(m);
    metricsByFandom.set(m.fandomId, list);
  }

  const engByFandom = new Map<string, { totalViews: number; totalEngagement: number }>();
  for (const e of engagementStats) {
    engByFandom.set(e.fandomId, {
      totalViews: Number(e.totalViews),
      totalEngagement: Number(e.totalEngagement),
    });
  }

  const scrapeByFandom = new Set<string>();
  for (const s of scrapeCounts) {
    if (s.fandomId && Number(s.count) > 0) {
      scrapeByFandom.add(s.fandomId);
    }
  }

  return rows.map((row) => {
    const platforms = platformsByFandom.get(row.id) || [];
    const latestMetrics = metricsByFandom.get(row.id) || [];
    const eng = engByFandom.get(row.id) || { totalViews: 0, totalEngagement: 0 };
    const totalFollowers = platforms.reduce((s, p) => s + p.followers, 0);
    const engRate =
      eng.totalViews > 0 ? (eng.totalEngagement / eng.totalViews) * 100 : 0;

    // Consider scraped if we have scrape runs, content items, or metric snapshots
    const hasBeenScraped =
      scrapeByFandom.has(row.id) ||
      engByFandom.has(row.id) ||
      latestMetrics.length > 0;

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
      aiKeyBehavior: row.aiKeyBehavior,
      aiEngagementPotential: row.aiEngagementPotential,
      aiCommunityTone: row.aiCommunityTone,
      aiRationale: row.aiRationale,
      aiSuggestedAction: row.aiSuggestedAction,
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
      hasBeenScraped,
    };
  });
}

export async function getFandomBySlug(slug: string, dateFrom?: string, dateTo?: string) {
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

  const metricsConditions = [eq(metricSnapshots.fandomId, row.id)];
  if (dateFrom) metricsConditions.push(gte(metricSnapshots.date, dateFrom));
  if (dateTo) metricsConditions.push(lte(metricSnapshots.date, dateTo));

  const metrics = await db
    .select()
    .from(metricSnapshots)
    .where(and(...metricsConditions))
    .orderBy(desc(metricSnapshots.date));

  const content = await db
    .select()
    .from(contentItems)
    .where(eq(contentItems.fandomId, row.id))
    .orderBy(desc(contentItems.likes))
    .limit(20);

  const infsByEngagement = await db
    .select()
    .from(influencers)
    .where(eq(influencers.fandomId, row.id))
    .orderBy(desc(influencers.engagementRate))
    .limit(12);

  const infsByFollowers = await db
    .select()
    .from(influencers)
    .where(eq(influencers.fandomId, row.id))
    .orderBy(desc(influencers.followers))
    .limit(12);

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
    aiKeyBehavior: row.aiKeyBehavior,
    aiEngagementPotential: row.aiEngagementPotential,
    aiCommunityTone: row.aiCommunityTone,
    aiRationale: row.aiRationale,
    aiSuggestedAction: row.aiSuggestedAction,
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
    hasBeenScraped: content.length > 0 || metrics.length > 0,
    content: content.map(mapContent),
    influencersByEngagement: infsByEngagement.map(mapInfluencer),
    influencersByFollowers: infsByFollowers.map(mapInfluencer),
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
  // Fetch fandoms, content counts, and all content for insight analysis
  const [allFandoms, contentCounts, allContentRows] = await Promise.all([
    getAllFandoms(),
    db
      .select({
        fandomId: contentItems.fandomId,
        count: sql<number>`count(*)`,
      })
      .from(contentItems)
      .groupBy(contentItems.fandomId),
    db
      .select({
        fandomId: contentItems.fandomId,
        contentType: contentItems.contentType,
        text: contentItems.text,
        likes: contentItems.likes,
        comments: contentItems.comments,
        shares: contentItems.shares,
        views: contentItems.views,
        hashtags: contentItems.hashtags,
      })
      .from(contentItems),
  ]);

  const countMap = new Map(
    contentCounts.map((c) => [c.fandomId, Number(c.count)])
  );

  // Group content by fandom for insight generation
  const contentByFandom = new Map<string, typeof allContentRows>();
  for (const row of allContentRows) {
    const list = contentByFandom.get(row.fandomId) || [];
    list.push(row);
    contentByFandom.set(row.fandomId, list);
  }

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

    const fandomContent = contentByFandom.get(f.id) || [];
    const contentInsight = analyzeContentInsight(fandomContent, f.avgEngagementRate);

    // Use AI-generated fields when available, fall back to rule-based
    const finalRationale = f.aiRationale || rationale;
    const finalAction = f.aiSuggestedAction || action;
    if (f.aiCommunityTone) {
      contentInsight.tone = f.aiCommunityTone;
    }

    return {
      id: f.id,
      fandomId: f.id,
      fandomName: f.name,
      tier: f.tier,
      segment,
      score,
      rationale: finalRationale,
      suggestedPlatform: (bestPlatform?.platform || "tiktok") as Platform,
      suggestedAction: finalAction,
      estimatedReach: f.totalFollowers,
      demographicTags: f.demographicTags,
      contentInsight,
      hasBeenScraped: f.hasBeenScraped,
    };
  });

  return recommendations.sort((a, b) => b.score - a.score);
}

function analyzeContentInsight(
  content: { contentType: string; text: string | null; likes: number; comments: number; shares: number; views: number; hashtags: string[] | null }[],
  engagementRate: number,
): ContentInsight {
  if (content.length === 0) {
    return {
      topContentType: "unknown",
      contentBreakdown: [],
      tone: "Insufficient data to determine tone.",
      fanBehavior: "No content data available yet.",
      topHashtags: [],
    };
  }

  // Content type breakdown
  const typeCounts: Record<string, number> = {};
  for (const c of content) {
    typeCounts[c.contentType] = (typeCounts[c.contentType] || 0) + 1;
  }
  const contentBreakdown = Object.entries(typeCounts)
    .map(([type, count]) => ({
      type,
      count,
      percentage: Math.round((count / content.length) * 100),
    }))
    .sort((a, b) => b.count - a.count);
  const topContentType = contentBreakdown[0]?.type || "unknown";

  // Top hashtags
  const hashtagCounts: Record<string, number> = {};
  for (const c of content) {
    for (const h of c.hashtags || []) {
      hashtagCounts[h] = (hashtagCounts[h] || 0) + 1;
    }
  }
  const topHashtags = Object.entries(hashtagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([tag]) => tag);

  // Tone analysis based on content signals
  const totalLikes = content.reduce((s, c) => s + c.likes, 0);
  const totalComments = content.reduce((s, c) => s + c.comments, 0);
  const totalShares = content.reduce((s, c) => s + c.shares, 0);
  const totalViews = content.reduce((s, c) => s + c.views, 0);
  const commentRatio = totalViews > 0 ? totalComments / totalViews : 0;
  const shareRatio = totalViews > 0 ? totalShares / totalViews : 0;
  const likeRatio = totalViews > 0 ? totalLikes / totalViews : 0;

  // Analyze text for tone signals
  const allText = content
    .map((c) => c.text || "")
    .join(" ")
    .toLowerCase();

  const hasFanLove = /love|proud|stan|slay|queen|king|idol|bias|ult|fave|bestie/i.test(allText);
  const hasHype = /omg|grabe|laban|trending|viral|lit|fire|iconic|era/i.test(allText);
  const hasAdvocacy = /support|vote|stream|milestone|record|chart|project|fund/i.test(allText);
  const hasHumor = /lol|haha|charot|joke|funny|meme|kaloka|naur/i.test(allText);
  const hasFilipino = /grabe|sana all|ang ganda|galing|proud pinoy|pinoy pride|laban|galing/i.test(allText);

  const toneTraits: string[] = [];
  if (hasFanLove) toneTraits.push("passionate and affectionate");
  if (hasHype) toneTraits.push("hype-driven and energetic");
  if (hasAdvocacy) toneTraits.push("goal-oriented and organized");
  if (hasHumor) toneTraits.push("humorous and casual");
  if (hasFilipino) toneTraits.push("proudly Filipino");

  let tone: string;
  if (toneTraits.length > 0) {
    tone = `Community tone is ${toneTraits.join(", ")}. Best approached with content that matches this energy.`;
  } else if (engagementRate > 10) {
    tone = "Highly reactive community that engages deeply with content. Authentic, relatable messaging works best.";
  } else {
    tone = "Community engages at a moderate level. Clear, direct messaging with strong visuals recommended.";
  }

  // Fan behavior analysis
  const isVideoHeavy = (typeCounts["video"] || 0) + (typeCounts["reel"] || 0) > content.length * 0.6;
  const isHighComment = commentRatio > 0.02;
  const isHighShare = shareRatio > 0.01;
  const isHighLike = likeRatio > 0.05;

  const behaviors: string[] = [];
  if (isVideoHeavy) behaviors.push("Fans prefer short-form video content (reels/TikToks)");
  else if ((typeCounts["post"] || 0) > content.length * 0.5) behaviors.push("Fans engage primarily with image posts and carousels");
  else if ((typeCounts["tweet"] || 0) > content.length * 0.5) behaviors.push("Fans are highly active in text-based discussions and threads");

  if (isHighComment) behaviors.push("strong commenter culture — fans actively discuss and reply");
  if (isHighShare) behaviors.push("high sharing tendency — fans amplify content organically");
  if (isHighLike) behaviors.push("strong passive engagement through likes");
  if (hasAdvocacy) behaviors.push("organized fan projects (streaming, voting, charting)");
  if (hasHype) behaviors.push("trend-driven — fans rally around viral moments");

  const fanBehavior = behaviors.length > 0
    ? behaviors.map((b) => b.charAt(0).toUpperCase() + b.slice(1)).join(". ") + "."
    : "Fan behavior patterns will emerge as more content is collected.";

  return {
    topContentType,
    contentBreakdown,
    tone,
    fanBehavior,
    topHashtags,
  };
}
