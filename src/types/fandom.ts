export type FandomTier = "emerging" | "trending" | "existing";

export type Platform =
  | "instagram"
  | "tiktok"
  | "facebook"
  | "youtube"
  | "twitter"
  | "reddit";

export type ContentType = "post" | "video" | "reel" | "tweet" | "thread";

export type DemographicTag = "gen_y" | "gen_z" | "abc" | "cde";

export type MarketSegment = "postpaid" | "prepaid" | "all";

export interface Fandom {
  id: string;
  name: string;
  slug: string;
  tier: FandomTier;
  description: string | null;
  imageUrl: string | null;
  fandomGroup: string | null;
  demographicTags: DemographicTag[];
  createdAt: Date;
  updatedAt: Date;
}

export interface FandomPlatform {
  id: string;
  fandomId: string;
  platform: Platform;
  handle: string;
  followers: number;
  url: string | null;
}

export interface MetricSnapshot {
  id: string;
  fandomId: string;
  platform: Platform;
  date: string;
  followers: number;
  postsCount: number;
  engagementTotal: number;
  engagementRate: number;
  growthRate: number;
  avgLikes: number;
  avgComments: number;
  avgShares: number;
}

export interface ContentItem {
  id: string;
  fandomId: string;
  platform: Platform;
  externalId: string;
  contentType: ContentType;
  text: string | null;
  url: string | null;
  likes: number;
  comments: number;
  shares: number;
  views: number;
  publishedAt: Date | null;
  scrapedAt: Date;
  hashtags: string[];
}

export interface Influencer {
  id: string;
  fandomId: string;
  platform: Platform;
  username: string;
  displayName: string | null;
  followers: number;
  engagementRate: number;
  profileUrl: string | null;
  avatarUrl: string | null;
  bio: string | null;
  relevanceScore: number;
}

export interface GoogleTrend {
  id: string;
  fandomId: string;
  keyword: string;
  date: string;
  interestValue: number;
  region: string;
}

export interface FandomWithMetrics extends Fandom {
  platforms: FandomPlatform[];
  totalFollowers: number;
  avgEngagementRate: number;
  weeklyGrowthRate: number;
  latestMetrics: MetricSnapshot[];
}

export interface Recommendation {
  id: string;
  fandomId: string;
  fandomName: string;
  tier: FandomTier;
  segment: MarketSegment;
  score: number;
  rationale: string;
  suggestedPlatform: Platform;
  suggestedAction: string;
  estimatedReach: number;
  demographicTags: DemographicTag[];
}
