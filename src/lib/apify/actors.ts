import type { Platform } from "@/types/fandom";

export interface ActorConfig {
  actorId: string;
  platform: Platform;
  description: string;
  buildInput: (params: {
    handle: string;
    keyword?: string;
    limit?: number;
  }) => Record<string, unknown>;
}

export const actorConfigs: Record<string, ActorConfig> = {
  instagram: {
    actorId: "apify/instagram-scraper",
    platform: "instagram",
    description: "Scrapes Instagram profiles, posts, and hashtags",
    buildInput: ({ handle, limit = 100 }) => ({
      directUrls: [`https://www.instagram.com/${handle.replace("@", "")}/`],
      resultsType: "posts",
      resultsLimit: limit,
    }),
  },
  tiktok: {
    actorId: "clockworks/tiktok-scraper",
    platform: "tiktok",
    description: "Scrapes TikTok profiles, videos, and hashtags",
    buildInput: ({ handle, limit = 100 }) => ({
      profiles: [handle.replace("@", "")],
      resultsPerPage: limit,
      shouldDownloadVideos: false,
    }),
  },
  facebook: {
    actorId: "apify/facebook-posts-scraper",
    platform: "facebook",
    description: "Scrapes Facebook page posts and engagement",
    buildInput: ({ handle, limit = 100 }) => ({
      startUrls: [{ url: `https://www.facebook.com/${handle}` }],
      resultsLimit: limit,
    }),
  },
  youtube: {
    actorId: "menoob/pldt-youtube-scraper",
    platform: "youtube",
    description: "Custom YouTube scraper via Data API v3 — channels, videos, engagement",
    buildInput: ({ handle, limit = 50 }) => ({
      channelUrls: [`https://www.youtube.com/@${handle}`],
      maxVideos: limit,
    }),
  },
  twitter: {
    actorId: "apidojo/tweet-scraper",
    platform: "twitter",
    description: "Scrapes tweets by keyword or hashtag",
    buildInput: ({ handle, keyword, limit = 500 }) => ({
      searchTerms: keyword ? [keyword] : [handle],
      maxTweets: limit,
      searchMode: "live",
    }),
  },
  reddit: {
    actorId: "menoob/pldt-reddit-scraper",
    platform: "reddit",
    description: "Custom Reddit scraper via public JSON API — search and subreddit posts",
    buildInput: ({ handle, keyword, limit = 100 }) => ({
      searchQuery: keyword || handle,
      subreddits: [],
      maxResults: limit,
    }),
  },
  googleTrends: {
    actorId: "apify/google-trends-scraper",
    platform: "instagram", // placeholder, trends are cross-platform
    description: "Scrapes Google Trends interest data",
    buildInput: ({ keyword }) => ({
      searchTerms: keyword ? [keyword] : [],
      geo: "PH",
      timeRange: "past12Months",
      category: 0,
    }),
  },
};
