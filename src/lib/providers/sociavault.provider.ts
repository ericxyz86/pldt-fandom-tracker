import type { Platform } from "@/types/fandom";
import type { ScrapeProvider, ScrapeParams, ProviderResult } from "./types";

/**
 * SociaVault provider — calls the SociaVault API via the monitor proxy.
 *
 * Supports all 6 platforms: Reddit, TikTok, Instagram, YouTube, Twitter, Facebook.
 *
 * Endpoints used (via monitor proxy):
 *   - TikTok:    /tiktok/profile?handle=...
 *   - Instagram: /instagram/posts?handle=...
 *   - YouTube:   /youtube/channel?handle=... + /youtube/channel-videos?handle=...
 *   - Twitter:   /twitter/user-tweets?handle=...
 *   - Facebook:  /facebook/profile/posts?url=...
 *   - Reddit:    /reddit/search?query=...
 */

const MONITOR_APP_NAME = "pldt-fandom";

// Timeout for SociaVault API calls (30 seconds)
const SOCIAVAULT_TIMEOUT_MS = 30000;

function getSociavaultApiKey(): string {
  return process.env.SOCIAVAULT_API_KEY || "";
}

function getMonitorProxyUrl(): string {
  return process.env.MONITOR_PROXY_URL || "http://sociavault-monitor:3080";
}

function getMonitorApiKey(): string {
  const key = process.env.MONITOR_API_KEY;
  if (!key) throw new Error("MONITOR_API_KEY environment variable is required");
  return key;
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

/** Standard headers for all SociaVault requests */
function getHeaders(): Record<string, string> {
  return {
    "X-API-Key": getSociavaultApiKey(),
    "X-App-Name": MONITOR_APP_NAME,
    "X-Monitor-Key": getMonitorApiKey(),
    "Content-Type": "application/json",
  };
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

/**
 * Helper: call a SociaVault endpoint and return parsed JSON data.
 * Throws on HTTP errors or API-level errors.
 */
async function callSociavault(
  path: string,
  queryParams: Record<string, string>,
  label: string
): Promise<Record<string, unknown>> {
  const url = buildProxyUrl(path, queryParams);
  console.log(`[SociaVault] ${label}: ${url}`);

  const response = await fetchWithTimeout(
    url,
    { method: "GET", headers: getHeaders() },
    SOCIAVAULT_TIMEOUT_MS
  );

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`SociaVault API returned ${response.status}: ${errorText}`);
  }

  const json = (await response.json()) as Record<string, unknown>;

  if (!(json.success as boolean)) {
    throw new Error(`SociaVault API error: ${JSON.stringify(json)}`);
  }

  const data = json.data as Record<string, unknown>;
  if (!data) {
    throw new Error("SociaVault response missing 'data' field");
  }

  return data;
}

/**
 * Convert SociaVault indexed-object responses ({ "0": {...}, "1": {...} }) to arrays.
 * Also handles cases where the value is already an array or null/undefined.
 */
function indexedObjectToArray(obj: unknown): Record<string, unknown>[] {
  if (!obj || typeof obj !== "object") return [];
  if (Array.isArray(obj)) return obj as Record<string, unknown>[];
  const record = obj as Record<string, unknown>;
  const keys = Object.keys(record).sort((a, b) => Number(a) - Number(b));
  return keys
    .filter((k) => /^\d+$/.test(k))
    .map((k) => record[k] as Record<string, unknown>)
    .filter((v) => v && typeof v === "object");
}

// ─────────────────────────────────────────────────────────
// Reddit (existing implementation, unchanged)
// ─────────────────────────────────────────────────────────

/**
 * Normalize SociaVault Reddit response into the format expected by normalize.ts.
 * SociaVault returns raw Reddit JSON API data with posts as indexed objects.
 */
function normalizeSociavaultRedditPosts(data: Record<string, unknown>): Record<string, unknown>[] {
  const posts = data.posts as Record<string, unknown> | undefined;
  if (!posts) return [];

  const items = indexedObjectToArray(posts);
  return items.map((post) => ({
    id: post.id || "",
    title: post.title || "",
    selftext: post.selftext || "",
    url: post.url || (post.permalink ? `https://www.reddit.com${post.permalink}` : ""),
    permalink: post.permalink || "",
    upVotes: post.score || post.ups || 0,
    score: post.score || post.ups || 0,
    numberOfComments: post.num_comments || 0,
    numComments: post.num_comments || 0,
    author: post.author || "",
    subreddit: post.subreddit || "",
    createdAt: post.created_at_iso ||
      (post.created_utc
        ? new Date((post.created_utc as number) * 1000).toISOString()
        : null),
    created_utc: post.created_utc || 0,
    subreddit_subscribers: post.subreddit_subscribers || 0,
  }));
}

async function scrapeReddit(params: ScrapeParams): Promise<ProviderResult> {
  const query = params.keyword || params.handle;
  const limit = params.limit || 20;

  const data = await callSociavault(
    "/reddit/search",
    { query, sort: "new", limit: String(limit) },
    `Fetching Reddit search for "${query}" (limit: ${limit})`
  );

  const items = normalizeSociavaultRedditPosts(data);
  console.log(`[SociaVault] Got ${items.length} Reddit posts for "${query}"`);

  return { success: items.length > 0, items, source: "sociavault" };
}

// ─────────────────────────────────────────────────────────
// TikTok
// ─────────────────────────────────────────────────────────

/**
 * Normalize SociaVault TikTok profile response to match Apify TikTok scraper output.
 *
 * SociaVault returns: { user: {...}, stats: {...}, statsV2: {...}, itemList: {...} }
 * Normalize.ts expects items with:
 *   id, text/desc, webVideoUrl, diggCount, commentCount, shareCount, playCount,
 *   createTime, hashtags, authorMeta { name, nickName, fans, avatar, signature, region }
 *   + type:'profile' item with followerCount for metrics
 */
function normalizeTikTokProfile(data: Record<string, unknown>): Record<string, unknown>[] {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const user = (data.user || {}) as any;
  const stats = (data.stats || data.statsV2 || {}) as any;
  const itemList = data.itemList;

  // Build authorMeta from profile data (injected into each video item)
  const authorMeta = {
    name: user.uniqueId || "",
    nickName: user.nickname || "",
    nickname: user.nickname || "",
    fans: parseInt(stats.followerCount) || 0,
    followers: parseInt(stats.followerCount) || 0,
    avatar: user.avatarLarger || user.avatarMedium || "",
    signature: user.signature || "",
    region: user.language || "",
  };

  const items: Record<string, unknown>[] = [];

  // Add a synthetic profile item for follower metrics extraction
  items.push({
    type: "profile",
    followerCount: parseInt(stats.followerCount) || 0,
    fans: parseInt(stats.followerCount) || 0,
    heartCount: parseInt(stats.heartCount || stats.heart) || 0,
    videoCount: parseInt(stats.videoCount) || 0,
    authorMeta,
  });

  // Extract video items from itemList (may be indexed object or array or empty {})
  const videos = indexedObjectToArray(itemList);
  for (const video of videos) {
    const videoStats = (video.stats || {}) as any;
    items.push({
      id: video.id || "",
      text: video.desc || video.title || "",
      desc: video.desc || video.title || "",
      webVideoUrl: video.video
        ? `https://www.tiktok.com/@${user.uniqueId || ""}/video/${video.id}`
        : "",
      diggCount: videoStats.diggCount || video.diggCount || 0,
      likes: videoStats.diggCount || video.diggCount || 0,
      commentCount: videoStats.commentCount || video.commentCount || 0,
      comments: videoStats.commentCount || video.commentCount || 0,
      shareCount: videoStats.shareCount || video.shareCount || 0,
      shares: videoStats.shareCount || video.shareCount || 0,
      playCount: videoStats.playCount || video.playCount || 0,
      views: videoStats.playCount || video.playCount || 0,
      createTime: video.createTime || 0,
      hashtags: indexedObjectToArray(video.challenges || video.textExtra)
        .map((h: any) => ({ name: h.hashtagName || h.title || h.name || "" }))
        .filter((h: any) => h.name),
      authorMeta,
    });
  }

  return items;
}

async function scrapeTikTok(params: ScrapeParams): Promise<ProviderResult> {
  const handle = params.handle.replace("@", "");

  console.log(`[SociaVault] Fetching TikTok profile for "${handle}"`);
  const data = await callSociavault(
    "/tiktok/profile",
    { handle },
    `TikTok profile for @${handle}`
  );

  const items = normalizeTikTokProfile(data);
  console.log(`[SociaVault] Got ${items.length} TikTok items for "${handle}" (1 profile + ${items.length - 1} videos)`);

  return { success: items.length > 0, items, source: "sociavault" };
}

// ─────────────────────────────────────────────────────────
// Instagram
// ─────────────────────────────────────────────────────────

/**
 * Normalize SociaVault Instagram posts response to match Apify Instagram scraper output.
 *
 * SociaVault /instagram/posts returns: { items: [...], user: {...}, next_max_id }
 * Each item has IG internal format (caption_text, like_count, comment_count, etc.)
 *
 * Normalize.ts expects:
 *   id, shortCode, type, caption, url, likesCount, commentsCount,
 *   videoViewCount, timestamp, ownerUsername, ownerFullName,
 *   ownerFollowerCount, ownerFollowersCount, ownerProfilePicUrl
 */
function normalizeInstagramPosts(data: Record<string, unknown>): Record<string, unknown>[] {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const rawItems = data.items;
  const user = (data.user || {}) as any;

  const ownerUsername = user.username || "";
  const ownerFullName = user.full_name || "";
  const ownerFollowerCount = user.follower_count || 0;
  const ownerProfilePicUrl = user.profile_pic_url || "";

  const posts = indexedObjectToArray(rawItems);

  return posts.map((item: any) => {
    // Caption can be nested in caption.text or directly in caption_text
    const captionObj = item.caption as any;
    const caption = (captionObj && typeof captionObj === "object")
      ? captionObj.text || ""
      : item.caption_text || item.caption || "";

    // Determine type
    const mediaType = item.media_type;
    const isVideo = mediaType === 2 || item.video_versions;
    const type = isVideo ? "Video" : "Image";

    return {
      id: item.pk || item.id || "",
      shortCode: item.code || "",
      type,
      caption,
      url: item.code ? `https://www.instagram.com/p/${item.code}/` : "",
      likesCount: item.like_count || 0,
      commentsCount: item.comment_count || 0,
      videoViewCount: item.play_count || item.view_count || 0,
      timestamp: item.taken_at
        ? new Date((item.taken_at as number) * 1000).toISOString()
        : null,
      ownerUsername: item.user?.username || ownerUsername,
      ownerFullName: item.user?.full_name || ownerFullName,
      ownerFollowerCount: ownerFollowerCount,
      ownerFollowersCount: ownerFollowerCount,
      ownerProfilePicUrl: item.user?.profile_pic_url || ownerProfilePicUrl,
      locationName: item.location?.name || null,
    };
  });
}

/**
 * Fallback: normalize Instagram profile response (when /posts is unavailable).
 * SociaVault /instagram/profile returns nested edge format.
 */
function normalizeInstagramProfileFallback(data: Record<string, unknown>): Record<string, unknown>[] {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const nestedData = (data.data || data) as any;
  const user = nestedData.user || nestedData;

  const ownerUsername = user.username || "";
  const ownerFullName = user.full_name || "";
  const ownerFollowerCount = user.edge_followed_by?.count || 0;
  const ownerProfilePicUrl = user.profile_pic_url_hd || user.profile_pic_url || "";

  const edges = user.edge_owner_to_timeline_media?.edges || [];
  const edgeArray = indexedObjectToArray(edges);

  return edgeArray.map((edge: any) => {
    const node = edge.node || edge;
    const caption = node.edge_media_to_caption?.edges?.[0]?.node?.text ||
      node.edge_media_to_caption?.edges?.["0"]?.node?.text || "";
    const isVideo = node.is_video || node.__typename === "GraphVideo";

    return {
      id: node.id || "",
      shortCode: node.shortcode || "",
      type: isVideo ? "Video" : "Image",
      caption,
      url: node.shortcode ? `https://www.instagram.com/p/${node.shortcode}/` : "",
      likesCount: node.edge_liked_by?.count || node.edge_media_preview_like?.count || 0,
      commentsCount: node.edge_media_to_comment?.count || 0,
      videoViewCount: node.video_view_count || 0,
      timestamp: node.taken_at_timestamp
        ? new Date((node.taken_at_timestamp as number) * 1000).toISOString()
        : null,
      ownerUsername,
      ownerFullName,
      ownerFollowerCount,
      ownerFollowersCount: ownerFollowerCount,
      ownerProfilePicUrl,
    };
  });
}

async function scrapeInstagram(params: ScrapeParams): Promise<ProviderResult> {
  const handle = params.handle.replace("@", "");

  // Primary: use /instagram/posts for cleaner item-level data
  try {
    console.log(`[SociaVault] Fetching Instagram posts for "${handle}"`);
    const data = await callSociavault(
      "/instagram/posts",
      { handle },
      `Instagram posts for @${handle}`
    );

    const items = normalizeInstagramPosts(data);
    console.log(`[SociaVault] Got ${items.length} Instagram posts for "${handle}"`);

    if (items.length > 0) {
      return { success: true, items, source: "sociavault" };
    }
  } catch (postsErr) {
    console.log(`[SociaVault] Instagram /posts failed for "${handle}", trying /profile fallback:`, postsErr instanceof Error ? postsErr.message : postsErr);
  }

  // Fallback: use /instagram/profile and extract from edge data
  console.log(`[SociaVault] Fetching Instagram profile for "${handle}" (fallback)`);
  const profileData = await callSociavault(
    "/instagram/profile",
    { handle },
    `Instagram profile for @${handle} (fallback)`
  );

  const items = normalizeInstagramProfileFallback(profileData);
  console.log(`[SociaVault] Got ${items.length} Instagram items from profile for "${handle}"`);

  return { success: items.length > 0, items, source: "sociavault" };
}

// ─────────────────────────────────────────────────────────
// YouTube
// ─────────────────────────────────────────────────────────

/**
 * Normalize SociaVault YouTube channel + channel-videos response.
 *
 * Channel endpoint returns: { channelId, name, handle, subscriberCount, videoCount, viewCount, country, avatar, ... }
 * Channel-videos endpoint returns: { videos: { "0": {...}, "1": {...} } } or similar
 *
 * Normalize.ts expects items with:
 *   id, title, url, likes, commentsCount, viewCount/views, date/uploadDate,
 *   channelName/channelTitle, channelUrl, channelSubscribers, channelThumbnail, channelCountry
 */
function normalizeYouTubeVideos(
  videos: Record<string, unknown>[],
  channelMeta: { name: string; url: string; subscribers: number; country: string; thumbnail: string }
): Record<string, unknown>[] {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  return videos.map((video: any) => {
    const videoId = video.videoId || video.id || "";
    return {
      id: videoId,
      title: video.title || "",
      url: videoId ? `https://www.youtube.com/watch?v=${videoId}` : video.url || "",
      likes: video.likes || 0,
      commentsCount: video.comments || video.commentsCount || 0,
      viewCount: video.viewCount || video.views || 0,
      views: video.viewCount || video.views || 0,
      date: video.publishedTimeText || video.publishDate || video.date || null,
      uploadDate: video.publishDate || video.date || null,
      // Inject channel metadata into every video item (normalize.ts reads these)
      channelName: channelMeta.name,
      channelTitle: channelMeta.name,
      channelUrl: channelMeta.url,
      channelSubscribers: channelMeta.subscribers,
      channelThumbnail: channelMeta.thumbnail,
      channelCountry: channelMeta.country,
      // Extra fields
      duration: video.lengthText || video.duration || null,
      description: video.descriptionSnippet || video.description || null,
    };
  });
}

async function scrapeYouTube(params: ScrapeParams): Promise<ProviderResult> {
  const handle = params.handle.replace("@", "");

  // Step 1: Get channel metadata
  console.log(`[SociaVault] Fetching YouTube channel for "${handle}"`);
  const channelData = await callSociavault(
    "/youtube/channel",
    { handle },
    `YouTube channel for @${handle}`
  );

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const avatarSources = (channelData.avatar as any)?.image?.sources;
  const thumbnail = avatarSources
    ? (indexedObjectToArray(avatarSources)[0] as any)?.url || ""
    : "";

  const channelMeta = {
    name: (channelData.name as string) || "",
    url: (channelData.channel as string) || `https://www.youtube.com/@${handle}`,
    subscribers: parseInt(String(channelData.subscriberCount)) || 0,
    country: (channelData.country as string) || "",
    thumbnail,
  };

  // Step 2: Get recent videos
  let videoItems: Record<string, unknown>[] = [];
  try {
    console.log(`[SociaVault] Fetching YouTube channel-videos for "${handle}"`);
    const videosData = await callSociavault(
      "/youtube/channel-videos",
      { handle },
      `YouTube channel-videos for @${handle}`
    );

    // Videos may be in data.videos (indexed object) or data directly
    const rawVideos = videosData.videos || videosData.items || videosData;
    videoItems = indexedObjectToArray(rawVideos);
  } catch (videosErr) {
    console.log(`[SociaVault] YouTube channel-videos failed for "${handle}":`, videosErr instanceof Error ? videosErr.message : videosErr);
  }

  const items = normalizeYouTubeVideos(videoItems, channelMeta);

  // If no videos found, still return a synthetic item with channel metadata
  // so the metrics normalizer can at least extract subscriber count
  if (items.length === 0) {
    items.push({
      id: channelData.channelId || "",
      title: `${channelMeta.name} - Channel`,
      url: channelMeta.url,
      likes: 0,
      commentsCount: 0,
      viewCount: parseInt(String(channelData.viewCount)) || 0,
      views: parseInt(String(channelData.viewCount)) || 0,
      date: null,
      channelName: channelMeta.name,
      channelTitle: channelMeta.name,
      channelUrl: channelMeta.url,
      channelSubscribers: channelMeta.subscribers,
      channelThumbnail: channelMeta.thumbnail,
      channelCountry: channelMeta.country,
    });
  }

  console.log(`[SociaVault] Got ${items.length} YouTube items for "${handle}" (subs: ${channelMeta.subscribers})`);

  return { success: items.length > 0, items, source: "sociavault" };
}

// ─────────────────────────────────────────────────────────
// Twitter / X
// ─────────────────────────────────────────────────────────

/**
 * Normalize SociaVault Twitter user-tweets response to match Apify Twitter scraper output.
 *
 * SociaVault /twitter/user-tweets returns: { tweets: { "0": {...}, "1": {...} } }
 * Each tweet has Twitter's internal GraphQL format with:
 *   __typename, rest_id, core.user_results.result.legacy, legacy (tweet data)
 *
 * Normalize.ts expects:
 *   id, full_text/text, url, favorite_count/likeCount, reply_count/replyCount,
 *   retweet_count/retweetCount, views_count, created_at, entities.hashtags[].text,
 *   user { screen_name, name, followers_count, profile_image_url_https, description, location }
 */
function normalizeTwitterTweets(data: Record<string, unknown>): Record<string, unknown>[] {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const tweets = data.tweets || data;
  const tweetArray = indexedObjectToArray(tweets);

  return tweetArray.map((tweet: any) => {
    // Twitter GraphQL format: tweet data in .legacy, user in .core.user_results.result.legacy
    const tweetLegacy = tweet.legacy || tweet;
    const userResult = tweet.core?.user_results?.result || {};
    const userLegacy = userResult.legacy || {};

    const restId = tweet.rest_id || tweetLegacy.id_str || tweetLegacy.id || "";
    const screenName = userLegacy.screen_name || tweetLegacy.screen_name || "";

    // Extract hashtags from entities
    const entities = tweetLegacy.entities || {};
    const hashtagsRaw = entities.hashtags;
    const hashtags = indexedObjectToArray(hashtagsRaw).map((h: any) => ({
      text: h.text || h.tag || "",
    }));

    // View count from tweet_results or ext_views
    const viewCount = tweet.views?.count
      || tweetLegacy.ext_views?.count
      || 0;

    return {
      id: restId,
      full_text: tweetLegacy.full_text || tweetLegacy.text || "",
      text: tweetLegacy.full_text || tweetLegacy.text || "",
      url: screenName && restId
        ? `https://x.com/${screenName}/status/${restId}`
        : "",
      favorite_count: tweetLegacy.favorite_count || 0,
      likeCount: tweetLegacy.favorite_count || 0,
      reply_count: tweetLegacy.reply_count || 0,
      replyCount: tweetLegacy.reply_count || 0,
      retweet_count: tweetLegacy.retweet_count || 0,
      retweetCount: tweetLegacy.retweet_count || 0,
      views_count: parseInt(String(viewCount)) || 0,
      created_at: tweetLegacy.created_at || null,
      entities: { hashtags },
      user: {
        screen_name: screenName,
        userName: screenName,
        name: userLegacy.name || "",
        displayName: userLegacy.name || "",
        followers_count: userLegacy.followers_count || userLegacy.normal_followers_count || 0,
        followers: userLegacy.followers_count || userLegacy.normal_followers_count || 0,
        profile_image_url_https: userLegacy.profile_image_url_https || "",
        profileImageUrl: userLegacy.profile_image_url_https || "",
        description: userLegacy.description || "",
        location: userLegacy.location || "",
      },
    };
  });
}

async function scrapeTwitter(params: ScrapeParams): Promise<ProviderResult> {
  const handle = params.handle.replace("@", "");

  console.log(`[SociaVault] Fetching Twitter user-tweets for "${handle}"`);
  const data = await callSociavault(
    "/twitter/user-tweets",
    { handle },
    `Twitter user-tweets for @${handle}`
  );

  const items = normalizeTwitterTweets(data);
  console.log(`[SociaVault] Got ${items.length} Twitter tweets for "${handle}"`);

  return { success: items.length > 0, items, source: "sociavault" };
}

// ─────────────────────────────────────────────────────────
// Facebook
// ─────────────────────────────────────────────────────────

/**
 * Normalize SociaVault Facebook profile-posts response to match Apify Facebook scraper output.
 *
 * SociaVault /facebook/profile/posts returns:
 *   { posts: { "0": { id, text, url, permalink, author: { name, id }, videoDetails?, ... } } }
 *
 * Normalize.ts expects:
 *   postId/id, text/message, url, likes/reactionsCount, comments/commentsCount,
 *   shares/sharesCount, time/timestamp, pageName/userName, pageLikes/pageFollowers,
 *   pageUrl, pageLocation/location
 */
function normalizeFacebookPosts(data: Record<string, unknown>): Record<string, unknown>[] {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const posts = data.posts || data;
  const postArray = indexedObjectToArray(posts);

  return postArray.map((post: any) => {
    const author = post.author || {};

    // Reactions/engagement can be in various shapes
    const reactionCount = post.reaction_count?.count || post.reactions?.count || post.likes || 0;
    const commentCount = post.comment_count?.total_count || post.comments?.count || post.comments || 0;
    const shareCount = post.share_count?.count || post.reshare_count?.count || post.shares || 0;

    return {
      postId: post.id || "",
      id: post.id || "",
      text: post.text || post.message || "",
      message: post.text || post.message || "",
      url: post.url || post.permalink || "",
      likes: typeof reactionCount === "number" ? reactionCount : parseInt(String(reactionCount)) || 0,
      reactionsCount: typeof reactionCount === "number" ? reactionCount : parseInt(String(reactionCount)) || 0,
      comments: typeof commentCount === "number" ? commentCount : parseInt(String(commentCount)) || 0,
      commentsCount: typeof commentCount === "number" ? commentCount : parseInt(String(commentCount)) || 0,
      shares: typeof shareCount === "number" ? shareCount : parseInt(String(shareCount)) || 0,
      sharesCount: typeof shareCount === "number" ? shareCount : parseInt(String(shareCount)) || 0,
      time: post.timestamp || post.created_time || null,
      timestamp: post.timestamp || post.created_time || null,
      pageName: author.name || author.short_name || "",
      userName: author.name || author.short_name || "",
      pageLikes: 0, // Not available in posts endpoint
      pageFollowers: 0,
      pageUrl: author.id ? `https://www.facebook.com/${author.id}` : "",
      pageLocation: "",
      location: "",
    };
  });
}

async function scrapeFacebook(params: ScrapeParams): Promise<ProviderResult> {
  const handle = params.handle;
  // Facebook endpoints use 'url' param, so construct the page URL
  const fbUrl = handle.startsWith("http")
    ? handle
    : `https://www.facebook.com/${handle}`;

  console.log(`[SociaVault] Fetching Facebook profile-posts for "${handle}"`);
  const data = await callSociavault(
    "/facebook/profile/posts",
    { url: fbUrl },
    `Facebook profile-posts for ${handle}`
  );

  const items = normalizeFacebookPosts(data);
  console.log(`[SociaVault] Got ${items.length} Facebook posts for "${handle}"`);

  return { success: items.length > 0, items, source: "sociavault" };
}

// ─────────────────────────────────────────────────────────
// Provider export
// ─────────────────────────────────────────────────────────

export const sociavaultProvider: ScrapeProvider = {
  name: "sociavault",

  supports(platform: Platform): boolean {
    return ["reddit", "tiktok", "instagram", "youtube", "twitter", "facebook"].includes(platform);
  },

  async scrape(platform: Platform, params: ScrapeParams): Promise<ProviderResult> {
    try {
      switch (platform) {
        case "reddit":
          return await scrapeReddit(params);
        case "tiktok":
          return await scrapeTikTok(params);
        case "instagram":
          return await scrapeInstagram(params);
        case "youtube":
          return await scrapeYouTube(params);
        case "twitter":
          return await scrapeTwitter(params);
        case "facebook":
          return await scrapeFacebook(params);
        default:
          return {
            success: false,
            items: [],
            source: "sociavault",
            error: `SociaVault does not support platform: ${platform}`,
          };
      }
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
