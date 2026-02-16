import type { Platform } from "@/types/fandom";
import type { ScrapeProvider, ScrapeParams, ProviderResult } from "./types";

/**
 * SociaVault provider — calls the SociaVault API via the monitor proxy.
 * 
 * Currently only Reddit endpoints are tested and working.
 * Other platforms will return unsupported errors (triggering failover to Apify).
 */

const MONITOR_APP_NAME = "pldt-fandom";

function getSociavaultApiKey(): string {
  return process.env.SOCIAVAULT_API_KEY || "";
}

// Timeout for SociaVault API calls (30 seconds)
const SOCIAVAULT_TIMEOUT_MS = 30000;

function getMonitorProxyUrl(): string {
  return process.env.MONITOR_PROXY_URL || "http://sociavault-monitor:3080";
}

function getMonitorApiKey(): string {
  return process.env.MONITOR_API_KEY || "sv-ailabs-2026";
}

/**
 * Build the full proxy URL for a SociaVault endpoint.
 * Routes through: monitor-proxy → SociaVault API
 */
function buildProxyUrl(path: string, queryParams: Record<string, string>): string {
  const baseUrl = `${getMonitorProxyUrl()}/proxy/v1/scrape${path}`;
  const qs = new URLSearchParams(queryParams).toString();
  return qs ? `${baseUrl}?${qs}` : baseUrl;
}

/**
 * Normalize SociaVault Reddit response into the format expected by normalize.ts.
 * SociaVault returns raw Reddit JSON API data with posts as indexed objects.
 */
function normalizeSociavaultRedditPosts(data: Record<string, unknown>): Record<string, unknown>[] {
  const posts = data.posts as Record<string, unknown> | undefined;
  if (!posts) return [];

  // Posts come as { "0": {...}, "1": {...}, ... } — convert to array
  const items: Record<string, unknown>[] = [];
  const keys = Object.keys(posts).sort((a, b) => Number(a) - Number(b));

  for (const key of keys) {
    const post = posts[key] as Record<string, unknown>;
    if (!post || typeof post !== "object") continue;

    // Map Reddit API fields to the format expected by normalize.ts
    items.push({
      id: post.id || "",
      title: post.title || "",
      selftext: post.selftext || "",
      url: post.url || (post.permalink ? `https://www.reddit.com${post.permalink}` : ""),
      permalink: post.permalink || "",
      // normalize.ts checks upVotes || score
      upVotes: post.score || post.ups || 0,
      score: post.score || post.ups || 0,
      // normalize.ts checks numberOfComments || numComments
      numberOfComments: post.num_comments || 0,
      numComments: post.num_comments || 0,
      author: post.author || "",
      subreddit: post.subreddit || "",
      // normalize.ts checks createdAt
      createdAt: post.created_at_iso || (post.created_utc
        ? new Date((post.created_utc as number) * 1000).toISOString()
        : null),
      created_utc: post.created_utc || 0,
      subreddit_subscribers: post.subreddit_subscribers || 0,
    });
  }

  return items;
}

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

export const sociavaultProvider: ScrapeProvider = {
  name: "sociavault",

  supports(platform: Platform): boolean {
    // Currently only Reddit is tested and working
    // Return true for all platforms to allow future expansion
    // The scrape method will return appropriate errors for unsupported platforms
    return platform === "reddit";
  },

  async scrape(platform: Platform, params: ScrapeParams): Promise<ProviderResult> {
    if (platform !== "reddit") {
      return {
        success: false,
        items: [],
        source: "sociavault",
        error: `SociaVault does not yet support platform: ${platform}`,
      };
    }

    try {
      return await scrapeReddit(params);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown SociaVault error";
      console.error(`[SociaVault] Failed for ${params.handle} (${platform}):`, errorMsg);
      return {
        success: false,
        items: [],
        source: "sociavault",
        error: errorMsg,
      };
    }
  },
};

/**
 * Scrape Reddit via SociaVault API.
 * Uses the /reddit/search endpoint with the keyword/handle as the query.
 */
async function scrapeReddit(params: ScrapeParams): Promise<ProviderResult> {
  const query = params.keyword || params.handle;
  const limit = params.limit || 20;

  const url = buildProxyUrl("/reddit/search", {
    query,
    sort: "new",
    limit: String(limit),
  });

  console.log(`[SociaVault] Fetching Reddit search for "${query}" (limit: ${limit})`);

  const response = await fetchWithTimeout(
    url,
    {
      method: "GET",
      headers: {
        "X-API-Key": getSociavaultApiKey(),
        "X-App-Name": MONITOR_APP_NAME,
        "X-Monitor-Key": getMonitorApiKey(),
        "Content-Type": "application/json",
      },
    },
    SOCIAVAULT_TIMEOUT_MS
  );

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`SociaVault API returned ${response.status}: ${errorText}`);
  }

  const json = await response.json() as Record<string, unknown>;

  if (!(json.success as boolean)) {
    throw new Error(`SociaVault API error: ${JSON.stringify(json)}`);
  }

  const data = json.data as Record<string, unknown>;
  if (!data) {
    throw new Error("SociaVault response missing 'data' field");
  }

  const items = normalizeSociavaultRedditPosts(data);

  console.log(`[SociaVault] Got ${items.length} Reddit posts for "${query}"`);

  return {
    success: items.length > 0,
    items,
    source: "sociavault",
  };
}
