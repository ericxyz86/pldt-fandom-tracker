import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fandomPlatforms, fandoms } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface HandleCheck {
  platform: string;
  handle: string;
  valid: boolean;
  displayName?: string;
  followers?: number;
  error?: string;
}

async function checkInstagram(handle: string): Promise<HandleCheck> {
  const clean = handle.replace("@", "");
  try {
    const res = await fetch(
      `https://www.instagram.com/api/v1/users/web_profile_info/?username=${clean}`,
      {
        headers: {
          "x-ig-app-id": "936619743392459",
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        },
        signal: AbortSignal.timeout(10000),
      }
    );
    if (res.status === 404) {
      return { platform: "instagram", handle: clean, valid: false, error: "Account not found" };
    }
    if (res.status === 429) {
      return { platform: "instagram", handle: clean, valid: true, error: "Rate limited (handle likely valid)" };
    }
    if (!res.ok) {
      return { platform: "instagram", handle: clean, valid: true, error: `HTTP ${res.status} (unconfirmed)` };
    }
    const data = await res.json();
    const user = data?.data?.user;
    if (!user) {
      return { platform: "instagram", handle: clean, valid: false, error: "No user data" };
    }
    return {
      platform: "instagram",
      handle: clean,
      valid: true,
      displayName: user.full_name || clean,
      followers: user.edge_followed_by?.count || 0,
    };
  } catch (e) {
    return {
      platform: "instagram",
      handle: clean,
      valid: false,
      error: e instanceof Error ? e.message : "Check failed",
    };
  }
}

async function checkTikTok(handle: string): Promise<HandleCheck> {
  const clean = handle.replace("@", "");
  try {
    const res = await fetch(`https://www.tiktok.com/@${clean}`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
    });
    const html = await res.text();
    if (
      html.includes("Couldn\\'t find this account") ||
      html.includes("couldn&#39;t find this account") ||
      html.includes('"statusCode":10202') ||
      res.status === 404
    ) {
      return { platform: "tiktok", handle: clean, valid: false, error: "Account not found" };
    }
    const match = html.match(/"followerCount"\s*:\s*(\d+)/);
    const nameMatch = html.match(/"nickname"\s*:\s*"([^"]+)"/);
    return {
      platform: "tiktok",
      handle: clean,
      valid: true,
      displayName: nameMatch?.[1] || clean,
      followers: match ? parseInt(match[1]) : undefined,
    };
  } catch (e) {
    return {
      platform: "tiktok",
      handle: clean,
      valid: false,
      error: e instanceof Error ? e.message : "Check failed",
    };
  }
}

async function checkYouTube(handle: string): Promise<HandleCheck> {
  const clean = handle.replace("@", "");
  try {
    // Try multiple URL formats
    const urls = [
      `https://www.youtube.com/@${clean}`,
      `https://www.youtube.com/c/${clean}`,
      `https://www.youtube.com/${clean}`,
    ];
    let html = "";
    let found = false;
    for (const url of urls) {
      const res = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          "Accept-Language": "en-US,en;q=0.9",
          "Cookie": "CONSENT=PENDING+999; SOCS=CAISNQgDEitib3FfaWRlbnRpdHlmcm9udGVuZHVpc2VydmVyXzIwMjMwODI5LjA3X3AxGgJlbiACGgYIgJnSmQY",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(10000),
      });
      if (res.status === 404) continue;
      html = await res.text();
      if (!html.includes('"404"') && !html.includes("This page isn")) {
        found = true;
        break;
      }
    }
    if (!found || !html) {
      return { platform: "youtube", handle: clean, valid: false, error: "Channel not found" };
    }
    const nameMatch = html.match(/"channelMetadataRenderer".*?"title"\s*:\s*"([^"]+)"/);
    // Extract subscriber count from multiple possible JSON fields
    let followers: number | undefined;
    // Try "subscriberCountText":{"simpleText":"3.22M subscribers"}
    const subTextMatch = html.match(/"subscriberCountText":\{"simpleText":"([^"]+)"/);
    if (subTextMatch) {
      followers = parseSubCount(subTextMatch[1]);
    }
    // Try "subscriberCountText":"3.22M subscribers"
    if (!followers) {
      const subText2 = html.match(/"subscriberCountText":"([^"]+)"/);
      if (subText2) followers = parseSubCount(subText2[1]);
    }
    // Try raw "subscriberCount":"3220000"
    if (!followers) {
      const rawSub = html.match(/"subscriberCount":"(\d+)"/);
      if (rawSub) followers = parseInt(rawSub[1]);
    }
    return {
      platform: "youtube",
      handle: clean,
      valid: true,
      displayName: nameMatch?.[1] || clean,
      followers,
    };
  } catch (e) {
    return {
      platform: "youtube",
      handle: clean,
      valid: false,
      error: e instanceof Error ? e.message : "Check failed",
    };
  }
}

function parseSubCount(text: string): number | undefined {
  // "3.22M subscribers" -> 3220000, "816K subscribers" -> 816000
  const match = text.match(/([\d.]+)\s*([KMB])?/i);
  if (!match) return undefined;
  let num = parseFloat(match[1]);
  const suffix = (match[2] || "").toUpperCase();
  if (suffix === "K") num *= 1000;
  else if (suffix === "M") num *= 1000000;
  else if (suffix === "B") num *= 1000000000;
  return Math.round(num);
}

async function checkTwitter(handle: string): Promise<HandleCheck> {
  const clean = handle.replace("@", "");
  
  // Try multiple Twitter viewer mirrors
  const mirrors = [
    `https://twstalker.com/${clean}`,
    `https://nitter.privacydev.net/${clean}`,
    `https://xcancel.com/${clean}`,
  ];
  
  for (const url of mirrors) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml",
          "Accept-Language": "en-US,en;q=0.9",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(10000),
      });
      
      if (!res.ok) continue;
      const html = await res.text();
      
      if (html.includes("User not found") || html.includes("doesn't exist") || html.includes("This account") || html.includes("Nothing here")) {
        return { platform: "twitter", handle: clean, valid: false, error: "Account not found" };
      }
      
      // Try multiple patterns for follower extraction
      let followers: number | undefined;
      let displayName: string | undefined;
      
      // Pattern 1: "955K Followers" or "1,234,567 Followers"
      const followerMatches = html.match(/([\d,.]+[KMB]?)\s*Followers/gi);
      if (followerMatches && followerMatches.length > 0) {
        const match = followerMatches[0].match(/([\d,.]+[KMB]?)\s*Followers/i);
        if (match) {
          followers = parseSubCount(match[1].replace(/,/g, ""));
        }
      }
      
      // Pattern 2: Nitter-style "followers_count" in data attributes
      if (!followers) {
        const dataMatch = html.match(/followers[_-]count['":\s]+(\d+)/i);
        if (dataMatch) followers = parseInt(dataMatch[1]);
      }
      
      // Pattern 3: stat-link with followers count
      if (!followers) {
        const statMatch = html.match(/class="[^"]*followers[^"]*"[^>]*>[\s\S]*?([\d,.]+[KMB]?)/i);
        if (statMatch) followers = parseSubCount(statMatch[1].replace(/,/g, ""));
      }
      
      const nameMatch = html.match(/<title>([^<(]+)/);
      displayName = nameMatch ? nameMatch[1].trim().replace(/ \(@.*/, "").replace(/ \|.*/, "").replace(/ \/.*/, "") : clean;
      
      if (followers && followers > 0) {
        console.log(`[Verify Twitter] @${clean} via ${new URL(url).hostname}: ${followers} followers`);
        return { platform: "twitter", handle: clean, valid: true, displayName, followers };
      }
      
      // Got page but no followers — try next mirror
      console.log(`[Verify Twitter] @${clean} via ${new URL(url).hostname}: page OK but no followers found`);
      continue;
    } catch {
      continue;
    }
  }
  
  // All mirrors failed
  console.log(`[Verify Twitter] @${clean}: all mirrors failed`);
  return { platform: "twitter", handle: clean, valid: true, error: "Followers unavailable" };
}

async function checkFacebook(handle: string): Promise<HandleCheck> {
  const clean = handle.replace("@", "");
  try {
    const res = await fetch(`https://www.facebook.com/${clean}`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
    });
    const html = await res.text();
    if (
      res.status === 404 ||
      html.includes("This page isn't available") ||
      html.includes("this content isn")
    ) {
      return { platform: "facebook", handle: clean, valid: false, error: "Page not found" };
    }
    // Extract from og:description which contains "2,853,567 likes" or "2,853,567 na like"
    let followers: number | undefined;
    const ogMatch = html.match(/og:description[^>]*content="([^"]+)"/);
    if (ogMatch) {
      const desc = ogMatch[1];
      // Match "2,853,567 likes" or "2,853,567 na like" (Filipino locale)
      const likesMatch = desc.match(/([\d,]+)\s*(?:na )?like/i);
      if (likesMatch) {
        followers = parseInt(likesMatch[1].replace(/,/g, ""));
      }
      // Also try followers
      const followMatch = desc.match(/([\d,]+)\s*(?:na )?follower/i);
      if (followMatch) {
        followers = parseInt(followMatch[1].replace(/,/g, ""));
      }
    }
    // Fallback: try other patterns in HTML
    if (!followers) {
      const likeMatch = html.match(/([\d,.]+[KMB]?)\s*(?:people like this|followers|likes)/i);
      if (likeMatch) {
        followers = parseSubCount(likeMatch[1].replace(/,/g, ""));
      }
    }
    return { platform: "facebook", handle: clean, valid: true, followers };
  } catch (e) {
    return { platform: "facebook", handle: clean, valid: true, error: "Could not verify (network)" };
  }
}

async function checkReddit(handle: string): Promise<HandleCheck> {
  const clean = handle.replace(/^(r\/|\/r\/)/, "");
  try {
    const res = await fetch(`https://old.reddit.com/r/${clean}.json?limit=1`, {
      headers: {
        "User-Agent": "PLDTFandomTracker/1.0",
      },
      signal: AbortSignal.timeout(10000),
    });
    if (res.status === 404) {
      return { platform: "reddit", handle: clean, valid: false, error: "Subreddit not found" };
    }
    return { platform: "reddit", handle: clean, valid: true };
  } catch (e) {
    return { platform: "reddit", handle: clean, valid: true, error: "Could not verify (network)" };
  }
}

const checkers: Record<string, (handle: string) => Promise<HandleCheck>> = {
  instagram: checkInstagram,
  tiktok: checkTikTok,
  youtube: checkYouTube,
  twitter: checkTwitter,
  facebook: checkFacebook,
  reddit: checkReddit,
};

// POST /api/fandoms/verify — verify all handles for a fandom and persist results
export async function POST(req: NextRequest) {
  try {
    const { fandomId, handles } = await req.json();

    let toCheck: { platform: string; handle: string }[] = [];
    let dbFandomId: string | null = null;

    if (handles && Array.isArray(handles)) {
      toCheck = handles;
    } else if (fandomId) {
      // Look up fandom UUID from either slug or id
      const rows = await db
        .select({ id: fandoms.id })
        .from(fandoms)
        .where(eq(fandoms.slug, fandomId))
        .limit(1);

      if (rows.length === 0) {
        // Try by UUID directly
        const byId = await db
          .select({ id: fandoms.id })
          .from(fandoms)
          .where(eq(fandoms.id, fandomId))
          .limit(1);
        if (byId.length > 0) dbFandomId = byId[0].id;
      } else {
        dbFandomId = rows[0].id;
      }

      if (!dbFandomId) {
        return NextResponse.json({ error: "Fandom not found" }, { status: 404 });
      }

      const platforms = await db
        .select({ platform: fandomPlatforms.platform, handle: fandomPlatforms.handle })
        .from(fandomPlatforms)
        .where(eq(fandomPlatforms.fandomId, dbFandomId));
      toCheck = platforms.map((p) => ({ platform: p.platform, handle: p.handle }));
    } else {
      return NextResponse.json({ error: "fandomId or handles required" }, { status: 400 });
    }

    // Run all checks in parallel
    const results = await Promise.all(
      toCheck.map(async ({ platform, handle }) => {
        const checker = checkers[platform];
        if (!checker) {
          return { platform, handle, valid: true, error: "No checker for platform" } as HandleCheck;
        }
        return checker(handle);
      })
    );

    // Persist results to DB if we have a fandom ID
    if (dbFandomId) {
      const now = new Date();
      for (const r of results) {
        const updateData: Record<string, any> = {
          verified: r.valid ? "valid" : "invalid",
          verifiedAt: now,
        };
        // Also update follower count if we got a real number
        if (r.followers && r.followers > 0) {
          updateData.followers = r.followers;
        }
        await db
          .update(fandomPlatforms)
          .set(updateData)
          .where(
            and(
              eq(fandomPlatforms.fandomId, dbFandomId),
              eq(fandomPlatforms.platform, r.platform as any)
            )
          );
      }
    }

    return NextResponse.json({ results });
  } catch (error) {
    console.error("[Verify] Failed:", error);
    return NextResponse.json({ error: "Verification failed" }, { status: 500 });
  }
}

// GET /api/fandoms/verify?all=true — bulk verify all fandoms
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  if (searchParams.get("all") !== "true") {
    return NextResponse.json({ error: "Use ?all=true to bulk verify" }, { status: 400 });
  }

  try {
    // Get all fandoms with their platforms
    const allFandoms = await db
      .select({ id: fandoms.id, name: fandoms.name, slug: fandoms.slug })
      .from(fandoms);

    const allResults: { fandom: string; results: HandleCheck[] }[] = [];
    const now = new Date();

    for (const fandom of allFandoms) {
      const platforms = await db
        .select({ platform: fandomPlatforms.platform, handle: fandomPlatforms.handle })
        .from(fandomPlatforms)
        .where(eq(fandomPlatforms.fandomId, fandom.id));

      const results = await Promise.all(
        platforms.map(async ({ platform, handle }) => {
          const checker = checkers[platform];
          if (!checker) return { platform, handle, valid: true, error: "No checker" } as HandleCheck;
          return checker(handle);
        })
      );

      // Persist
      for (const r of results) {
        const updateData: Record<string, any> = {
          verified: r.valid ? "valid" : "invalid",
          verifiedAt: now,
        };
        if (r.followers && r.followers > 0) {
          updateData.followers = r.followers;
        }
        await db
          .update(fandomPlatforms)
          .set(updateData)
          .where(
            and(
              eq(fandomPlatforms.fandomId, fandom.id),
              eq(fandomPlatforms.platform, r.platform as any)
            )
          );
      }

      allResults.push({ fandom: fandom.name, results });

      // Small delay between fandoms to avoid rate limits
      await new Promise((r) => setTimeout(r, 500));
    }

    return NextResponse.json({
      verified: allResults.length,
      results: allResults,
    });
  } catch (error) {
    console.error("[Verify All] Failed:", error);
    return NextResponse.json({ error: "Bulk verification failed" }, { status: 500 });
  }
}
