import type {
  FandomWithMetrics,
  MetricSnapshot,
  ContentItem,
  Influencer,
  GoogleTrend,
  Recommendation,
} from "@/types/fandom";
import { seedFandoms } from "./seed";

function generateId(): string {
  return Math.random().toString(36).substring(2, 15);
}

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

const now = new Date();

export function getMockFandoms(): FandomWithMetrics[] {
  return seedFandoms.map((sf) => {
    const totalFollowers = sf.platforms.reduce(
      () => randomBetween(50000, 5000000),
      0
    );
    const engRate = parseFloat((Math.random() * 8 + 1).toFixed(2));
    const growthRate = parseFloat(
      (Math.random() * (sf.tier === "emerging" ? 25 : 10) - 2).toFixed(2)
    );

    return {
      id: generateId(),
      name: sf.name,
      slug: sf.slug,
      tier: sf.tier,
      description: sf.description,
      imageUrl: null,
      fandomGroup: sf.fandomGroup,
      demographicTags: sf.demographicTags,
      createdAt: new Date("2025-01-01"),
      updatedAt: now,
      platforms: sf.platforms.map((p) => ({
        id: generateId(),
        fandomId: "",
        platform: p.platform,
        handle: p.handle,
        followers: randomBetween(10000, 3000000),
        url: p.url,
      })),
      totalFollowers,
      avgEngagementRate: engRate,
      weeklyGrowthRate: growthRate,
      latestMetrics: [],
    };
  });
}

export function getMockMetricHistory(
  fandomId: string,
  days: number = 30
): MetricSnapshot[] {
  const metrics: MetricSnapshot[] = [];
  let baseFollowers = randomBetween(100000, 2000000);
  const platforms = ["instagram", "tiktok", "twitter"] as const;

  for (let i = days; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);

    for (const platform of platforms) {
      baseFollowers += randomBetween(-500, 2000);
      const likes = randomBetween(5000, 50000);
      const comments = randomBetween(200, 5000);
      const shares = randomBetween(100, 3000);

      metrics.push({
        id: generateId(),
        fandomId,
        platform,
        date: date.toISOString().split("T")[0],
        followers: baseFollowers,
        postsCount: randomBetween(5, 30),
        engagementTotal: likes + comments + shares,
        engagementRate: parseFloat(
          (((likes + comments + shares) / baseFollowers) * 100).toFixed(2)
        ),
        growthRate: parseFloat((Math.random() * 5 - 1).toFixed(2)),
        avgLikes: likes,
        avgComments: comments,
        avgShares: shares,
      });
    }
  }
  return metrics;
}

export function getMockContent(fandomId: string): ContentItem[] {
  const types = ["post", "video", "reel", "tweet"] as const;
  const platforms = ["instagram", "tiktok", "twitter", "youtube"] as const;
  const sampleHashtags = [
    "BINI",
    "SB19",
    "PPop",
    "BTS",
    "NewJeans",
    "KAIA",
    "Pinoy",
    "PLDTHome",
    "FanMeet",
    "Concert",
  ];

  return Array.from({ length: 20 }, () => {
    const pub = new Date(now);
    pub.setDate(pub.getDate() - randomBetween(0, 14));
    return {
      id: generateId(),
      fandomId,
      platform: platforms[randomBetween(0, platforms.length - 1)],
      externalId: generateId(),
      contentType: types[randomBetween(0, types.length - 1)],
      text: "Sample fandom content post with engagement...",
      url: "https://example.com/post",
      likes: randomBetween(1000, 100000),
      comments: randomBetween(50, 5000),
      shares: randomBetween(20, 3000),
      views: randomBetween(5000, 500000),
      publishedAt: pub,
      scrapedAt: now,
      hashtags: sampleHashtags.slice(0, randomBetween(2, 5)),
    };
  });
}

export function getMockInfluencers(fandomId: string): Influencer[] {
  const names = [
    "fan_account_ph",
    "ppop_daily",
    "kpop_manila",
    "fandom_updates",
    "idol_clips_ph",
    "music_stan_ph",
    "concert_vibes",
    "fan_edits_ph",
  ];
  const platforms = ["instagram", "tiktok", "twitter", "youtube"] as const;

  return names.map((name) => ({
    id: generateId(),
    fandomId,
    platform: platforms[randomBetween(0, platforms.length - 1)],
    username: name,
    displayName: name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    followers: randomBetween(5000, 500000),
    engagementRate: parseFloat((Math.random() * 10 + 1).toFixed(2)),
    profileUrl: `https://example.com/${name}`,
    avatarUrl: null,
    bio: "Fan account dedicated to sharing updates and content",
    relevanceScore: parseFloat((Math.random() * 0.5 + 0.5).toFixed(2)),
  }));
}

export function getMockTrends(fandomId: string): GoogleTrend[] {
  const trends: GoogleTrend[] = [];
  for (let i = 90; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    trends.push({
      id: generateId(),
      fandomId,
      keyword: "fandom",
      date: date.toISOString().split("T")[0],
      interestValue: randomBetween(10, 100),
      region: "PH",
    });
  }
  return trends;
}

export function getMockRecommendations(): Recommendation[] {
  const fandoms = getMockFandoms();
  return fandoms
    .filter((f) => f.weeklyGrowthRate > 3)
    .map((f) => ({
      id: generateId(),
      fandomId: f.id,
      fandomName: f.name,
      tier: f.tier,
      segment: f.demographicTags.includes("abc")
        ? ("postpaid" as const)
        : ("prepaid" as const),
      score: parseFloat((Math.random() * 40 + 60).toFixed(1)),
      rationale: `${f.name} shows ${f.weeklyGrowthRate.toFixed(1)}% weekly growth with strong engagement, making it ideal for ${f.demographicTags.includes("abc") ? "postpaid" : "prepaid"} campaigns targeting ${f.demographicTags.includes("gen_z") ? "Gen Z" : "Gen Y"}.`,
      suggestedPlatform: f.platforms[0]?.platform || "tiktok",
      suggestedAction: `Partner with micro-influencers in the ${f.name} community for content collaborations and branded challenges.`,
      estimatedReach: randomBetween(100000, 5000000),
      demographicTags: f.demographicTags,
    }));
}
