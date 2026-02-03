import { db } from "../src/lib/db";
import { fandoms, influencers } from "../src/lib/db/schema";
import { sql } from "drizzle-orm";

// Seed realistic influencer data based on actual PH fandom fan accounts
const INFLUENCER_DATA: Record<string, Array<{
  username: string;
  displayName: string;
  platform: "tiktok" | "instagram" | "twitter" | "youtube";
  followers: number;
  engagementRate: number;
  relevanceScore: number;
  bio: string;
}>> = {
  "BINI Blooms": [
    { username: "biniblooms_official", displayName: "BINI Blooms", platform: "tiktok", followers: 285000, engagementRate: 8.5, relevanceScore: 95, bio: "Official BINI fan page | P-Pop Queens" },
    { username: "biniupdatesph", displayName: "BINI Updates PH", platform: "twitter", followers: 120000, engagementRate: 6.2, relevanceScore: 88, bio: "Your daily BINI updates and news" },
    { username: "bini.edits", displayName: "BINI Edits", platform: "instagram", followers: 95000, engagementRate: 7.1, relevanceScore: 82, bio: "BINI edits and fan content" },
    { username: "ppopriseph", displayName: "P-Pop Rise PH", platform: "youtube", followers: 450000, engagementRate: 4.3, relevanceScore: 78, bio: "P-Pop content and live performances" },
  ],
  "SB19 A'TIN": [
    { username: "sb19official_fan", displayName: "SB19 Fan HQ", platform: "tiktok", followers: 195000, engagementRate: 9.1, relevanceScore: 92, bio: "Dedicated A'TIN fan account" },
    { username: "atinworldwide", displayName: "A'TIN Worldwide", platform: "twitter", followers: 85000, engagementRate: 7.8, relevanceScore: 86, bio: "SB19 A'TIN global updates" },
    { username: "sb19updates.ph", displayName: "SB19 Updates", platform: "instagram", followers: 72000, engagementRate: 5.9, relevanceScore: 80, bio: "SB19 latest news and schedules" },
  ],
  "BTS ARMY": [
    { username: "armyphilippines", displayName: "ARMY Philippines", platform: "twitter", followers: 520000, engagementRate: 5.4, relevanceScore: 90, bio: "Philippine ARMY | BTS fan base" },
    { username: "btsph.daily", displayName: "BTS PH Daily", platform: "tiktok", followers: 380000, engagementRate: 6.8, relevanceScore: 87, bio: "Daily BTS content for Filipino ARMYs" },
    { username: "purpleyouph", displayName: "Purple You PH", platform: "instagram", followers: 165000, engagementRate: 4.2, relevanceScore: 75, bio: "BTS fan art and edits from Manila" },
  ],
  "NewJeans Bunnies": [
    { username: "nwjnsphilippines", displayName: "NewJeans PH", platform: "twitter", followers: 89000, engagementRate: 8.3, relevanceScore: 88, bio: "NewJeans Philippine Bunnies" },
    { username: "newjeans.mnl", displayName: "NewJeans Manila", platform: "tiktok", followers: 145000, engagementRate: 7.5, relevanceScore: 85, bio: "NewJeans fan content from Manila" },
  ],
  "SEVENTEEN CARAT": [
    { username: "caratph_", displayName: "CARAT PH", platform: "twitter", followers: 175000, engagementRate: 6.1, relevanceScore: 86, bio: "SEVENTEEN Philippine fan union" },
    { username: "svtph.updates", displayName: "SVT PH Updates", platform: "instagram", followers: 68000, engagementRate: 5.7, relevanceScore: 79, bio: "SEVENTEEN updates for Filipino CARATs" },
  ],
  "KAIA Fans": [
    { username: "kaiastansph", displayName: "KAIA Stans PH", platform: "tiktok", followers: 42000, engagementRate: 11.2, relevanceScore: 82, bio: "KAIA fan page | Rising P-Pop star" },
    { username: "kaia.updates", displayName: "KAIA Updates", platform: "instagram", followers: 28000, engagementRate: 9.8, relevanceScore: 76, bio: "Your source for KAIA news" },
  ],
  "G22 Fans": [
    { username: "g22nation", displayName: "G22 Nation", platform: "tiktok", followers: 35000, engagementRate: 10.5, relevanceScore: 80, bio: "G22 fan community | P-Pop" },
    { username: "g22updates.ph", displayName: "G22 Updates PH", platform: "twitter", followers: 18000, engagementRate: 8.9, relevanceScore: 72, bio: "G22 daily updates" },
  ],
  "ALAMAT Fans": [
    { username: "alamatribe", displayName: "Alamat Tribe PH", platform: "tiktok", followers: 28000, engagementRate: 9.7, relevanceScore: 78, bio: "Alamat fan community" },
    { username: "alamat.updates", displayName: "Alamat Updates", platform: "instagram", followers: 15000, engagementRate: 7.3, relevanceScore: 70, bio: "Alamat P-Pop group updates" },
  ],
  "AlDub Nation": [
    { username: "aldubforevs", displayName: "AlDub Forever", platform: "twitter", followers: 95000, engagementRate: 3.8, relevanceScore: 72, bio: "AlDub Nation since 2015" },
    { username: "aldub.clips", displayName: "AlDub Clips", platform: "tiktok", followers: 55000, engagementRate: 4.5, relevanceScore: 68, bio: "Classic AlDub moments" },
  ],
  "r/DragRacePhilippines": [
    { username: "dragraceph.fan", displayName: "DRPH Fan", platform: "tiktok", followers: 62000, engagementRate: 8.9, relevanceScore: 84, bio: "Drag Race Philippines fan content" },
    { username: "drphilippines", displayName: "DR Philippines", platform: "instagram", followers: 48000, engagementRate: 6.7, relevanceScore: 78, bio: "Drag Race PH updates and memes" },
    { username: "shantayyoustaph", displayName: "Shantay PH", platform: "youtube", followers: 125000, engagementRate: 5.2, relevanceScore: 75, bio: "Drag Race PH reviews and reactions" },
  ],
};

async function seedInfluencers() {
  await db.delete(influencers);
  console.log("Cleared existing influencer data");

  const allFandoms = await db.select().from(fandoms);
  console.log(`Found ${allFandoms.length} fandoms`);

  let totalInserted = 0;

  for (const fandom of allFandoms) {
    const data = INFLUENCER_DATA[fandom.name];
    if (!data) {
      console.log(`No influencer data for ${fandom.name}, skipping`);
      continue;
    }

    for (const inf of data) {
      await db.insert(influencers).values({
        fandomId: fandom.id,
        platform: inf.platform,
        username: inf.username,
        displayName: inf.displayName,
        followers: inf.followers,
        engagementRate: String(inf.engagementRate),
        profileUrl: null,
        avatarUrl: null,
        bio: inf.bio,
        relevanceScore: String(inf.relevanceScore),
      });
      totalInserted++;
    }

    console.log(`Seeded ${data.length} influencers for ${fandom.name}`);
  }

  console.log(`\nDone! Inserted ${totalInserted} influencers`);
  process.exit(0);
}

seedInfluencers().catch((err) => {
  console.error("Failed to seed influencers:", err);
  process.exit(1);
});
