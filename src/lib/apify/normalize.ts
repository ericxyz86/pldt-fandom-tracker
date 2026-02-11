import type { Platform, ContentType } from "@/types/fandom";

interface NormalizedMetric {
  followers: number;
  postsCount: number;
  engagementTotal: number;
  avgLikes: number;
  avgComments: number;
  avgShares: number;
}

interface NormalizedContent {
  externalId: string;
  contentType: ContentType;
  text: string | null;
  url: string | null;
  likes: number;
  comments: number;
  shares: number;
  views: number;
  publishedAt: string | null;
  hashtags: string[];
}

interface NormalizedInfluencer {
  username: string;
  displayName: string | null;
  followers: number;
  engagementRate: number;
  profileUrl: string | null;
  avatarUrl: string | null;
  bio: string | null;
  location: string | null;
  postCount: number;
}

/* eslint-disable @typescript-eslint/no-explicit-any */

export function normalizeMetrics(
  platform: Platform,
  rawData: any[]
): NormalizedMetric {
  switch (platform) {
    case "instagram":
      return normalizeInstagramMetrics(rawData);
    case "tiktok":
      return normalizeTikTokMetrics(rawData);
    case "facebook":
      return normalizeFacebookMetrics(rawData);
    case "youtube":
      return normalizeYouTubeMetrics(rawData);
    case "twitter":
      return normalizeTwitterMetrics(rawData);
    case "reddit":
      return normalizeRedditMetrics(rawData);
    default:
      return {
        followers: 0,
        postsCount: 0,
        engagementTotal: 0,
        avgLikes: 0,
        avgComments: 0,
        avgShares: 0,
      };
  }
}

export function normalizeContent(
  platform: Platform,
  rawData: any[]
): NormalizedContent[] {
  switch (platform) {
    case "instagram":
      return rawData.map((item) => ({
        externalId: item.id || item.shortCode || "",
        contentType: item.type === "Video" ? "reel" : "post",
        text: item.caption || null,
        url: item.url || null,
        likes: item.likesCount || 0,
        comments: item.commentsCount || 0,
        shares: 0,
        views: item.videoViewCount || 0,
        publishedAt: item.timestamp || null,
        hashtags: extractHashtags(item.caption || ""),
      }));
    case "tiktok":
      return rawData.map((item) => ({
        externalId: item.id || "",
        contentType: "video",
        text: item.text || item.desc || null,
        url: item.webVideoUrl || null,
        likes: item.diggCount || item.likes || 0,
        comments: item.commentCount || item.comments || 0,
        shares: item.shareCount || item.shares || 0,
        views: item.playCount || item.views || 0,
        publishedAt: item.createTime
          ? new Date(item.createTime * 1000).toISOString()
          : null,
        hashtags: (item.hashtags || []).map(
          (h: any) => h.name || h.title || h
        ),
      }));
    case "twitter":
      return rawData.map((item) => ({
        externalId: item.id || "",
        contentType: "tweet",
        text: item.full_text || item.text || null,
        url: item.url || null,
        likes: item.favorite_count || item.likeCount || 0,
        comments: item.reply_count || item.replyCount || 0,
        shares: item.retweet_count || item.retweetCount || 0,
        views: item.views_count || 0,
        publishedAt: item.created_at || null,
        hashtags: (item.entities?.hashtags || []).map(
          (h: any) => h.text || h
        ),
      }));
    case "youtube":
      return rawData.map((item) => ({
        externalId: item.id || "",
        contentType: "video",
        text: item.title || null,
        url: item.url || null,
        likes: item.likes || 0,
        comments: item.commentsCount || 0,
        shares: 0,
        views: item.viewCount || item.views || 0,
        publishedAt: safeParseDate(item.date || item.uploadDate || null),
        hashtags: extractHashtags(item.title || ""),
      }));
    case "facebook":
      return rawData.map((item) => ({
        externalId: item.postId || item.id || "",
        contentType: "post",
        text: item.text || item.message || null,
        url: item.url || null,
        likes: item.likes || item.reactionsCount || 0,
        comments: item.comments || item.commentsCount || 0,
        shares: item.shares || item.sharesCount || 0,
        views: 0,
        publishedAt: item.time || item.timestamp || null,
        hashtags: extractHashtags(item.text || item.message || ""),
      }));
    case "reddit":
      return rawData.map((item) => ({
        externalId: item.id || "",
        contentType: "thread",
        text: item.title || null,
        url: item.url || null,
        likes: item.upVotes || item.score || 0,
        comments: item.numberOfComments || item.numComments || 0,
        shares: 0,
        views: 0,
        publishedAt: item.createdAt || null,
        hashtags: [],
      }));
    default:
      return [];
  }
}

export function normalizeInfluencers(
  platform: Platform,
  rawData: any[]
): NormalizedInfluencer[] {
  const extractors: Record<Platform, (item: any) => NormalizedInfluencer | null> = {
    instagram: (item) => {
      // Instagram scraper returns posts from a profile. Each post has ownerUsername
      // (the profile being scraped). Only extract the actual profile owner, and use
      // the follower count directly from the profile-level field.
      const username = item.ownerUsername || "";
      if (!username) return null;
      // ownerFollowerCount (not ownerFollowersCount) is the profile-level field
      // from apify/instagram-scraper. Fall back to ownerFollowersCount.
      const followers = item.ownerFollowerCount || item.ownerFollowersCount || 0;
      return {
        username,
        displayName: item.ownerFullName || null,
        followers,
        engagementRate: 0,
        profileUrl: `https://www.instagram.com/${username}`,
        avatarUrl: item.ownerProfilePicUrl || null,
        bio: null,
        location: item.locationName || null,
        postCount: 0,
      };
    },
    tiktok: (item) => {
      const meta = item.authorMeta || {};
      const username = meta.name || item.author?.uniqueId || item.authorName || "";
      if (!username) return null;
      return {
        username,
        displayName: meta.nickName || meta.nickname || item.author?.nickname || null,
        followers: meta.fans || meta.followers || 0,
        engagementRate: 0,
        profileUrl: `https://www.tiktok.com/@${username}`,
        avatarUrl: meta.avatar || null,
        bio: meta.signature || null,
        location: meta.region || item.author?.region || null,
        postCount: 0,
      };
    },
    twitter: (item) => {
      const user = item.user || item.author || {};
      const username = user.screen_name || user.userName || item.username || "";
      if (!username) return null;
      return {
        username,
        displayName: user.name || user.displayName || null,
        followers: user.followers_count || user.followers || 0,
        engagementRate: 0,
        profileUrl: `https://x.com/${username}`,
        avatarUrl: user.profile_image_url_https || user.profileImageUrl || null,
        bio: user.description || null,
        location: user.location || null,
        postCount: 0,
      };
    },
    youtube: (item) => {
      const channelName = item.channelName || item.channelTitle || "";
      const channelUrl = item.channelUrl || "";
      if (!channelName) return null;
      return {
        username: channelName,
        displayName: channelName,
        followers: item.channelSubscribers || 0,
        engagementRate: 0,
        profileUrl: channelUrl || null,
        avatarUrl: item.channelThumbnail || null,
        bio: null,
        location: item.channelCountry || null,
        postCount: 0,
      };
    },
    facebook: (item) => {
      const username = item.pageName || item.userName || "";
      if (!username) return null;
      return {
        username,
        displayName: item.pageName || null,
        followers: item.pageLikes || item.pageFollowers || 0,
        engagementRate: 0,
        profileUrl: item.pageUrl || null,
        avatarUrl: null,
        bio: null,
        location: item.pageLocation || item.location || null,
        postCount: 0,
      };
    },
    reddit: (item) => {
      const username = item.author || item.username || "";
      if (!username || username === "[deleted]" || username === "AutoModerator") return null;
      return {
        username,
        displayName: null,
        followers: item.authorKarma || 0,
        engagementRate: 0,
        profileUrl: `https://www.reddit.com/user/${username}`,
        avatarUrl: null,
        bio: null,
        location: null,
        postCount: 0,
      };
    },
  };

  const extractor = extractors[platform];
  if (!extractor) return [];

  // Deduplicate by username, keeping highest followers and counting posts
  const byUsername = new Map<string, NormalizedInfluencer>();
  for (const item of rawData) {
    const inf = extractor(item);
    if (!inf || !inf.username) continue;
    const key = inf.username.toLowerCase();
    const existing = byUsername.get(key);
    if (!existing) {
      inf.postCount = 1;
      byUsername.set(key, inf);
    } else {
      existing.postCount++;
      if (inf.followers > existing.followers) {
        existing.followers = inf.followers;
        existing.displayName = inf.displayName || existing.displayName;
        existing.avatarUrl = inf.avatarUrl || existing.avatarUrl;
        existing.bio = inf.bio || existing.bio;
      }
      if (!existing.location && inf.location) {
        existing.location = inf.location;
      }
    }
  }

  return Array.from(byUsername.values());
}

function normalizeInstagramMetrics(rawData: any[]): NormalizedMetric {
  const totalLikes = rawData.reduce(
    (sum, item) => sum + (item.likesCount || 0),
    0
  );
  const totalComments = rawData.reduce(
    (sum, item) => sum + (item.commentsCount || 0),
    0
  );
  return {
    followers: rawData[0]?.ownerFollowerCount || 0,
    postsCount: rawData.length,
    engagementTotal: totalLikes + totalComments,
    avgLikes: rawData.length ? Math.round(totalLikes / rawData.length) : 0,
    avgComments: rawData.length
      ? Math.round(totalComments / rawData.length)
      : 0,
    avgShares: 0,
  };
}

function normalizeTikTokMetrics(rawData: any[]): NormalizedMetric {
  const totalLikes = rawData.reduce(
    (sum, item) => sum + (item.diggCount || item.likes || 0),
    0
  );
  const totalComments = rawData.reduce(
    (sum, item) => sum + (item.commentCount || item.comments || 0),
    0
  );
  const totalShares = rawData.reduce(
    (sum, item) => sum + (item.shareCount || item.shares || 0),
    0
  );
  return {
    followers: rawData[0]?.authorMeta?.fans || 0,
    postsCount: rawData.length,
    engagementTotal: totalLikes + totalComments + totalShares,
    avgLikes: rawData.length ? Math.round(totalLikes / rawData.length) : 0,
    avgComments: rawData.length
      ? Math.round(totalComments / rawData.length)
      : 0,
    avgShares: rawData.length ? Math.round(totalShares / rawData.length) : 0,
  };
}

function normalizeFacebookMetrics(rawData: any[]): NormalizedMetric {
  const totalLikes = rawData.reduce(
    (sum, item) => sum + (item.likes || item.reactionsCount || 0),
    0
  );
  const totalComments = rawData.reduce(
    (sum, item) => sum + (item.comments || item.commentsCount || 0),
    0
  );
  const totalShares = rawData.reduce(
    (sum, item) => sum + (item.shares || item.sharesCount || 0),
    0
  );
  return {
    followers: 0,
    postsCount: rawData.length,
    engagementTotal: totalLikes + totalComments + totalShares,
    avgLikes: rawData.length ? Math.round(totalLikes / rawData.length) : 0,
    avgComments: rawData.length
      ? Math.round(totalComments / rawData.length)
      : 0,
    avgShares: rawData.length ? Math.round(totalShares / rawData.length) : 0,
  };
}

function normalizeYouTubeMetrics(rawData: any[]): NormalizedMetric {
  const totalLikes = rawData.reduce(
    (sum, item) => sum + (item.likes || 0),
    0
  );
  const totalComments = rawData.reduce(
    (sum, item) => sum + (item.commentsCount || 0),
    0
  );
  return {
    followers: rawData[0]?.channelSubscribers || 0,
    postsCount: rawData.length,
    engagementTotal: totalLikes + totalComments,
    avgLikes: rawData.length ? Math.round(totalLikes / rawData.length) : 0,
    avgComments: rawData.length
      ? Math.round(totalComments / rawData.length)
      : 0,
    avgShares: 0,
  };
}

function normalizeTwitterMetrics(rawData: any[]): NormalizedMetric {
  const totalLikes = rawData.reduce(
    (sum, item) => sum + (item.favorite_count || item.likeCount || 0),
    0
  );
  const totalComments = rawData.reduce(
    (sum, item) => sum + (item.reply_count || item.replyCount || 0),
    0
  );
  const totalShares = rawData.reduce(
    (sum, item) => sum + (item.retweet_count || item.retweetCount || 0),
    0
  );
  return {
    followers: 0,
    postsCount: rawData.length,
    engagementTotal: totalLikes + totalComments + totalShares,
    avgLikes: rawData.length ? Math.round(totalLikes / rawData.length) : 0,
    avgComments: rawData.length
      ? Math.round(totalComments / rawData.length)
      : 0,
    avgShares: rawData.length ? Math.round(totalShares / rawData.length) : 0,
  };
}

function normalizeRedditMetrics(rawData: any[]): NormalizedMetric {
  const totalLikes = rawData.reduce(
    (sum, item) => sum + (item.upVotes || item.score || 0),
    0
  );
  const totalComments = rawData.reduce(
    (sum, item) => sum + (item.numberOfComments || item.numComments || 0),
    0
  );
  return {
    followers: 0,
    postsCount: rawData.length,
    engagementTotal: totalLikes + totalComments,
    avgLikes: rawData.length ? Math.round(totalLikes / rawData.length) : 0,
    avgComments: rawData.length
      ? Math.round(totalComments / rawData.length)
      : 0,
    avgShares: 0,
  };
}


function safeParseDate(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  
  // Already ISO format
  if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  
  // Strip "Premiered " prefix
  const cleaned = dateStr.replace(/^Premiered\s+/i, '').trim();
  
  // Try "Feb 5, 2026" or "February 5, 2026" format
  const directParse = new Date(cleaned);
  if (!isNaN(directParse.getTime()) && directParse.getFullYear() > 1990) {
    return directParse.toISOString();
  }
  
  // Relative dates: "2 days ago", "3 weeks ago", "1 month ago", "1 year ago"
  const relMatch = cleaned.match(/(\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago/i);
  if (relMatch) {
    const num = parseInt(relMatch[1]);
    const unit = relMatch[2].toLowerCase();
    const now = new Date();
    switch (unit) {
      case 'second': now.setSeconds(now.getSeconds() - num); break;
      case 'minute': now.setMinutes(now.getMinutes() - num); break;
      case 'hour': now.setHours(now.getHours() - num); break;
      case 'day': now.setDate(now.getDate() - num); break;
      case 'week': now.setDate(now.getDate() - num * 7); break;
      case 'month': now.setMonth(now.getMonth() - num); break;
      case 'year': now.setFullYear(now.getFullYear() - num); break;
    }
    return now.toISOString();
  }
  
  // "Streamed X days/hours ago" or just text we can't parse
  return null;
}

function extractHashtags(text: string): string[] {
  const matches = text.match(/#[\w\u0080-\uFFFF]+/g);
  return matches ? matches.map((h) => h.replace("#", "")) : [];
}
