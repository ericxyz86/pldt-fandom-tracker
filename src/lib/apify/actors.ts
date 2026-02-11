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
    actorId: "menoob/pldt-instagram-scraper",
    platform: "instagram",
    description: "Scrapes Instagram profiles, posts, and hashtags",
    buildInput: ({ handle, limit = 20 }) => ({
      directUrls: [`https://www.instagram.com/${handle.replace("@", "")}/`],
      resultsType: "posts",
      resultsLimit: limit,
    }),
  },
  tiktok: {
    actorId: "menoob/pldt-tiktok-scraper",
    platform: "tiktok",
    description: "Scrapes TikTok profiles, videos, and hashtags",
    buildInput: ({ handle, limit = 20 }) => ({
      profiles: [handle.replace("@", "")],
      resultsPerPage: limit,
      shouldDownloadVideos: false,
    }),
  },
  facebook: {
    actorId: "menoob/facebook-banking-scraper",
    platform: "facebook",
    description: "Scrapes Facebook page posts and engagement",
    buildInput: ({ handle, limit = 20 }) => ({
      startUrls: [{ url: `https://www.facebook.com/${handle}` }],
      resultsLimit: limit,
    }),
  },
  youtube: {
    actorId: "menoob/pldt-youtube-scraper",
    platform: "youtube",
    description: "Custom YouTube scraper via page data extraction",
    buildInput: ({ handle, limit = 20 }) => ({
      startUrls: [{ url: `https://www.youtube.com/@${handle}` }],
      maxResults: limit,
      type: "video",
    }),
  },
  twitter: {
    actorId: "menoob/pldt-twitter-scraper",
    platform: "twitter",
    description: "Scrapes tweets by keyword or hashtag",
    buildInput: ({ handle, keyword, limit = 20 }) => ({
      searchTerms: keyword ? [keyword] : [handle],
      maxTweets: limit,
      searchMode: "live",
    }),
  },
  reddit: {
    actorId: "menoob/pldt-reddit-scraper",
    platform: "reddit",
    description: "Custom Reddit scraper via public JSON API",
    buildInput: ({ handle, keyword, limit = 20 }) => ({
      startUrls: keyword
        ? [{ url: `https://www.reddit.com/search.json?q=${encodeURIComponent(keyword)}&sort=new&limit=${limit}` }]
        : [{ url: `https://www.reddit.com/search.json?q=${encodeURIComponent(handle)}&sort=new&limit=${limit}` }],
      maxItems: limit,
      sort: "new",
    }),
  },
  googleTrends: {
    actorId: "menoob/pldt-google-trends-scraper",
    platform: "instagram",
    description: "Scrapes Google Trends interest data (currently blocked)",
    buildInput: ({ keyword }) => ({
      searchTerms: keyword ? [keyword] : [],
      geo: "PH",
      timeRange: "past12Months",
      category: 0,
    }),
  },
};
