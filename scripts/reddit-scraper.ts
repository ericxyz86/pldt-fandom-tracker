#!/usr/bin/env npx tsx
/**
 * Reddit Local Scraper for PLDT Fandom Tracker
 *
 * Runs on Mac Mini (residential IP) because Reddit blocks datacenter IPs.
 * Fetches Reddit search results for all tracked fandoms and pushes to
 * the fandom tracker's /api/scrape/reddit-push endpoint.
 *
 * Usage:
 *   npx tsx scripts/reddit-scraper.ts
 *
 * Environment:
 *   FANDOM_TRACKER_URL  - Base URL (default: https://pldt-fandom.aiailabs.net)
 *   FANDOM_TRACKER_SECRET - API secret for auth
 */

const FANDOM_TRACKER_URL =
  process.env.FANDOM_TRACKER_URL || "https://pldt-fandom.aiailabs.net";
const API_SECRET = process.env.FANDOM_TRACKER_SECRET || "";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// Delay between Reddit API calls to avoid rate limiting
const DELAY_MS = 2000;
const ITEMS_PER_FANDOM = 25;

interface RedditPost {
  id: string;
  title: string;
  selftext: string;
  url: string;
  permalink: string;
  score: number;
  num_comments: number;
  author: string;
  subreddit: string;
  created_utc: number;
}

interface FandomInfo {
  id: string;
  name: string;
  slug: string;
  platforms: Array<{
    platform: string;
    handle: string;
  }>;
}

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch fandoms list from the tracker API
 */
async function fetchFandoms(): Promise<FandomInfo[]> {
  const res = await fetch(`${FANDOM_TRACKER_URL}/api/fandoms`);
  if (!res.ok) {
    throw new Error(`Failed to fetch fandoms: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  // The API returns { fandoms: [...] } or just [...]
  return data.fandoms || data;
}

/**
 * Search Reddit for a keyword using public JSON API
 */
async function searchReddit(keyword: string, limit: number = ITEMS_PER_FANDOM): Promise<RedditPost[]> {
  const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(keyword)}&sort=new&limit=${limit}&t=week`;

  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
    },
  });

  if (!res.ok) {
    console.error(`  ❌ Reddit search failed for "${keyword}": ${res.status}`);
    return [];
  }

  const data = await res.json();
  const children = data?.data?.children || [];

  return children.map((child: any) => {
    const p = child.data;
    return {
      id: p.id,
      title: p.title,
      selftext: p.selftext || "",
      url: p.url,
      permalink: p.permalink,
      score: p.score || 0,
      num_comments: p.num_comments || 0,
      author: p.author || "[deleted]",
      subreddit: p.subreddit,
      created_utc: p.created_utc,
    };
  });
}

/**
 * Push Reddit data to the fandom tracker
 */
async function pushToTracker(
  fandomId: string,
  keyword: string,
  items: RedditPost[]
): Promise<{ success: boolean; newItems: number }> {
  const res = await fetch(`${FANDOM_TRACKER_URL}/api/scrape/reddit-push`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_SECRET}`,
    },
    body: JSON.stringify({ fandomId, keyword, items }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`  ❌ Push failed: ${res.status} — ${text.slice(0, 200)}`);
    return { success: false, newItems: 0 };
  }

  const data = await res.json();
  return { success: data.success, newItems: data.newItems || 0 };
}

/**
 * Build a Reddit search keyword from fandom name.
 * Simplifies names to get better search results.
 */
function buildSearchKeyword(fandomName: string): string {
  const mappings: Record<string, string> = {
    "BINI Blooms": "BINI",
    "BTS ARMY": "BTS Philippines",
    "NewJeans Bunnies": "NewJeans Philippines",
    "SEVENTEEN CARAT": "SEVENTEEN kpop Philippines",
    "KAIA Fans": "KAIA girl group Philippines",
    "ALAMAT Fans": "ALAMAT group Philippines",
    "G22 Fans": "G22 group Philippines",
    "VXON - Vixies": "VXON Philippines",
    "YGIG - WeGo": "YGIG Philippines",
    "JMFyang Fans": "JMFyang",
    "AshDres Fans": "AshDres",
    "AlDub Nation": "AlDub",
    "Cup of Joe (Joewahs)": "Cup of Joe band Philippines",
    "Team Payaman / Cong TV Universe Fans": "Cong TV",
    "r/DragRacePhilippines": "Drag Race Philippines",
  };

  if (mappings[fandomName]) return mappings[fandomName];
  if (fandomName.includes("SB19")) return "SB19";

  // Default: use fandom name as-is
  const cleaned = fandomName.split(/[/\\(]/)[0].trim();
  return cleaned;
}

async function main() {
  console.log("🔴 PLDT Reddit Scraper — Local Pipeline");
  console.log(`   Target: ${FANDOM_TRACKER_URL}`);
  console.log(`   Auth: ${API_SECRET ? "✅" : "❌ MISSING"}`);
  console.log("");

  if (!API_SECRET) {
    console.error("❌ FANDOM_TRACKER_SECRET env var is required");
    process.exit(1);
  }

  // Step 1: Get all tracked fandoms
  console.log("📋 Fetching tracked fandoms...");
  const fandoms = await fetchFandoms();

  // Search Reddit for ALL fandoms (keyword search works for everything)
  // Skip fandoms with no platforms at all (likely placeholder/unconfigured)
  const targetFandoms = fandoms.filter(
    (f) => f.platforms && f.platforms.length > 0
  );

  console.log(
    `   Found ${fandoms.length} fandoms, ${targetFandoms.length} with platforms configured`
  );
  console.log("");

  let totalNew = 0;
  let totalFetched = 0;
  let successCount = 0;
  let failCount = 0;

  for (const fandom of targetFandoms) {
    const keyword = buildSearchKeyword(fandom.name);
    console.log(`🔍 ${fandom.name} → searching "${keyword}"...`);

    try {
      // Search Reddit
      const items = await searchReddit(keyword);
      totalFetched += items.length;

      if (items.length === 0) {
        console.log(`   ⚠️  No results found`);
        failCount++;
        await delay(DELAY_MS);
        continue;
      }

      // Push to tracker
      const result = await pushToTracker(fandom.id, keyword, items);

      if (result.success) {
        console.log(
          `   ✅ ${items.length} posts fetched, ${result.newItems} new`
        );
        totalNew += result.newItems;
        successCount++;
      } else {
        console.log(`   ❌ Push failed`);
        failCount++;
      }
    } catch (error) {
      console.error(
        `   ❌ Error: ${error instanceof Error ? error.message : error}`
      );
      failCount++;
    }

    // Rate limit delay
    await delay(DELAY_MS);
  }

  console.log("");
  console.log("📊 Summary:");
  console.log(`   Fandoms processed: ${targetFandoms.length}`);
  console.log(`   Succeeded: ${successCount}`);
  console.log(`   Failed: ${failCount}`);
  console.log(`   Total posts fetched: ${totalFetched}`);
  console.log(`   New items ingested: ${totalNew}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
