import OpenAI from "openai";
import { db } from "@/lib/db";
import { fandoms, fandomPlatforms, contentItems, aiPageInsights, aiDiscoveredFandoms } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { getAllTrends, getAllContent, getAllInfluencers } from "@/lib/services/fandom.service";
import {
  verifyFandomFollowers,
  computeVerificationStatus,
  type EstimatedFollower,
} from "@/lib/apify/verify";

const DELAY_BETWEEN_CALLS_MS = 1500;
const ENABLE_VERIFICATION = process.env.DISCOVERY_VERIFY_FOLLOWERS !== "false";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface FandomContext {
  name: string;
  tier: string;
  fandomGroup: string | null;
  demographicTags: string[];
  platforms: { platform: string; handle: string; followers: number }[];
  avgEngagementRate: number;
  weeklyGrowthRate: number;
  totalFollowers: number;
}

interface ContentSample {
  text: string | null;
  contentType: string;
  likes: number;
  comments: number;
  shares: number;
  views: number;
  hashtags: string[];
}

interface AIInsights {
  keyBehavior: string;
  engagementPotential: string;
  communityTone: string;
  rationale: string;
  suggestedAction: string;
}

function getOpenAIClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({ apiKey });
}

export async function generateFandomInsights(
  fandomId: string
): Promise<{ success: boolean; fandomName: string }> {
  const client = getOpenAIClient();
  if (!client) {
    return { success: false, fandomName: "unknown" };
  }

  // Fetch fandom details
  const fandomRows = await db
    .select()
    .from(fandoms)
    .where(eq(fandoms.id, fandomId))
    .limit(1);

  if (fandomRows.length === 0) {
    return { success: false, fandomName: "unknown" };
  }
  const fandom = fandomRows[0];

  // Fetch platforms
  const platforms = await db
    .select()
    .from(fandomPlatforms)
    .where(eq(fandomPlatforms.fandomId, fandomId));

  const totalFollowers = platforms.reduce((s, p) => s + p.followers, 0);

  // Fetch top 20 content items by likes
  const content = await db
    .select()
    .from(contentItems)
    .where(eq(contentItems.fandomId, fandomId))
    .orderBy(desc(contentItems.likes))
    .limit(20);

  const totalViews = content.reduce((s, c) => s + c.views, 0);
  const totalEngagement = content.reduce(
    (s, c) => s + c.likes + c.comments + c.shares,
    0
  );
  const engRate = totalViews > 0 ? (totalEngagement / totalViews) * 100 : 0;

  const context: FandomContext = {
    name: fandom.name,
    tier: fandom.tier,
    fandomGroup: fandom.fandomGroup,
    demographicTags: fandom.demographicTags || [],
    platforms: platforms.map((p) => ({
      platform: p.platform,
      handle: p.handle,
      followers: p.followers,
    })),
    avgEngagementRate: parseFloat(engRate.toFixed(2)),
    weeklyGrowthRate: 0,
    totalFollowers,
  };

  const contentSamples: ContentSample[] = content.map((c) => ({
    text: c.text ? c.text.slice(0, 200) : null,
    contentType: c.contentType,
    likes: c.likes,
    comments: c.comments,
    shares: c.shares,
    views: c.views,
    hashtags: c.hashtags || [],
  }));

  try {
    const insights = await callOpenAI(client, context, contentSamples);
    if (!insights) {
      return { success: false, fandomName: fandom.name };
    }

    // Save to DB
    await db
      .update(fandoms)
      .set({
        aiKeyBehavior: insights.keyBehavior,
        aiEngagementPotential: insights.engagementPotential,
        aiCommunityTone: insights.communityTone,
        aiRationale: insights.rationale,
        aiSuggestedAction: insights.suggestedAction,
        aiGeneratedAt: new Date(),
      })
      .where(eq(fandoms.id, fandomId));

    console.log(`[AI] Generated insights for ${fandom.name}`);
    return { success: true, fandomName: fandom.name };
  } catch (error) {
    console.error(`[AI] Failed to generate insights for ${fandom.name}:`, error);
    return { success: false, fandomName: fandom.name };
  }
}

export async function generateAllFandomInsights(): Promise<
  { success: boolean; fandomName: string }[]
> {
  const client = getOpenAIClient();
  if (!client) {
    console.log("[AI] OPENAI_API_KEY not configured, skipping AI insights");
    return [];
  }

  const allFandoms = await db.select().from(fandoms);
  const results: { success: boolean; fandomName: string }[] = [];

  for (let i = 0; i < allFandoms.length; i++) {
    const f = allFandoms[i];
    const result = await generateFandomInsights(f.id);
    results.push(result);

    if (i < allFandoms.length - 1) {
      await delay(DELAY_BETWEEN_CALLS_MS);
    }
  }

  const succeeded = results.filter((r) => r.success).length;
  console.log(
    `[AI] Generated insights for ${succeeded}/${results.length} fandoms`
  );

  return results;
}

// --- Page-level insight generators ---

export async function generateTrendsInsights(): Promise<boolean> {
  const client = getOpenAIClient();
  if (!client) return false;

  const trends = await getAllTrends();
  if (trends.length === 0) return false;

  // Summarize trends data for the prompt
  const fandomMap = new Map<string, { name: string; data: { date: string; value: number }[] }>();
  for (const t of trends) {
    if (!fandomMap.has(t.fandomSlug)) {
      fandomMap.set(t.fandomSlug, { name: t.fandomName, data: [] });
    }
    fandomMap.get(t.fandomSlug)!.data.push({ date: t.date, value: t.interestValue });
  }

  const trendSummary = Array.from(fandomMap.entries())
    .map(([_slug, info]) => {
      const latest = info.data.slice(-7);
      const avg = latest.reduce((s, d) => s + d.value, 0) / (latest.length || 1);
      const earliest = info.data.slice(0, 7);
      const earlyAvg = earliest.reduce((s, d) => s + d.value, 0) / (earliest.length || 1);
      return `- ${info.name}: current avg interest ${avg.toFixed(0)}/100, early avg ${earlyAvg.toFixed(0)}/100, ${info.data.length} data points`;
    })
    .join("\n");

  try {
    const response = await client.responses.create({
      model: "gpt-5.2",
      instructions: `You are a social media marketing analyst for PLDT Home in the Philippines. Analyze Google Trends data across multiple fandoms and provide actionable marketing insights. Be specific and reference the data. Keep each field to 2-4 sentences.`,
      input: `Analyze these Google Trends data across Philippine fandoms:\n\n${trendSummary}\n\nReturn a JSON object with these 4 fields:\n- "summary": Overall trend landscape overview\n- "topMover": Which fandom is gaining or losing the most search interest and why\n- "patterns": Any seasonality, correlations, or notable patterns\n- "recommendation": What PLDT Home should act on based on these trends`,
      text: {
        format: {
          type: "json_schema",
          name: "trends_insights",
          strict: true,
          schema: {
            type: "object",
            properties: {
              summary: { type: "string" },
              topMover: { type: "string" },
              patterns: { type: "string" },
              recommendation: { type: "string" },
            },
            required: ["summary", "topMover", "patterns", "recommendation"],
            additionalProperties: false,
          },
        },
      },
    });

    const parsed = JSON.parse(response.output_text);
    await upsertPageInsight("trends", parsed);
    console.log("[AI] Generated trends page insights");
    return true;
  } catch (error) {
    console.error("[AI] Failed to generate trends insights:", error);
    return false;
  }
}

export async function generateContentInsights(): Promise<boolean> {
  const client = getOpenAIClient();
  if (!client) return false;

  const content = await getAllContent();
  if (content.length === 0) return false;

  const contentSummary = content
    .slice(0, 30)
    .map((c, i) => {
      const text = c.text ? `"${c.text.slice(0, 120)}"` : "(no text)";
      const tags = c.hashtags?.length ? ` [${c.hashtags.slice(0, 5).join(", ")}]` : "";
      return `${i + 1}. [${c.platform}/${c.contentType}] ${text}${tags} — ${c.likes} likes, ${c.comments} comments, ${c.shares} shares, ${c.views} views (${c.fandomName})`;
    })
    .join("\n");

  // Platform breakdown
  const platformStats: Record<string, { count: number; totalEng: number }> = {};
  for (const c of content) {
    if (!platformStats[c.platform]) platformStats[c.platform] = { count: 0, totalEng: 0 };
    platformStats[c.platform].count++;
    platformStats[c.platform].totalEng += c.likes + c.comments + c.shares;
  }
  const platformBreakdown = Object.entries(platformStats)
    .map(([p, s]) => `- ${p}: ${s.count} items, ${s.totalEng.toLocaleString()} total engagement`)
    .join("\n");

  try {
    const response = await client.responses.create({
      model: "gpt-5.2",
      instructions: `You are a social media content strategist for PLDT Home in the Philippines. Analyze cross-fandom content performance data and provide actionable content strategy insights. Be specific and reference the data. Keep each field to 2-4 sentences.`,
      input: `Analyze top-performing content across Philippine fandoms:\n\n**Platform Breakdown:**\n${platformBreakdown}\n\n**Top Content Items:**\n${contentSummary}\n\nReturn a JSON object with these 4 fields:\n- "summary": Overall content landscape overview\n- "topPerformingThemes": What content themes and formats work best\n- "platformBreakdown": Which platforms drive the most engagement and why\n- "recommendation": Content strategy advice for PLDT Home`,
      text: {
        format: {
          type: "json_schema",
          name: "content_insights",
          strict: true,
          schema: {
            type: "object",
            properties: {
              summary: { type: "string" },
              topPerformingThemes: { type: "string" },
              platformBreakdown: { type: "string" },
              recommendation: { type: "string" },
            },
            required: ["summary", "topPerformingThemes", "platformBreakdown", "recommendation"],
            additionalProperties: false,
          },
        },
      },
    });

    const parsed = JSON.parse(response.output_text);
    await upsertPageInsight("content", parsed);
    console.log("[AI] Generated content page insights");
    return true;
  } catch (error) {
    console.error("[AI] Failed to generate content insights:", error);
    return false;
  }
}

export async function generateInfluencerInsights(): Promise<boolean> {
  const client = getOpenAIClient();
  if (!client) return false;

  const allInfluencers = await getAllInfluencers();
  if (allInfluencers.length === 0) return false;

  // Tier analysis
  const micro = allInfluencers.filter((i) => i.followers < 100000);
  const macro = allInfluencers.filter((i) => i.followers >= 100000);
  const microAvgEng = micro.length > 0 ? micro.reduce((s, i) => s + i.engagementRate, 0) / micro.length : 0;
  const macroAvgEng = macro.length > 0 ? macro.reduce((s, i) => s + i.engagementRate, 0) / macro.length : 0;

  const influencerSummary = allInfluencers
    .slice(0, 30)
    .map((i, idx) => `${idx + 1}. @${i.username} (${i.platform}) — ${i.followers.toLocaleString()} followers, ${i.engagementRate}% eng, score ${i.relevanceScore}, fandom: ${i.fandomName}`)
    .join("\n");

  try {
    const response = await client.responses.create({
      model: "gpt-5.2",
      instructions: `You are an influencer marketing strategist for PLDT Home in the Philippines. Analyze influencer data across fandoms and provide partnership recommendations. Be specific and reference the data. Keep each field to 2-4 sentences.`,
      input: `Analyze influencer ecosystem across Philippine fandoms:\n\n**Tier Breakdown:**\n- Micro (<100K followers): ${micro.length} influencers, avg engagement ${microAvgEng.toFixed(2)}%\n- Macro (100K+ followers): ${macro.length} influencers, avg engagement ${macroAvgEng.toFixed(2)}%\n\n**Top Influencers by Relevance:**\n${influencerSummary}\n\nReturn a JSON object with these 4 fields:\n- "summary": Overview of the influencer ecosystem\n- "tierAnalysis": Micro vs macro influencer performance comparison\n- "topPartnershipPicks": Best influencers for PLDT Home brand partnerships and why\n- "recommendation": Influencer strategy advice for PLDT Home`,
      text: {
        format: {
          type: "json_schema",
          name: "influencer_insights",
          strict: true,
          schema: {
            type: "object",
            properties: {
              summary: { type: "string" },
              tierAnalysis: { type: "string" },
              topPartnershipPicks: { type: "string" },
              recommendation: { type: "string" },
            },
            required: ["summary", "tierAnalysis", "topPartnershipPicks", "recommendation"],
            additionalProperties: false,
          },
        },
      },
    });

    const parsed = JSON.parse(response.output_text);
    await upsertPageInsight("influencers", parsed);
    console.log("[AI] Generated influencer page insights");
    return true;
  } catch (error) {
    console.error("[AI] Failed to generate influencer insights:", error);
    return false;
  }
}

export async function generateAllPageInsights(): Promise<{ trends: boolean; content: boolean; influencers: boolean }> {
  const client = getOpenAIClient();
  if (!client) {
    console.log("[AI] OPENAI_API_KEY not configured, skipping page insights");
    return { trends: false, content: false, influencers: false };
  }

  const trends = await generateTrendsInsights();
  await delay(DELAY_BETWEEN_CALLS_MS);
  const content = await generateContentInsights();
  await delay(DELAY_BETWEEN_CALLS_MS);
  const inf = await generateInfluencerInsights();

  console.log(`[AI] Page insights — trends: ${trends}, content: ${content}, influencers: ${inf}`);
  return { trends, content, influencers: inf };
}

// --- Fandom Discovery ---

interface DiscoveredFandomAI {
  name: string;
  description: string;
  fandomGroup: string;
  suggestedTier: "emerging" | "trending" | "existing";
  sustainabilityScore: number;
  growthScore: number;
  estimatedFollowers: { platform: string; handle: string; followers: number }[];
  sustainabilityRating: string;
  growthPotential: string;
  keyBehavior: string;
  engagementPotential: string;
  communityTone: string;
  rationale: string;
  suggestedPlatforms: string[];
  suggestedDemographics: string[];
}

/**
 * Compute a deterministic size score from total follower count.
 * Uses a logarithmic scale so the score reflects relative magnitude:
 *   0 followers      → 0
 *   1K followers     → 20
 *   10K followers    → 35
 *   100K followers   → 50
 *   500K followers   → 63
 *   1M followers     → 70
 *   5M followers     → 83
 *   10M+ followers   → 90-100
 */
function computeSizeScore(totalFollowers: number): number {
  if (totalFollowers <= 0) return 0;
  // log10 scale: 1K=3, 10K=4, 100K=5, 1M=6, 10M=7, 100M=8
  const logVal = Math.log10(totalFollowers);
  // Map log range [3, 8] to score range [20, 100]
  const score = Math.round(((logVal - 3) / 5) * 80 + 20);
  return Math.max(0, Math.min(100, score));
}

/**
 * Deduplicate estimated followers by platform, keeping the entry
 * with the highest follower count for each platform.
 */
function deduplicateFollowers(
  followers: { platform: string; handle: string; followers: number }[]
): { platform: string; handle: string; followers: number }[] {
  const byPlatform = new Map<string, { platform: string; handle: string; followers: number }>();
  for (const entry of followers) {
    const existing = byPlatform.get(entry.platform);
    if (!existing || entry.followers > existing.followers) {
      byPlatform.set(entry.platform, entry);
    }
  }
  return Array.from(byPlatform.values());
}

export interface DiscoverOptions {
  verify?: boolean;
}

export async function discoverNewFandoms(options: DiscoverOptions = {}) {
  const { verify = ENABLE_VERIFICATION } = options;

  const client = getOpenAIClient();
  if (!client) {
    throw new Error("OPENAI_API_KEY not configured");
  }

  // Get currently tracked fandom names
  const trackedFandoms = await db.select({ name: fandoms.name, slug: fandoms.slug }).from(fandoms);
  const trackedNames = trackedFandoms.map((f) => f.name);
  const trackedSlugs = new Set(trackedFandoms.map((f) => f.slug));

  // Get actively discovered fandoms (status = "discovered") — exclude from new results
  const activeDiscovered = await db
    .select({ name: aiDiscoveredFandoms.name, slug: aiDiscoveredFandoms.slug })
    .from(aiDiscoveredFandoms)
    .where(eq(aiDiscoveredFandoms.status, "discovered"));
  const activeSlugs = new Set(activeDiscovered.map((f) => f.slug));

  // Get dismissed fandoms — permanently excluded
  const dismissedFandoms = await db
    .select({ name: aiDiscoveredFandoms.name, slug: aiDiscoveredFandoms.slug })
    .from(aiDiscoveredFandoms)
    .where(eq(aiDiscoveredFandoms.status, "dismissed"));

  // Get cleared fandoms — can be re-discovered, pass as suggestions
  const clearedFandoms = await db
    .select({
      name: aiDiscoveredFandoms.name,
      slug: aiDiscoveredFandoms.slug,
      overallScore: aiDiscoveredFandoms.overallScore,
      fandomGroup: aiDiscoveredFandoms.fandomGroup,
    })
    .from(aiDiscoveredFandoms)
    .where(eq(aiDiscoveredFandoms.status, "cleared"));

  // Exclude list: tracked + actively discovered + dismissed (NOT cleared)
  const excludeList = [
    ...trackedNames,
    ...activeDiscovered.map((f) => f.name),
    ...dismissedFandoms.map((f) => f.name),
  ];
  const excludeSlugs = new Set([
    ...trackedSlugs,
    ...activeSlugs,
    ...dismissedFandoms.map((f) => f.slug),
  ]);

  // Cleared fandoms — MUST be re-included in results
  const clearedHint = clearedFandoms.length > 0
    ? `\n\nIMPORTANT — RE-INCLUDE THESE FANDOMS: The following fandoms were previously discovered and the user cleared them for a fresh evaluation. You MUST re-include ALL of them in your results with updated data. Search for their current follower counts again. They are NOT excluded — they should appear in your output:\n${clearedFandoms
        .sort((a, b) => b.overallScore - a.overallScore)
        .map((f) => `- ${f.name} (group: ${f.fandomGroup || "unknown"})`)
        .join("\n")}\n\nIn addition to re-including the above, discover NEW fandoms to reach at least 20 total.`
    : "";

  const response = await client.responses.create({
    model: "gpt-5.2",
    tools: [{ type: "web_search_preview" as const }],
    instructions: `You are a Philippine social media and fandom research analyst for PLDT Home, a major telecom brand. Your job is to discover untapped Philippine fandoms that PLDT Home could partner with for marketing campaigns.

Use web search to research current trending fandoms, social media accounts, and fan communities in the Philippines. Look up actual follower counts on TikTok, Instagram, Facebook, YouTube, Twitter/X, and Reddit. Search for trending hashtags, viral content, and emerging fan communities in the Philippine market.

Evaluate each fandom on two criteria (do NOT score size — we compute that from follower counts):
1. **Sustainability** (0-100): Will this fandom last 3-6+ months? Is it a flash trend or enduring?
2. **Growth Potential** (0-100): Is this fandom growing? Look for recent follower growth, trending content, upcoming events.

For estimatedFollowers, search for the actual social media accounts and report the follower counts you find. Each entry should have "platform" (instagram/tiktok/facebook/youtube/twitter/reddit), "handle" (the actual @ handle without the @), and "followers" (the number you found). Only include accounts you can verify via search.

IMPORTANT: Only include ONE entry per platform. If a fandom has multiple accounts on the same platform, pick the primary/official one with the most followers.

Focus on diversity: include P-Pop, K-Pop, anime, gaming, sports, local entertainment, content creators, and niche communities. Prioritize fandoms with active Philippine communities.

IMPORTANT — Write detailed, substantive text for each qualitative field:
- "description": 2-3 sentences explaining what the fandom is about and its Philippine context
- "keyBehavior": 2-3 sentences describing specific online behaviors — what fans actually do, what content they create, how they mobilize. Reference specific hashtags, content formats, or fan activities.
- "engagementPotential": 2-3 sentences on how brands can engage this fandom and the opportunity level. Mention specific campaign types, content formats, or partnership approaches.
- "communityTone": 1-2 sentences on the vibe, communication style, and culture of the community
- "rationale": 2-3 sentences on why PLDT Home should consider this fandom for campaigns — the business case

For suggestedDemographics, use these values: "gen_y", "gen_z", "abc", "cde"
For suggestedPlatforms, use these values: "instagram", "tiktok", "facebook", "youtube", "twitter", "reddit"
For suggestedTier, use: "emerging", "trending", or "existing"`,
    input: `Discover as many Philippine fandoms as you can (aim for 30+) that are NOT in this exclusion list:

${excludeList.length > 0 ? excludeList.map((n) => `- ${n}`).join("\n") : "(No fandoms tracked yet)"}
${clearedHint}

Return as many fandoms as possible (at least 25-30). We will select the top 20 by score, so cast a wide net. Search the web for each fandom's social media presence and current follower counts. Return a JSON array of fandom objects with real data from your searches.`,
    text: {
      format: {
        type: "json_schema",
        name: "discovered_fandoms",
        strict: true,
        schema: {
          type: "object",
          properties: {
            fandoms: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  description: { type: "string" },
                  fandomGroup: { type: "string" },
                  suggestedTier: { type: "string", enum: ["emerging", "trending", "existing"] },
                  sustainabilityScore: { type: "number" },
                  growthScore: { type: "number" },
                  estimatedFollowers: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        platform: { type: "string" },
                        handle: { type: "string" },
                        followers: { type: "number" },
                      },
                      required: ["platform", "handle", "followers"],
                      additionalProperties: false,
                    },
                  },
                  sustainabilityRating: { type: "string" },
                  growthPotential: { type: "string" },
                  keyBehavior: { type: "string" },
                  engagementPotential: { type: "string" },
                  communityTone: { type: "string" },
                  rationale: { type: "string" },
                  suggestedPlatforms: { type: "array", items: { type: "string" } },
                  suggestedDemographics: { type: "array", items: { type: "string" } },
                },
                required: [
                  "name", "description", "fandomGroup", "suggestedTier",
                  "sustainabilityScore", "growthScore",
                  "estimatedFollowers", "sustainabilityRating", "growthPotential",
                  "keyBehavior", "engagementPotential", "communityTone",
                  "rationale", "suggestedPlatforms", "suggestedDemographics",
                ],
                additionalProperties: false,
              },
            },
          },
          required: ["fandoms"],
          additionalProperties: false,
        },
      },
    },
  });

  const parsed = JSON.parse(response.output_text) as { fandoms: DiscoveredFandomAI[] };
  const now = new Date();
  const clearedSlugSet = new Set(clearedFandoms.map((f) => f.slug));

  // Step 1: Score all candidates in memory
  type InsertValues = typeof aiDiscoveredFandoms.$inferInsert;
  const candidates: {
    values: InsertValues;
    overallScore: number;
    isCleared: boolean;
    slug: string;
    estimatedFollowers: EstimatedFollower[];
    sustainabilityScore: number;
    growthScore: number;
  }[] = [];

  for (const f of parsed.fandoms) {
    const slug = f.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");

    // Skip if in the exclude set (tracked, active discovered, dismissed)
    if (excludeSlugs.has(slug)) {
      continue;
    }

    // Deduplicate followers by platform
    const dedupedFollowers = deduplicateFollowers(f.estimatedFollowers);

    // Compute size score deterministically from follower counts
    const totalEstFollowers = dedupedFollowers.reduce((s, ef) => s + ef.followers, 0);
    const sizeScore = computeSizeScore(totalEstFollowers);

    const overallScore = Math.round(sizeScore * 0.3 + f.sustainabilityScore * 0.3 + f.growthScore * 0.4);

    // Build suggestedHandles from deduped estimatedFollowers data
    const suggestedHandles = dedupedFollowers.map(
      (ef) => `${ef.platform}:@${ef.handle.replace(/^@/, "")}`
    );

    // Build estimatedSize with follower breakdown
    const followerBreakdown = dedupedFollowers
      .map((ef) => `${ef.platform}: ${formatFollowerCount(ef.followers)}`)
      .join(", ");
    const estimatedSize = totalEstFollowers > 0
      ? `~${formatFollowerCount(totalEstFollowers)} total (${followerBreakdown})`
      : "Unknown";

    candidates.push({
      values: {
        name: f.name,
        slug,
        description: f.description,
        fandomGroup: f.fandomGroup || null,
        suggestedTier: f.suggestedTier,
        sizeScore,
        sustainabilityScore: f.sustainabilityScore,
        growthScore: f.growthScore,
        overallScore,
        estimatedSize,
        sustainabilityRating: f.sustainabilityRating,
        growthPotential: f.growthPotential,
        keyBehavior: f.keyBehavior,
        engagementPotential: f.engagementPotential,
        communityTone: f.communityTone,
        rationale: f.rationale,
        suggestedPlatforms: f.suggestedPlatforms,
        suggestedDemographics: f.suggestedDemographics,
        suggestedHandles,
        verifiedFollowers: "[]",
        verificationStatus: "pending",
        status: "discovered" as const,
        generatedAt: now,
      },
      overallScore,
      isCleared: clearedSlugSet.has(slug),
      slug,
      estimatedFollowers: dedupedFollowers,
      sustainabilityScore: f.sustainabilityScore,
      growthScore: f.growthScore,
    });
  }

  // Step 2: Sort by overallScore descending, take top 20
  candidates.sort((a, b) => b.overallScore - a.overallScore);
  const top = candidates.slice(0, 20);

  // Step 3: Verify followers for top 20 candidates (if enabled)
  if (verify) {
    console.log(`[AI Discovery] Verifying followers for ${top.length} candidates...`);
    const BATCH_SIZE = 5;
    const BATCH_DELAY_MS = 3000;

    for (let i = 0; i < top.length; i += BATCH_SIZE) {
      const batch = top.slice(i, i + BATCH_SIZE);

      // Run verification for batch in parallel
      const verificationPromises = batch.map(async (candidate) => {
        const verified = await verifyFandomFollowers(candidate.estimatedFollowers);
        return { slug: candidate.slug, verified };
      });

      const batchResults = await Promise.allSettled(verificationPromises);

      // Update candidates with verification results
      for (const result of batchResults) {
        if (result.status === "fulfilled") {
          const { slug, verified } = result.value;
          const candidate = top.find((c) => c.slug === slug);
          if (candidate) {
            // Recalculate size score from verified followers
            const totalVerifiedFollowers = verified.reduce((s, vf) => s + vf.followers, 0);
            const newSizeScore = computeSizeScore(totalVerifiedFollowers);
            const newOverallScore = Math.round(
              newSizeScore * 0.3 +
              candidate.sustainabilityScore * 0.3 +
              candidate.growthScore * 0.4
            );

            // Update estimatedSize with verified data
            const followerBreakdown = verified
              .map((vf) => `${vf.platform}: ${formatFollowerCount(vf.followers)}${vf.verified ? " ✓" : ""}`)
              .join(", ");
            const estimatedSize = totalVerifiedFollowers > 0
              ? `~${formatFollowerCount(totalVerifiedFollowers)} total (${followerBreakdown})`
              : "Unknown";

            // Update candidate values
            candidate.values.verifiedFollowers = JSON.stringify(verified);
            candidate.values.verificationStatus = computeVerificationStatus(verified);
            candidate.values.verifiedAt = now;
            candidate.values.sizeScore = newSizeScore;
            candidate.values.overallScore = newOverallScore;
            candidate.values.estimatedSize = estimatedSize;
            candidate.overallScore = newOverallScore;
          }
        }
      }

      // Delay between batches (except for last batch)
      if (i + BATCH_SIZE < top.length) {
        await delay(BATCH_DELAY_MS);
      }
    }

    // Re-sort by updated scores
    top.sort((a, b) => b.overallScore - a.overallScore);
    console.log(`[AI Discovery] Verification complete`);
  } else {
    // Mark all as skipped if verification is disabled
    for (const candidate of top) {
      candidate.values.verificationStatus = "skipped";
    }
  }

  // Step 4: Persist only the top 20
  const results = [];
  const keptClearedSlugs = new Set(top.filter((c) => c.isCleared).map((c) => c.slug));

  for (const candidate of top) {
    if (candidate.isCleared) {
      const [updated] = await db
        .update(aiDiscoveredFandoms)
        .set({ ...candidate.values, dismissedAt: null })
        .where(eq(aiDiscoveredFandoms.slug, candidate.slug))
        .returning();
      results.push(updated);
    } else {
      const [inserted] = await db
        .insert(aiDiscoveredFandoms)
        .values(candidate.values)
        .returning();
      results.push(inserted);
    }
  }

  // Step 5: Any cleared fandoms NOT in the top 20 stay as "cleared" (no action needed)

  const verifiedCount = top.filter((c) => c.values.verificationStatus === "complete" || c.values.verificationStatus === "partial").length;
  console.log(`[AI Discovery] Discovered ${results.length} fandoms (top 20 by score from ${candidates.length} candidates, ${verifiedCount} verified)`);
  return results;
}

function formatFollowerCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

async function upsertPageInsight(page: string, insights: Record<string, string>) {
  const existing = await db
    .select()
    .from(aiPageInsights)
    .where(eq(aiPageInsights.page, page))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(aiPageInsights)
      .set({
        insights: JSON.stringify(insights),
        generatedAt: new Date(),
      })
      .where(eq(aiPageInsights.page, page));
  } else {
    await db.insert(aiPageInsights).values({
      page,
      insights: JSON.stringify(insights),
      generatedAt: new Date(),
    });
  }
}

async function callOpenAI(
  client: OpenAI,
  context: FandomContext,
  contentSamples: ContentSample[]
): Promise<AIInsights | null> {
  const platformBreakdown = context.platforms
    .map(
      (p) => `- ${p.platform}: @${p.handle} (${p.followers.toLocaleString()} followers)`
    )
    .join("\n");

  const contentExamples = contentSamples
    .slice(0, 20)
    .map((c, i) => {
      const text = c.text ? `"${c.text}"` : "(no text)";
      const hashtags = c.hashtags.length > 0 ? ` [${c.hashtags.join(", ")}]` : "";
      return `${i + 1}. [${c.contentType}] ${text}${hashtags} — ${c.likes} likes, ${c.comments} comments, ${c.shares} shares, ${c.views} views`;
    })
    .join("\n");

  const systemPrompt = `You are a social media marketing analyst specializing in Philippine fandoms for PLDT Home campaigns. You analyze fandom communities to provide actionable marketing insights for telecom brand partnerships.

Your audience is PLDT Home's marketing team. They want to know:
- How fans actually behave online (not generic descriptions)
- What makes this fandom special for brand engagement
- Concrete campaign ideas, not vague suggestions

Be specific and reference actual content patterns you see in the data. Write in a professional but accessible tone. Keep each field to 1-3 sentences.`;

  const userPrompt = `Analyze this fandom and generate marketing insights:

**Fandom:** ${context.name}
**Tier:** ${context.tier}
**Group:** ${context.fandomGroup || "Unknown"}
**Demographics:** ${context.demographicTags.join(", ") || "Not specified"}
**Total Followers:** ${context.totalFollowers.toLocaleString()}
**Engagement Rate:** ${context.avgEngagementRate}%

**Platform Breakdown:**
${platformBreakdown}

**Top Performing Content (${contentSamples.length} items):**
${contentExamples || "No content data available yet."}

Return a JSON object with exactly these 5 fields:
- "keyBehavior": What are the defining online behaviors of this fandom? What do fans actually do? (1-2 sentences)
- "engagementPotential": How should brands engage with this fandom? What's the opportunity level and best approach? (1-2 sentences)
- "communityTone": What's the vibe and communication style of this community? (1-2 sentences)
- "rationale": Why should PLDT Home invest in this fandom for campaigns? What's the business case? (2-3 sentences)
- "suggestedAction": What specific campaign action should PLDT Home take with this fandom right now? (2-3 sentences)`;

  const response = await client.responses.create({
    model: "gpt-5.2",
    instructions: systemPrompt,
    input: userPrompt,
    text: {
      format: {
        type: "json_schema",
        name: "fandom_insights",
        strict: true,
        schema: {
          type: "object",
          properties: {
            keyBehavior: { type: "string" },
            engagementPotential: { type: "string" },
            communityTone: { type: "string" },
            rationale: { type: "string" },
            suggestedAction: { type: "string" },
          },
          required: [
            "keyBehavior",
            "engagementPotential",
            "communityTone",
            "rationale",
            "suggestedAction",
          ],
          additionalProperties: false,
        },
      },
    },
  });

  const content = response.output_text;
  if (!content) return null;

  try {
    const parsed = JSON.parse(content) as AIInsights;
    if (
      parsed.keyBehavior &&
      parsed.engagementPotential &&
      parsed.communityTone &&
      parsed.rationale &&
      parsed.suggestedAction
    ) {
      return parsed;
    }
    return null;
  } catch {
    console.error("[AI] Failed to parse OpenAI response:", content);
    return null;
  }
}
