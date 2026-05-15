import { NextRequest, NextResponse } from "next/server";
import { scrapeSociavaultCommentReplies } from "@/lib/providers";
import type { Platform } from "@/types/fandom";

const API_SECRET = process.env.PLDT_API_SECRET || process.env.API_SECRET || "";

/**
 * POST /api/scrape/comment-replies
 *
 * Selectively expands a TikTok or YouTube reply thread through SociaVault.
 *
 * Auth: X-API-Secret header OR Bearer token
 *
 * Body (TikTok):
 * {
 *   "platform": "tiktok",
 *   "commentId": "...",
 *   "videoUrl": "https://www.tiktok.com/...",
 *   "cursor": "optional",
 *   "limit": 50
 * }
 *
 * Body (YouTube):
 * {
 *   "platform": "youtube",
 *   "repliesContinuationToken": "...",
 *   "continuationToken": "optional-next-page-token",
 *   "limit": 50
 * }
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const xApiSecret = request.headers.get("x-api-secret");

  if (API_SECRET) {
    const isAuthed = authHeader === `Bearer ${API_SECRET}` || xApiSecret === API_SECRET;
    if (!isAuthed) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const body = await request.json().catch(() => ({}));
    const {
      platform,
      handle = "thread-expansion",
      commentId,
      videoUrl,
      cursor,
      repliesContinuationToken,
      continuationToken,
      limit,
    } = body;

    if (platform !== "tiktok" && platform !== "youtube") {
      return NextResponse.json(
        { error: "platform must be 'tiktok' or 'youtube'" },
        { status: 400 }
      );
    }

    const result = await scrapeSociavaultCommentReplies(platform as Platform, {
      handle,
      commentId,
      videoUrl,
      cursor,
      repliesContinuationToken,
      continuationToken,
      limit: Math.min(Math.max(Number(limit) || 50, 1), 100),
    });

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: result.error || "Failed to fetch comment replies",
          source: result.source,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      source: result.source,
      count: result.items.length,
      items: result.items,
      pagination: result.pagination || null,
    });
  } catch (error) {
    console.error("[Comment Replies] Failed:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
