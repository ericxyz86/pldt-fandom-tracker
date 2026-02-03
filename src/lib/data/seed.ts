import type { FandomTier, Platform, DemographicTag } from "@/types/fandom";

export interface SeedFandom {
  name: string;
  slug: string;
  tier: FandomTier;
  description: string;
  fandomGroup: string;
  demographicTags: DemographicTag[];
  platforms: { platform: Platform; handle: string; url: string }[];
}

export const seedFandoms: SeedFandom[] = [
  // === EMERGING FANDOMS ===
  {
    name: "KAIA Fans",
    slug: "kaia-fans",
    tier: "emerging",
    description:
      "Fast-growing fandom for KAIA, a rising P-Pop girl group gaining traction on social media.",
    fandomGroup: "P-Pop",
    demographicTags: ["gen_z", "abc"],
    platforms: [
      {
        platform: "instagram",
        handle: "@kaia_official",
        url: "https://www.instagram.com/kaia_official",
      },
      {
        platform: "tiktok",
        handle: "@kaia_official",
        url: "https://www.tiktok.com/@kaia_official",
      },
      {
        platform: "twitter",
        handle: "@KAIA_offcl",
        url: "https://twitter.com/KAIA_offcl",
      },
    ],
  },
  {
    name: "G22 Fans",
    slug: "g22-fans",
    tier: "emerging",
    description:
      "Fans of G22, a Filipino girl group known for their hip-hop and R&B sound.",
    fandomGroup: "P-Pop",
    demographicTags: ["gen_z", "abc"],
    platforms: [
      {
        platform: "instagram",
        handle: "@g22official",
        url: "https://www.instagram.com/g22official",
      },
      {
        platform: "tiktok",
        handle: "@g22official",
        url: "https://www.tiktok.com/@g22official",
      },
      {
        platform: "youtube",
        handle: "G22Official",
        url: "https://www.youtube.com/@G22Official",
      },
    ],
  },
  {
    name: "r/DragRacePhilippines",
    slug: "drag-race-philippines",
    tier: "emerging",
    description:
      "Online community around Drag Race Philippines, active on Reddit and social media.",
    fandomGroup: "Drag Race",
    demographicTags: ["gen_z", "gen_y", "abc"],
    platforms: [
      {
        platform: "reddit",
        handle: "r/DragRacePhilippines",
        url: "https://www.reddit.com/r/DragRacePhilippines",
      },
      {
        platform: "instagram",
        handle: "@dragraceph",
        url: "https://www.instagram.com/dragraceph",
      },
      {
        platform: "tiktok",
        handle: "@dragraceph",
        url: "https://www.tiktok.com/@dragraceph",
      },
    ],
  },

  // === TRENDING FANDOMS ===
  {
    name: "BTS ARMY",
    slug: "bts-army",
    tier: "trending",
    description:
      "One of the largest global fandoms. BTS ARMY in the Philippines is extremely active with viral content creation and offline events.",
    fandomGroup: "K-POP",
    demographicTags: ["gen_z", "gen_y", "abc", "cde"],
    platforms: [
      {
        platform: "twitter",
        handle: "#BTS_ARMY_PH",
        url: "https://twitter.com/search?q=%23BTS_ARMY_PH",
      },
      {
        platform: "tiktok",
        handle: "#BTSPhilippines",
        url: "https://www.tiktok.com/tag/btsphilippines",
      },
      {
        platform: "facebook",
        handle: "BTS ARMY Philippines",
        url: "https://www.facebook.com/groups/btsarmyph",
      },
    ],
  },
  {
    name: "NewJeans Bunnies",
    slug: "newjeans-bunnies",
    tier: "trending",
    description:
      "Rapidly growing fandom for NewJeans, a K-Pop group hugely popular with Gen Z in the Philippines.",
    fandomGroup: "K-POP",
    demographicTags: ["gen_z", "abc"],
    platforms: [
      {
        platform: "tiktok",
        handle: "#NewJeansPH",
        url: "https://www.tiktok.com/tag/newjeansph",
      },
      {
        platform: "twitter",
        handle: "#NewJeans_PH",
        url: "https://twitter.com/search?q=%23NewJeans_PH",
      },
      {
        platform: "instagram",
        handle: "@newjeans_official",
        url: "https://www.instagram.com/newjeans_official",
      },
    ],
  },
  {
    name: "SEVENTEEN CARAT",
    slug: "seventeen-carat",
    tier: "trending",
    description:
      "CARAT is the dedicated fandom of SEVENTEEN, known for organized fan events and strong social media presence in PH.",
    fandomGroup: "K-POP",
    demographicTags: ["gen_z", "gen_y", "abc"],
    platforms: [
      {
        platform: "twitter",
        handle: "#CARAT_PH",
        url: "https://twitter.com/search?q=%23CARAT_PH",
      },
      {
        platform: "tiktok",
        handle: "#SeventeenPH",
        url: "https://www.tiktok.com/tag/seventeenph",
      },
      {
        platform: "facebook",
        handle: "SEVENTEEN CARAT PH",
        url: "https://www.facebook.com/groups/caratph",
      },
    ],
  },

  // === EXISTING FANDOMS ===
  {
    name: "AlDub Nation",
    slug: "aldub-nation",
    tier: "existing",
    description:
      "One of the most iconic Filipino fandoms, centered around the AlDub love team. Loyal, Facebook-heavy, CDE-skewing.",
    fandomGroup: "Local Entertainment",
    demographicTags: ["gen_y", "cde"],
    platforms: [
      {
        platform: "facebook",
        handle: "AlDub Nation",
        url: "https://www.facebook.com/groups/aldubnation",
      },
      {
        platform: "twitter",
        handle: "#AlDubNation",
        url: "https://twitter.com/search?q=%23AlDubNation",
      },
      {
        platform: "youtube",
        handle: "AlDub",
        url: "https://www.youtube.com/results?search_query=aldub",
      },
    ],
  },
  {
    name: "SB19 A'TIN",
    slug: "sb19-atin",
    tier: "existing",
    description:
      "A'TIN is the fandom of SB19, the pioneering Filipino boy group. Cross-class appeal, strong on all platforms.",
    fandomGroup: "P-Pop",
    demographicTags: ["gen_z", "gen_y", "abc", "cde"],
    platforms: [
      {
        platform: "twitter",
        handle: "@SB19Official",
        url: "https://twitter.com/SB19Official",
      },
      {
        platform: "youtube",
        handle: "SB19 Official",
        url: "https://www.youtube.com/@SB19Official",
      },
      {
        platform: "facebook",
        handle: "SB19 Official",
        url: "https://www.facebook.com/SB19Official",
      },
      {
        platform: "tiktok",
        handle: "@sb19official",
        url: "https://www.tiktok.com/@sb19official",
      },
    ],
  },
  {
    name: "BINI Blooms",
    slug: "bini-blooms",
    tier: "existing",
    description:
      "BINI is one of the most popular P-Pop girl groups in the Philippines with massive TikTok and YouTube reach.",
    fandomGroup: "P-Pop",
    demographicTags: ["gen_z", "abc", "cde"],
    platforms: [
      {
        platform: "tiktok",
        handle: "@baborealive",
        url: "https://www.tiktok.com/@baborealive",
      },
      {
        platform: "youtube",
        handle: "BINI Official",
        url: "https://www.youtube.com/@BINIph",
      },
      {
        platform: "instagram",
        handle: "@baborealive",
        url: "https://www.instagram.com/baborealive",
      },
      {
        platform: "twitter",
        handle: "@BINI_ph",
        url: "https://twitter.com/BINI_ph",
      },
    ],
  },
  {
    name: "ALAMAT Fans",
    slug: "alamat-fans",
    tier: "existing",
    description:
      "Fandom for ALAMAT, a multilingual P-Pop boy group representing various Philippine regions and languages.",
    fandomGroup: "P-Pop",
    demographicTags: ["gen_z", "cde"],
    platforms: [
      {
        platform: "youtube",
        handle: "ALAMAT Official",
        url: "https://www.youtube.com/@ALAMATOfficial",
      },
      {
        platform: "twitter",
        handle: "@ALAMAT_official",
        url: "https://twitter.com/ALAMAT_official",
      },
      {
        platform: "facebook",
        handle: "ALAMAT Official",
        url: "https://www.facebook.com/ALAMATofficial",
      },
    ],
  },
];
