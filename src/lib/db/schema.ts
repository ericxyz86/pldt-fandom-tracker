import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  decimal,
  date,
  pgEnum,
} from "drizzle-orm/pg-core";

export const fandomTierEnum = pgEnum("fandom_tier", [
  "emerging",
  "trending",
  "existing",
]);

export const platformEnum = pgEnum("platform", [
  "instagram",
  "tiktok",
  "facebook",
  "youtube",
  "twitter",
  "reddit",
]);

export const contentTypeEnum = pgEnum("content_type", [
  "post",
  "video",
  "reel",
  "tweet",
  "thread",
]);

export const scrapeStatusEnum = pgEnum("scrape_status", [
  "pending",
  "running",
  "succeeded",
  "failed",
]);

export const fandoms = pgTable("fandoms", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").unique().notNull(),
  tier: fandomTierEnum("tier").notNull(),
  description: text("description"),
  imageUrl: text("image_url"),
  fandomGroup: text("fandom_group"),
  demographicTags: text("demographic_tags").array().notNull().default([]),
  aiKeyBehavior: text("ai_key_behavior"),
  aiEngagementPotential: text("ai_engagement_potential"),
  aiCommunityTone: text("ai_community_tone"),
  aiRationale: text("ai_rationale"),
  aiSuggestedAction: text("ai_suggested_action"),
  aiGeneratedAt: timestamp("ai_generated_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const fandomPlatforms = pgTable("fandom_platforms", {
  id: uuid("id").defaultRandom().primaryKey(),
  fandomId: uuid("fandom_id")
    .references(() => fandoms.id)
    .notNull(),
  platform: platformEnum("platform").notNull(),
  handle: text("handle").notNull(),
  followers: integer("followers").default(0).notNull(),
  url: text("url"),
});

export const metricSnapshots = pgTable("metric_snapshots", {
  id: uuid("id").defaultRandom().primaryKey(),
  fandomId: uuid("fandom_id")
    .references(() => fandoms.id)
    .notNull(),
  platform: platformEnum("platform").notNull(),
  date: date("date").notNull(),
  followers: integer("followers").default(0).notNull(),
  postsCount: integer("posts_count").default(0).notNull(),
  engagementTotal: integer("engagement_total").default(0).notNull(),
  engagementRate: decimal("engagement_rate", {
    precision: 12,
    scale: 4,
  })
    .default("0")
    .notNull(),
  growthRate: decimal("growth_rate", { precision: 12, scale: 4 })
    .default("0")
    .notNull(),
  avgLikes: integer("avg_likes").default(0).notNull(),
  avgComments: integer("avg_comments").default(0).notNull(),
  avgShares: integer("avg_shares").default(0).notNull(),
});

export const contentItems = pgTable("content_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  fandomId: uuid("fandom_id")
    .references(() => fandoms.id)
    .notNull(),
  platform: platformEnum("platform").notNull(),
  externalId: text("external_id").notNull(),
  contentType: contentTypeEnum("content_type").notNull(),
  text: text("text"),
  url: text("url"),
  likes: integer("likes").default(0).notNull(),
  comments: integer("comments").default(0).notNull(),
  shares: integer("shares").default(0).notNull(),
  views: integer("views").default(0).notNull(),
  publishedAt: timestamp("published_at"),
  scrapedAt: timestamp("scraped_at").defaultNow().notNull(),
  hashtags: text("hashtags").array().default([]).notNull(),
});

export const influencers = pgTable("influencers", {
  id: uuid("id").defaultRandom().primaryKey(),
  fandomId: uuid("fandom_id")
    .references(() => fandoms.id)
    .notNull(),
  platform: platformEnum("platform").notNull(),
  username: text("username").notNull(),
  displayName: text("display_name"),
  followers: integer("followers").default(0).notNull(),
  engagementRate: decimal("engagement_rate", {
    precision: 12,
    scale: 4,
  })
    .default("0")
    .notNull(),
  profileUrl: text("profile_url"),
  avatarUrl: text("avatar_url"),
  bio: text("bio"),
  relevanceScore: decimal("relevance_score", {
    precision: 5,
    scale: 2,
  })
    .default("0")
    .notNull(),
});

export const googleTrends = pgTable("google_trends", {
  id: uuid("id").defaultRandom().primaryKey(),
  fandomId: uuid("fandom_id")
    .references(() => fandoms.id)
    .notNull(),
  keyword: text("keyword").notNull(),
  date: date("date").notNull(),
  interestValue: integer("interest_value").default(0).notNull(),
  region: text("region").default("PH").notNull(),
});

export const aiPageInsights = pgTable("ai_page_insights", {
  id: uuid("id").defaultRandom().primaryKey(),
  page: text("page").notNull().unique(),
  insights: text("insights").notNull(),
  generatedAt: timestamp("generated_at").notNull(),
});

export const discoveryStatusEnum = pgEnum("discovery_status", [
  "discovered",
  "dismissed",
  "tracked",
  "cleared",
]);

export const aiDiscoveredFandoms = pgTable("ai_discovered_fandoms", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").unique().notNull(),
  description: text("description").notNull(),
  fandomGroup: text("fandom_group"),
  suggestedTier: fandomTierEnum("suggested_tier").notNull(),
  sizeScore: integer("size_score").notNull(),
  sustainabilityScore: integer("sustainability_score").notNull(),
  growthScore: integer("growth_score").notNull(),
  overallScore: integer("overall_score").notNull(),
  estimatedSize: text("estimated_size").notNull(),
  sustainabilityRating: text("sustainability_rating").notNull(),
  growthPotential: text("growth_potential").notNull(),
  keyBehavior: text("key_behavior").notNull(),
  engagementPotential: text("engagement_potential").notNull(),
  communityTone: text("community_tone").notNull(),
  rationale: text("rationale").notNull(),
  suggestedPlatforms: text("suggested_platforms").array().notNull(),
  suggestedDemographics: text("suggested_demographics").array().notNull(),
  suggestedHandles: text("suggested_handles").array().notNull(),
  status: discoveryStatusEnum("status").default("discovered").notNull(),
  trackedFandomId: uuid("tracked_fandom_id").references(() => fandoms.id),
  generatedAt: timestamp("generated_at").notNull(),
  dismissedAt: timestamp("dismissed_at"),
});

export const scrapeRuns = pgTable("scrape_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  actorId: text("actor_id").notNull(),
  fandomId: uuid("fandom_id").references(() => fandoms.id),
  platform: platformEnum("platform"),
  status: scrapeStatusEnum("status").default("pending").notNull(),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  finishedAt: timestamp("finished_at"),
  itemsCount: integer("items_count").default(0).notNull(),
  apifyRunId: text("apify_run_id"),
});
