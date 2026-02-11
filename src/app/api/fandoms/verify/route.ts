import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fandomPlatforms, fandoms } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

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
    // Use TikTok's web page and check for meta tags / status
    const res = await fetch(`https://www.tiktok.com/@${clean}`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
    });
    const html = await res.text();
    // Check for "Couldn't find this account" or similar 404
    if (
      html.includes("Couldn\\'t find this account") ||
      html.includes("couldn&#39;t find this account") ||
      html.includes('"statusCode":10202') ||
      res.status === 404
    ) {
      return { platform: "tiktok", handle: clean, valid: false, error: "Account not found" };
    }
    // Try to extract follower count from universal data
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
    const res = await fetch(`https://www.youtube.com/@${clean}`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
    });
    if (res.status === 404) {
      return { platform: "youtube", handle: clean, valid: false, error: "Channel not found" };
    }
    const html = await res.text();
    if (html.includes('"404"') || html.includes("This page isn")) {
      return { platform: "youtube", handle: clean, valid: false, error: "Channel not found" };
    }
    // Extract subscriber count
    const subMatch = html.match(/"subscriberCountText"\s*:\s*\{\s*"simpleText"\s*:\s*"([^"]+)"/);
    const nameMatch = html.match(/"channelMetadataRenderer".*?"title"\s*:\s*"([^"]+)"/);
    return {
      platform: "youtube",
      handle: clean,
      valid: true,
      displayName: nameMatch?.[1] || clean,
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

async function checkTwitter(handle: string): Promise<HandleCheck> {
  const clean = handle.replace("@", "");
  // X/Twitter aggressively blocks all server-side verification from datacenter IPs.
  // We cannot reliably distinguish "account exists" from "blocked" — always assume valid.
  return { platform: "twitter", handle: clean, valid: true, error: "X blocks server verification" };
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
    return { platform: "facebook", handle: clean, valid: true };
  } catch (e) {
    return { platform: "facebook", handle: clean, valid: true, error: "Could not verify (network)" };
  }
}

const checkers: Record<string, (handle: string) => Promise<HandleCheck>> = {
  instagram: checkInstagram,
  tiktok: checkTikTok,
  youtube: checkYouTube,
  twitter: checkTwitter,
  facebook: checkFacebook,
};

// POST /api/fandoms/verify — verify all handles for a fandom
export async function POST(req: NextRequest) {
  try {
    const { fandomId, handles } = await req.json();

    let toCheck: { platform: string; handle: string }[] = [];

    if (handles && Array.isArray(handles)) {
      // Direct handle check (for pre-save validation)
      toCheck = handles;
    } else if (fandomId) {
      // Check existing fandom handles from DB
      const platforms = await db
        .select({ platform: fandomPlatforms.platform, handle: fandomPlatforms.handle })
        .from(fandomPlatforms)
        .where(eq(fandomPlatforms.fandomId, fandomId));
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

    return NextResponse.json({ results });
  } catch (error) {
    console.error("[Verify] Failed:", error);
    return NextResponse.json({ error: "Verification failed" }, { status: 500 });
  }
}
